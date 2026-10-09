// Periodic jobs for Refer & Earn and the customer wallet. Each one reads its work straight
// from MongoDB and is idempotent, so running on several instances or after a restart is safe.
import Order from '../models/Order.model.js';
import { sweepDueReferrals } from './referral.service.js';
import { expireCredits } from './customerWallet.service.js';

const UNPAID_ONLINE_ORDER_MINUTES = 30;

/**
 * Online orders that used wallet money but were never paid: cancel them so the wallet money
 * (and coupon, and stock) comes back. Without this the wallet amount stays spent on an order
 * that will never ship.
 */
export const releaseUnpaidWalletOrders = async ({ limit = 50 } = {}) => {
    const cutoff = new Date(Date.now() - UNPAID_ONLINE_ORDER_MINUTES * 60 * 1000);
    const stale = await Order.find({
        paymentMethod: 'prepaid',
        paymentStatus: { $in: ['pending', 'failed'] },
        walletApplied: { $gt: 0 },
        status: 'pending',
        createdAt: { $lte: cutoff },
        isDeleted: { $ne: true },
    }).select('orderId userId').limit(limit).lean();

    if (!stale.length) return 0;
    const { cancelOrderInternal } = await import('../modules/user/controllers/order.controller.js');
    let released = 0;
    for (const o of stale) {
        try {
            await cancelOrderInternal(o.orderId, o.userId, 'Payment was not completed');
            released += 1;
        } catch (err) {
            console.error(`[Wallet] Could not release unpaid order ${o.orderId}:`, err.message);
        }
    }
    return released;
};

export const startRewardJobs = () => {
    const every = (ms, name, fn) =>
        setInterval(() => {
            fn().catch((err) => console.error(`[RewardJobs] ${name} failed:`, err.message));
        }, ms).unref();

    every(5 * 60 * 1000, 'referral sweep', () => sweepDueReferrals());
    every(5 * 60 * 1000, 'unpaid wallet orders', () => releaseUnpaidWalletOrders());
    every(60 * 60 * 1000, 'wallet expiry', () => expireCredits());
};

export default { startRewardJobs, releaseUnpaidWalletOrders };
