import Order from '../models/Order.model.js';
import ApiError from '../utils/ApiError.js';
import { emitEvent } from './socket.service.js';
import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { OrderNotificationService } from './orderNotification.service.js';

/**
 * Helper to notify eligible riders within 8km
 */
async function notifyEligibleRiders(order) {
    if (typeof order.populate === 'function' && !order.populated('vendorItems.vendorId')) {
        await order.populate({
            path: 'vendorItems.vendorId',
            select: 'storeName shopAddress address shopLocation'
        });
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

    const payload = {
        orderId: order.orderId,
        id: order._id,
        total: order.total,
        customer: order.shippingAddress?.name || 'Customer',
        address: order.shippingAddress?.address || 'Address',
        vendorName,
        vendorAddress,
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        distance: 'N/A',
        estimatedTime: 'Searching...',
        deliveryFee: 25,
        isReturn: false,
        isMultiVendor: order.isMultiVendor,
        vendorPickups: order.vendorPickups,
        type: 'new_assignment_broadcast'
    };

    if (!order.pickupLocation || !order.pickupLocation.coordinates || 
        (order.pickupLocation.coordinates[0] === 0 && order.pickupLocation.coordinates[1] === 0)) {
        emitEvent('delivery_partners', 'order_ready_for_pickup', payload);
        return;
    }

    const pickupCoords = order.pickupLocation.coordinates;
    
    const eligibleRiders = await DeliveryBoy.find({
        status: 'available',
        currentLocation: {
            $geoWithin: {
                $centerSphere: [pickupCoords, 8 / 6378.1]
            }
        }
    }).select('_id');

    if (eligibleRiders.length === 0) {
        emitEvent('delivery_partners', 'order_ready_for_pickup', payload);
    } else {
        eligibleRiders.forEach(rider => {
            emitEvent(`delivery_${rider._id}`, 'order_ready_for_pickup', payload);
        });
    }
}

export const OrderWorkflowService = {

    async vendorAccept(orderId, vendorId) {
        const order = await Order.findOneAndUpdate(
            {
                $and: [
                    { $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }] },
                    { status: 'pending' },
                    { 'vendorItems.vendorId': vendorId }
                ]
            },
            {
                $set: {
                    status: 'searching',
                    vendorAcceptedAt: new Date(),
                    readyAt: new Date(),
                    searchStartedAt: new Date(),
                    'vendorItems.$[elem].status': 'ready_for_pickup',
                    'vendorItems.$[elem].acceptedAt': new Date(),
                    'vendorItems.$[elem].readyAt': new Date()
                }
            },
            { 
                new: true,
                arrayFilters: [{ 'elem.vendorId': vendorId }]
            }
        ).populate('userId', 'name fcmTokens phone');

        if (!order) throw new ApiError(409, 'Order is no longer available or already accepted.');

        const { QueueService } = await import('./queue.service.js');
        const { autoAssignDeliveryBoy } = await import('./autoAssignment.service.js');
        await QueueService.scheduleAdminEscalation(order._id);
        await QueueService.scheduleUserNoPartnerNotification(order._id);

        // IMPORTANT: Run autoAssign FIRST so the order gets a deliveryBoyId before the
        // notification service checks whether to broadcast to all nearby riders.
        await autoAssignDeliveryBoy(order._id).catch(err => console.error('[OrderWorkflow] Auto assignment failed:', err));
        await OrderNotificationService.notifyOrderUpdate(order._id, 'searching', { excludeRecipientId: vendorId });
        
        return order;
    },

    async markReady(orderId, vendorId, readyPhoto) {
        const order = await Order.findOneAndUpdate(
            {
                $and: [
                    { $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }] },
                    { status: 'accepted' },
                    { 'vendorItems.vendorId': vendorId }
                ]
            },
            {
                $set: {
                    status: 'searching',
                    readyAt: new Date(),
                    readyPhoto,
                    searchStartedAt: new Date(),
                    'vendorItems.$[elem].status': 'ready_for_pickup',
                    'vendorItems.$[elem].readyAt': new Date()
                }
            },
            { 
                new: true,
                arrayFilters: [{ 'elem.vendorId': vendorId }]
            }
        ).populate('userId', 'name fcmTokens');

        if (!order) throw new ApiError(409, 'Order status must be "accepted" to mark it ready.');

        const { QueueService } = await import('./queue.service.js');
        const { autoAssignDeliveryBoy } = await import('./autoAssignment.service.js');
        await QueueService.scheduleAdminEscalation(order._id);
        await QueueService.scheduleUserNoPartnerNotification(order._id);
        
        // IMPORTANT: Run autoAssign FIRST so the order gets a deliveryBoyId before the
        // notification service checks whether to broadcast to all nearby riders.
        await autoAssignDeliveryBoy(order._id).catch(err => console.error('[OrderWorkflow] Auto assignment failed:', err));
        await OrderNotificationService.notifyOrderUpdate(order._id, 'searching', { excludeRecipientId: vendorId });

        return order;
    },

    async riderClaim(orderId, riderId) {
        const order = await Order.findOneAndUpdate(
            {
                $and: [
                    { $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }] },
                    { status: { $in: ['ready_for_pickup', 'searching', 'accepted'] } },
                    { deliveryBoyId: { $exists: false } }
                ]
            },
            {
                $set: {
                    status: 'assigned',
                    deliveryBoyId: riderId,
                    assignedAt: new Date()
                }
            },
            { new: true }
        );

        if (!order) throw new ApiError(409, 'Too slow! This job has already been claimed.');

        const otp = order.generateDeliveryOtp();
        await order.save();
        
        emitEvent('delivery_partners', 'order_taken', { orderId: order.orderId || order._id });
        await OrderNotificationService.notifyOrderUpdate(order._id, 'assigned');
        
        return order;
    },

    async markArrived(orderId, riderId) {
        const order = await Order.findOne({
            $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }],
            deliveryBoyId: riderId,
            status: { $in: ['picked_up', 'out_for_delivery'] }
        }).select('+deliveryOtpDebug');

        if (!order) throw new ApiError(404, 'Order not found.');

        if (order.status === 'picked_up') {
            order.status = 'out_for_delivery';
            await order.save();
        }

        // Specialized arrived event for OTP display on user side
        emitEvent(`user_${order.userId}`, 'rider_arrived', {
            orderId: order.orderId,
            otp: order.deliveryOtpDebug
        });

        await OrderNotificationService.notifyOrderUpdate(order._id, 'out_for_delivery');
        return order;
    },

    async completePickup(orderId, riderId, otp) {
        const order = await Order.findOneAndUpdate(
            {
                $and: [
                    { $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }] },
                    { status: 'assigned' },
                    { deliveryBoyId: riderId }
                ]
            },
            {
                $set: {
                    status: 'picked_up',
                    pickedUpAt: new Date(),
                    'vendorItems.$[].status': 'picked_up',
                    'vendorItems.$[].pickedUpAt': new Date()
                }
            },
            { new: true }
        );

        if (!order) throw new ApiError(404, 'Order not found.');

        await OrderNotificationService.notifyOrderUpdate(order._id, 'picked_up');
        return order;
    },

    async riderComplete(orderId, riderId, otp, deliveryPhoto) {
        const orderCheck = await Order.findOne({
            $and: [
                { $or: [{ _id: mongoose.isValidObjectId(orderId) ? orderId : null }, { orderId: orderId }] },
                { status: { $in: ['picked_up', 'out_for_delivery'] } },
                { deliveryBoyId: riderId }
            ]
        }).select('+deliveryOtpHash +deliveryOtpDebug +deliveryOtpExpiry');

        if (!orderCheck) throw new ApiError(404, 'Order mismatch.');

        const isMatch = await orderCheck.compareDeliveryOtp(otp);
        if (!isMatch) throw new ApiError(401, 'Invalid OTP.');

        const order = await Order.findOneAndUpdate(
            { _id: orderCheck._id },
            {
                $set: {
                    status: 'delivered',
                    deliveredAt: new Date(),
                    deliveryPhoto: deliveryPhoto,
                    'vendorItems.$[].status': 'delivered',
                    'vendorItems.$[].deliveredAt': new Date()
                }
            },
            { new: true }
        );

        await OrderNotificationService.notifyOrderUpdate(order._id, 'delivered');
        return order;
    }
};
