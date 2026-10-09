// Admin Refer & Earn and customer wallet endpoints (docs/REFER_AND_EARN_AND_WALLET.md §8.2).
import mongoose from 'mongoose';
import crypto from 'crypto';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.model.js';
import Referral, { REFERRAL_STATUSES } from '../../../models/Referral.model.js';
import WalletTransaction from '../../../models/WalletTransaction.model.js';
import {
    getReferralSettings,
    getWalletSettings,
    saveRewardSettings,
} from '../../../services/rewardSettings.service.js';
import { rewardReferral, adminVoidReferral } from '../../../services/referral.service.js';
import { credit, debit, getBalance } from '../../../services/customerWallet.service.js';
import { createNotification } from '../../../services/notification.service.js';

const adminIdOf = (req) => req.user?._id || req.user?.id;
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// GET /api/admin/referral-program/settings
export const getReferralProgramSettings = asyncHandler(async (req, res) => {
    const [referral, wallet] = await Promise.all([getReferralSettings(), getWalletSettings()]);
    res.status(200).json(new ApiResponse(200, { referral, wallet }, 'Settings fetched.'));
});

// PUT /api/admin/referral-program/settings   body: { referral?, wallet? }
export const updateReferralProgramSettings = asyncHandler(async (req, res) => {
    const out = {};
    if (req.body.referral) out.referral = await saveRewardSettings('referral', req.body.referral);
    if (req.body.wallet) out.wallet = await saveRewardSettings('wallet', req.body.wallet);
    if (!out.referral && !out.wallet) throw new ApiError(400, 'Nothing to update.');
    res.status(200).json(new ApiResponse(200, {
        referral: out.referral || await getReferralSettings(),
        wallet: out.wallet || await getWalletSettings(),
    }, 'Settings saved.'));
});

// GET /api/admin/referrals?status=&search=&from=&to=&flagged=&page=&limit=
export const listReferrals = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
    const filter = {};
    if (REFERRAL_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.flagged === 'true') filter['fraudFlags.0'] = { $exists: true };
    if (req.query.from || req.query.to) {
        filter.createdAt = {};
        if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
        if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const search = String(req.query.search || '').trim();
    if (search) {
        const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const users = await User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }, { referralCode: rx }] })
            .select('_id').limit(200).lean();
        const ids = users.map((u) => u._id);
        filter.$or = [{ referrer: { $in: ids } }, { referee: { $in: ids } }, { code: rx }];
    }

    const [items, total, counts] = await Promise.all([
        Referral.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('referrer', 'name phone referralCode')
            .populate('referee', 'name phone')
            .populate('firstOrder', 'orderId status total paymentMethod')
            .lean(),
        Referral.countDocuments(filter),
        Referral.aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, paid: { $sum: { $add: ['$referrerReward', '$refereeReward'] } } } }]),
    ]);
    const summary = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0]));
    let rewardsPaid = 0;
    counts.forEach((c) => { summary[c._id] = c.n; if (c._id === 'rewarded') rewardsPaid = c.paid; });
    res.status(200).json(new ApiResponse(200, { items, total, page, limit, summary: { ...summary, rewardsPaid: round2(rewardsPaid) } }, 'Referrals fetched.'));
});

// GET /api/admin/referrals/:id
export const getReferralDetail = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, 'Invalid referral id.');
    const referral = await Referral.findById(req.params.id)
        .populate('referrer', 'name phone email referralCode walletBalance')
        .populate('referee', 'name phone email createdAt')
        .populate('firstOrder', 'orderId status total subtotal couponDiscount walletApplied paymentMethod deliveredAt createdAt')
        .populate('voidedBy', 'name email')
        .lean();
    if (!referral) throw new ApiError(404, 'Referral not found.');
    const transactions = await WalletTransaction.find({ referral: referral._id }).sort({ createdAt: 1 }).lean();
    res.status(200).json(new ApiResponse(200, { ...referral, transactions }, 'Referral fetched.'));
});

// POST /api/admin/referrals/:id/void   body: { reason }
export const voidReferral = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, 'Invalid referral id.');
    const reason = String(req.body.reason || '').trim();
    if (!reason) throw new ApiError(400, 'A reason is required.');
    const updated = await adminVoidReferral(req.params.id, reason, adminIdOf(req));
    if (!updated) throw new ApiError(409, 'Only pending, order placed or qualified referrals can be voided.');
    res.status(200).json(new ApiResponse(200, updated, 'Referral voided.'));
});

// POST /api/admin/referrals/:id/reward-now
export const rewardReferralNow = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, 'Invalid referral id.');
    const result = await rewardReferral(req.params.id, { force: true });
    if (!result.rewarded) throw new ApiError(409, `Referral was not rewarded: ${result.reason.replace(/_/g, ' ')}.`);
    res.status(200).json(new ApiResponse(200, result, 'Referral rewarded.'));
});

// GET /api/admin/customers/:id/wallet
export const getCustomerWallet = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, 'Invalid customer id.');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
    const user = await User.findById(req.params.id).select('name phone referralCode referredBy').lean();
    if (!user) throw new ApiError(404, 'Customer not found.');
    const [balance, items, total] = await Promise.all([
        getBalance(user._id),
        WalletTransaction.find({ user: user._id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('order', 'orderId')
            .lean(),
        WalletTransaction.countDocuments({ user: user._id }),
    ]);
    res.status(200).json(new ApiResponse(200, { user, balance, items, total, page }, 'Customer wallet fetched.'));
});

// POST /api/admin/customers/:id/wallet/adjust   body: { type: 'credit'|'debit', amount, note, requestId? }
export const adjustCustomerWallet = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, 'Invalid customer id.');
    const type = req.body.type;
    const amount = round2(req.body.amount);
    const note = String(req.body.note || '').trim();
    if (!['credit', 'debit'].includes(type)) throw new ApiError(400, 'Type must be credit or debit.');
    if (!(amount > 0) || amount > 100000) throw new ApiError(400, 'Amount must be between 0.01 and 100000.');
    if (note.length < 3) throw new ApiError(400, 'Please add a note explaining the adjustment.');

    const user = await User.findById(req.params.id).select('_id').lean();
    if (!user) throw new ApiError(404, 'Customer not found.');

    // requestId lets the panel retry safely; without one every click is a new adjustment.
    const requestId = String(req.body.requestId || '').trim().slice(0, 64) || crypto.randomUUID();
    const meta = {
        source: 'admin_adjustment',
        idempotencyKey: `admin_adjustment:${user._id}:${requestId}`,
        note: note.slice(0, 500),
        createdBy: adminIdOf(req),
        createdByModel: 'Admin',
    };
    const tx = type === 'credit' ? await credit(user._id, amount, meta) : await debit(user._id, amount, meta);
    const balance = await getBalance(user._id);

    if (type === 'credit') {
        createNotification({
            recipientId: user._id,
            recipientType: 'user',
            title: `₹${amount} added to your CLOSH wallet`,
            message: note,
            type: 'wallet',
            actionLink: '/wallet',
        }).catch(() => {});
    }
    res.status(200).json(new ApiResponse(200, { transaction: tx, balance }, 'Wallet adjusted.'));
});

// GET /api/admin/reports/referral
export const getReferralReport = asyncHandler(async (req, res) => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [byStatus, liability, expiring, sources] = await Promise.all([
        Referral.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
        User.aggregate([{ $group: { _id: null, total: { $sum: '$walletBalance' }, holders: { $sum: { $cond: [{ $gt: ['$walletBalance', 0] }, 1, 0] } } } }]),
        WalletTransaction.aggregate([
            { $match: { type: 'credit', remaining: { $gt: 0 }, expiresAt: { $gt: now, $lte: in30 } } },
            { $group: { _id: null, total: { $sum: '$remaining' } } },
        ]),
        WalletTransaction.aggregate([{ $group: { _id: { type: '$type', source: '$source' }, total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    ]);
    const funnel = Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0]));
    byStatus.forEach((r) => { funnel[r._id] = r.n; });
    res.status(200).json(new ApiResponse(200, {
        funnel,
        walletLiability: round2(liability[0]?.total || 0),
        walletHolders: liability[0]?.holders || 0,
        expiringNext30Days: round2(expiring[0]?.total || 0),
        ledger: sources.map((s) => ({ type: s._id.type, source: s._id.source, total: round2(s.total), count: s.n })),
    }, 'Referral report fetched.'));
});
