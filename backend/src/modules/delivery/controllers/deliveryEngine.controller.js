import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Delivery from '../../../models/Delivery.model.js';
import DeliveryBatch from '../../../models/DeliveryBatch.model.js';
import { emitEvent } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { assertRiderIsFree, markRiderBusy, markRiderAvailable } from '../../../services/deliveryAvailability.service.js';

// Internal helper for state checking
const checkState = (current, expected) => {
    if (current !== expected) throw new ApiError(409, `Invalid State: Currently ${current}, expected ${expected}.`);
};

export const assignBatch = asyncHandler(async (req, res) => {
    const { orderIds } = req.body;
    const deliveryBoyId = req.user.id;

    if (!orderIds || !orderIds.length) throw new ApiError(400, "Provide orderIds to batch");

    const orders = await Order.find({ _id: { $in: orderIds }, status: 'ready_for_pickup' });
    if (orders.length === 0) throw new ApiError(400, "Orders not found or already assigned");

    await assertRiderIsFree(deliveryBoyId);

    const customerId = orders[0].userId;
    // verify all have same customer
    if (!orders.every(o => String(o.userId) === String(customerId))) {
        throw new ApiError(400, "Batch orders must belong to the exact same customer");
    }

    const batchId = `BATCH-${Date.now()}`;
    const newDeliveries = [];

    // Map orders to delivery objects
    for (let order of orders) {
        order.status = 'assigned';
        order.deliveryBoyId = deliveryBoyId;
        
        for (let vi of order.vendorItems) {
            vi.status = 'assigned';
            vi.deliveryBoyId = deliveryBoyId;
            
            newDeliveries.push(new Delivery({
                orderId: order._id,
                vendorId: vi.vendorId,
                deliveryBoyId,
                status: 'assigned',
                payment: {
                    originalAmount: vi.total || order.total,
                    method: order.paymentMethod,
                }
            }));
        }
        await order.save();
        emitEvent(`user_${customerId}`, 'order_assigned', { orderId: order._id });
        emitEvent(`user_${customerId}`, 'order_updated', { orderId: order._id });
    }

    const savedDeliveries = await Delivery.insertMany(newDeliveries);
    const dropoffCoords = orders[0].shippingAddress?.location?.coordinates || [0,0];

    const batch = new DeliveryBatch({
        batchId,
        customerId,
        deliveryBoyId,
        deliveries: savedDeliveries.map(d => d._id),
        status: 'assigned',
        customerLocation: { type: 'Point', coordinates: dropoffCoords },
        customerAddress: orders[0].shippingAddress,
        customerName: orders[0].shippingAddress.name
    });

    await batch.save();
    await markRiderBusy(deliveryBoyId);

    // Link deliveries to batchId
    await Delivery.updateMany(
        { _id: { $in: savedDeliveries.map(d => d._id) } }, 
        { batchId: batch._id }
    );
    req.app.get('io')?.to('delivery_partners').emit('orders_assigned_to_batch', { batchId });

    res.status(200).json(new ApiResponse(200, batch, "Batch successfully grouped & assigned"));
});

export const getDeliveryFlow = asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id }).populate('deliveries');
    if (!batch) throw new ApiError(404, "Batch not found for this partner");
    res.status(200).json(new ApiResponse(200, batch, "Delivery Batch fetched"));
});

export const pickupBatch = asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id }).populate('deliveries');
    if (!batch) throw new ApiError(404, "Batch not found");
    
    // Check state
    checkState(batch.status, 'assigned');

    const { packagePhoto, sealedBoxPhoto } = req.body;
    if (!packagePhoto || !sealedBoxPhoto) throw new ApiError(400, "Requires package and sealed box proofs");

    await Delivery.updateMany(
        { _id: { $in: batch.deliveries.map(d => d._id) } }, 
        { status: 'picked_up', packagePhoto, sealedBoxPhoto, pickedUpAt: new Date(), pickupCompleted: true }
    );
    
    // Sync order statuses
    const deliveries = await Delivery.find({ _id: { $in: batch.deliveries } });
    const orderIds = deliveries.map(d => d.orderId);
    await Order.updateMany(
        { _id: { $in: orderIds } },
        { status: 'picked_up' }
    );
    orderIds.forEach(id => {
        emitEvent(`user_${batch.customerId}`, 'order_picked_up', { orderId: id });
    });
    
    batch.status = 'picked_up';
    await batch.save();

    res.status(200).json(new ApiResponse(200, batch, "Items verified and picked up"));
});

export const startBatchDelivery = asyncHandler(async (req, res) => {
     const { batchId } = req.params;
     const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id }).populate('deliveries');
     if (!batch) throw new ApiError(404, "Batch not found");
     
     checkState(batch.status, 'picked_up');
     
     await Delivery.updateMany(
        { _id: { $in: batch.deliveries.map(d => d._id) } }, 
        { status: 'out_for_delivery', deliveryStarted: true, outForDeliveryAt: new Date() }
     );
     
     // Sync order statuses
     const deliveries = await Delivery.find({ _id: { $in: batch.deliveries } });
     const orderIds = deliveries.map(d => d.orderId);
     await Order.updateMany(
         { _id: { $in: orderIds } },
         { status: 'out_for_delivery' }
     );
     orderIds.forEach(id => {
         emitEvent(`user_${batch.customerId}`, 'order_out_for_delivery', { orderId: id });
     });
     
     batch.status = 'out_for_delivery';
     await batch.save();

     emitEvent(`user_${batch.customerId}`, 'batch_out_for_delivery', { batchId });
     res.status(200).json(new ApiResponse(200, batch, "Delivery started and Live Tracking enabled"));
});

export const markBatchArrived = asyncHandler(async (req, res) => {
     const { batchId } = req.params;
     const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id }).populate('deliveries');
     if (!batch) throw new ApiError(404, "Batch not found");
     
     checkState(batch.status, 'out_for_delivery');
     
     batch.status = 'arrived';
     
     // Generate OTP logic securely...
     const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
     batch.deliveryOtp = generatedOtp; 
     batch.deliveryOtpSentAt = new Date();
     
     createNotification({
         recipientId: batch.customerId,
         recipientType: 'user',
         title: 'Your Order Has Arrived',
         message: `Your delivery partner has arrived! Secure Delivery OTP: ${generatedOtp}. Do not share it until you open the box.`
     });

     await Delivery.updateMany(
        { _id: { $in: batch.deliveries.map(d => d._id) } }, 
        { status: 'arrived', arrivedAtCustomer: true, arrivedAt: new Date() }
     );

     // Sync order statuses - for legacy Arrival tracking
     const deliveries = await Delivery.find({ _id: { $in: batch.deliveries } });
     const orderIds = deliveries.map(d => d.orderId);
     await Order.updateMany(
         { _id: { $in: orderIds } },
         { status: 'out_for_delivery' } // Orders usually stay in 'out_for_delivery' until final completion or 'arrived' if supported
     );
     orderIds.forEach(id => {
         emitEvent(`user_${batch.customerId}`, 'rider_arrived', { orderId: id, otp: generatedOtp });
     });
     
     await batch.save();

     emitEvent(`user_${batch.customerId}`, 'batch_arrived', { batchId });
     res.status(200).json(new ApiResponse(200, batch, "Marked arrived & generated OTP"));
});

export const processTryAndBuy = asyncHandler(async (req, res) => {
     const { batchId } = req.params;
     const { tryAndBuyMapping } = req.body; // Array: [{ deliveryId, acceptedItems[], rejectedItems[] }]
     const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id }).populate({
         path: 'deliveries',
         populate: { path: 'orderId' }
     });
     if (!batch) throw new ApiError(404, "Batch not found");
     
     checkState(batch.status, 'arrived');
     
     batch.status = 'try_and_buy';

     for (const mapping of tryAndBuyMapping) {
         const delivery = await Delivery.findById(mapping.deliveryId).populate('orderId');
         if (!delivery) continue;

         const order = delivery.orderId;
         // Find the specific vendor group in the order
         const vendorGroup = order.vendorItems.find(vi => String(vi.vendorId) === String(delivery.vendorId));
         
         let recalculatedAmount = 0;
         if (vendorGroup) {
             // Calculate sum of price * quantity for accepted items only
             // mapping.acceptedItems contains IDs or names. Let's assume they are item IDs for now or variant keys.
             // If 'main' is used as a placeholder in the UI, we adjust.
             
             if (mapping.acceptedItems.includes('all') || mapping.acceptedItems.includes('main')) {
                 recalculatedAmount = vendorGroup.total || (vendorGroup.subtotal + vendorGroup.tax + vendorGroup.shipping - vendorGroup.discount);
             } else {
                 // specific items logic
                 const acceptedSet = new Set(mapping.acceptedItems.map(id => String(id)));
                 const acceptedItems = vendorGroup.items.filter(item => acceptedSet.has(String(item._id)));
                 
                 const subtotal = acceptedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                 const tax = (subtotal * 0.18); // Example tax or use proportion
                 recalculatedAmount = subtotal + tax + (vendorGroup.shipping || 0);
             }
         }

         await Delivery.updateOne(
             { _id: mapping.deliveryId },
             { 
                 status: 'payment_pending',
                 tryAndBuy: { 
                     enabled: true, 
                     acceptedItems: mapping.acceptedItems, 
                     rejectedItems: mapping.rejectedItems 
                 },
                 'payment.recalculatedAmount': recalculatedAmount
             }
         );
     }
     
     await batch.save();
     res.status(200).json(new ApiResponse(200, batch, "Saved Try and Buy answers and recalculated totals."));
});

export const processBatchPayment = asyncHandler(async (req, res) => {
     const { batchId } = req.params;
     const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id });
     if (!batch) throw new ApiError(404, "Batch not found");
     
     checkState(batch.status, 'try_and_buy');
     
     batch.status = 'payment_pending';
     await batch.save();
     
     // Recalculate Logic dynamically happens on frontend & verified centrally here via services
     res.status(200).json(new ApiResponse(200, batch, "Payment state established"));
});

export const completeBatchDelivery = asyncHandler(async (req, res) => {
     const { batchId } = req.params;
     const { otp, openBoxPhoto } = req.body;
     const batch = await DeliveryBatch.findOne({ batchId, deliveryBoyId: req.user.id });
     if (!batch) throw new ApiError(404, "Batch not found");
     
     // Frontend currently completes straight from 'try_and_buy' (it never calls
     // processBatchPayment), so allow either state here — but still block completing
     // from earlier phases (assigned/picked_up/out_for_delivery/arrived).
     if (!['try_and_buy', 'payment_pending'].includes(batch.status)) {
         throw new ApiError(409, `Invalid State: Currently ${batch.status}, expected try_and_buy or payment_pending.`);
     }

     if (String(otp).trim() !== String(batch.deliveryOtp).trim()) {
         batch.deliveryOtpAttempts += 1;
         await batch.save();
         throw new ApiError(400, "Invalid OTP provided");
     }

     if (!openBoxPhoto) {
         throw new ApiError(400, "Open Box verification photo required to finalize.");
     }

     batch.status = 'delivered';
     batch.deliveryOtp = null; // Clean up
     await Delivery.updateMany(
        { _id: { $in: batch.deliveries } }, 
        { status: 'delivered', otpVerified: true, openBoxPhoto, deliveredAt: new Date() }
     );

     // Sync order statuses
     const deliveries = await Delivery.find({ _id: { $in: batch.deliveries } });
     const orders = await Order.find({ _id: { $in: deliveries.map(d => d.orderId) } });
     
     const { WalletService } = await import('../../../services/wallet.service.js');
     
     for (let order of orders) {
         order.status = 'delivered';
         order.deliveredAt = new Date();
         if (order.vendorItems) {
            order.vendorItems.forEach(vi => {
                vi.status = 'delivered';
                vi.deliveredAt = new Date();
            });
         }
         await order.save();
         
         // Credit earnings
         await WalletService.processOrderCompletion(order).catch(e => console.error(`[Batch Earnings] Failed for ${order._id}:`, e.message));
         
         emitEvent(`user_${batch.customerId}`, 'order_delivered', { orderId: order._id });
     }

     batch.status = 'delivered';
     await batch.save();
     await markRiderAvailable(batch.deliveryBoyId);

     res.status(200).json(new ApiResponse(200, batch, "Batch delivered and verified successfully!"));
});
