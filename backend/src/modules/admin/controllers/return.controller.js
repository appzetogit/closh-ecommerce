import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Order from '../../../models/Order.model.js';
import User from '../../../models/User.model.js';
import Product from '../../../models/Product.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { refundPayment } from '../../../services/razorpay.service.js';
import { WalletService } from '../../../services/wallet.service.js';
import * as DeliveryOtpService from '../../../services/deliveryOtp.service.js';
import { assertRiderIsFree, markRiderBusy } from '../../../services/deliveryAvailability.service.js';

const enrichReturnItems = (request) => {
    const orderItems = Array.isArray(request?.orderId?.items) ? request.orderId.items : [];
    const returnItems = Array.isArray(request?.items) ? request.items : [];

    return returnItems.map((item) => {
        const productId = String(item?.productId || '');
        const matchedOrderItem = orderItems.find(
            (orderItem) => String(orderItem?.productId || '') === productId
        );

        return {
            ...item,
            name: item?.name || matchedOrderItem?.name || 'Unknown Product',
            price: Number(item?.price ?? matchedOrderItem?.price ?? 0),
            image: item?.image || matchedOrderItem?.image || '',
        };
    });
};

const normalizeReturnRequest = (requestDoc) => {
    const request = requestDoc.toObject ? requestDoc.toObject() : requestDoc;
    const orderRefId = request.orderId?._id || request.orderId || null;
    const orderOrderId = request.orderId?.orderId || null;
    const guestInfo = request.orderId?.guestInfo || null;

    let customer = { name: 'Guest', email: 'N/A', phone: 'N/A' };
    if (request.userId) {
        customer = {
            name: request.userId.name || 'Unknown Customer',
            email: request.userId.email || 'N/A',
            phone: request.userId.phone || 'N/A'
        };
    } else if (guestInfo) {
        customer = {
            name: guestInfo.name || 'Guest Customer',
            email: guestInfo.email || 'N/A',
            phone: guestInfo.phone || 'N/A'
        };
    }

    return {
        ...request,
        id: String(request._id),
        customer,
        orderId: orderOrderId || (typeof orderRefId === 'string' ? orderRefId : 'N/A'),
        orderRefId: orderRefId ? String(orderRefId) : null,
        paymentMethod: request.orderId?.paymentMethod || 'manual',
        paymentStatus: request.orderId?.paymentStatus || 'unknown',
        requestDate: request.createdAt,
        items: enrichReturnItems(request),
    };
};

/**
 * @desc    Get all return requests with filtering and pagination
 * @route   GET /api/admin/return-requests
 * @access  Private (Admin)
 */
export const getAllReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status, startDate, endDate, vendorId, vendorCity } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};

    if (status && status !== 'all') {
        filter.status = status;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (vendorId) {
        filter.vendorId = vendorId;
    } else if (vendorCity) {
        const cityVendors = await Vendor.find({ 'address.city': vendorCity }).select('_id').lean();
        const cityVendorIds = cityVendors.map((v) => v._id);
        filter.vendorId = { $in: cityVendorIds };
    }

    // Search by return id, order number, customer fields, and reason text
    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = search.match(/^[0-9a-fA-F]{24}$/);

        const [matchedOrders, matchedUsers] = await Promise.all([
            Order.find({ orderId: regex }).select('_id').lean(),
            User.find({
                $or: [{ name: regex }, { email: regex }, { phone: regex }]
            }).select('_id').limit(200).lean(),
        ]);

        const matchedOrderIds = matchedOrders.map((o) => o._id);
        const matchedUserIds = matchedUsers.map((u) => u._id);

        const orFilters = [
            { reason: regex },
            { 'items.name': regex },
            ...(matchedOrderIds.length > 0 ? [{ orderId: { $in: matchedOrderIds } }] : []),
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];

        if (isObjectId) {
            orFilters.push({ _id: search }, { orderId: search });
        }

        if (orFilters.length > 0) {
            filter.$or = orFilters;
        }
    }

    const returnRequests = await ReturnRequest.find(filter)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items paymentMethod paymentStatus guestInfo')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit);

    const total = await ReturnRequest.countDocuments(filter);

    // Normalize data for frontend
    const normalizedRequests = returnRequests.map(normalizeReturnRequest);

    res.status(200).json(
        new ApiResponse(200, {
            returnRequests: normalizedRequests,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Return requests fetched successfully')
    );
});

/**
 * @desc    Get return request detail
 * @route   GET /api/admin/return-requests/:id
 * @access  Private (Admin)
 */
export const getReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total createdAt items paymentMethod paymentStatus razorpayPaymentId guestInfo')
        .populate('vendorId', 'shopName email')
        .populate('deliveryBoyId', 'name phone');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    // Normalize
    const normalized = normalizeReturnRequest(request);

    res.status(200).json(
        new ApiResponse(200, normalized, 'Return request details fetched successfully')
    );
});

/**
 * @desc    Update return request status
 * @route   PATCH /api/admin/return-requests/:id/status
 * @access  Private (Admin)
 */
export const updateReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, adminNote, refundStatus } = req.body;

    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items paymentMethod paymentStatus razorpayPaymentId');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    const currentStatus = request.status;
    const currentRefundStatus = request.refundStatus || 'pending';

    const allowedStatuses = ['pending', 'approved', 'processing', 'rejected', 'completed'];
    const allowedRefundStatuses = ['pending', 'processed', 'failed'];
    
    const statusTransitions = {
        pending: ['approved', 'rejected'],
        approved: ['processing', 'completed'],
        processing: ['completed'],
        rejected: [],
        completed: [],
    };
    const refundTransitions = {
        pending: ['processed', 'failed'],
        failed: ['processed'],
        processed: [],
    };

    if (status && !allowedStatuses.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(', ')}`);
    }
    if (refundStatus && !allowedRefundStatuses.includes(refundStatus)) {
        throw new ApiError(400, `Refund status must be one of: ${allowedRefundStatuses.join(', ')}`);
    }

    // Status Transition Validation
    if (status && status !== currentStatus) {
        const allowed = statusTransitions[currentStatus] || [];
        if (!allowed.includes(status)) {
            throw new ApiError(409, `Cannot move return request from ${currentStatus} to ${status}.`);
        }
    }

    // Refund Transition Validation & Automation
    if (refundStatus && refundStatus !== currentRefundStatus) {
        const allowedRefundNext = refundTransitions[currentRefundStatus] || [];
        if (!allowedRefundNext.includes(refundStatus)) {
            throw new ApiError(409, `Cannot move refund status from ${currentRefundStatus} to ${refundStatus}.`);
        }

        // Automated refund if status is being set to 'processed'
        if (refundStatus === 'processed') {
            const order = request.orderId;
            if (!order) throw new ApiError(400, "Linked order not found for refund.");

            if (order.paymentMethod !== 'cod' && order.razorpayPaymentId) {
                try {
                    const refund = await refundPayment({
                        paymentId: order.razorpayPaymentId,
                        amount: request.refundAmount || 0,
                        notes: {
                            return_id: String(request._id),
                            order_id: String(order.orderId)
                        }
                    });
                    request.refundId = refund.id;
                    request.refundNotes = `Automated Razorpay Refund successful. Refund ID: ${refund.id}`;
                    
                    // Fallback for local development where webhook cannot reach
                    if (process.env.NODE_ENV !== 'production' || !process.env.RAZORPAY_WEBHOOK_SECRET) {
                        request.refundStatus = 'processed';
                    }
                    order.paymentStatus = 'refunded';
                    await order.save();
                } catch (error) {
                    console.error('Automated Refund Error:', error);
                    throw new ApiError(500, `Automated refund failed: ${error.message}. Please handle manually.`);
                }
            } else if (order.paymentMethod === 'cod') {
                 request.refundNotes = `Manual refund processed for COD order. ` + (adminNote || '');
            } else {
                 throw new ApiError(400, "Online payment record (razorpayPaymentId) not found. Manual refund required.");
            }
        }
    }

    if (status) request.status = status;
    if (refundStatus) request.refundStatus = refundStatus;
    if (adminNote !== undefined) request.adminNote = adminNote;

    // If status is approved, setup the delivery task and notify riders
    if (status === 'approved' && currentStatus !== 'approved') {
        try {
            const Vendor = (await import('../../../models/Vendor.model.js')).default;
            const vendor = await Vendor.findById(request.vendorId);
            const order = request.orderId;

            // 1. Set Pickup Location (Customer's address)
            if (order && order.shippingAddress) {
                request.pickupLocation = {
                    type: 'Point',
                    coordinates: order.shippingAddress.coordinates || [0, 0]
                };
            }

            // 2. Set Dropoff Location (Vendor's shop location)
            if (vendor && vendor.shopLocation) {
                request.dropoffLocation = {
                    type: 'Point',
                    coordinates: vendor.shopLocation.coordinates || [0, 0]
                };
            }

            await request.save();

            // 3. Notify nearby delivery boys or auto-start for Try&Buy
            if (request.pickupLocation?.coordinates?.length === 2 && request.pickupLocation.coordinates[0] !== 0) {
                if (request.deliveryBoyId) {
                    // Try & Buy auto-assigned return - start processing immediately
                    request.status = 'processing';
                    await request.save();
                    
                    const { emitEvent } = await import('../../../socket/index.js');
                    emitEvent(`user_${request.userId?._id || request.userId}`, 'return_delivery_assigned', {
                        returnId: request._id,
                        deliveryBoyId: request.deliveryBoyId
                    });
                    if (request.vendorId) {
                        emitEvent(`vendor_${request.vendorId}`, 'return_delivery_assigned', {
                            returnId: request._id,
                            deliveryBoyId: request.deliveryBoyId
                        });
                    }
                    
                    const { createNotification } = await import('../../user/controllers/notification.controller.js');
                    createNotification({
                        recipientId: String(request.deliveryBoyId),
                        recipientType: 'delivery',
                        title: 'Return Request Approved',
                        message: `Return request ${request.returnId || ''} has been approved. Please proceed.`,
                        type: 'return',
                        data: { returnId: String(request._id) }
                    }).catch(() => {});
                } else {
                    const { notifyNearbyDeliveryBoysForReturn } = await import('../../delivery/controllers/assignment.controller.js');
                    await notifyNearbyDeliveryBoysForReturn(request).catch(err =>
                        console.error(`[Return Assignment] Failed to notify delivery boys for return ${request._id}:`, err)
                    );
                }
            }
        } catch (error) {
            console.error('[Admin Return Approval] Error setting up delivery assignment:', error);
            await request.save();
        }
    } else {
        await request.save();
    }

    // Return lifecycle side-effects:
    // - On approval, mark linked order as returned (if not terminal).
    // - On completion, restore stock for requested items once.
    if (status === 'approved' || status === 'completed') {
        const linkedOrderId = request.orderId?._id || request.orderId;
        if (linkedOrderId) {
            const order = await Order.findById(linkedOrderId);
            if (order && order.isDeleted !== true) {
                if (status === 'approved' && !['cancelled', 'returned'].includes(order.status)) {
                    order.status = 'returned';
                    await order.save();
                    
                    if (order.deliveryBoyId) {
                        try {
                            const { emitEvent } = await import('../../../services/socket.service.js');
                            emitEvent(`delivery_${order.deliveryBoyId}`, 'order_status_updated', order);
                        } catch (err) {
                            console.error('[Admin Return Approval] Socket event error:', err);
                        }
                    }
                }

                if (status === 'completed') {
                    const stockRestores = (request.items || []).map(async (item) => {
                        const qty = Number(item?.quantity || 0);
                        if (!item?.productId || qty <= 0) return;
                        const product = await Product.findById(item.productId);
                        if (!product) return;

                        product.stockQuantity += qty;
                        
                        // Handle variant stock
                        const size = item.selectedSize || item.variant?.size || (item.variant && Object.values(item.variant)[0]);
                        if (size && product.variants?.stockMap && product.variants.stockMap.has(size)) {
                            const currentVarStock = product.variants.stockMap.get(size) || 0;
                            product.variants.stockMap.set(size, currentVarStock + qty);
                        }

                        if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                        else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                        else product.stock = 'in_stock';
                        await product.save();
                    });
                    await Promise.all(stockRestores);
                    
                    // Reverse vendor earnings and commission
                    await WalletService.processOrderReturn(request);
                }
            }
        }
    }

    const notificationTasks = [];
    if (request.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId: request.userId._id,
                recipientType: 'user',
                title: 'Return request updated',
                message: `Your return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status || ''),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    }

    if (request.vendorId) {
        notificationTasks.push(
            createNotification({
                recipientId: request.vendorId,
                recipientType: 'vendor',
                title: 'Return request updated by admin',
                message: `Return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status || ''),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    const normalized = normalizeReturnRequest(request);

    emitEvent(`return_${request._id}`, 'return_status_updated', request);

    res.status(200).json(new ApiResponse(200, normalized, 'Return request status updated successfully'));
});

/**
 * @desc    Assign delivery boy to return request
 * @route   POST /api/admin/return-requests/:id/assign
 * @access  Private (Admin)
 */
export const assignDeliveryBoyToReturn = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
        throw new ApiError(400, 'Delivery Boy ID is required');
    }

    const returnReq = await ReturnRequest.findById(id).populate('userId', 'name');
    if (!returnReq) {
        throw new ApiError(404, 'Return request not found');
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId);
    if (!rider) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    await assertRiderIsFree(deliveryBoyId, { excludeReturnId: returnReq._id });

    returnReq.deliveryBoyId = deliveryBoyId;
    returnReq.status = 'processing';

    // Generate Pickup OTP for customer
    const otp = DeliveryOtpService.generateOtp();
    returnReq.pickupOtpHash = DeliveryOtpService.hashOtp(otp);
    returnReq.pickupOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    returnReq.pickupOtpDebug = otp;

    await returnReq.save();
    await markRiderBusy(deliveryBoyId);
    
    // Notify Customer about OTP
    if (returnReq.userId) {
        await createNotification({
            recipientId: returnReq.userId._id || returnReq.userId,
            recipientType: 'user',
            title: 'Return Pickup OTP 🔐',
            message: `Your return pickup OTP is ${otp}. Please share it with the rider.`,
            type: 'order',
            data: { returnId: String(returnReq._id), otp }
        });
    }

    // Notify Rider
    await createNotification({
        recipientId: deliveryBoyId,
        recipientType: 'delivery',
        title: 'New Return Assigned',
        message: `Admin has assigned you a return request for order #${returnReq.returnId}`,
        type: 'return',
        data: { returnId: String(returnReq._id) }
    });

    let customerAddress = 'Address unavailable';
    let vendorAddress = 'Shop Address unavailable';
    let vendorName = 'Vendor';
    
    try {
        const Order = (await import('../../../models/Order.model.js')).default;
        const orderDoc = await Order.findById(returnReq.orderId?._id || returnReq.orderId);
        if (orderDoc?.shippingAddress?.address) {
            customerAddress = orderDoc.shippingAddress.address;
        }
        
        const Vendor = (await import('../../../models/Vendor.model.js')).default;
        const vendorDoc = await Vendor.findById(returnReq.vendorId);
        if (vendorDoc) {
            vendorName = vendorDoc.storeName || 'Vendor';
            vendorAddress = vendorDoc.shopAddress || vendorAddress;
        }
    } catch (e) {
        console.error('[AdminReturnPayload Enrich Error]', e.message);
    }

    // Real-time assignment alert to delivery partner for return
    const returnPayload = {
        returnId: String(returnReq._id),
        id: String(returnReq._id),
        orderId: returnReq.returnId || String(returnReq._id),
        pickupLocation: returnReq.pickupLocation,
        dropoffLocation: returnReq.dropoffLocation,
        customerName: returnReq.userId?.name || 'Customer',
        customer: returnReq.userId?.name || 'Customer',
        vendorName: vendorName,
        address: customerAddress,
        vendorAddress: vendorAddress,
        total: returnReq.refundAmount || 0,
        distance: 'N/A',
        estimatedTime: 'N/A',
        deliveryFee: 25,
        type: 'return'
    };
    emitEvent(`delivery_${deliveryBoyId}`, 'return_ready_for_pickup', returnPayload);

    res.status(200).json(new ApiResponse(200, returnReq, 'Delivery boy assigned successfully'));
});

