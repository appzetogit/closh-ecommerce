// Customer wallet (docs/REFER_AND_EARN_AND_WALLET.md §3.2, §5.3, §7.7-7.8).
//
// The ledger (WalletTransaction) is the source of truth; User.walletBalance is a cached sum
// that is only ever changed together with a ledger entry, inside the same transaction, and
// with a conditional update so it can never go negative. Every write carries an
// idempotencyKey, so retries (queue re-runs, double clicks) cannot pay or charge twice.
import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Order from '../models/Order.model.js';
import WalletTransaction from '../models/WalletTransaction.model.js';
import ApiError from '../utils/ApiError.js';
import { getWalletSettings } from './rewardSettings.service.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const isDuplicateKey = (err) => err?.code === 11000 || /E11000/.test(String(err?.message || ''));

/** Runs `fn(session)` in the caller's session, or in a fresh transaction when none is given. */
const withSession = async (session, fn) => {
    if (session) return fn(session);
    const own = await mongoose.startSession();
    try {
        let result;
        await own.withTransaction(async () => {
            result = await fn(own);
        });
        return result;
    } finally {
        await own.endSession();
    }
};

/**
 * Wallet amount for an order (§6.1). Pure function, shared by the checkout preview and
 * placeOrder so the quoted and charged numbers always match.
 */
export const computeWalletApplied = ({ useWallet, balance, settings, eligibleBase, payableBeforeWallet, couponApplied }) => {
    if (!useWallet || !settings?.enabled) return 0;
    if (couponApplied && !settings.allowWithCoupon) return 0;
    if (eligibleBase < (settings.minOrderValueForWallet || 0)) return 0;
    const byPercent = (payableBeforeWallet * (settings.maxWalletPercentPerOrder ?? 100)) / 100;
    const byAmount = settings.maxWalletAmountPerOrder > 0 ? settings.maxWalletAmountPerOrder : Infinity;
    const amount = Math.min(Number(balance) || 0, byPercent, byAmount, payableBeforeWallet);
    return Math.max(0, Math.floor(amount * 100) / 100);
};

export const getBalance = async (userId) => {
    const user = await User.findById(userId).select('walletBalance').lean();
    return round2(user?.walletBalance || 0);
};

/**
 * Add money to a customer's wallet as a new credit lot.
 * @returns the WalletTransaction (existing one if this idempotencyKey was already used)
 */
export const credit = async (userId, amount, meta = {}, { session } = {}) => {
    const value = round2(amount);
    if (!(value > 0)) return null;
    if (!meta.idempotencyKey) throw new Error('credit() needs an idempotencyKey');

    return withSession(session, async (s) => {
        const existing = await WalletTransaction.findOne({ idempotencyKey: meta.idempotencyKey }).session(s);
        if (existing) return existing;

        let expiresAt = meta.expiresAt ?? null;
        if (meta.expiresAt === undefined) {
            const { creditValidityDays } = await getWalletSettings();
            expiresAt = creditValidityDays > 0 ? new Date(Date.now() + creditValidityDays * DAY_MS) : null;
        }

        const user = await User.findOneAndUpdate(
            { _id: userId },
            { $inc: { walletBalance: value } },
            { new: true, session: s, projection: { walletBalance: 1 } }
        );
        if (!user) throw new ApiError(404, 'Customer not found.');

        const [tx] = await WalletTransaction.create([{
            user: userId,
            type: 'credit',
            source: meta.source,
            amount: value,
            remaining: value,
            expiresAt,
            order: meta.order || null,
            referral: meta.referral || null,
            idempotencyKey: meta.idempotencyKey,
            note: meta.note,
            createdBy: meta.createdBy || null,
            createdByModel: meta.createdByModel || 'System',
            balanceAfter: round2(user.walletBalance),
        }], { session: s });
        return tx;
    });
};

/**
 * Spend from the wallet, earliest-expiring money first. Throws 409 when the balance is no
 * longer enough (e.g. the same wallet used in another tab a moment ago).
 */
export const debit = async (userId, amount, meta = {}, { session } = {}) => {
    const value = round2(amount);
    if (!(value > 0)) return null;
    if (!meta.idempotencyKey) throw new Error('debit() needs an idempotencyKey');

    return withSession(session, async (s) => {
        const existing = await WalletTransaction.findOne({ idempotencyKey: meta.idempotencyKey }).session(s);
        if (existing) return existing;

        const user = await User.findOneAndUpdate(
            { _id: userId, walletBalance: { $gte: value } },
            { $inc: { walletBalance: -value } },
            { new: true, session: s, projection: { walletBalance: 1 } }
        );
        if (!user) throw new ApiError(409, 'Your wallet balance has changed. Please review your order and try again.');

        const now = new Date();
        const lots = await WalletTransaction.find({
            user: userId,
            type: 'credit',
            remaining: { $gt: 0 },
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        }).session(s);
        // Earliest expiry first; lots that never expire last.
        lots.sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity));

        let left = value;
        const allocations = [];
        for (const lot of lots) {
            if (left <= 0) break;
            const take = round2(Math.min(lot.remaining, left));
            const res = await WalletTransaction.updateOne(
                { _id: lot._id, remaining: { $gte: take } },
                { $inc: { remaining: -take } },
                { session: s }
            );
            if (res.modifiedCount === 0) continue;
            allocations.push({ credit: lot._id, amount: take });
            left = round2(left - take);
        }
        if (left > 0) {
            // Cached balance said yes but the lots disagree (should not happen); refuse rather
            // than create money out of nothing. The transaction rolls back the balance change.
            throw new ApiError(409, 'Your wallet balance could not be used right now. Please try again.');
        }

        const [tx] = await WalletTransaction.create([{
            user: userId,
            type: 'debit',
            source: meta.source || 'order_payment',
            amount: value,
            order: meta.order || null,
            allocations,
            idempotencyKey: meta.idempotencyKey,
            note: meta.note,
            createdBy: meta.createdBy || null,
            createdByModel: meta.createdByModel || 'System',
            balanceAfter: round2(user.walletBalance),
        }], { session: s });
        return tx;
    });
};

/**
 * Put wallet money used on an order back into the wallet (cancel, Try & Buy keeps less,
 * return). Never returns more than order.walletApplied - order.walletRefunded. The refund is
 * a new credit lot that keeps the latest expiry of the lots it was paid from, and at least
 * `refundGraceDays` from now.
 * @param {string} reasonKey unique per refund event, e.g. 'cancel', 'try_buy', 'return:<id>'
 * @returns amount actually refunded
 */
export const refundOrder = async (orderOrId, amount, reasonKey, { session } = {}) => {
    return withSession(session, async (s) => {
        const order = await Order.findById(orderOrId?._id || orderOrId)
            .select('userId walletApplied walletRefunded walletDebitId orderId')
            .session(s);
        if (!order || !(order.walletApplied > 0)) return 0;

        const refundable = round2(order.walletApplied - (order.walletRefunded || 0));
        const value = round2(Math.min(Number(amount) || 0, refundable));
        if (!(value > 0)) return 0;

        const key = `order_refund:${order._id}:${reasonKey}`;
        if (await WalletTransaction.exists({ idempotencyKey: key }).session(s)) return 0;

        // Claim the refund on the order first so two concurrent refunds cannot both pass.
        const claim = await Order.updateOne(
            { _id: order._id, walletRefunded: { $lte: round2(order.walletApplied - value) } },
            { $inc: { walletRefunded: value } },
            { session: s }
        );
        if (claim.modifiedCount === 0) return 0;

        const { refundGraceDays } = await getWalletSettings();
        const graceUntil = new Date(Date.now() + refundGraceDays * DAY_MS);
        let expiresAt = graceUntil;
        if (order.walletDebitId) {
            const debitTx = await WalletTransaction.findById(order.walletDebitId).select('allocations').session(s);
            const lotIds = (debitTx?.allocations || []).map((a) => a.credit);
            if (lotIds.length) {
                const lots = await WalletTransaction.find({ _id: { $in: lotIds } }).select('expiresAt').session(s);
                if (lots.some((l) => !l.expiresAt)) expiresAt = null;
                else {
                    const latest = Math.max(...lots.map((l) => l.expiresAt.getTime()));
                    expiresAt = new Date(Math.max(latest, graceUntil.getTime()));
                }
            }
        }

        await credit(order.userId, value, {
            source: 'order_refund',
            order: order._id,
            idempotencyKey: key,
            expiresAt,
            note: `Refund for order ${order.orderId} (${reasonKey})`,
        }, { session: s });
        return value;
    });
};

/** Remove the unspent part of expired credit lots. Safe to run repeatedly. */
export const expireCredits = async ({ limit = 500 } = {}) => {
    const lots = await WalletTransaction.find({
        type: 'credit',
        remaining: { $gt: 0 },
        expiresAt: { $ne: null, $lte: new Date() },
    }).limit(limit).lean();

    let expired = 0;
    for (const lot of lots) {
        try {
            await withSession(null, async (s) => {
                const fresh = await WalletTransaction.findOneAndUpdate(
                    { _id: lot._id, remaining: { $gt: 0 } },
                    { $set: { remaining: 0 } },
                    { session: s, new: false }
                );
                if (!fresh || !(fresh.remaining > 0)) return;
                const value = round2(fresh.remaining);
                const user = await User.findById(lot.user).select('walletBalance').session(s);
                const take = round2(Math.min(value, user?.walletBalance || 0));
                const updated = await User.findOneAndUpdate(
                    { _id: lot.user },
                    { $inc: { walletBalance: -take } },
                    { new: true, session: s, projection: { walletBalance: 1 } }
                );
                await WalletTransaction.create([{
                    user: lot.user,
                    type: 'debit',
                    source: 'expiry',
                    amount: value,
                    allocations: [{ credit: lot._id, amount: value }],
                    idempotencyKey: `expiry:${lot._id}`,
                    note: 'Wallet credit expired',
                    balanceAfter: round2(updated?.walletBalance || 0),
                }], { session: s });
                expired += 1;
            });
        } catch (err) {
            if (!isDuplicateKey(err)) console.error(`[Wallet] Could not expire lot ${lot._id}:`, err.message);
        }
    }
    return expired;
};

/** Credits expiring within `days` (for the "expiring soon" banner). */
export const getExpiringSoon = async (userId, days = 30) => {
    const until = new Date(Date.now() + days * DAY_MS);
    const lots = await WalletTransaction.find({
        user: userId,
        type: 'credit',
        remaining: { $gt: 0 },
        expiresAt: { $ne: null, $gt: new Date(), $lte: until },
    }).select('remaining expiresAt').sort({ expiresAt: 1 }).lean();
    return lots.map((l) => ({ amount: round2(l.remaining), expiresAt: l.expiresAt }));
};

export const CustomerWallet = { computeWalletApplied, getBalance, credit, debit, refundOrder, expireCredits, getExpiringSoon };
export default CustomerWallet;
