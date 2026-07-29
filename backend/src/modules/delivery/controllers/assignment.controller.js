import { cacheInvalidate } from './order.controller.js';
import mongoose from 'mongoose';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Order from '../../../models/Order.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import DeliveryBatch from '../../../models/DeliveryBatch.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import OrderNotificationService from '../../../services/orderNotification.service.js';
import { calculateDistance, calculatePathDistance, getDeliveryEarning, getVendorPickupFee } from '../../../utils/geo.js';
import { getDeliveryFeeConfig } from '../../../utils/deliveryFeeConfig.js';
import { autoAssignDeliveryBoy } from '../../../services/autoAssignment.service.js';


/**
 * Find nearby delivery boys for an order
 */
export const findNearbyDeliveryBoys = async (order, radiusMeters = 8000) => {
    const pickupLocation = order.pickupLocation;
    
    if (!pickupLocation || !pickupLocation.coordinates || (pickupLocation.coordinates[0] === 0 && pickupLocation.coordinates[1] === 0)) {
        return [];
    }

    // High-performance direct indexed query (Faster than aggregation for simple radius)
    return await DeliveryBoy.find({
        status: 'available',
        isAvailable: true,
        currentLocation: {
            $near: {
                $geometry: { type: 'Point', coordinates: pickupLocation.coordinates },
                $maxDistance: radiusMeters,
            },
        },
    }).limit(10).lean();
};

/**
 * Find nearby delivery partners for a return pickup
 */
export const findNearbyDeliveryBoysForReturn = async (returnRequest, radiusMeters = 8000) => {
    const pickupLocation = returnRequest.pickupLocation;
    console.log(`[Radius Search Return] Searching within ${radiusMeters}m of ${pickupLocation?.coordinates?.map(Number).join(', ')}`);

    if (!pickupLocation || !pickupLocation.coordinates || (pickupLocation.coordinates[0] === 0 && pickupLocation.coordinates[1] === 0)) {
        console.warn(`[Radius Search Return] ⚠️ Invalid pickup coordinates:`, pickupLocation?.coordinates);
        return [];
    }

    const nearbyBoys = await DeliveryBoy.aggregate([
        {
            $geoNear: {
                near: {
                    type: 'Point',
                    coordinates: pickupLocation.coordinates.map(Number),
                },
                distanceField: 'distance',
                maxDistance: radiusMeters,
                query: { 
                    status: 'available', 
                    isAvailable: true
                },
                spherical: true,
            },
        },
        { $limit: 10 },
    ]);

    if (nearbyBoys.length > 0) {
        console.log(`[Radius Search Return] Found ${nearbyBoys.length} boys.`);
    } else {
        console.log(`[Radius Search Return] ❌ No available boys found within ${radiusMeters}m for return.`);
    }

    return nearbyBoys;
};

/**
 * Notify nearby delivery boys about a new available order
 */
export const notifyNearbyDeliveryBoys = async (order) => {
    // Populate vendor info if not already there to show shop address
    if (typeof order.populate === 'function' && !order.populated('vendorItems.vendorId')) {
        await order.populate({
            path: 'vendorItems.vendorId',
            select: 'storeName shopAddress address shopLocation'
        });
    }

    console.log(`\n--- 🔍 [DELIVERY SEARCH] ---`);
    console.log(`Order: ${order.orderId} (${order._id})`);
    console.log(`Pickup Location: (${order.pickupLocation?.coordinates?.join(', ') || 'NONE'})`);

    const nearbyBoys = await findNearbyDeliveryBoys(order);
    console.log(`[Assignment] Nearby Boys matches from DB: ${nearbyBoys.length}`);
    
    // Calculate Earning & Distance for the socket popup (estimation only — final locked at completion)
    let estimatedDistance = order.deliveryDistance ? `${order.deliveryDistance} km` : '0 km';
    let estimatedTime = 'N/A';
    let deliveryFee = order.deliveryEarnings || 25;

    try {
        const feeConfig = await getDeliveryFeeConfig();
        const dropoffCoords = order.dropoffLocation?.coordinates;
        const pickupCoords = order.pickupLocation?.coordinates;

        if (pickupCoords?.length === 2 && dropoffCoords?.length === 2 && (dropoffCoords[0] !== 0 || dropoffCoords[1] !== 0)) {
            console.log(`[Assignment] Calculating distance to customer at ${dropoffCoords.join(', ')}...`);
            const { getDistanceMatrix } = await import('../../../services/googleMaps.service.js');
            
            const matrix = await getDistanceMatrix(pickupCoords, dropoffCoords);
            let distanceVal = order.deliveryDistance || 0;

            if (matrix) {
                distanceVal = matrix.distance;
                estimatedDistance = `${matrix.distance} km`;
                estimatedTime = matrix.duration;
                console.log(`[Assignment] Distance Matrix result: ${estimatedDistance}, ${estimatedTime}`);
            } else if (!order.deliveryDistance) {
                distanceVal = calculateDistance(pickupCoords, dropoffCoords);
                estimatedDistance = `${distanceVal} km (est.)`;
                estimatedTime = `${Math.round(distanceVal * 3)} mins`;
                console.log(`[Assignment] Haversine fallback result: ${estimatedDistance}`);
            }
            
            // Estimate fee: distance fee + vendor routing distance fee (for multi-vendor)
            if (distanceVal > 0) {
                let vendorRoutingDistance = 0;
                if (order.isMultiVendor && order.vendorPickups?.length > 1) {
                    const sortedPickups = [...order.vendorPickups].sort((a, b) => a.sequence - b.sequence);
                    const vendorCoords = sortedPickups.map(p => p.shopLocation?.coordinates).filter(c => c && c.length === 2);
                    vendorRoutingDistance = calculatePathDistance(vendorCoords);
                }
                
                deliveryFee = getDeliveryEarning(distanceVal, feeConfig) + getVendorPickupFee(vendorRoutingDistance, feeConfig);
            }
            console.log(`[Assignment] Estimated Delivery Fee: ₹${deliveryFee}`);
        }
    } catch (err) {
        console.error('❌ [AssignmentDistance Error]', err.message);
    }

    const firstVendorGroup = order.vendorItems?.[0] || {};
    const vendorData = firstVendorGroup.vendorId || {};
    const vendorName = vendorData.storeName || firstVendorGroup.vendorName || 'Vendor';
    
    let vendorAddress = vendorData.shopAddress || 'Shop Address';
    if (!vendorAddress || vendorAddress === 'Shop Address') {
        if (vendorData.address?.street) {
            vendorAddress = `${vendorData.address.street}, ${vendorData.address.city || ''}`;
        }
    }

    const socketPayload = {
        orderId: order.orderId,
        id: order._id,
        pickupLocation: order.pickupLocation,
        customer: order.shippingAddress?.name || 'Customer',
        address: order.shippingAddress?.address || 'Address unavailable',
        vendorName,
        vendorAddress,
        total: order.total,
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        distance: estimatedDistance,
        estimatedTime: estimatedTime,
        deliveryFee: deliveryFee,
        isMultiVendor: order.isMultiVendor,
        vendorPickups: order.vendorPickups,
        type: 'new_assignment_broadcast'
    };

    // NOTE: Broadcast to all nearby/global riders removed. Auto-assignment (autoAssignment.service.js)
    // handles finding and notifying the specific assigned rider. Broadcasting here was
    // disturbing ALL nearby delivery boys who are not assigned to this order.
    console.log(`ℹ️ [Assignment] Found ${nearbyBoys.length} nearby partners. Skipping broadcast — auto-assignment will notify the assigned rider directly.`);
    console.log(`--- ✅ [DELIVERY NOTIFICATION FINISHED] ---\n`);
    return nearbyBoys.length;
};

/**
 * Notify nearby delivery partners about a return pickup
 */
export const notifyNearbyDeliveryBoysForReturn = async (returnRequest) => {
    const nearbyBoys = await findNearbyDeliveryBoysForReturn(returnRequest);
    // REMOVED early exit to allow global broadcast fallback if no one is nearby

    const orderId = returnRequest.orderId?.orderId || 'Order';

    const notificationPromises = nearbyBoys.map(boy =>
        createNotification({
            recipientId: boy._id,
            recipientType: 'delivery',
            title: 'Return Request Available',
            message: `A return request for #${orderId} is ready for pickup near you.`,
            type: 'return',
            data: {
                returnId: String(returnRequest._id),
                orderId: orderId,
                pickupLocation: JSON.stringify(returnRequest.pickupLocation),
                dropoffLocation: JSON.stringify(returnRequest.dropoffLocation),
                type: 'return_pickup_broadcast'
            }
        })
    );

    // Calculate Distance & Earning for the return broadcast
    let estimatedDistance = 'N/A';
    let estimatedTime = 'N/A';
    let deliveryFee = 25;

    try {
        if (returnRequest.pickupLocation?.coordinates?.length === 2 && returnRequest.dropoffLocation?.coordinates?.length === 2) {
            const { getDistanceMatrix } = await import('../../../services/googleMaps.service.js');
            const { calculateDistance, getDeliveryEarning } = await import('../../../utils/geo.js');
            
            const matrix = await getDistanceMatrix(returnRequest.pickupLocation.coordinates, returnRequest.dropoffLocation.coordinates);
            let distanceVal = 0;

            if (matrix) {
                distanceVal = matrix.distance;
                estimatedDistance = `${matrix.distance} km`;
                estimatedTime = matrix.duration;
            } else {
                distanceVal = calculateDistance(returnRequest.pickupLocation.coordinates, returnRequest.dropoffLocation.coordinates);
                estimatedDistance = `${distanceVal} km (est.)`;
                estimatedTime = `${Math.round(distanceVal * 3)} mins`;
            }
            deliveryFee = getDeliveryEarning(distanceVal);
        }
    } catch (err) {
        console.error('[ReturnDistance] Failed to calculate return distance:', err.message);
    }

    let customerAddress = 'Address unavailable';
    let vendorAddress = 'Shop Address unavailable';
    let vendorName = 'Vendor';
    
    try {
        const Order = (await import('../../../models/Order.model.js')).default;
        const orderDoc = await Order.findById(returnRequest.orderId?._id || returnRequest.orderId);
        if (orderDoc?.shippingAddress?.address) {
            customerAddress = orderDoc.shippingAddress.address;
        }
        
        const Vendor = (await import('../../../models/Vendor.model.js')).default;
        const vendorDoc = await Vendor.findById(returnRequest.vendorId);
        if (vendorDoc) {
            vendorName = vendorDoc.storeName || 'Vendor';
            vendorAddress = vendorDoc.shopAddress || vendorAddress;
        }
    } catch (e) {
        console.error('[ReturnPayload Enrich Error]', e.message);
    }

    const returnPayload = {
        returnId: String(returnRequest._id),
        id: String(returnRequest._id),
        orderId: orderId,
        pickupLocation: returnRequest.pickupLocation,
        dropoffLocation: returnRequest.dropoffLocation,
        customerName: returnRequest.userId?.name || 'Customer',
        customer: returnRequest.userId?.name || 'Customer',
        vendorName: vendorName,
        address: customerAddress,
        vendorAddress: vendorAddress,
        total: returnRequest.orderId?.total || 0,
        distance: estimatedDistance,
        estimatedTime: estimatedTime,
        deliveryFee: deliveryFee,
        type: 'return'
    };

    // NOTE: Return broadcast to all nearby/global riders removed. 
    // Auto-assignment handles finding and notifying the specific assigned rider.
    // Broadcasting here was disturbing ALL nearby delivery boys.
    if (nearbyBoys.length > 0) {
        await Promise.allSettled(notificationPromises);
    }
    console.log(`ℹ️ [Return Assignment] Found ${nearbyBoys.length} nearby partners. Skipping broadcast — auto-assignment will notify the assigned rider directly.`);
    return nearbyBoys.length;
};

/**
 * Handle delivery boy accepting an order (First-Accept logic)
 */
export const acceptOrderAssignment = asyncHandler(async (req, res) => {
    const { id: orderId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    let orderObjectId = null;
    if (mongoose.isValidObjectId(orderId)) {
        orderObjectId = new mongoose.Types.ObjectId(orderId);
        idFilter.push({ _id: orderObjectId });
    }

    // ── BLOCKER: Ensure rider doesn't already have an active mission (Order or Return) ──
    const activeOrderQuery = {
        deliveryBoyId: deliveryBoyId,
        isDeleted: { $ne: true },
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived'] }
    };
    if (orderObjectId) {
        activeOrderQuery._id = { $ne: orderObjectId };
    } else {
        activeOrderQuery.orderId = { $ne: orderId };
    }

    const [hasActiveOrder, hasActiveReturn] = await Promise.all([
        Order.exists(activeOrderQuery),
        ReturnRequest.exists({
            deliveryBoyId: deliveryBoyId,
            status: 'processing'
        })
    ]);

    if (hasActiveOrder || hasActiveReturn) {
        throw new ApiError(400, 'Mission in progress: You must complete your current task before accepting another.');
    }

    // Atomic update to prevent double assignment
    // Accepts both single-vendor (ready_for_pickup) and multi-vendor (all_vendors_ready) orders,
    // and also allows orders pre-assigned by Admin or already assigned to the same delivery boy.
    const order = await Order.findOneAndUpdate(
        {
            $and: [
                { $or: idFilter },
                { status: { $in: ['ready_for_pickup', 'all_vendors_ready', 'processing', 'assigned', 'searching'] } },
                { 
                    $or: [
                        { deliveryBoyId: null }, 
                        { deliveryBoyId: { $exists: false } },
                        { deliveryBoyId: deliveryBoyId }
                    ] 
                }
            ]
        },
        {
            $set: {
                status: 'assigned',
                deliveryBoyId: deliveryBoyId,
                riderAcceptedAt: new Date()
            }
        },
        { new: true }
    );

    if (!order) {
        throw new ApiError(409, 'Order is no longer available or has already been assigned.');
    }

    // Update Delivery Boy status to busy so they don't receive new requests
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'busy' });

    // ── Multi-Vendor Stop Setup & DeliveryBatch creation ──
    if (order.isMultiVendor || order.vendorPickups?.length > 0 || order.status === 'all_vendors_ready') {
        try {
            // Get rider's current location for nearest-first sorting
            const rider = await DeliveryBoy.findById(deliveryBoyId).select('currentLocation');
            const riderCoords = rider?.currentLocation?.coordinates;

            const sortStopsNearestFirst = (stops, coords) => {
                if (!coords || coords.length < 2) return stops;
                return [...stops].sort((a, b) => {
                    const distA = calculateDistance(coords, a.shopLocation?.coordinates || [0, 0]);
                    const distB = calculateDistance(coords, b.shopLocation?.coordinates || [0, 0]);
                    return distA - distB;
                });
            };

            let rawStops = order.vendorPickups || [];
            if (rawStops.length === 0) {
                const populatedOrder = await Order.findById(order._id).populate('vendorItems.vendorId', 'storeName shopAddress shopLocation');
                rawStops = (populatedOrder?.vendorItems || []).map((vi, idx) => {
                    const vendorDoc = vi.vendorId;
                    const otp = Math.floor(100000 + Math.random() * 900000).toString();
                    return {
                        vendorId: vi.vendorId?._id || vi.vendorId,
                        vendorName: vendorDoc?.storeName || vi.vendorName,
                        shopLocation: vendorDoc?.shopLocation || { type: 'Point', coordinates: [0, 0] },
                        shopAddress: vendorDoc?.shopAddress || '',
                        sequence: idx,
                        status: 'pending',
                        handoverOtp: otp,
                        handoverOtpHash: otp,
                        handoverOtpDebug: otp,
                        handoverOtpSentAt: new Date(),
                    };
                });
                await Order.findByIdAndUpdate(order._id, { vendorPickups: rawStops });
                order.vendorPickups = rawStops;
            }
            const sortedStops = sortStopsNearestFirst(rawStops, riderCoords);
            const pickupStops = sortedStops.map((stop, idx) => ({
                vendorId: stop.vendorId,
                vendorName: stop.vendorName,
                shopAddress: stop.shopAddress,
                location: stop.shopLocation,
                sequence: idx,
                status: 'pending',
                otpVerified: false,
            }));

            // Re-sequence vendorPickups on the order to match sorted stops
            const resequencedPickups = sortedStops.map((stop, idx) => ({ ...stop.toObject?.() || stop, sequence: idx }));
            await Order.findByIdAndUpdate(order._id, { vendorPickups: resequencedPickups });

            // Create DeliveryBatch for this multi-vendor trip
            const batchId = `MVBATCH-${Date.now()}`;
            await DeliveryBatch.create({
                batchId,
                deliveryBoyId,
                customerId: order.userId,
                isMultiVendor: true,
                currentStopIndex: 0,
                pickupStops,
                customerLocation: order.dropoffLocation,
                customerAddress: order.shippingAddress,
                customerName: order.shippingAddress?.name,
                status: 'assigned',
            });
            console.log(`[MultiVendor] Successfully created DeliveryBatch for order ${order.orderId} via default accept route.`);
        } catch (mvErr) {
            console.error(`[MultiVendor] Error setting up batch in default accept route:`, mvErr);
        }
    }

    // Unified Notification to all parties
    await OrderNotificationService.notifyOrderUpdate(order._id, 'assigned', {
        title: 'Delivery Partner Assigned',
        message: `A delivery partner has been assigned to order ${order.orderId}.`
    });

    // Notify other delivery partners that this order is taken (Global broadcast to clear UI)
    emitEvent('delivery_partners', 'order_taken', {
        orderId: order.orderId,
        id: order._id
    });

    await cacheInvalidate(`dash:${deliveryBoyId}`, `profile:${deliveryBoyId}`);

    res.status(200).json(new ApiResponse(200, order, 'Order assigned successfully.'));
});

/**
 * Handle delivery boy rejecting an auto-assigned order
 */
export const rejectOrderAssignment = asyncHandler(async (req, res) => {
    const { id: orderId } = req.params;
    const deliveryBoyId = req.user.id;

    console.log(`[RejectAssignment] Rider ${deliveryBoyId} requested rejection for order: ${orderId}`);

    const idFilter = [];
    if (mongoose.isValidObjectId(orderId)) {
        idFilter.push({ _id: new mongoose.Types.ObjectId(orderId) });
    }
    idFilter.push({ orderId });

    const order = await Order.findOne({
        $or: idFilter,
        deliveryBoyId: deliveryBoyId
    });

    if (!order) {
        throw new ApiError(404, 'Order assignment not found or already assigned/reassigned to another rider.');
    }

    // Prevent rejection if rider has already proceeded beyond assignment
    if (['picked_up', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)) {
        throw new ApiError(400, 'Cannot reject order assignment once pickup has started.');
    }

    // 1. Mark this delivery boy as rejected for this order
    if (!order.rejectedDeliveryBoys.includes(deliveryBoyId)) {
        order.rejectedDeliveryBoys.push(deliveryBoyId);
    }

    // 2. Clear assignment on the Order
    order.deliveryBoyId = undefined;
    order.status = 'searching';
    order.vendorPickups = []; // Will be recalculated by new assignment
    await order.save();

    // 3. Re-enable rider availability
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'available' });

    // 4. Delete the DeliveryBatch
    await DeliveryBatch.deleteMany({
        customerId: order.userId,
        deliveryBoyId: deliveryBoyId,
        status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] }
    });

    // 5. Trigger auto assignment for the next nearest rider (excluding current one)
    console.log(`[RejectAssignment] Triggering autoAssignment search excluding current rider ${deliveryBoyId}`);
    autoAssignDeliveryBoy(order._id, [deliveryBoyId]).catch(err => {
        console.error("[RejectAssignment] Background autoAssign trigger failed:", err);
    });

    await cacheInvalidate(`dash:${deliveryBoyId}`, `profile:${deliveryBoyId}`);

    res.status(200).json(new ApiResponse(200, null, 'Assignment rejected. Searching for another partner.'));
});

