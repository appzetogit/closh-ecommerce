import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import User from '../../../models/User.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { notifyNearbyDeliveryBoysForReturn } from '../../delivery/controllers/assignment.controller.js';
import Vendor from '../../../models/Vendor.model.js';
import Address from '../../../models/Address.model.js';
import { emitEvent } from '../../../services/socket.service.js';
import { WalletService } from '../../../services/wallet.service.js';
import { applyReturnToOrder } from '../../../utils/applyReturnToOrder.js';

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
            vendorPrice: Number(matchedOrderItem?.vendorPrice ?? 0),
            image: item?.image || matchedOrderItem?.image || '',
        };
    });
};

const normalizeReturnRequest = (requestDoc) => {
    const request = requestDoc.toObject ? requestDoc.toObject() : requestDoc;
    const orderOrderId = request.orderId?.orderId;
    const orderRefId = request.orderId?._id ?? request.orderId ?? null;

    return {
        ...request,
        id: String(request._id),
        customer: request.userId
            ? {
                name: request.userId.name ?? 'Guest',
                email: request.userId.email ?? 'N/A',
                phone: request.userId.phone ?? '',
            }
            : { name: 'Guest', email: 'N/A', phone: '' },
        orderId: orderOrderId || String(orderRefId || ''),
        orderRefId: orderRefId ? String(orderRefId) : null,
        requestDate: request.createdAt,
        rejectionReason: request.rejectionReason || request.adminNote || '',
        items: enrichReturnItems(request),
    };
};

// GET /api/vendor/return-requests
export const getVendorReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);

    const filter = {
        $or: [
            { vendorId: req.user.id },
            { 'vendorDropoffs.vendorId': req.user.id }
        ]
    };

    if (status && status !== 'all') {
        filter.status = status;
    }

    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);

        const [matchedOrders, matchedUsers] = await Promise.all([
            Order.find({ orderId: regex }).select('_id').lean(),
            User.find({
                $or: [{ name: regex }, { email: regex }, { phone: regex }],
            })
                .select('_id')
                .limit(200)
                .lean(),
        ]);

        const matchedOrderIds = matchedOrders.map((o) => o._id);
        const matchedUserIds = matchedUsers.map((u) => u._id);

        const searchOrFilters = [
            { reason: regex },
            { 'items.name': regex },
            ...(matchedOrderIds.length > 0 ? [{ orderId: { $in: matchedOrderIds } }] : []),
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];

        if (isObjectId) {
            searchOrFilters.push({ _id: search }, { orderId: search });
        }

        // Combine the vendor condition with the search condition using $and
        filter.$and = [{ $or: searchOrFilters }];
    }

    const [requests, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('userId', 'name email phone')
            .populate('orderId', 'orderId total items vendorItems status paymentStatus')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    const normalized = requests.map(normalizeReturnRequest);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                returnRequests: normalized,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit),
                },
            },
            'Return requests fetched.'
        )
    );
});

// GET /api/vendor/return-requests/:id
export const getVendorReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findOne({
        _id: req.params.id,
        $or: [
            { vendorId: req.user.id },
            { 'vendorDropoffs.vendorId': req.user.id }
        ]
    })
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total createdAt items vendorItems status paymentStatus');

    if (!request) throw new ApiError(404, 'Return request not found.');

    res.status(200).json(
        new ApiResponse(200, normalizeReturnRequest(request), 'Return request fetched.')
    );
});

// PATCH /api/vendor/return-requests/:id/status
export const updateVendorReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, refundStatus, rejectionReason } = req.body;
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
        throw new ApiError(
            400,
            `Refund status must be one of: ${allowedRefundStatuses.join(', ')}`
        );
    }

    const request = await ReturnRequest.findOne({
        _id: req.params.id,
        $or: [
            { vendorId: req.user.id },
            { 'vendorDropoffs.vendorId': req.user.id }
        ]
    })
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items vendorItems status paymentStatus');
    if (!request) throw new ApiError(404, 'Return request not found.');

    const previousStatus = request.status;
    const nextStatus = status || request.status;
    const nextRefundStatus = refundStatus || request.refundStatus;
    const nextRejectionReason = rejectionReason !== undefined
        ? String(rejectionReason || '').trim()
        : String(request.rejectionReason || '');
    const statusUnchanged = !status || status === request.status;
    const refundUnchanged = !refundStatus || refundStatus === request.refundStatus;
    const rejectionReasonUnchanged =
        rejectionReason === undefined || nextRejectionReason === String(request.rejectionReason || '');

    if (statusUnchanged && refundUnchanged && rejectionReasonUnchanged) {
        return res.status(200).json(
            new ApiResponse(200, normalizeReturnRequest(request), 'No changes applied.')
        );
    }

    if (status && status !== request.status) {
        const allowedNext = statusTransitions[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(409, `Cannot move return request from ${request.status} to ${status}.`);
        }
    }

    request.status = nextStatus;
    if (refundStatus) request.refundStatus = nextRefundStatus;
    if (rejectionReason !== undefined) request.rejectionReason = nextRejectionReason;
    if (status !== 'rejected' && request.rejectionReason) request.rejectionReason = '';

    // If status is approved, setup the delivery task
    if (status === 'approved' && previousStatus !== 'approved') {
        const vendor = await Vendor.findById(request.vendorId);
        const order = await Order.findById(request.orderId);

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
    } else {
        await request.save();
    }

    // Keep lifecycle effects consistent when vendor processes returns.
    if (status === 'approved' || status === 'completed') {
        const linkedOrderId = request.orderId?._id || request.orderId;
        if (linkedOrderId) {
            const order = await Order.findById(linkedOrderId);
            if (order && order.isDeleted !== true) {
                const vendorGroups = Array.isArray(order.vendorItems) ? order.vendorItems : [];
                const uniqueVendorIds = [
                    ...new Set(vendorGroups.map((group) => String(group?.vendorId || '')).filter(Boolean)),
                ];
                const isSingleVendorOrder = uniqueVendorIds.length <= 1;

                // Do not prematurely set order status to 'returned' upon approval
                // It will be set when the return is actually 'completed'

                if (status === 'completed' && previousStatus !== 'completed') {
                    const stockRestores = (request.items || []).map(async (item) => {
                        const qty = Number(item?.quantity || 0);
                        const variantKey = item?.selectedSize || item?.variant?.size || item?.variantKey || (item?.variant && Object.values(item.variant)[0]);
                        if (!item?.productId || qty <= 0) return;

                        const incUpdate = { stockQuantity: qty };
                        if (variantKey) {
                            incUpdate[`variants.stockMap.${variantKey}`] = qty;
                        }

                        const updatedProduct = await Product.findByIdAndUpdate(
                            item.productId,
                            { $inc: incUpdate },
                            { new: true }
                        );

                        if (updatedProduct) {
                            const nextStockState = updatedProduct.stockQuantity <= 0 ? 'out_of_stock' : (updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 10) ? 'low_stock' : 'in_stock');
                            await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStockState } });
                        }
                    });
                    await Promise.all(stockRestores);

                    // Reverse vendor earnings and commission
                    await WalletService.processOrderReturn(request);

                    // Stamp returned quantities/amount onto the order so invoices
                    // (admin/user/vendor) show the actual amount payable after this return.
                    applyReturnToOrder(order, request);

                    // Mark full order returned/refunded only when every vendor in this order completed returns.
                    const completedReturns = await ReturnRequest.find({
                        orderId: order._id,
                        status: 'completed',
                    })
                        .select('vendorId')
                        .lean();

                    const completedVendorSet = new Set(
                        completedReturns.map((entry) => String(entry?.vendorId || '')).filter(Boolean)
                    );
                    const allVendorsCompleted =
                        uniqueVendorIds.length > 0 && uniqueVendorIds.every((vendorId) => completedVendorSet.has(vendorId));

                    if (allVendorsCompleted) {
                        if (order.status !== 'cancelled') {
                            order.status = 'returned';
                        }
                        order.paymentStatus = 'refunded';
                    }

                    await order.save();
                }
            }
        }
    }

    const notificationTasks = [
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Return request updated',
            message: `Return request for order ${request.orderId?.orderId || request.orderId} updated.`,
            type: 'order',
            data: {
                returnRequestId: String(request._id),
                orderId: String(request.orderId?.orderId || request.orderId || ''),
                status: String(request.status),
                refundStatus: String(request.refundStatus || ''),
            },
        }),
    ];

    if (request.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId: request.userId._id,
                recipientType: 'user',
                title: 'Return request status updated',
                message: `Your return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    }

    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    admins.forEach((admin) => {
        notificationTasks.push(
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'Return request updated',
                message: `Return request for order ${request.orderId?.orderId || request.orderId} moved to ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    });

    await Promise.allSettled(notificationTasks);

    emitEvent(`return_${request._id}`, 'return_status_updated', request);

    res.status(200).json(
        new ApiResponse(
            200,
            normalizeReturnRequest(request),
            'Return request status updated.'
        )
    );
});
