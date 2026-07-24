import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import User from '../../../models/User.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import { OrderNotificationService } from '../../../services/orderNotification.service.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import DeliveryBatch from '../../../models/DeliveryBatch.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { calculateDistance } from '../../../utils/geo.js';
import { refundPayment } from '../../../services/razorpay.service.js';

// GET /api/admin/orders
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search, startDate, endDate, userId } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = { isDeleted: { $ne: true } };

    if (status && status !== 'all') filter.status = status;
    if (String(req.query.assignableOnly || '') === 'true' && !filter.status) {
        filter.status = { $in: ['pending', 'processing', 'shipped', 'ready_for_pickup', 'all_vendors_ready', 'assigned'] };
    }
    if (search) {
        const regex = new RegExp(search, 'i');
        const matchedUsers = await User.find({
            $or: [{ name: regex }, { email: regex }, { phone: regex }]
        }).select('_id').limit(200).lean();
        const matchedUserIds = matchedUsers.map((u) => u._id);

        filter.$or = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (req.query.vendorId) {
        filter['vendorItems.vendorId'] = req.query.vendorId;
    } else if (req.query.vendorCity) {
        const cityVendors = await Vendor.find({ 'address.city': req.query.vendorCity }).select('_id').lean();
        const cityVendorIds = cityVendors.map((v) => v._id);
        filter['vendorItems.vendorId'] = { $in: cityVendorIds };
    }
    if (userId) {
        filter.userId = userId;
    }
    if (String(req.query.onlyUnassigned || '') === 'true') {
        filter.deliveryBoyId = null;
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .populate('deliveryBoyId', 'name phone currentLocation')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        orders,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Orders fetched.'));
});

// GET /api/admin/orders/:id
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    })
        .populate('userId', 'name email phone')
        .populate('deliveryBoyId', 'name phone email vehicleType vehicleNumber currentLocation')
        .populate('items.productId')
        .populate('vendorItems.vendorId', 'storeName shopAddress shopLocation phone gstNumber')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');

    // Fetch related commissions (vendor settlements)
    const commissions = await Commission.find({ orderId: order._id }).lean();
    
    // Fetch related return requests
    const returnRequests = await ReturnRequest.find({ orderId: order._id }).lean();

    const responseData = {
        ...order,
        commissions,
        returnRequests,
    };

    res.status(200).json(new ApiResponse(200, responseData, 'Order fetched.'));
});

// PATCH /api/admin/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'ready_for_delivery', 'assigned', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    }).populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const previousStatus = String(order.status || '').toLowerCase();
    const nextStatus = String(status || '').toLowerCase();

    const allowedTransitions = {
        pending: ['processing', 'cancelled', 'ready_for_delivery'],
        processing: ['shipped', 'cancelled', 'ready_for_delivery'],
        ready_for_delivery: ['assigned', 'shipped', 'cancelled'],
        searching: ['assigned', 'cancelled'],
        ready_for_pickup: ['assigned', 'cancelled'],
        all_vendors_ready: ['assigned', 'cancelled'],
        assigned: ['shipped', 'out_for_delivery', 'cancelled'],
        shipped: ['delivered', 'cancelled', 'returned', 'out_for_delivery'],
        out_for_delivery: ['delivered', 'cancelled', 'returned'],
        delivered: ['returned'],
        cancelled: [],
        returned: [],
    };


    if (previousStatus !== nextStatus) {
        const nextAllowed = allowedTransitions[previousStatus] || [];
        if (!nextAllowed.includes(nextStatus)) {
            throw new ApiError(409, `Cannot move order from ${previousStatus} to ${nextStatus}.`);
        }
    }

    order.status = nextStatus;
    if (nextStatus === 'delivered') {
        order.deliveredAt = new Date();
        order.cancelledAt = null;
    } else if (nextStatus === 'cancelled') {
        order.cancelledAt = new Date();
    } else if (nextStatus === 'returned') {
        order.cancelledAt = null;
    } else {
        order.deliveredAt = null;
        order.cancelledAt = null;
    }

    if (nextStatus === 'processing') {
        (order.vendorItems || []).forEach((vi) => {
            const current = String(vi?.status || 'pending');
            if (current !== 'cancelled' && current !== 'delivered') {
                vi.status = 'processing';
            }
        });
    }
    if (nextStatus === 'shipped') {
        (order.vendorItems || []).forEach((vi) => {
            const current = String(vi?.status || 'pending');
            if (current !== 'cancelled' && current !== 'delivered') {
                vi.status = 'shipped';
            }
        });
    }
    if (nextStatus === 'delivered') {
        (order.vendorItems || []).forEach((vi) => {
            const current = String(vi?.status || 'pending');
            if (current !== 'cancelled') {
                vi.status = 'delivered';
            }
        });
    }
    if (nextStatus === 'cancelled') {
        (order.vendorItems || []).forEach((vi) => {
            const current = String(vi?.status || 'pending');
            if (current !== 'delivered') {
                vi.status = 'cancelled';
            }
        });
    }

    if (nextStatus === 'cancelled' && previousStatus !== 'cancelled') {
        for (const item of order.items || []) {
            const quantity = Number(item.quantity || 0);
            if (quantity <= 0 || !item.productId) continue;

            const product = await Product.findById(item.productId);
            if (!product) continue;

            const variantKey = item.variantKey;
            
            // Increment total stock
            product.stockQuantity = (Number(product.stockQuantity) || 0) + quantity;

            if (variantKey && product.variants) {
                // Restore variant-specific stock if it was a variant order
                if (!product.variants.stockMap) {
                    product.variants.stockMap = new Map();
                }

                const currentMap = product.variants.stockMap;
                let currentVariantStock = 0;
                
                if (currentMap instanceof Map) {
                    currentVariantStock = Number(currentMap.get(variantKey)) || 0;
                    currentMap.set(variantKey, currentVariantStock + quantity);
                } else {
                    currentVariantStock = Number(currentMap[variantKey]) || 0;
                    currentMap[variantKey] = currentVariantStock + quantity;
                }
                product.markModified('variants.stockMap');
            }

            // Update stock status
            const nextStockState =
                product.stockQuantity <= 0
                    ? 'out_of_stock'
                    : (product.stockQuantity <= (product.lowStockThreshold || 10) ? 'low_stock' : 'in_stock');
            
            product.stock = nextStockState;
            await product.save();
        }
    }

    await order.save();

    if (nextStatus === 'cancelled') {
        // Free the delivery boy if assigned and credit them for the cancellation trip if they accepted it
        if (order.deliveryBoyId) {
            const DeliveryBoy = mongoose.model('DeliveryBoy');
            const riderEarnings = Number(order.deliveryEarnings || 0);
            
            if (riderEarnings > 0 && order.riderAcceptedAt) {
                await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { 
                    status: 'available',
                    $inc: {
                        totalDeliveries: 1, // count as trip
                        totalEarnings: riderEarnings,
                        availableBalance: riderEarnings,
                    }
                });
            } else {
                await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { status: 'available' });
            }

            // Cancel any associated DeliveryBatch to remove it from the rider's active screen
            await DeliveryBatch.updateMany(
                { customerId: order.userId, deliveryBoyId: order.deliveryBoyId, status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] } },
                { $set: { status: 'cancelled' } }
            );

            // Tell the rider explicitly that this request/order was removed
            emitEvent(`delivery_${order.deliveryBoyId}`, 'order_cancelled', {
                orderId: order.orderId,
                id: order._id,
                message: 'Order was cancelled by admin.'
            });
        }

        // Reverse vendor earnings visibility for this order.
        // Keep it idempotent by only updating commissions not already cancelled.
        await Commission.updateMany(
            {
                orderId: order._id,
                status: { $ne: 'cancelled' },
            },
            {
                $set: {
                    status: 'cancelled',
                    paidAt: null,
                    settlementId: null,
                },
            }
        );

        // Process full refund if prepaid
        if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'cash' && order.razorpayPaymentId && order.paymentStatus !== 'refunded') {
            let refundSuccess = false;
            let refundObj = null;
            try {
                refundObj = await refundPayment({
                    paymentId: order.razorpayPaymentId,
                    amount: order.total || 0,
                    notes: { orderId: String(order._id) }
                });
                refundSuccess = true;
            } catch (refundError) {
                console.error('Admin Cancellation Refund Error:', refundError?.error || refundError?.message || refundError);
                console.error('Refund Error Details:', JSON.stringify({
                    paymentId: order.razorpayPaymentId,
                    amount: order.total,
                    amountInPaise: Math.round((order.total || 0) * 100),
                    razorpayError: refundError?.error || refundError?.statusCode || 'unknown'
                }));
                order.refundStatus = 'failed';
            }

            if (refundSuccess && refundObj) {
                order.refundStatus = refundObj.status === 'processed' ? 'processed' : 'pending';
                order.refundId = refundObj.id;
                order.refundAmount = order.total;
                order.paymentStatus = 'refunded';
            }
            await order.save();
        }
    }

    // Unified role-aware notifications
    await OrderNotificationService.notifyOrderUpdate(order._id, nextStatus);

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

// GET /api/admin/orders/:id/nearby-riders
export const getNearbyRiders = asyncHandler(async (req, res) => {
    const filter = {
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    };
    const order = await Order.findOne(filter).select('pickupLocation orderId');
    if (!order) throw new ApiError(404, 'Order not found.');

    const pickupCoords = order.pickupLocation?.coordinates;

    let query = {
        applicationStatus: 'approved',
        isActive: true
    };

    if (pickupCoords && pickupCoords.length === 2 && pickupCoords[0] !== 0) {
        query.currentLocation = {
            $near: {
                $geometry: { type: 'Point', coordinates: pickupCoords },
                $maxDistance: 10000 // 10 km radius
            }
        };
    }

    const allRiders = await DeliveryBoy.find(query)
        .select('name phone status currentLocation vehicleType vehicleNumber')
        .limit(20) // Limit to top 20 nearest
        .lean();

    const ridersWithDistance = allRiders.map(rider => {
        const riderCoords = rider.currentLocation?.coordinates;
        let distance = 9999;
        if (pickupCoords && pickupCoords.length === 2 && riderCoords && riderCoords.length === 2) {
            distance = calculateDistance(pickupCoords, riderCoords);
        }
        return { ...rider, distance: Math.round(distance * 10) / 10 };
    }).sort((a, b) => a.distance - b.distance);

    res.status(200).json(new ApiResponse(200, { riders: ridersWithDistance }, 'Nearby riders fetched.'));
});

// PATCH /api/admin/orders/:id/assign-delivery
export const assignDeliveryBoy = asyncHandler(async (req, res) => {
    const { deliveryBoyId } = req.body;
    if (!deliveryBoyId) throw new ApiError(400, 'deliveryBoyId is required.');

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId).select('name isActive applicationStatus currentLocation');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery boy not found.');
    if (!deliveryBoy.isActive) throw new ApiError(400, 'Delivery boy is inactive.');
    if (deliveryBoy.applicationStatus !== 'approved') {
        throw new ApiError(400, 'Delivery boy is not approved.');
    }

    const filter = {
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    };
    const order = await Order.findOne(filter);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (['cancelled', 'returned', 'delivered'].includes(String(order.status))) {
        throw new ApiError(409, `Cannot assign delivery for ${order.status} order.`);
    }

    const previousDeliveryBoyId = order.deliveryBoyId ? String(order.deliveryBoyId) : '';
    const isReassigned = previousDeliveryBoyId && previousDeliveryBoyId !== String(deliveryBoyId);

    order.deliveryBoyId = deliveryBoyId;
    order.riderAcceptedAt = new Date(); // Admin manually assigns, so treat it as accepted
    if (['ready_for_pickup', 'all_vendors_ready', 'searching', 'ready_for_delivery', 'processing'].includes(order.status)) {
        order.status = 'assigned';
    } else if (order.status === 'pending') {
        order.status = 'processing';
        // Keep vendor-facing status in sync with order lifecycle.
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'processing' };
        });
    }

    // ── Multi-Vendor Stop Setup & DeliveryBatch creation ──
    if (order.isMultiVendor || order.vendorPickups?.length > 0 || order.status === 'all_vendors_ready' || order.status === 'assigned') {
        if (order.isMultiVendor || order.vendorPickups?.length > 0) {
            try {
                // Delete any existing DeliveryBatch for this order to avoid duplicates (especially on reassignment)
                await DeliveryBatch.deleteMany({ customerId: order.userId, status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] } });

                const riderCoords = deliveryBoy.currentLocation?.coordinates;

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
                order.vendorPickups = resequencedPickups;

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
                console.log(`[MultiVendor Admin Assign] Successfully created DeliveryBatch for order ${order.orderId}`);
            } catch (mvErr) {
                console.error(`[MultiVendor Admin Assign] Error setting up batch:`, mvErr);
            }
        }
    }

    await order.save();
    
    // Unified role-aware notifications for assignment
    await OrderNotificationService.notifyOrderUpdate(order._id, 'assigned');

    // Real-time assignment alert to delivery partner
    const socketPayload = {
        orderId: order.orderId,
        id: order._id,
        pickupLocation: order.pickupLocation,
        customerName: order.shippingAddress?.name || 'Customer',
        address: order.shippingAddress?.address || 'Address unavailable',
        total: order.total,
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        distance: order.deliveryDistance ? `${order.deliveryDistance} km` : '0 km',
        estimatedTime: 'N/A',
        deliveryFee: order.deliveryEarnings || 25,
        isMultiVendor: order.isMultiVendor,
        vendorPickups: order.vendorPickups,
        type: 'new_assignment_broadcast'
    };
    emitEvent(`delivery_${deliveryBoyId}`, 'order_ready_for_pickup', socketPayload);

    res.status(200).json(new ApiResponse(200, order, 'Delivery boy assigned.'));
});

// DELETE /api/admin/orders/:id
export const deleteOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOneAndUpdate(
        {
            $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
            isDeleted: { $ne: true },
        },
        {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user?.id || null,
        },
        { new: true }
    );
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, null, 'Order archived.'));
});
