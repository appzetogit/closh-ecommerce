// Customer Refer & Earn and wallet endpoints (docs/REFER_AND_EARN_AND_WALLET.md §8.1).
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import WalletTransaction from '../../../models/WalletTransaction.model.js';
import {
    getReferralSummary,
    getReferralHistory,
    validateReferralCode,
} from '../../../services/referral.service.js';
import { computeWalletApplied, getBalance, getExpiringSoon } from '../../../services/customerWallet.service.js';
import { getWalletSettings } from '../../../services/rewardSettings.service.js';

const userIdOf = (req) => req.user?._id || req.user?.id;
const pageParams = (q) => ({
    page: Math.max(1, Number(q.page) || 1),
    limit: Math.min(Math.max(1, Number(q.limit) || 20), 50),
});

// GET /api/user/referral
export const getMyReferral = asyncHandler(async (req, res) => {
    const summary = await getReferralSummary(userIdOf(req));
    res.status(200).json(new ApiResponse(200, summary, 'Referral details fetched.'));
});

// GET /api/user/referral/history
export const getMyReferralHistory = asyncHandler(async (req, res) => {
    const history = await getReferralHistory(userIdOf(req), pageParams(req.query));
    res.status(200).json(new ApiResponse(200, history, 'Referral history fetched.'));
});

// POST /api/user/referral/validate-code  (public, rate-limited)
export const checkReferralCode = asyncHandler(async (req, res) => {
    const result = await validateReferralCode(req.body.code);
    res.status(200).json(new ApiResponse(200, result, result.valid ? 'Referral code is valid.' : 'Referral code is not valid.'));
});

// GET /api/user/wallet
export const getMyWallet = asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const [balance, expiringSoon, settings] = await Promise.all([
        getBalance(userId),
        getExpiringSoon(userId, 30),
        getWalletSettings(),
    ]);
    res.status(200).json(new ApiResponse(200, {
        balance,
        expiringSoon,
        settings: {
            enabled: settings.enabled,
            maxWalletPercentPerOrder: settings.maxWalletPercentPerOrder,
            maxWalletAmountPerOrder: settings.maxWalletAmountPerOrder,
            minOrderValueForWallet: settings.minOrderValueForWallet,
            allowWithCoupon: settings.allowWithCoupon,
        },
    }, 'Wallet fetched.'));
});

// GET /api/user/wallet/transactions
export const getMyWalletTransactions = asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const filter = { user: userIdOf(req) };
    const [items, total] = await Promise.all([
        WalletTransaction.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('order', 'orderId')
            .select('type source amount expiresAt remaining note order createdAt balanceAfter')
            .lean(),
        WalletTransaction.countDocuments(filter),
    ]);
    const label = {
        referral_reward: 'Refer & Earn reward',
        referee_reward: 'Welcome reward',
        order_payment: 'Used on order',
        order_refund: 'Refund to wallet',
        expiry: 'Expired',
        admin_adjustment: 'Adjustment by CLOSH',
    };
    res.status(200).json(new ApiResponse(200, {
        total,
        page,
        items: items.map((t) => ({
            id: t._id,
            type: t.type,
            source: t.source,
            label: label[t.source] || t.source,
            amount: t.amount,
            orderId: t.order?.orderId || null,
            expiresAt: t.type === 'credit' ? t.expiresAt : null,
            note: t.source === 'admin_adjustment' ? t.note : undefined,
            balanceAfter: t.balanceAfter,
            createdAt: t.createdAt,
        })),
    }, 'Wallet transactions fetched.'));
});

// POST /api/user/wallet/preview
// Shows how much wallet the order will use. placeOrder recomputes this on its own numbers,
// with the same function, when the order is placed.
export const previewWalletUse = asyncHandler(async (req, res) => {
    const subtotal = Math.max(0, Number(req.body.subtotal) || 0);
    const couponDiscount = Math.max(0, Number(req.body.couponDiscount) || 0);
    const fees = Math.max(0, Number(req.body.shipping) || 0) + Math.max(0, Number(req.body.platformFee) || 0);
    const payableBeforeWallet = Math.max(0, subtotal - couponDiscount + fees);
    const [balance, settings] = await Promise.all([getBalance(userIdOf(req)), getWalletSettings()]);
    const walletApplied = computeWalletApplied({
        useWallet: true,
        balance,
        settings,
        eligibleBase: subtotal - couponDiscount,
        payableBeforeWallet,
        couponApplied: couponDiscount > 0,
    });
    let reason = null;
    if (!settings.enabled) reason = 'wallet_disabled';
    else if (balance <= 0) reason = 'no_balance';
    else if (couponDiscount > 0 && !settings.allowWithCoupon) reason = 'not_with_coupon';
    else if (subtotal - couponDiscount < settings.minOrderValueForWallet) reason = 'below_min_order';
    res.status(200).json(new ApiResponse(200, {
        enabled: settings.enabled,
        balance,
        walletApplied,
        payableAfterWallet: Math.max(0, Number((payableBeforeWallet - walletApplied).toFixed(2))),
        reason: walletApplied > 0 ? null : reason,
        minOrderValueForWallet: settings.minOrderValueForWallet,
    }, 'Wallet preview.'));
});
