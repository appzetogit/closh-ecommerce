// Refer & Earn (docs/REFER_AND_EARN_AND_WALLET.md §3.1, §7).
//
// Only the referred customer's first order that is delivered, kept above the minimum value
// and past the return window earns a reward. Sharing a code or signing up earns nothing.
// Rewards are paid into the customer wallet by a sweeper (sweepDueReferrals) that reads due
// referrals straight from MongoDB, so a restart or a Redis outage can delay a reward by a
// few minutes but never lose it.
import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Order from '../models/Order.model.js';
import Referral from '../models/Referral.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Address from '../models/Address.model.js';
import WalletTransaction from '../models/WalletTransaction.model.js';
import { credit } from './customerWallet.service.js';
import { getReferralSettings } from './rewardSettings.service.js';
import { createNotification } from './notification.service.js';
import { normalizeReferralCode } from '../utils/referralCode.js';

const HOUR_MS = 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CANCELLED_STATUSES = ['cancelled', 'failed'];
const COMPLETED_STATUSES = ['delivered', 'try_buy_completed'];

const normalizeAddress = (a = {}) =>
    `${String(a.address || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(a.zipCode || '').replace(/\D/g, '')}`;

/** Public check used by the sign-up form. Never reveals more than the first name. */
export const validateReferralCode = async (rawCode) => {
    const settings = await getReferralSettings();
    if (!settings.enabled) return { valid: false, reason: 'program_disabled' };
    const code = normalizeReferralCode(rawCode);
    if (code.length < 6) return { valid: false, reason: 'invalid_code' };
    const referrer = await User.findOne({ referralCode: code, isActive: { $ne: false }, isDeleted: { $ne: true } })
        .select('name')
        .lean();
    if (!referrer) return { valid: false, reason: 'invalid_code' };
    return { valid: true, code, referrerFirstName: String(referrer.name || '').split(' ')[0] };
};

/**
 * Turn the code a customer typed at sign-up into a Referral. Called once the account is
 * verified, so unverified sign-ups cannot farm referrals. Never throws: a bad code must not
 * block registration.
 * @returns {{ applied: boolean, reason?: string }}
 */
export const activatePendingReferral = async (userId) => {
    try {
        const user = await User.findById(userId).select('+pendingReferralCode referredBy signupDeviceId name').lean();
        if (!user?.pendingReferralCode) return { applied: false };
        const clear = () => User.updateOne({ _id: userId }, { $unset: { pendingReferralCode: 1 } });

        if (user.referredBy) { await clear(); return { applied: false, reason: 'already_referred' }; }

        const settings = await getReferralSettings();
        if (!settings.enabled) { await clear(); return { applied: false, reason: 'program_disabled' }; }

        const code = normalizeReferralCode(user.pendingReferralCode);
        const referrer = await User.findOne({ referralCode: code, isActive: { $ne: false }, isDeleted: { $ne: true } })
            .select('_id signupDeviceId')
            .lean();
        if (!referrer) { await clear(); return { applied: false, reason: 'invalid_code' }; }
        if (String(referrer._id) === String(userId)) { await clear(); return { applied: false, reason: 'self_referral' }; }
        if (user.signupDeviceId && referrer.signupDeviceId && user.signupDeviceId === referrer.signupDeviceId) {
            await clear();
            return { applied: false, reason: 'self_referral' };
        }
        // R2: only brand-new customers.
        const priorOrders = await Order.countDocuments({ userId, isDeleted: { $ne: true } });
        if (priorOrders > 0) { await clear(); return { applied: false, reason: 'not_new_customer' }; }

        try {
            await Referral.create({
                referrer: referrer._id,
                referee: userId,
                code,
                status: 'pending',
                settingsSnapshot: settings,
            });
        } catch (err) {
            if (err?.code === 11000) { await clear(); return { applied: false, reason: 'already_referred' }; }
            throw err;
        }
        await User.updateOne(
            { _id: userId },
            { $set: { referredBy: referrer._id, referralAppliedAt: new Date() }, $unset: { pendingReferralCode: 1 } }
        );
        return { applied: true };
    } catch (err) {
        console.error(`[Referral] Could not apply referral for user ${userId}:`, err.message);
        return { applied: false, reason: 'error' };
    }
};

/**
 * Called inside placeOrder's transaction once the order exists. Starts tracking the order if
 * it is the referred customer's first order.
 */
export const onOrderPlaced = async (order, { session } = {}) => {
    const referral = await Referral.findOne({ referee: order.userId, status: 'pending' }).session(session || null);
    if (!referral) return null;
    const snap = referral.settingsSnapshot || {};

    const earlier = await Order.countDocuments({
        userId: order.userId,
        _id: { $ne: order._id },
        isDeleted: { $ne: true },
        status: { $nin: CANCELLED_STATUSES },
    }).session(session || null);
    if (earlier > 0) {
        referral.status = 'void';
        referral.voidReason = 'not_first_order';
        await referral.save({ session });
        return null;
    }

    const isCod = order.paymentMethod === 'cod' || order.paymentMethod === 'cash';
    if (isCod && snap.allowCod === false) return null; // stays pending; a later prepaid first order can count

    referral.status = 'order_placed';
    referral.firstOrder = order._id;
    await referral.save({ session });
    order.referral = referral._id;
    return referral;
};

/** First order cancelled or nothing kept: void, or wait for the next order (D1). */
export const onOrderCancelled = async (orderId, reason = 'order_cancelled') => {
    const referral = await Referral.findOne({ firstOrder: orderId, status: { $in: ['order_placed', 'qualified'] } });
    if (!referral) return null;
    const strict = referral.settingsSnapshot?.firstOrderStrict === true;
    const update = strict
        ? { $set: { status: 'void', voidReason: reason } }
        : { $set: { status: 'pending', firstOrder: null, keptValue: 0, rewardDueAt: null } };
    return Referral.findOneAndUpdate({ _id: referral._id, status: referral.status }, update, { new: true });
};

/** Order delivered / Try & Buy finished: qualify the referral and set when it is paid. */
export const onOrderCompleted = async (orderOrId) => {
    const order = await Order.findById(orderOrId?._id || orderOrId)
        .select('userId status subtotal couponDiscount shippingAddress deliveredAt')
        .lean();
    if (!order) return null;
    const referral = await Referral.findOne({ firstOrder: order._id, status: 'order_placed' });
    if (!referral) return null;

    const keptValue = round2((order.subtotal || 0) - (order.couponDiscount || 0));
    if (!COMPLETED_STATUSES.includes(order.status) || keptValue <= 0) {
        return onOrderCancelled(order._id, 'fully_returned');
    }
    const snap = referral.settingsSnapshot || {};
    if (keptValue < (Number(snap.minFirstOrderValue) || 0)) {
        return Referral.findOneAndUpdate(
            { _id: referral._id, status: 'order_placed' },
            { $set: { status: 'void', voidReason: 'below_min_value', keptValue } },
            { new: true }
        );
    }

    // Same delivery address as one of the referrer's saved addresses: hold for admin review.
    const fraudFlags = [];
    const referrerAddresses = await Address.find({ userId: referral.referrer }).select('address zipCode').lean();
    const orderKey = normalizeAddress(order.shippingAddress);
    if (referrerAddresses.some((a) => normalizeAddress(a) === orderKey)) fraudFlags.push('same_address');

    const delayHours = Number(snap.rewardDelayHours ?? 24);
    return Referral.findOneAndUpdate(
        { _id: referral._id, status: 'order_placed' },
        {
            $set: {
                status: 'qualified',
                keptValue,
                rewardDueAt: new Date(Date.now() + delayHours * HOUR_MS),
                fraudFlags,
            },
        },
        { new: true }
    );
};

const monthStart = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
};

const rewardAmountFor = (snap, keptValue) => {
    const rr = snap.referrerReward || {};
    if (rr.type === 'percent') {
        const raw = (keptValue * (Number(rr.value) || 0)) / 100;
        return round2(rr.maxAmount > 0 ? Math.min(raw, rr.maxAmount) : raw);
    }
    return round2(Number(rr.value) || 0);
};

const voidReferral = (referral, reason, extra = {}) =>
    Referral.findOneAndUpdate(
        { _id: referral._id, status: { $in: ['pending', 'order_placed', 'qualified'] } },
        { $set: { status: 'void', voidReason: reason, ...extra } },
        { new: true }
    );

/**
 * Pay one referral. Re-checks everything at payment time; safe to call repeatedly.
 * @param {{ force?: boolean }} opts force: admin "reward now" — skips the wait and fraud hold, not the other checks
 */
export const rewardReferral = async (referralId, { force = false } = {}) => {
    const referral = await Referral.findById(referralId);
    if (!referral || referral.status !== 'qualified') return { rewarded: false, reason: 'not_qualified' };
    if (!force && referral.rewardDueAt && referral.rewardDueAt > new Date()) return { rewarded: false, reason: 'not_due' };
    if (!force && referral.fraudFlags?.length) return { rewarded: false, reason: 'held_for_review' };

    const snap = referral.settingsSnapshot || {};
    const order = await Order.findById(referral.firstOrder).select('status orderId').lean();
    if (!order || !COMPLETED_STATUSES.includes(order.status)) {
        await voidReferral(referral, 'fully_returned');
        return { rewarded: false, reason: 'order_not_kept' };
    }

    // An open customer return: wait until it is resolved.
    const openReturn = await ReturnRequest.exists({
        orderId: referral.firstOrder,
        isTryBuyAutoReturn: { $ne: true },
        status: { $in: ['pending', 'approved', 'processing'] },
    });
    if (openReturn) {
        await Referral.updateOne({ _id: referral._id }, { $set: { rewardDueAt: new Date(Date.now() + 24 * HOUR_MS) } });
        return { rewarded: false, reason: 'return_open' };
    }
    const returned = await ReturnRequest.find({
        orderId: referral.firstOrder,
        isTryBuyAutoReturn: { $ne: true },
        status: 'completed',
    }).select('items').lean();
    const returnedValue = returned.reduce(
        (sum, r) => sum + (r.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
        0
    );
    const keptValue = round2(referral.keptValue - returnedValue);
    if (keptValue < (Number(snap.minFirstOrderValue) || 0)) {
        await voidReferral(referral, 'below_min_value', { keptValue });
        return { rewarded: false, reason: 'below_min_value' };
    }

    const referrer = await User.findById(referral.referrer).select('isActive isDeleted name').lean();
    if (!referrer || referrer.isActive === false || referrer.isDeleted) {
        await voidReferral(referral, 'referrer_inactive');
        return { rewarded: false, reason: 'referrer_inactive' };
    }

    const [lifetime, thisMonth] = await Promise.all([
        Referral.countDocuments({ referrer: referral.referrer, status: 'rewarded' }),
        Referral.countDocuments({ referrer: referral.referrer, status: 'rewarded', rewardedAt: { $gte: monthStart() } }),
    ]);
    if (snap.maxRewardsPerReferrer > 0 && lifetime >= snap.maxRewardsPerReferrer) {
        await voidReferral(referral, 'cap_reached');
        return { rewarded: false, reason: 'cap_reached' };
    }
    if (snap.monthlyRewardCap > 0 && thisMonth >= snap.monthlyRewardCap) {
        // Try again next month rather than losing the reward.
        const next = new Date(monthStart());
        next.setMonth(next.getMonth() + 1);
        await Referral.updateOne({ _id: referral._id }, { $set: { rewardDueAt: next } });
        return { rewarded: false, reason: 'monthly_cap' };
    }

    const referrerAmount = rewardAmountFor(snap, keptValue);
    const refereeAmount = snap.refereeReward?.enabled ? round2(Number(snap.refereeReward.value) || 0) : 0;

    const session = await mongoose.startSession();
    let rewarded = false;
    try {
        await session.withTransaction(async () => {
            const claimed = await Referral.findOneAndUpdate(
                { _id: referral._id, status: 'qualified' },
                {
                    $set: {
                        status: 'rewarded',
                        rewardedAt: new Date(),
                        referrerReward: referrerAmount,
                        refereeReward: refereeAmount,
                        keptValue,
                    },
                },
                { new: true, session }
            );
            if (!claimed) return;
            if (referrerAmount > 0) {
                await credit(referral.referrer, referrerAmount, {
                    source: 'referral_reward',
                    referral: referral._id,
                    order: referral.firstOrder,
                    idempotencyKey: `referral_reward:${referral._id}`,
                    note: 'Refer & Earn reward',
                }, { session });
            }
            if (refereeAmount > 0) {
                await credit(referral.referee, refereeAmount, {
                    source: 'referee_reward',
                    referral: referral._id,
                    order: referral.firstOrder,
                    idempotencyKey: `referee_reward:${referral._id}`,
                    note: 'Welcome reward for joining with a referral',
                }, { session });
            }
            rewarded = true;
        });
    } finally {
        await session.endSession();
    }
    if (!rewarded) return { rewarded: false, reason: 'already_processed' };

    const referee = await User.findById(referral.referee).select('name').lean();
    const friend = String(referee?.name || 'Your friend').split(' ')[0];
    if (referrerAmount > 0) {
        createNotification({
            recipientId: referral.referrer,
            recipientType: 'user',
            title: `₹${referrerAmount} added to your CLOSH wallet`,
            message: `${friend} placed their first order. Use your wallet balance on your next purchase.`,
            type: 'referral',
            data: { referralId: String(referral._id) },
            actionLink: '/wallet',
        }).catch(() => {});
    }
    if (refereeAmount > 0) {
        createNotification({
            recipientId: referral.referee,
            recipientType: 'user',
            title: `₹${refereeAmount} welcome reward added`,
            message: 'Thanks for joining CLOSH. Your reward is in your wallet.',
            type: 'referral',
            data: { referralId: String(referral._id) },
            actionLink: '/wallet',
        }).catch(() => {});
    }
    return { rewarded: true, referrerAmount, refereeAmount };
};

/** Pays every referral whose waiting period is over. Run periodically (server.js). */
export const sweepDueReferrals = async ({ limit = 100 } = {}) => {
    const due = await Referral.find({
        status: 'qualified',
        rewardDueAt: { $lte: new Date() },
        fraudFlags: { $size: 0 },
    }).select('_id').limit(limit).lean();
    let paid = 0;
    for (const { _id } of due) {
        try {
            const res = await rewardReferral(_id);
            if (res.rewarded) paid += 1;
        } catch (err) {
            console.error(`[Referral] Reward failed for ${_id}:`, err.message);
        }
    }
    return paid;
};

export const adminVoidReferral = async (referralId, reason, adminId) => {
    const referral = await Referral.findById(referralId);
    if (!referral) return null;
    return voidReferral(referral, reason ? `admin: ${String(reason).slice(0, 200)}` : 'admin', { voidedBy: adminId || null });
};

/** Data for the customer's Refer & Earn page. */
export const getReferralSummary = async (userId) => {
    const [user, settings] = await Promise.all([
        User.findById(userId).select('referralCode name').lean(),
        getReferralSettings(),
    ]);
    let code = user?.referralCode;
    if (!code && user) {
        // Older accounts get their code the first time they open the page.
        const doc = await User.findById(userId);
        await doc.save();
        code = doc.referralCode;
    }
    const counts = await Referral.aggregate([
        { $match: { referrer: new mongoose.Types.ObjectId(String(userId)) } },
        { $group: { _id: '$status', n: { $sum: 1 }, earned: { $sum: '$referrerReward' } } },
    ]);
    const by = Object.fromEntries(counts.map((c) => [c._id, c]));
    const invited = counts.reduce((s, c) => s + c.n, 0);
    const pending = ['pending', 'order_placed', 'qualified'].reduce((s, k) => s + (by[k]?.n || 0), 0);
    const earnedAgg = await WalletTransaction.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(String(userId)), source: 'referral_reward' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const base = (process.env.CLIENT_URL || 'https://www.closh.in').split(',')[0].replace(/\/$/, '');
    const link = code ? `${base}/r/${code}` : '';
    const rr = settings.referrerReward;
    return {
        enabled: settings.enabled,
        code,
        link,
        shareMessage: settings.shareMessage.replaceAll('{CODE}', code || '').replaceAll('{LINK}', link),
        terms: settings.termsText,
        reward: {
            type: rr.type,
            value: rr.value,
            maxAmount: rr.maxAmount,
            refereeReward: settings.refereeReward.enabled ? settings.refereeReward.value : 0,
            minFirstOrderValue: settings.minFirstOrderValue,
            rewardDelayHours: settings.rewardDelayHours,
        },
        stats: {
            invited,
            pending,
            rewarded: by.rewarded?.n || 0,
            earned: round2(earnedAgg[0]?.total || 0),
        },
    };
};

export const getReferralHistory = async (userId, { page = 1, limit = 20 } = {}) => {
    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
        Referral.find({ referrer: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('referee', 'name')
            .lean(),
        Referral.countDocuments({ referrer: userId }),
    ]);
    const mask = (name = '') => {
        const first = String(name).split(' ')[0] || 'Friend';
        return first.length <= 2 ? first : `${first.slice(0, 2)}${'*'.repeat(Math.min(first.length - 2, 4))}`;
    };
    const statusLabel = {
        pending: 'Joined - waiting for first order',
        order_placed: 'First order placed',
        qualified: 'Order delivered - reward on the way',
        rewarded: 'Reward earned',
        void: 'Not eligible',
    };
    return {
        total,
        items: items.map((r) => ({
            id: r._id,
            friend: mask(r.referee?.name),
            status: r.status,
            statusLabel: statusLabel[r.status],
            reward: r.status === 'rewarded' ? r.referrerReward : null,
            rewardDueAt: r.status === 'qualified' ? r.rewardDueAt : null,
            joinedAt: r.createdAt,
            rewardedAt: r.rewardedAt,
        })),
    };
};

export const ReferralService = {
    validateReferralCode,
    activatePendingReferral,
    onOrderPlaced,
    onOrderCancelled,
    onOrderCompleted,
    rewardReferral,
    sweepDueReferrals,
    adminVoidReferral,
    getReferralSummary,
    getReferralHistory,
};
export default ReferralService;
