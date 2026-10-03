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
 * Also stamps lastAssignedAt so autoAssignDeliveryBoy can rotate fairly among
 * several nearby riders instead of always handing every order to whichever one
 * happens to be nearest (see autoAssignment.service.js).
 */
export async function markRiderBusy(deliveryBoyId) {
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'busy', lastAssignedAt: new Date() });
}

/**
 * Releases the rider back to available. Call after a job completes,
 * is cancelled, or is rejected.
 */
export async function markRiderAvailable(deliveryBoyId) {
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'available' });
}

// Anything a rider is still on the hook for: an offered/accepted order or a return that
// is assigned to them. An offer they haven't accepted yet counts too - they are marked
// busy the moment it is offered, and the accept-timeout worker is what frees them.
const ACTIVE_ORDER_STATUSES = [
    'assigned', 'picked_up', 'out_for_delivery', 'arrived', 'processing',
    'ready_for_pickup', 'all_vendors_ready', 'returning_unselected_items', 'returning_unselected',
];
const ACTIVE_RETURN_STATUSES = ['approved', 'processing'];

async function riderHasActiveWork(deliveryBoyId) {
    const [order, ret] = await Promise.all([
        Order.exists({ deliveryBoyId, isDeleted: { $ne: true }, status: { $in: ACTIVE_ORDER_STATUSES } }),
        ReturnRequest.exists({ deliveryBoyId, status: { $in: ACTIVE_RETURN_STATUSES } }),
    ]);
    return Boolean(order || ret);
}

/**
 * Safety net for riders stuck on 'busy' with nothing to do. Many separate paths set
 * 'busy' (offer, accept, admin assign, returns) and each needs its own matching release
 * (deliver, cancel, reject, timeout, order deleted...). Any one that's missed leaves the
 * rider 'busy' forever - and the auto-assigner only considers 'available' riders, so
 * they silently stop getting orders. Only ever flips 'busy' -> 'available'; an 'offline'
 * rider stays offline.
 *
 * @returns {Promise<boolean>} true if the rider was released
 */
export async function releaseRiderIfIdle(deliveryBoyId) {
    if (!deliveryBoyId) return false;
    if (await riderHasActiveWork(deliveryBoyId)) return false;
    const res = await DeliveryBoy.updateOne({ _id: deliveryBoyId, status: 'busy' }, { $set: { status: 'available' } });
    return res.modifiedCount > 0;
}

let lastBusySweepAt = 0;

/**
 * Runs releaseRiderIfIdle over every 'busy' rider. Throttled, since it is called on the
 * hot path of every assignment.
 *
 * @returns {Promise<number>} how many riders were released
 */
export async function reconcileBusyRiders({ force = false, minIntervalMs = 30 * 1000 } = {}) {
    const now = Date.now();
    if (!force && now - lastBusySweepAt < minIntervalMs) return 0;
    lastBusySweepAt = now;

    const busy = await DeliveryBoy.find({ status: 'busy' }).select('_id').lean();
    let released = 0;
    for (const rider of busy) {
        if (await releaseRiderIfIdle(rider._id)) released += 1;
    }
    if (released > 0) console.log(`[RiderReconcile] Released ${released} idle rider(s) stuck on 'busy'.`);
    return released;
}
