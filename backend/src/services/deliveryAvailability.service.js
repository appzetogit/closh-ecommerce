import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import ApiError from '../utils/ApiError.js';

/**
 * Throws ApiError(409) if the rider already has an active order/return
 * other than the one being excluded (e.g. the order they're currently being
 * (re)assigned to, so re-confirming the same job is allowed).
 */
export async function assertRiderIsFree(deliveryBoyId, { excludeOrderId, excludeReturnId } = {}) {
    const activeOrderQuery = {
        deliveryBoyId,
        isDeleted: { $ne: true },
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived'] },
    };
    if (excludeOrderId) {
        activeOrderQuery._id = { $ne: excludeOrderId };
    }

    const activeReturnQuery = {
        deliveryBoyId,
        status: 'processing',
    };
    if (excludeReturnId) {
        activeReturnQuery._id = { $ne: excludeReturnId };
    }

    const [hasActiveOrder, hasActiveReturn] = await Promise.all([
        Order.exists(activeOrderQuery),
        ReturnRequest.exists(activeReturnQuery),
    ]);

    if (hasActiveOrder || hasActiveReturn) {
        throw new ApiError(409, 'This rider already has an active delivery in progress.');
    }
}

/**
 * Marks the rider busy. Call right after a successful assignment.
 */
export async function markRiderBusy(deliveryBoyId) {
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'busy' });
}

/**
 * Releases the rider back to available. Call after a job completes,
 * is cancelled, or is rejected.
 */
export async function markRiderAvailable(deliveryBoyId) {
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'available' });
}
