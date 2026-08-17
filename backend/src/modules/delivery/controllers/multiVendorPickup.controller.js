import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import DeliveryBatch from '../../../models/DeliveryBatch.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import { emitEvent } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { calculateDistance } from '../../../utils/geo.js';
import { uploadLocalFileToCloudinaryAndCleanup, cleanupLocalFiles } from '../../../services/upload.service.js';

// ─── Helper: sort vendor stops nearest-first from rider's location ───
const sortStopsNearestFirst = (stops, riderCoords) => {
    if (!riderCoords || riderCoords.length < 2) return stops;
    return [...stops].sort((a, b) => {
        const distA = calculateDistance(riderCoords, a.shopLocation?.coordinates || [0, 0]);
        const distB = calculateDistance(riderCoords, b.shopLocation?.coordinates || [0, 0]);
        return distA - distB;
    });
};

// GET /api/delivery/multi-vendor/available
// Returns all orders in 'all_vendors_ready' status (not yet assigned)
export const getAvailableMultiVendorOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({
        status: 'all_vendors_ready',
        deliveryBoyId: { $exists: false },
        isDeleted: { $ne: true },
    })
        .select('orderId total orderType shippingAddress vendorItems isMultiVendor vendorPickups createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

    res.status(200).json(new ApiResponse(200, orders, 'Available multi-vendor orders'));
});

// POST /api/delivery/multi-vendor/:orderId/accept
// Delivery boy self-assigns to a multi-vendor order (first-accept wins)
export const acceptMultiVendorOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const deliveryBoyId = req.user.id;

    let orderObjectId = null;
    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) {
        orderObjectId = new mongoose.Types.ObjectId(orderId);
        idFilter.push({ _id: orderObjectId });
    }

    // Block if rider already has active mission (excluding this order itself)
    const activeOrderQuery = {
        deliveryBoyId,
        isDeleted: { $ne: true },
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'all_vendors_ready'] },
    };
    if (orderObjectId) {
        activeOrderQuery._id = { $ne: orderObjectId };
    } else {
        activeOrderQuery.orderId = { $ne: orderId };
    }

    const hasActive = await Order.exists(activeOrderQuery);
    if (hasActive) throw new ApiError(400, 'You already have an active mission. Complete it first.');

    // Get rider's current location for nearest-first sorting
    const rider = await DeliveryBoy.findById(deliveryBoyId).select('currentLocation name');
    const riderCoords = rider?.currentLocation?.coordinates;

    const order = await Order.findOneAndUpdate(
        {
            $and: [
                { $or: idFilter },
                { status: { $in: ['all_vendors_ready', 'processing', 'assigned'] } },
                { 
                    $or: [
                        { deliveryBoyId: { $exists: false } },
                        { deliveryBoyId: null },
                        { deliveryBoyId: deliveryBoyId }
                    ]
                }
            ]
        },
        {
            $set: {
                status: 'assigned',
                deliveryBoyId,
                assignedAt: new Date(),
            },
        },
        { new: true }
    );

    if (!order) throw new ApiError(409, 'Order already taken or no longer available.');

    if (!order.deliveryOtpDebug) {
        order.generateDeliveryOtp();
        await order.save();
    }

    // Sort stops nearest-first and build DeliveryBatch pickupStops
    let rawStops = order.vendorPickups || [];
    if (rawStops.length === 0) {
        const populatedOrder = await Order.findById(order._id).populate('vendorItems.vendorId', 'storeName shopAddress shopLocation phone address');
        rawStops = (populatedOrder?.vendorItems || []).map((vi, idx) => {
            const vendorDoc = vi.vendorId;
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const fullAddress = vendorDoc?.shopAddress 
                || [vendorDoc?.address?.street, vendorDoc?.address?.city, vendorDoc?.address?.state, vendorDoc?.address?.zipCode]
                    .filter(Boolean).join(', ') 
                || '';
            return {
                vendorId: vi.vendorId?._id || vi.vendorId,
                vendorName: vendorDoc?.storeName || vi.vendorName,
                shopLocation: vendorDoc?.shopLocation || { type: 'Point', coordinates: [0, 0] },
                shopAddress: fullAddress,
                vendorPhone: vendorDoc?.phone || '',
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
        vendorPhone: stop.vendorPhone || '',
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
    const batch = await DeliveryBatch.create({
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

    // Notify customer
    emitEvent(`user_${order.userId}`, 'order_assigned', { orderId: order.orderId, rider: rider?.name });
    createNotification({
        recipientId: String(order.userId),
        recipientType: 'user',
        title: 'Delivery Partner Assigned',
        message: `A delivery partner has been assigned to your order #${order.orderId}.`,
    }).catch(() => {});

    // Clear this order from other riders' screens
    emitEvent('delivery_partners', 'order_taken', { orderId: order.orderId, id: order._id });

    res.status(200).json(new ApiResponse(200, { order, batch }, 'Multi-vendor order accepted.'));
});

// GET /api/delivery/multi-vendor/:orderId/status
// Get full multi-vendor order + stops status
export const getMultiVendorOrderStatus = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({
        $and: [
            { $or: idFilter },
            {
                $or: [
                    { deliveryBoyId },
                    { deliveryBoyId: null },
                    { deliveryBoyId: { $exists: false } }
                ]
            }
        ]
    })
        .lean();
    if (!order) throw new ApiError(404, 'Order not found or not assigned to you.');

    // Find the ACTIVE batch (exclude delivered/cancelled), newest first
    let batch = await DeliveryBatch.findOne({ 
        customerId: order.userId, 
        deliveryBoyId, 
        isMultiVendor: true,
        status: { $nin: ['delivered', 'cancelled'] }
    }).sort({ createdAt: -1 }).lean();
    if (!batch) {
        batch = await DeliveryBatch.findOne({ 
            deliveryBoyId, 
            isMultiVendor: true, 
            status: { $nin: ['delivered', 'cancelled'] } 
        }).sort({ createdAt: -1 }).lean();
    }

    // Enrich vendorPickups with live vendor phone & address (for existing orders that may lack them)
    if (order.vendorPickups?.length > 0) {
        try {
            const Vendor = mongoose.model('Vendor');
            const vendorIds = order.vendorPickups.map(s => s.vendorId).filter(Boolean);
            const vendors = await Vendor.find({ _id: { $in: vendorIds } })
                .select('phone shopAddress address')
                .lean();
            const vendorMap = {};
            vendors.forEach(v => { vendorMap[v._id.toString()] = v; });
            
            order.vendorPickups = order.vendorPickups.map(stop => {
                const v = vendorMap[stop.vendorId?.toString()];
                if (v) {
                    if (!stop.vendorPhone) stop.vendorPhone = v.phone || '';
                    stop.shopAddress = v.shopAddress 
                        || [v.address?.street, v.address?.city, v.address?.state, v.address?.zipCode]
                            .filter(Boolean).join(', ') 
                        || stop.shopAddress || '';
                }
                return stop;
            });
        } catch (enrichErr) {
            console.error('[VendorPickup Enrich] Error:', enrichErr.message);
        }
    }

    // Check if there is an associated return request
    let returnRequest = null;
    try {
        const ReturnRequestModel = mongoose.model('ReturnRequest');
        returnRequest = await ReturnRequestModel.findOne({ orderId: order._id }).lean();
    } catch (err) {
        console.error('[MultiVendorPickup Controller] ReturnRequest query error:', err.message);
    }

    res.status(200).json(new ApiResponse(200, { order, batch, returnRequest }, 'Multi-vendor order status.'));
});

// POST /api/delivery/multi-vendor/:orderId/stops/:vendorId/arrive
// Rider marks arrived at a vendor stop
export const arriveAtVendorStop = asyncHandler(async (req, res) => {
    const { orderId, vendorId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true });
    if (!order) throw new ApiError(404, 'Order not found.');

    const stop = order.vendorPickups.find(s => String(s.vendorId) === String(vendorId));
    if (!stop) throw new ApiError(404, 'Vendor stop not found.');
    if (stop.status !== 'pending') throw new ApiError(409, `Stop already in status: ${stop.status}`);

    // Check stops are done in sequence
    const prevStops = order.vendorPickups.filter(s => s.sequence < stop.sequence);
    const allPrevDone = prevStops.every(s => s.status === 'picked_up');
    if (!allPrevDone) throw new ApiError(400, 'Complete previous stops before moving to this one.');

    stop.status = 'arrived';
    stop.arrivedAt = new Date();
    order.markModified('vendorPickups');
    await order.save();

    // Update DeliveryBatch stop too
    await DeliveryBatch.findOneAndUpdate(
        { deliveryBoyId, isMultiVendor: true, 'pickupStops.vendorId': vendorId },
        { $set: { 'pickupStops.$.status': 'arrived', 'pickupStops.$.arrivedAt': new Date() } }
    );

    // Notify vendor that rider has arrived
    emitEvent(`vendor_${vendorId}`, 'rider_arrived_for_pickup', { orderId: order.orderId });

    res.status(200).json(new ApiResponse(200, stop, 'Marked arrived at vendor stop.'));
});

// POST /api/delivery/multi-vendor/:orderId/stops/:vendorId/verify-otp
// Rider enters vendor handover OTP
export const verifyVendorHandoverOtp = asyncHandler(async (req, res) => {
    const { orderId, vendorId } = req.params;
    const { otp } = req.body;
    const deliveryBoyId = req.user.id;

    if (!otp) throw new ApiError(400, 'OTP is required.');

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true })
        .select('+vendorPickups.handoverOtp +vendorPickups.handoverOtpHash +vendorPickups.handoverOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const stop = order.vendorPickups.find(s => String(s.vendorId) === String(vendorId));
    if (!stop) throw new ApiError(404, 'Vendor stop not found.');
    if (stop.status !== 'arrived') throw new ApiError(409, 'Mark arrived at this stop first.');

    // Check OTP (supports plain-text debug match)
    const isValid = String(stop.handoverOtpHash || '') === String(otp) ||
                    String(stop.handoverOtpDebug || '') === String(otp) ||
                    String(stop.handoverOtp || '') === String(otp);
    if (!isValid) {
        stop.handoverOtpAttempts = (stop.handoverOtpAttempts || 0) + 1;
        order.markModified('vendorPickups');
        await order.save();
        throw new ApiError(400, `Incorrect OTP. Attempt ${stop.handoverOtpAttempts}.`);
    }

    stop.status = 'otp_verified';
    stop.handoverOtpVerifiedAt = new Date();
    order.markModified('vendorPickups');
    await order.save();

    res.status(200).json(new ApiResponse(200, { verified: true }, 'Vendor OTP verified.'));
});

// POST /api/delivery/multi-vendor/:orderId/stops/:vendorId/pickup
// Confirm product collected from vendor (after OTP verified)
export const confirmVendorPickup = asyncHandler(async (req, res) => {
    const { orderId, vendorId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true })
        .select('+vendorPickups.handoverOtp +vendorPickups.handoverOtpHash +vendorPickups.handoverOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const stop = order.vendorPickups.find(s => String(s.vendorId) === String(vendorId));
    if (!stop) throw new ApiError(404, 'Vendor stop not found.');
    if (stop.status !== 'otp_verified') throw new ApiError(409, 'Verify OTP before confirming pickup.');

    stop.status = 'picked_up';
    stop.pickedUpAt = new Date();
    order.markModified('vendorPickups');

    // Update DeliveryBatch
    await DeliveryBatch.findOneAndUpdate(
        { deliveryBoyId, isMultiVendor: true, 'pickupStops.vendorId': vendorId },
        { $set: { 'pickupStops.$.status': 'picked_up', 'pickupStops.$.pickedUpAt': new Date(), 'pickupStops.$.otpVerified': true } }
    );

    // Check if ALL stops are picked up
    const allPicked = order.vendorPickups.every(s => s.status === 'picked_up');
    if (allPicked) {
        order.status = 'picked_up';
        order.pickedUpAt = new Date();
        emitEvent(`user_${order.userId}`, 'order_picked_up', { orderId: order.orderId });
    }

    await order.save();

    res.status(200).json(new ApiResponse(200, {
        stop,
        allPickedUp: allPicked,
        nextAction: allPicked ? 'start_delivery' : 'proceed_to_next_stop',
    }, allPicked ? 'All vendors picked up! Ready to start delivery.' : 'Stop pickup confirmed.'));
});

// POST /api/delivery/multi-vendor/:orderId/start-delivery
// All stops done — start final delivery to customer
export const startFinalDelivery = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true });
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'picked_up') throw new ApiError(409, 'All vendor stops must be completed first.');

    order.status = 'out_for_delivery';
    await order.save();

    await DeliveryBatch.findOneAndUpdate(
        { deliveryBoyId, isMultiVendor: true },
        { status: 'out_for_delivery' }
    );

    emitEvent(`user_${order.userId}`, 'order_out_for_delivery', { orderId: order.orderId });

    res.status(200).json(new ApiResponse(200, order, 'Final delivery started.'));
});

// POST /api/delivery/multi-vendor/:orderId/arrive-customer
// Rider arrived at customer — generate delivery OTP
export const arriveAtCustomer = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true });
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'out_for_delivery') throw new ApiError(409, 'Start delivery first.');

    const otp = order.generateDeliveryOtp();
    await order.save();

    await DeliveryBatch.findOneAndUpdate(
        { deliveryBoyId, isMultiVendor: true },
        { status: 'arrived', deliveryOtp: otp, deliveryOtpDebug: otp }
    );

    // Notify customer with OTP
    createNotification({
        recipientId: String(order.userId),
        recipientType: 'user',
        title: 'Your Delivery Has Arrived!',
        message: `Your delivery partner is at your door! Your OTP is: ${otp}`,
    }).catch(() => {});

    emitEvent(`user_${order.userId}`, 'rider_arrived', { orderId: order.orderId, otp });

    res.status(200).json(new ApiResponse(200, { otp }, 'Arrived at customer. OTP generated.'));
});

// POST /api/delivery/multi-vendor/:orderId/complete
// Verify customer OTP and complete delivery
export const completeMultiVendorDelivery = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { otp } = req.body;
    const deliveryBoyId = req.user.id;

    if (!otp) throw new ApiError(400, 'Customer OTP is required.');

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true })
        .select('+deliveryOtpHash +deliveryOtpDebug +deliveryOtpExpiry');
    if (!order) throw new ApiError(404, 'Order not found.');

    // Try-and-buy orders generate a separate, hashed OTP on order.deliveryFlow (see
    // deliveryOtp.service.js). That is the OTP actually sent to the customer for such
    // orders, so it must be accepted here too — otherwise the customer's real OTP is
    // rejected because it never matches the plaintext order.deliveryOtpHash below.
    const normalizedOtp = String(otp).trim();
    const flow = order.deliveryFlow;
    let flowOtpMatch = false;
    if (flow?.otpHash) {
        const { hashOtp } = await import('../../../services/deliveryOtp.service.js');
        flowOtpMatch = flow.otpHash === hashOtp(normalizedOtp) || (process.env.NODE_ENV !== 'production' && flow.otpDebug === normalizedOtp);
    }

    if (!order.compareDeliveryOtp(normalizedOtp) && !flowOtpMatch) {
        order.deliveryOtpAttempts = (order.deliveryOtpAttempts || 0) + 1;
        await order.save();
        throw new ApiError(400, `Incorrect OTP. Attempt ${order.deliveryOtpAttempts}.`);
    }

    order.status = 'delivered';
    order.deliveredAt = new Date();
    order.deliveryOtpVerifiedAt = new Date();
    if (order.deliveryFlow) {
        order.deliveryFlow.phase = 'delivered';
        order.deliveryFlow.otpVerified = true;
        order.deliveryFlow.otpVerifiedAt = new Date();
    }
    // Mark all vendorItems as delivered
    order.vendorItems = order.vendorItems.map(vi => ({ ...vi.toObject(), status: 'delivered' }));
    await order.save();

    // Credit vendor + rider earnings — this path previously skipped wallet settlement entirely.
    const { WalletService } = await import('../../../services/wallet.service.js');
    await WalletService.processOrderCompletion(order).catch(err => {
        console.error(`[Wallet] Error processing earnings for multi-vendor order ${order._id}:`, err.message);
    });

    await DeliveryBatch.findOneAndUpdate(
        { deliveryBoyId, isMultiVendor: true },
        { status: 'delivered' }
    );

    // Update rider status to available
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'available', isAvailable: true });

    emitEvent(`user_${order.userId}`, 'order_delivered', { orderId: order.orderId });

    res.status(200).json(new ApiResponse(200, { delivered: true }, 'Multi-vendor order delivered successfully!'));
});

// GET /api/delivery/multi-vendor/:orderId/stops/:vendorId/handover-otp
// Vendor-facing: get handover OTP for a specific vendor stop (for rider to enter)
export const getVendorHandoverOtpForRider = asyncHandler(async (req, res) => {
    const { orderId, vendorId } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter, deliveryBoyId, isMultiVendor: true })
        .select('+vendorPickups.handoverOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const stop = order.vendorPickups.find(s => String(s.vendorId) === String(vendorId));
    if (!stop) throw new ApiError(404, 'Vendor stop not found.');

    // Only reveal OTP when rider has arrived at that stop
    if (stop.status === 'pending') throw new ApiError(403, 'Arrive at the vendor stop first.');

    res.status(200).json(new ApiResponse(200, {
        vendorName: stop.vendorName,
        handoverOtpDebug: stop.handoverOtpDebug,
        status: stop.status,
    }, 'Vendor handover OTP'));
});

// POST /api/delivery/uploads/image
export const uploadProofImage = asyncHandler(async (req, res) => {
    if (!req.file?.path) {
        throw new ApiError(400, 'Image file is required');
    }

    const { orderId, vendorId } = req.body;
    if (!orderId) {
        await cleanupLocalFiles([req.file.path]).catch(() => null);
        throw new ApiError(400, 'orderId is required');
    }

    try {
        // Upload image to Cloudinary in delivery/proofs folder
        const uploaded = await uploadLocalFileToCloudinaryAndCleanup(req.file.path, 'delivery/proofs');
        const imageUrl = uploaded.url;

        // If vendorId is provided, update the specific stop proof photo
        if (vendorId) {
            const idFilter = [{ orderId }];
            if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

            // 1. Update Order vendorPickups stop
            const order = await Order.findOne({ $or: idFilter, isMultiVendor: true });
            if (order) {
                const stopIdx = order.vendorPickups.findIndex(s => String(s.vendorId) === String(vendorId));
                if (stopIdx !== -1) {
                    order.vendorPickups[stopIdx].proofPhoto = imageUrl;
                    order.markModified('vendorPickups');
                    await order.save();
                }
            }

            // 2. Update DeliveryBatch pickupStops
            const batch = await DeliveryBatch.findOne({ deliveryBoyId: req.user.id, isMultiVendor: true });
            if (batch) {
                const stopIdx = batch.pickupStops.findIndex(s => String(s.vendorId) === String(vendorId));
                if (stopIdx !== -1) {
                    batch.pickupStops[stopIdx].proofPhoto = imageUrl;
                    batch.markModified('pickupStops');
                    await batch.save();
                }
            }
        }

        res.status(201).json(new ApiResponse(201, { imageUrl }, 'Proof image uploaded successfully'));
    } catch (error) {
        await cleanupLocalFiles([req.file.path]).catch(() => null);
        throw error;
    }
});
