import Coupon from '../models/Coupon.model.js';
import { Order } from '../models/Order.model.js';
import ApiError from '../utils/ApiError.js';

/**
 * Validate a coupon code against a cart total
 * @param {string} code - Coupon code
 * @param {number} cartTotal - Cart subtotal
 * @param {string} userId - User ID for first-order check
 * @returns {{ coupon, discount }}
 */
export const validateCoupon = async (code, cartTotal, userId = null) => {
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) throw new ApiError(400, 'Invalid coupon code.');
    
    // First Order Only Check
    if (coupon.isFirstOrderOnly && userId) {
        // An order only counts as "used your first order" if something was actually bought.
        // A Try & Buy order where every item was rejected at the door ends with subtotal 0
        // and must not burn a first-order-only coupon the customer never got value from.
        const pastOrders = await Order.countDocuments({ 
            userId, 
            status: { $nin: ['cancelled', 'failed'] },
            subtotal: { $gt: 0 },
        });
        if (pastOrders > 0) {
            throw new ApiError(400, 'This promo code is only valid for your first order.');
        }
    }

    if (coupon.startsAt && coupon.startsAt > Date.now()) throw new ApiError(400, 'Coupon is not active yet.');
    if (coupon.expiresAt && coupon.expiresAt < Date.now()) throw new ApiError(400, 'Coupon has expired.');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'Coupon usage limit reached.');
    if (cartTotal < coupon.minOrderValue) throw new ApiError(400, `Minimum order value for this coupon is ₹${coupon.minOrderValue}.`);

    let discount = 0;
    if (coupon.type === 'percentage') {
        discount = (cartTotal * coupon.value) / 100;
        if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else if (coupon.type === 'fixed') {
        discount = coupon.value;
    }

    // A discount can never exceed what it is applied to. Without this a fixed coupon larger
    // than the cart (or a 100% one) drives the payable amount to the fees only, or negative.
    discount = Math.max(0, Math.min(discount, Number(cartTotal) || 0));

    return { coupon, discount: parseFloat(discount.toFixed(2)) };
};

/**
 * Atomically take one use of a coupon. The usage-limit check in validateCoupon reads
 * usedCount before the order exists, so two checkouts can both pass it; this conditional
 * increment is what actually enforces the limit. Call inside the order transaction so a
 * failed order never consumes a use.
 */
export const consumeCoupon = async (coupon, { session } = {}) => {
    const updated = await Coupon.findOneAndUpdate(
        {
            _id: coupon._id,
            $or: [
                { usageLimit: null },
                { usageLimit: 0 },
                { usageLimit: { $exists: false } },
                { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
            ],
        },
        { $inc: { usedCount: 1 } },
        { new: true, session }
    );
    if (!updated) throw new ApiError(400, 'Coupon usage limit reached.');
    return updated;
};

/**
 * Give a coupon use back when the order it was spent on never completes (cancelled, or a
 * Try & Buy where nothing was kept). Idempotent: the per-order flag is claimed atomically,
 * so calling it from several cancel paths can only ever decrement once. Never throws.
 */
export const releaseCouponForOrder = async (orderId) => {
    try {
        const order = await Order.findOneAndUpdate(
            { _id: orderId, couponUsageConsumed: true, couponUsageReleased: { $ne: true } },
            { $set: { couponUsageReleased: true } },
            { projection: { couponCode: 1 } }
        );
        if (!order?.couponCode) return false;
        await Coupon.updateOne({ code: order.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
        return true;
    } catch (error) {
        console.error(`[Coupon] Could not release coupon for order ${orderId}:`, error.message);
        return false;
    }
};

/**
 * Increment coupon usage count (legacy helper, prefer consumeCoupon)
 */
export const incrementCouponUsage = async (couponId) => {
    await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
};
