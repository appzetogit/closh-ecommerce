// Order lifecycle hooks for the customer wallet and Refer & Earn. Called from every place
// that cancels or completes an order, after that code's own transaction. Never throws:
// a wallet or referral problem must not break a cancellation or a delivery.
import { refundOrder } from './customerWallet.service.js';
import { onOrderCancelled, onOrderCompleted } from './referral.service.js';

/** Order cancelled (any actor) or refused at the door: wallet money back, referral reset. */
export const onOrderCancelledRewards = async (orderId, reason = 'order_cancelled') => {
    try {
        await refundOrder(orderId, Infinity, 'cancel');
    } catch (err) {
        console.error(`[Wallet] Refund on cancel failed for order ${orderId}:`, err.message);
    }
    try {
        await onOrderCancelled(orderId, reason);
    } catch (err) {
        console.error(`[Referral] Cancel hook failed for order ${orderId}:`, err.message);
    }
};

/** Order delivered or Try & Buy finished: may qualify the customer's referral. */
export const onOrderCompletedRewards = async (orderId) => {
    try {
        await onOrderCompleted(orderId);
    } catch (err) {
        console.error(`[Referral] Completion hook failed for order ${orderId}:`, err.message);
    }
};

export default { onOrderCancelledRewards, onOrderCompletedRewards };
