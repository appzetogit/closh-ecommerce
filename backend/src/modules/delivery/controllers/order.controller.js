import Razorpay from 'razorpay';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Delivery from '../../../models/Delivery.model.js';
import DeliveryBatch from '../../../models/DeliveryBatch.model.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Product from '../../../models/Product.model.js';
import { OrderWorkflowService } from '../../../services/orderWorkflow.service.js';
import { OrderNotificationService } from '../../../services/orderNotification.service.js';
import { sendDeliveryOtpSms } from '../../../services/sms.service.js';
import * as DeliveryOtpService from '../../../services/deliveryOtp.service.js';
import redisConnection from '../../../config/redis.js';
import { WalletService } from '../../../services/wallet.service.js';
import { calculateDistance, calculatePathDistance, getDeliveryEarning, getVendorPickupFee, getVendorDropoffFee } from '../../../utils/geo.js';
import { getDeliveryFeeConfig } from '../../../utils/deliveryFeeConfig.js';
import Vendor from '../../../models/Vendor.model.js';
import Enquiry from '../../../models/Enquiry.model.js';
import CancellationReason from '../../../models/CancellationReason.model.js';

const DELIVERY_OTP_TTL_MS = 10 * 60 * 1000;
const DELIVERY_OTP_MAX_ATTEMPTS = 5;
const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const CACHE_TTL_SECONDS = 90; // 1.5 min cache for summary endpoints

/** Lightweight Redis cache helpers — silently fall back if Redis is down */
export const cacheGet = async (key) => {
    try {
        if (redisConnection?.status !== 'ready') return null;
        const data = await redisConnection.get(key);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
};
export const cacheSet = async (key, value, ttl = CACHE_TTL_SECONDS) => {
    try {
        if (redisConnection?.status !== 'ready') return;
        await redisConnection.set(key, JSON.stringify(value), 'EX', ttl);
    } catch { /* silent */ }
};
export const cacheInvalidate = async (...keys) => {
    try {
        if (redisConnection?.status !== 'ready') return;
        await redisConnection.del(...keys);
    } catch { /* silent */ }
};


const getCustomerEmail = (order) => {
    return (
        String(order?.shippingAddress?.email || '').trim().toLowerCase() ||
        String(order?.guestInfo?.email || '').trim().toLowerCase()
    );
};

const sendDeliveryOtpEmail = async (order, otp) => {
    const to = getCustomerEmail(order);
    if (!to) return false;

    await sendEmail({
        to,
        subject: `Delivery OTP for order ${order.orderId || order._id}`,
        text: `Your delivery verification OTP is ${otp}. Share it with the delivery partner only after receiving your order. It expires in 10 minutes.`,
        html: `<p>Your delivery verification OTP is <strong>${otp}</strong>.</p><p>Share it with the delivery partner only after receiving your order.</p><p>This OTP expires in 10 minutes.</p>`,
    });

    return true;
};

// GET /api/delivery/orders
export const getAssignedOrders = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const filter = { deliveryBoyId: req.user.id, isDeleted: { $ne: true } };

    if (status === 'open') {
        filter.status = { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'returning_unselected_items', 'returning_unselected'] };
    } else if (status === 'delivered') {
        // Multi-vendor orders may end up in 'try_buy_completed' or 'returned' if some items are returned
        filter.status = { $in: ['delivered', 'try_buy_completed', 'returned', 'returned_to_vendor'] };
    } else if (status) {
        // Support comma-separated statuses (e.g. "delivered,cancelled")
        if (typeof status === 'string' && status.includes(',')) {
            filter.status = { $in: status.split(',').map(s => s.trim()) };
        } else {
            filter.status = status;
        }
    }

    const hasPaginationParams = page !== undefined || limit !== undefined;
    const selectFields = 'orderId status total deliveryEarnings deliveryDistance items.name items.image items.quantity orderType paymentMethod customer phone address shippingAddress guestInfo vendorItems.vendorId vendorItems.vendorName isMultiVendor vendorPickups pickupLocation dropoffLocation createdAt updatedAt';

    if (!hasPaginationParams) {
        const orders = await Order.find(filter)
            .select(selectFields)
            .populate('vendorItems.vendorId', 'storeName')
            .sort({ updatedAt: -1 })
            .lean();
        return res.status(200).json(new ApiResponse(200, orders, 'Assigned orders fetched.'));
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const requestedLimit = Number(limit) || 20;
    const numericLimit = Math.min(Math.max(1, requestedLimit), 100);
    const skip = (numericPage - 1) * numericLimit;

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .select(selectFields)
            .populate('vendorItems.vendorId', 'storeName')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                orders,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Assigned orders fetched.'
        )
    );
});

// GET /api/delivery/orders/rejected
// Returns: (1) orders that were cancelled while this rider was assigned
//          (2) orders this rider explicitly rejected (in rejectedDeliveryBoys)
export const getRejectedOrders = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const { page, limit } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const selectFields = 'orderId status total deliveryEarnings deliveryDistance items.name items.image items.quantity orderType paymentMethod shippingAddress.name guestInfo.name vendorItems.vendorId vendorItems.vendorName isMultiVendor cancelledAt cancellationReason createdAt updatedAt';

    // Query 1: Cancelled while assigned to this rider
    const cancelledFilter = {
        deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
        status: 'cancelled',
        isDeleted: { $ne: true }
    };

    // Query 2: Orders this rider manually rejected (in rejectedDeliveryBoys)
    const rejectedByRiderFilter = {
        rejectedDeliveryBoys: new mongoose.Types.ObjectId(deliveryBoyId),
        isDeleted: { $ne: true }
    };

    const [cancelledOrders, rejectedOrders, cancelledTotal, rejectedTotal] = await Promise.all([
        Order.find(cancelledFilter)
            .select(selectFields)
            .populate('vendorItems.vendorId', 'storeName')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.find(rejectedByRiderFilter)
            .select(selectFields + ' rejectedDeliveryBoys')
            .populate('vendorItems.vendorId', 'storeName')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(cancelledFilter),
        Order.countDocuments(rejectedByRiderFilter),
    ]);

    // Merge and de-duplicate by orderId
    const seen = new Set();
    const merged = [];

    for (const o of cancelledOrders) {
        const key = String(o._id);
        if (!seen.has(key)) { seen.add(key); merged.push({ ...o, rejectionType: 'cancelled_assigned' }); }
    }
    for (const o of rejectedOrders) {
        const key = String(o._id);
        if (!seen.has(key)) { seen.add(key); merged.push({ ...o, rejectionType: 'rider_rejected' }); }
    }

    // Sort merged by updatedAt desc
    merged.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    const total = cancelledTotal + rejectedTotal;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                orders: merged,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
                summary: {
                    cancelledAssigned: cancelledTotal,
                    riderRejected: rejectedTotal,
                    total,
                }
            },
            'Rejected orders fetched.'
        )
    );
});

// GET /api/delivery/returns/completed
// Returns all return requests completed by this rider (history + earnings)
export const getCompletedReturns = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const { page, limit } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const [returns, total, earningsStats] = await Promise.all([
        ReturnRequest.find({ deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), status: 'completed' })
            .populate('orderId', 'orderId shippingAddress guestInfo paymentMethod isMultiVendor orderType total')
            .populate('userId', 'name')
            .populate('vendorId', 'storeName')
            .select('returnId status deliveryEarnings deliveryDistance items isMultiVendor vendorDropoffs reason createdAt updatedAt orderId userId vendorId')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        ReturnRequest.countDocuments({ deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), status: 'completed' }),
        ReturnRequest.aggregate([
            { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), status: 'completed' } },
            { $group: { _id: null, totalEarnings: { $sum: { $ifNull: ['$deliveryEarnings', 0] } }, count: { $sum: 1 } } }
        ])
    ]);

    const earningsSummary = earningsStats?.[0] || { totalEarnings: 0, count: 0 };

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                returns,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
                summary: {
                    total,
                    totalEarnings: earningsSummary.totalEarnings,
                }
            },
            'Completed returns fetched.'
        )
    );
});

// GET /api/delivery/orders/available
export const getAvailableOrders = asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    // Get current rider profile to find their location
    const rider = await DeliveryBoy.findById(req.user.id);
    const riderCoords = rider?.currentLocation?.coordinates;

    // ── BLOCKER: check if rider already has an active mission (Order or Return) ──
    const [hasActiveOrder, hasActiveReturn] = await Promise.all([
        Order.exists({
            deliveryBoyId: req.user.id,
            isDeleted: { $ne: true },
            status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'returning_unselected_items', 'returning_unselected'] }
        }),
        ReturnRequest.exists({
            deliveryBoyId: req.user.id,
            status: 'processing'
        })
    ]);

    if (hasActiveOrder || hasActiveReturn) {
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    orders: [],
                    pagination: { total: 0, page: numericPage, limit: numericLimit, pages: 1 },
                },
                'Mission in progress: Finish your current task to see more orders.'
            )
        );
    }

    const filter = {
        status: { $in: ['ready_for_pickup', 'all_vendors_ready', 'searching'] },
        deliveryBoyId: null,
        isDeleted: { $ne: true }
    };

    // Apply 8km spatial filter if rider location is known
    // 8km in radians = 8 / 6378.1
    if (riderCoords && riderCoords[0] !== 0 && riderCoords[1] !== 0) {
        filter.pickupLocation = {
            $geoWithin: {
                $centerSphere: [riderCoords, 8 / 6378.1]
            }
        };
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .select('orderId status pickupLocation dropoffLocation total deliveryEarnings items.name items.image items.quantity orderType paymentMethod isMultiVendor vendorItems vendorPickups createdAt shippingAddress.city shippingAddress.state')
            .populate('vendorItems.vendorId', 'storeName shopAddress shopLocation address')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                orders,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Available orders fetched.'
        )
    );
});


// GET /api/delivery/orders/dashboard-summary
export const getDashboardSummary = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const cacheKey = `dash:${deliveryBoyId}`;

    // Try cache first
    const cached = await cacheGet(cacheKey);
    if (cached) return res.status(200).json(new ApiResponse(200, cached, 'Dashboard summary fetched (cached).'));

    const rider = await DeliveryBoy.findById(deliveryBoyId).select('totalEarnings availableBalance').lean();
    if (!rider) throw new ApiError(404, 'Rider profile not found.');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
        statusStats,
        completedTodayCount,
        completedReturnsTodayCount,
        orderEarningsStats,
        returnEarningsStats,
        recentOrders,
        activeReturns
    ] = await Promise.all([
        Order.aggregate([
            { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]),
        Order.countDocuments({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: { $in: ['delivered', 'try_buy_completed'] },
            $or: [
                { deliveredAt: { $gte: todayStart } },
                { deliveredAt: { $exists: false }, updatedAt: { $gte: todayStart } },
                { deliveredAt: null, updatedAt: { $gte: todayStart } },
            ],
        }),
        ReturnRequest.countDocuments({
            deliveryBoyId,
            status: 'completed',
            updatedAt: { $gte: todayStart }
        }),
        Order.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    isDeleted: { $ne: true },
                    status: { $in: ['delivered', 'try_buy_completed'] },
                },
            },
            {
                $group: {
                    _id: null,
                    totalDeliveryFees: { $sum: { $ifNull: ['$deliveryEarnings', 0] } },
                },
            },
        ]),
        ReturnRequest.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    totalReturnFees: { $sum: { $ifNull: ['$deliveryEarnings', 0] } }
                }
            }
        ]),
        Order.find({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'returning_unselected_items', 'returning_unselected'] }
        })
            .select('orderId status total deliveryEarnings deliveryDistance orderType paymentMethod shippingAddress.name shippingAddress.phone guestInfo.name guestInfo.phone vendorItems.vendorId vendorItems.vendorName pickupLocation dropoffLocation items.name items.image items.quantity deliveryFlow.phase isMultiVendor vendorPickups createdAt updatedAt')
            .populate('vendorItems.vendorId', 'storeName shopAddress shopLocation')
            .sort({ updatedAt: -1 })
            .limit(10)
            .lean(),
        ReturnRequest.find({
            deliveryBoyId,
            status: 'processing'
        })
            .populate('orderId', 'orderId total shippingAddress')
            .populate('userId', 'name email phone')
            .populate('vendorId', 'storeName shopAddress shopLocation')
            .lean()
    ]);

    const orderEarnings = Number(orderEarningsStats?.[0]?.totalDeliveryFees || 0);
    const returnEarnings = Number(returnEarningsStats?.[0]?.totalReturnFees || 0);

    const countByStatus = statusStats.reduce((acc, row) => {
        acc[String(row?._id || '')] = Number(row?.count || 0);
        return acc;
    }, {});

    // Augment recentOrders with batchId from Delivery model
    const orderIds = recentOrders.map(o => o._id);
    const deliveries = await Delivery.find({ orderId: { $in: orderIds }, status: { $ne: 'delivered' } }).populate('batchId');

    const augmentedOrders = recentOrders.map(order => {
        const d = deliveries.find(del => String(del.orderId) === String(order._id));
        const orderObj = order.toObject ? order.toObject() : order;
        if (d && d.batchId) {
            orderObj.batchId = d.batchId.batchId;
        }
        return orderObj;
    });

    // Calculate Cash in Hand (Unsettled COD/Cash orders)
    const cashStats = await Order.aggregate([
        {
            $match: {
                deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                status: { $in: ['delivered', 'try_buy_completed'] },
                paymentMethod: { $in: ['cod', 'cash'] },
                isDeleted: { $ne: true }
            }
        },
        {
            $group: {
                _id: null,
                cashInHand: { $sum: { $cond: [{ $ne: ['$isCashSettled', true] }, '$total', 0] } },
                totalCashCollected: { $sum: '$total' }
            }
        }
    ]);

    const cashRow = cashStats?.[0] || { cashInHand: 0, totalCashCollected: 0 };

    // Source of truth: Use the bulk balance from the rider model
    const finalCashInHand = (rider.cashInHand !== undefined && rider.cashInHand !== null)
        ? rider.cashInHand
        : Number(cashRow.cashInHand || 0);

    const finalTotalCollected = (rider.cashCollected !== undefined && rider.cashCollected !== null)
        ? rider.cashCollected
        : Number(cashRow.totalCashCollected || 0);

    const summary = {
        totalOrders: statusStats.reduce((sum, row) => sum + Number(row?.count || 0), 0),
        completedToday: Number(completedTodayCount || 0) + Number(completedReturnsTodayCount || 0),
        openOrders:
            Number(countByStatus.assigned || 0) +
            Number(countByStatus.picked_up || 0) +
            Number(countByStatus.out_for_delivery || 0) +
            activeReturns.length,
        earnings: orderEarnings + returnEarnings,
        totalEarnings: Number(rider.totalEarnings || 0),
        availableBalance: Number(rider.availableBalance || 0),
        cashInHand: finalCashInHand,
        totalCashCollected: finalTotalCollected,
        recentOrders: augmentedOrders,
        activeReturns,
    };

    // Note: We no longer sync from orders back to model here to avoid overwriting 
    // settlement-adjusted balances. Financial integrity is maintained via WalletService.

    await cacheSet(cacheKey, summary);
    return res.status(200).json(new ApiResponse(200, summary, 'Dashboard summary fetched.'));
});

// GET /api/delivery/orders/profile-summary
export const getProfileSummary = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const profileCacheKey = `profile:${deliveryBoyId}`;

    const cached = await cacheGet(profileCacheKey);
    if (cached) return res.status(200).json(new ApiResponse(200, cached, 'Profile summary fetched (cached).'));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [deliveredStats, completedTodayCount, returnStats, returnTodayCount] = await Promise.all([
        Order.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    isDeleted: { $ne: true },
                    status: 'delivered',
                },
            },
            {
                $group: {
                    _id: null,
                    totalDeliveries: { $sum: 1 },
                    earnings: { $sum: { $ifNull: ['$deliveryEarnings', 0] } },
                },
            },
        ]),
        Order.countDocuments({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: 'delivered',
            $or: [
                { deliveredAt: { $gte: todayStart } },
                { deliveredAt: { $exists: false }, updatedAt: { $gte: todayStart } },
                { deliveredAt: null, updatedAt: { $gte: todayStart } },
            ],
        }),
        ReturnRequest.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: null,
                    totalReturns: { $sum: 1 },
                    earnings: { $sum: { $ifNull: ['$deliveryEarnings', 0] } },
                },
            },
        ]),
        ReturnRequest.countDocuments({
            deliveryBoyId,
            status: 'completed',
            updatedAt: { $gte: todayStart }
        }),
    ]);

    // Calculate Cash Stats
    const cashStats = await Order.aggregate([
        {
            $match: {
                deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                status: 'delivered',
                paymentMethod: { $in: ['cod', 'cash'] },
                isDeleted: { $ne: true }
            }
        },
        {
            $group: {
                _id: null,
                cashInHand: {
                    $sum: {
                        $cond: [
                            { $ne: ['$isCashSettled', true] },
                            { $ifNull: ['$deliveryFlow.finalAmount', '$total'] },
                            0
                        ]
                    }
                },
                totalCashCollected: { $sum: { $ifNull: ['$deliveryFlow.finalAmount', '$total'] } }
            }
        }
    ]);
    const rider = await DeliveryBoy.findById(deliveryBoyId);
    const row = deliveredStats?.[0] || {};
    const rRow = returnStats?.[0] || {};
    const cashRow = cashStats?.[0] || { cashInHand: 0, totalCashCollected: 0 };

    // Source of truth: Use the bulk balance from the rider model if it's been initialized/tracked.
    // Otherwise fallback to the aggregate of unsettled orders (for backward compatibility).
    const finalCashInHand = (rider.cashInHand !== undefined && rider.cashInHand !== null)
        ? rider.cashInHand
        : Number(cashRow.cashInHand || 0);

    const finalTotalCollected = (rider.cashCollected !== undefined && rider.cashCollected !== null)
        ? rider.cashCollected
        : Number(cashRow.totalCashCollected || 0);

    // Cache and return result
    // We include existing rider profile fields to avoid UI data loss on frontend merge
    const profileData = {
        ...rider.toObject(),
        totalDeliveries: Number(row.totalDeliveries || 0) + Number(rRow.totalReturns || 0),
        completedToday: Number(completedTodayCount || 0) + Number(returnTodayCount || 0),
        earnings: Number(row.earnings || 0) + Number(rRow.earnings || 0),
        totalEarnings: Number(rider.totalEarnings || 0),
        availableBalance: Number(rider.availableBalance || 0),
        cashInHand: finalCashInHand,
        totalCashCollected: finalTotalCollected
    };

    // Note: We no longer sync from orders back to model here to avoid overwriting 
    // settlement-adjusted balances. Financial integrity is maintained via WalletService.

    await cacheSet(profileCacheKey, profileData);

    return res.status(200).json(
        new ApiResponse(
            200,
            profileData,
            'Profile summary fetched.'
        )
    );
});

// Helper to safely find a ReturnRequest whether given an ObjectId (_id), returnId (RET-...), or orderId string (ORD-...)
const findReturnRequestByIdOrString = async (id, deliveryBoyId = null, includeUnassignedApproved = false) => {
    const conditions = [];
    if (mongoose.isValidObjectId(id)) {
        conditions.push({ _id: id });
        conditions.push({ orderId: id });
    }
    if (typeof id === 'string') {
        conditions.push({ returnId: id });
    }

    if (!mongoose.isValidObjectId(id) && typeof id === 'string') {
        const order = await Order.findOne({ orderId: id }).select('_id');
        if (order) {
            conditions.push({ orderId: order._id });
        }
    }

    const filter = conditions.length > 1 ? { $or: conditions } : (conditions[0] || {});

    if (deliveryBoyId && includeUnassignedApproved) {
        return ReturnRequest.findOne({
            $and: [
                filter,
                {
                    $or: [
                        { deliveryBoyId: deliveryBoyId },
                        { deliveryBoyId: { $exists: false }, status: 'approved' }
                    ]
                }
            ]
        });
    } else if (deliveryBoyId) {
        return ReturnRequest.findOne({
            $and: [
                filter,
                { deliveryBoyId: deliveryBoyId }
            ]
        });
    }

    return ReturnRequest.findOne(filter);
};

// GET /api/delivery/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deliveryBoyId = req.user.id;

    const idFilter = [{ orderId: id }];
    if (mongoose.isValidObjectId(id)) {
        idFilter.push({ _id: id });
    }

    const query = {
        isDeleted: { $ne: true },
        $and: [
            { $or: idFilter },
            {
                $or: [
                    { deliveryBoyId: deliveryBoyId },
                    {
                        deliveryBoyId: { $exists: false },
                        status: 'ready_for_pickup'
                    }
                ]
            }
        ]
    };

    let order = await Order.findOne(query)
        .populate('vendorItems.vendorId', 'storeName shopAddress shopLocation phone')
        .populate('deliveryBoyId', 'name phone currentLocation')
        .select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts');

    if (!order) {
        // Try searching in ReturnRequest
        const returnReq = await findReturnRequestByIdOrString(id, deliveryBoyId, true);

        if (!returnReq) throw new ApiError(404, 'Task not found.');

        await returnReq.populate('userId', 'name phone');
        await returnReq.populate('vendorId', 'storeName shopAddress shopLocation phone');
        await returnReq.populate('orderId', 'orderId total shippingAddress');

        // Normalize ReturnRequest to Order-like structure for the detail page
        return res.status(200).json(new ApiResponse(200, {
            _id: returnReq._id,
            id: returnReq._id,
            orderId: returnReq.orderId?.orderId || 'RETURN',
            status: returnReq.status === 'approved' ? 'ready_for_pickup' : (returnReq.status === 'processing' ? 'assigned' : returnReq.status),
            rawStatus: returnReq.status,
            type: 'return',
            customer: returnReq.userId?.name || 'Customer',
            phone: returnReq.userId?.phone || '',
            address: returnReq.orderId?.shippingAddress?.address || 'Pickup Point',
            pickupLocation: returnReq.pickupLocation,
            dropoffLocation: returnReq.dropoffLocation,
            total: returnReq.refundAmount || 0,
            items: returnReq.items || [],
            vendorName: returnReq.vendorId?.storeName || 'Vendor',
            vendorAddress: returnReq.vendorId?.shopAddress || 'Vendor Address',
            vendorLatitude: returnReq.vendorId?.shopLocation?.coordinates?.[1],
            vendorLongitude: returnReq.vendorId?.shopLocation?.coordinates?.[0],
            latitude: returnReq.pickupLocation?.coordinates?.[1], // For returns, pickup is from customer
            longitude: returnReq.pickupLocation?.coordinates?.[0],
            deliveryBoyId: returnReq.deliveryBoyId,
            createdAt: returnReq.createdAt,
            updatedAt: returnReq.updatedAt
        }, 'Return detail fetched.'));
    }

    // Attach batch context if exists
    const delivery = await Delivery.findOne({ orderId: order._id, status: { $ne: 'delivered' } }).populate('batchId');
    const responseData = order.toObject();
    if (delivery && delivery.batchId) {
        responseData.batchId = delivery.batchId.batchId; // The string ID BATCH-xxx
    }

    res.status(200).json(new ApiResponse(200, responseData, 'Order detail fetched.'));
});

// PATCH /api/delivery/orders/:id/status
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
    const { status, otp, pickupPhoto, deliveryPhoto } = req.body;
    const allowed = ['picked_up', 'out_for_delivery', 'delivered'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query).select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug +deviceToken');
    if (!order) throw new ApiError(404, 'Order not found or not assigned to you.');

    // Server-side transition guard
    const transitionMap = {
        assigned: ['picked_up'],
        ready_for_pickup: ['picked_up'],
        picked_up: ['out_for_delivery'],
        out_for_delivery: ['delivered'],
        delivered: ['delivered'],
    };

    const allowedNext = transitionMap[order.status] || [];
    if (!allowedNext.includes(status)) {
        throw new ApiError(409, `Cannot move order from ${order.status} to ${status}.`);
    }

    if (status === 'picked_up') {
        if (!pickupPhoto) {
            throw new ApiError(400, 'Product pickup photo is required to confirm pickup.');
        }
        order.pickupPhoto = pickupPhoto;

        // Status update logic continues below
    }

    if (status === 'out_for_delivery') {
        // Handled by OrderNotificationService
    }

    if (status === 'delivered') {
        const normalizedOtp = String(otp || '').trim();
        if (!/^\d{6}$/.test(normalizedOtp)) {
            throw new ApiError(400, 'Delivery OTP is required to complete delivery.');
        }

        if (!order.deliveryOtpHash || !order.deliveryOtpExpiry) {
            throw new ApiError(400, 'Delivery OTP was not generated.');
        }

        if (order.deliveryOtpExpiry < new Date()) {
            throw new ApiError(400, 'Delivery OTP has expired. Please resend OTP.');
        }

        if (deliveryPhoto) {
            order.deliveryPhoto = deliveryPhoto;
        }

        // Open box photo only required for COD orders
        const isCodOrder = order.paymentMethod === 'cod' || order.paymentMethod === 'cash';
        if (isCodOrder && !req.body.openBoxPhoto) {
            throw new ApiError(400, 'Open box photo (item verification) is required for COD orders.');
        }
        if (req.body.openBoxPhoto) {
            order.openBoxPhoto = req.body.openBoxPhoto;
        }

        const isMatch = order.deliveryOtpHash === DeliveryOtpService.hashOtp(normalizedOtp);
        if (!isMatch) {
            order.deliveryOtpAttempts = (Number(order.deliveryOtpAttempts) || 0) + 1;
            await order.save();
            throw new ApiError(400, 'Invalid delivery OTP.');
        }

        order.deliveryOtpVerifiedAt = new Date();
        order.deliveryOtpHash = undefined;
        order.deliveryOtpExpiry = undefined;
        order.deliveryOtpSentAt = undefined;
        order.deliveryOtpAttempts = 0;
        order.deliveryOtpDebug = undefined;
        order.deliveredAt = new Date();

        if (order.paymentMethod === 'cod' || order.paymentMethod === 'cash') {
            order.paymentStatus = 'paid';
            order.isCashSettled = false;
        }

        // Calculate delivery earnings using dynamic fee config (applied at completion)
        const { getDistanceMatrix } = await import('../../../services/googleMaps.service.js');
        const feeConfig = await getDeliveryFeeConfig();
        // For multi-vendor: calculate path distance between all vendors for the routing fee
        let vendorRoutingDistance = 0;
        let finalPickup = order.pickupLocation?.coordinates || [0, 0];
        if (order.isMultiVendor && order.vendorPickups?.length > 0) {
            const sortedPickups = [...order.vendorPickups].sort((a, b) => a.sequence - b.sequence);
            const vendorCoords = sortedPickups.map(p => p.shopLocation?.coordinates).filter(c => c && c.length === 2);
            if (vendorCoords.length > 0) {
                vendorRoutingDistance = calculatePathDistance(vendorCoords);
                finalPickup = vendorCoords[vendorCoords.length - 1]; // Use last vendor as starting point for delivery
            }
        }

        const pickup = finalPickup;
        const dropoff = order.dropoffLocation?.coordinates || [0, 0];

        let distanceKm = order.deliveryDistance || 0;

        // Re-verify distance for accuracy
        const matrix = await getDistanceMatrix(pickup, dropoff);
        if (matrix) {
            distanceKm = matrix.distance;
        } else if (!distanceKm) {
            distanceKm = calculateDistance(pickup, dropoff);
        }


        const numVendorStops = order.vendorItems?.length || 1;
        const stopFee = getVendorPickupFee(vendorRoutingDistance, feeConfig);
        const distanceFee = getDeliveryEarning(distanceKm, feeConfig);
        const riderEarnings = stopFee + distanceFee;

        console.log(`[OrderComplete] Distance: ${distanceKm}km | VendorRoutingDist: ${vendorRoutingDistance}km | StopFee: ₹${stopFee} | DistFee: ₹${distanceFee} | Total: ₹${riderEarnings}`);

        // Persist earnings and distance on the order
        order.deliveryEarnings = riderEarnings;
        order.deliveryDistance = distanceKm;

        // ── WALLET SETTLEMENT ──
        const { WalletService } = await import('../../../services/wallet.service.js');
        await WalletService.processOrderCompletion(order);

        const isTryAndBuy = order.orderType === 'try_and_buy' || order.orderType === 'check_and_buy';
        const flow = order.deliveryFlow || {};
        const hasRejectedItems = isTryAndBuy && flow.rejectedItems && flow.rejectedItems.length > 0;
        const finalPhase = hasRejectedItems ? 'returning_unselected' : 'delivered';
        const finalStatus = hasRejectedItems ? 'returning_unselected_items' : 'delivered';

        order.status = finalStatus;
        if (!hasRejectedItems) {
            order.deliveredAt = new Date();
        }
        if (order.deliveryFlow) {
            order.deliveryFlow.phase = finalPhase;
        }

        // Sync vendorItems statuses — per-vendor check for accepted/rejected items
        if (order.vendorItems && order.vendorItems.length > 0) {
            const rejectedItemsList = (order.deliveryFlow?.rejectedItems || []);
            const acceptedItemsList = (order.deliveryFlow?.tryAndBuyItems || []).filter(i => i.decision === 'accepted');
            
            order.vendorItems.forEach(group => {
                const vendorGroupId = String(group.vendorId._id || group.vendorId);
                
                // Check if THIS specific vendor has any rejected items
                const thisVendorHasRejectedItems = hasRejectedItems && rejectedItemsList.some(ri => {
                    const riVendorId = ri.vendorId ? String(ri.vendorId._id || ri.vendorId) : null;
                    if (riVendorId) return riVendorId === vendorGroupId;
                    // Fallback: check if the rejected item's product belongs to this vendor group
                    return group.items.some(item => String(item.productId) === String(ri.productId));
                });

                // Check if THIS specific vendor has any accepted items
                const thisVendorHasAcceptedItems = acceptedItemsList.some(ai => {
                    const aiVendorId = ai.vendorId ? String(ai.vendorId._id || ai.vendorId) : null;
                    if (aiVendorId) return aiVendorId === vendorGroupId;
                    // Fallback: check if the accepted item's product belongs to this vendor group
                    return group.items.some(item => String(item.productId) === String(ai.productId));
                });

                // If vendor has at least one accepted item, mark as delivered.
                // It will only be marked returning_unselected_items if ALL items are rejected.
                if (thisVendorHasAcceptedItems || !thisVendorHasRejectedItems) {
                    group.status = 'delivered';
                    group.deliveredAt = new Date();
                } else {
                    group.status = 'returning_unselected_items';
                }
            });
        }

        // Generate return stops for vendors if needed
        if (hasRejectedItems && order.deliveryFlow) {
            const returnVendorIds = [...new Set(order.deliveryFlow.rejectedItems.map(i => {
                const vi = order.vendorItems.find(g => g.items.some(item => String(item.productId) === String(i.productId)));
                return vi ? String(vi.vendorId._id || vi.vendorId) : null;
            }).filter(Boolean))];

            const returnStops = returnVendorIds.map(vid => {
                const vi = order.vendorItems.find(g => String(g.vendorId._id || g.vendorId) === vid);
                return {
                    vendorId: vid,
                    vendorName: vi ? vi.vendorName : 'Vendor',
                    shopLocation: vi ? vi.shopLocation : undefined,
                    shopAddress: vi ? vi.shopAddress : undefined,
                    vendorPhone: vi ? vi.phone : undefined,
                    status: 'pending'
                };
            });
            order.vendorReturnStops = returnStops;
        }

        await order.save();

        let updatedRider;
        if (!hasRejectedItems) {
            updatedRider = await DeliveryBoy.findById(req.user.id).select('name availableBalance totalEarnings totalDeliveries');
        }

        await OrderNotificationService.notifyOrderUpdate(order._id, finalStatus, {
            excludeRecipientId: req.user.id,
            title: `Order #${order.orderId} ${hasRejectedItems ? 'Partial Delivery' : 'Delivered'}`,
            message: hasRejectedItems ? `Order ${order.orderId} customer selection completed. Rider will return unselected items.` : `Order ${order.orderId} has been successfully delivered by ${updatedRider?.name || 'Partner'}.`
        });

        await cacheInvalidate(`dash:${req.user.id}`, `profile:${req.user.id}`);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    order,
                    rider: {
                        availableBalance: updatedRider?.availableBalance || 0,
                        totalEarnings: updatedRider?.totalEarnings || 0,
                        totalDeliveries: updatedRider?.totalDeliveries || 0,
                    },
                },
                'Delivery status updated.'
            )
        );
    }

    // ── CRITICAL: Actually persist the status change ──
    order.status = status;
    if (status === 'picked_up') order.pickedUpAt = new Date();

    // Sync vendorItems statuses
    if (order.vendorItems && order.vendorItems.length > 0) {
        order.vendorItems.forEach(group => {
            group.status = status;
            if (status === 'picked_up') group.pickedUpAt = new Date();
            if (status === 'delivered') group.deliveredAt = new Date();
        });
    }

    // Sync deliveryFlow if it exists
    if (order.deliveryFlow) {
        const phaseMap = { picked_up: 'picked_up', out_for_delivery: 'out_for_delivery' };
        if (phaseMap[status]) order.deliveryFlow.phase = phaseMap[status];
    }
    await order.save();
    await cacheInvalidate(`dash:${req.user.id}`, `profile:${req.user.id}`);

    // Unified Notification to all parties
    await OrderNotificationService.notifyOrderUpdate(order._id, status, {
        excludeRecipientId: req.user.id, // Rider knows it changed
        title: `Order #${order.orderId} ${status.replace(/_/g, ' ')}`,
        message: `Order ${order.orderId} is now ${status.replace(/_/g, ' ')}.`
    });

    res.status(200).json(new ApiResponse(200, order, 'Delivery status updated.'));
});

// POST /api/delivery/orders/:id/cancel (Creates an Enquiry instead of immediate cancellation)
export const cancelOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reasonId, reasonText } = req.body;
    const riderId = req.user.id;

    const query = {
        deliveryBoyId: riderId,
        isDeleted: { $ne: true },
        $or: [{ orderId: id }],
    };
    if (mongoose.isValidObjectId(id)) {
        query.$or.push({ _id: id });
    }

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    const cancellableStatuses = ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'ready_for_pickup', 'all_vendors_ready', 'processing'];
    if (!cancellableStatuses.includes(order.status)) {
        throw new ApiError(409, `Order cannot be cancelled in ${order.status} state.`);
    }

    // Check if an enquiry is already pending for this order
    const existingEnquiry = await Enquiry.findOne({ 
        orderId: order._id, 
        status: 'pending' 
    });
    if (existingEnquiry) {
        throw new ApiError(400, 'A cancellation request is already pending for this order.');
    }

    const enquiry = await Enquiry.create({
        orderId: order._id,
        deliveryBoyId: riderId,
        reasonId: reasonId || null,
        reasonText: reasonText || 'Delivery Cancellation',
        status: 'pending'
    });

    // Notify Admin
    emitEvent('admin', 'new_enquiry', {
        enquiryId: enquiry._id,
        orderId: order.orderId
    });

    // We return the ORIGINAL order to the frontend, because the frontend expects an Order object to update its state, not an Enquiry.
    // The order's status remains unchanged until admin approves the enquiry.
    res.status(200).json(new ApiResponse(200, order, 'Cancellation request submitted to admin for approval.'));
});

// GET /api/delivery/cancellation-reasons
export const getCancellationReasons = asyncHandler(async (req, res) => {
    const reasons = await CancellationReason.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, reasons, 'Cancellation reasons fetched.'));
});

// POST /api/delivery/orders/:id/resend-delivery-otp
export const resendDeliveryOtp = asyncHandler(async (req, res) => {
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };

    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query).select('+deviceToken');
    if (!order) throw new ApiError(404, 'Order not found.');

    const allowedStatusesForResend = ['picked_up', 'out_for_delivery'];
    if (!allowedStatusesForResend.includes(order.status)) {
        throw new ApiError(409, `OTP can only be resent when order is in ${allowedStatusesForResend.join(' or ')} state.`);
    }

    if (
        order.deliveryOtpSentAt &&
        new Date(order.deliveryOtpSentAt).getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS > Date.now()
    ) {
        throw new ApiError(429, 'Please wait before requesting another OTP.');
    }

    const otp = DeliveryOtpService.generateOtp();
    const flow = ensureDeliveryFlow(order);

    flow.otpHash = DeliveryOtpService.hashOtp(otp);
    flow.otpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
    flow.otpSentAt = new Date();
    flow.otpAttempts = 0;
    flow.otpDebug = otp;

    // Sync legacy fields
    order.deliveryOtpHash = flow.otpHash;
    order.deliveryOtpExpiry = flow.otpExpiry;
    order.deliveryOtpDebug = otp;

    await order.save();

    // Properly use centralized service for multi-channel notification
    await DeliveryOtpService.sendDeliveryOtp(order, otp);

    return res.status(200).json(new ApiResponse(200, { ...(IS_PRODUCTION ? {} : { deliveryOtpDebug: otp }), order: order }, 'Delivery OTP resent successfully.'));
});

// POST /api/delivery/orders/:id/arrived
export const markArrived = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const riderId = req.user.id;

    const query = {
        deliveryBoyId: riderId,
        isDeleted: { $ne: true },
        $or: [{ orderId: id }],
    };
    if (mongoose.isValidObjectId(id)) {
        query.$or.push({ _id: id });
    }

    const order = await Order.findOne(query).select('+deliveryOtpDebug +deviceToken');
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.status === 'picked_up') {
        order.status = 'out_for_delivery';
    }

    // Generate Delivery OTP at Arrival
    const otp = DeliveryOtpService.generateOtp();
    const flow = ensureDeliveryFlow(order);

    flow.otpHash = DeliveryOtpService.hashOtp(otp);
    flow.otpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
    flow.otpSentAt = new Date();
    flow.otpAttempts = 0;
    flow.otpDebug = otp;
    order.deliveryOtpDebug = otp;

    // Sync legacy fields
    order.deliveryOtpHash = flow.otpHash;
    order.deliveryOtpExpiry = flow.otpExpiry;

    await order.save();

    // Properly use centralized service for multi-channel notification
    await DeliveryOtpService.sendDeliveryOtp(order, otp);

    // Notify Track Room
    OrderNotificationService.notifyOrderUpdate(order._id, 'arrived', {
        excludeRecipientId: riderId,
        title: `Rider Arrived`,
        message: `Rider has arrived at the delivery location.`
    }).catch(err => console.error('Notification Error:', err));

    return res.status(200).json(new ApiResponse(200, order, 'Rider marked as arrived.'));
});

// GET /api/delivery/orders/:id/debug-otp (non-production only)
export const getDeliveryOtpForDebug = asyncHandler(async (req, res) => {
    if (IS_PRODUCTION) {
        throw new ApiError(404, 'Route not found.');
    }

    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query).select('+deliveryOtpDebug +deliveryOtpExpiry status orderId');
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'shipped') {
        throw new ApiError(409, 'Debug OTP is only available while order is in shipped state.');
    }

    const otp = String(order.deliveryOtpDebug || '').trim();
    if (!otp) {
        throw new ApiError(404, 'Delivery OTP debug value is not available.');
    }

    return res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        otp,
        expiresAt: order.deliveryOtpExpiry,
    }, 'Debug OTP fetched.'));
});

// GET /api/delivery/orders/:id/company-qr
export const getCompanyQR = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: id }],
    };
    if (mongoose.isValidObjectId(id)) {
        query.$or.push({ _id: id });
    }

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    const total = order.total || 0;
    // Simulated UPI intent via QR serving API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=company@upi%26pn=CLOSH%20Platform%26am=${total}%26cu=INR%26tn=Order_${order.orderId}`;

    return res.status(200).json(new ApiResponse(200, { qrUrl }, 'Company QR code generated.'));
});


// ═══════════════════════════════════════════════════════════════
//  ANTIGRAVITY ENGINE — State-Machine Delivery Flow Handlers
// ═══════════════════════════════════════════════════════════════

/** Helper: find an order assigned to the current rider */
const findOrderForRider = async (id, riderId, selectOtp = false) => {
    // Robustness: ensure we are using ObjectId for the query
    console.log(`[findOrderForRider] START - ID: ${id}, Rider: ${riderId}`);

    const riderObjectId = mongoose.Types.ObjectId.isValid(riderId)
        ? new mongoose.Types.ObjectId(riderId)
        : riderId;

    const query = {
        deliveryBoyId: riderObjectId,
        isDeleted: { $ne: true },
        $or: [{ orderId: id }],
    };
    if (mongoose.isValidObjectId(id)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(id) });
    }

    let q = Order.findOne(query).populate('vendorItems.vendorId');
    if (selectOtp) q = q.select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpDebug +deliveryFlow.otpHash +deliveryFlow.otpDebug');

    const order = await q;

    if (!order) {
        console.error(`[findOrderForRider] FAIL - Query:`, JSON.stringify(query));
        // Fallback: check if the order exists at all without rider filter for better error msgs
        const existsAtAll = await Order.findOne({ $or: [{ orderId: id }, { _id: mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null }] });
        if (existsAtAll) {
            console.error(`[findOrderForRider] Order FOUND but assigned to: ${existsAtAll.deliveryBoyId}`);
            throw new ApiError(403, `Order is assigned to another rider (${existsAtAll.deliveryBoyId}). You are ${riderId}.`);
        }
        throw new ApiError(404, 'Order not found.');
    }
    return order;
};

/** Map a top-level order.status to a deliveryFlow phase (for backward compat) */
const statusToPhase = (status) => {
    const map = {
        assigned: 'assigned', ready_for_pickup: 'assigned',
        picked_up: 'picked_up', out_for_delivery: 'out_for_delivery',
        delivered: 'delivered',
    };
    return map[status] || 'assigned';
};

/** Ensure the order has a deliveryFlow sub-doc, bootstrap if missing */
const ensureDeliveryFlow = (order) => {
    if (!order.deliveryFlow) {
        order.deliveryFlow = { phase: statusToPhase(order.status) };
    }
    return order.deliveryFlow;
};

// GET /api/delivery/orders/:id/flow
export const getDeliveryFlow = asyncHandler(async (req, res) => {
    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = order.deliveryFlow || { phase: statusToPhase(order.status) };
    res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        orderType: order.orderType,
        status: order.status,
        deliveryFlow: flow,
    }, 'Delivery flow fetched.'));
});

// PATCH /api/delivery/orders/:id/arrived-vendor
export const markArrivedAtVendor = asyncHandler(async (req, res) => {
    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    flow.arrivedAtVendor = new Date();
    await order.save();

    // Notify Vendor
    (order.vendorItems || []).forEach(vi =>
        emitEvent(`vendor_${vi.vendorId}`, 'rider_arrived_at_store', {
            orderId: order.orderId,
            riderName: order.deliveryBoyId?.name || 'Delivery Partner'
        })
    );

    OrderNotificationService.notifyOrderUpdate(order._id, 'arrived_at_store', {
        excludeRecipientId: req.user.id,
        title: `Partner Arrived`,
        message: `Delivery partner has arrived at your store for order #${order.orderId}.`,
    }).catch(() => { });

    res.status(200).json(new ApiResponse(200, order, 'Marked as arrived at vendor.'));
});

// PATCH /api/delivery/orders/:id/pickup
export const handlePickup = asyncHandler(async (req, res) => {
    const { pickupPhoto } = req.body;
    if (!pickupPhoto) throw new ApiError(400, 'Pickup photo is required.');

    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    if (flow.phase !== 'assigned') {
        throw new ApiError(409, `Cannot pickup from phase "${flow.phase}". Expected: assigned.`);
    }

    flow.phase = 'picked_up';
    flow.pickupPhoto = pickupPhoto;
    flow.pickupCompletedAt = new Date();
    order.status = 'picked_up';
    order.pickedUpAt = new Date();
    order.pickupPhoto = pickupPhoto;

    // Sync vendorItems statuses
    if (order.vendorItems && order.vendorItems.length > 0) {
        order.vendorItems.forEach(group => {
            group.status = 'picked_up';
            group.pickedUpAt = new Date();
        });
    }

    await order.save();

    emitEvent(`user_${order.userId}`, 'order_picked_up', { orderId: order.orderId });
    (order.vendorItems || []).forEach(vi =>
        emitEvent(`vendor_${vi.vendorId}`, 'order_picked_up', { orderId: order.orderId })
    );
    OrderNotificationService.notifyOrderUpdate(order._id, 'picked_up', {
        excludeRecipientId: req.user.id,
        title: `Order #${order.orderId} Picked Up`,
        message: `Delivery partner has picked up your order.`,
    }).catch(() => { });

    res.status(200).json(new ApiResponse(200, order, 'Pickup confirmed.'));
});

// PATCH /api/delivery/orders/:id/start
export const handleStartDelivery = asyncHandler(async (req, res) => {
    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    if (flow.phase !== 'picked_up') {
        throw new ApiError(409, `Cannot start delivery from phase "${flow.phase}". Expected: picked_up.`);
    }

    flow.phase = 'out_for_delivery';
    flow.startedAt = new Date();
    order.status = 'out_for_delivery';

    // Sync vendorItems statuses
    if (order.vendorItems && order.vendorItems.length > 0) {
        order.vendorItems.forEach(group => {
            group.status = 'out_for_delivery';
        });
    }

    await order.save();

    emitEvent(`user_${order.userId}`, 'order_out_for_delivery', { orderId: order.orderId });
    OrderNotificationService.notifyOrderUpdate(order._id, 'out_for_delivery', {
        excludeRecipientId: req.user.id,
        title: `Order #${order.orderId} On The Way`,
        message: `Your order is out for delivery.`,
    }).catch(() => { });

    res.status(200).json(new ApiResponse(200, order, 'Delivery started. Tracking active.'));
});

// PATCH /api/delivery/orders/:id/location
export const handleLocationUpdate = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) throw new ApiError(400, 'Coordinates required.');

    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    flow.lastLocation = { type: 'Point', coordinates: [longitude, latitude] };
    await order.save();

    emitEvent(`order_${order.orderId}`, 'location_updated', { latitude, longitude });
    res.status(200).json(new ApiResponse(200, null, 'Location updated.'));
});

// PATCH /api/delivery/orders/:id/arrived
export const handleArrivedAtCustomer = asyncHandler(async (req, res) => {
    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    if (!['out_for_delivery', 'picked_up'].includes(flow.phase)) {
        throw new ApiError(409, `Cannot mark arrived from phase "${flow.phase}".`);
    }

    // Auto-advance status
    if (order.status === 'picked_up') order.status = 'out_for_delivery';

    flow.phase = 'arrived';
    flow.arrivedAt = new Date();

    // Generate/Reuse OTP
    let otp = '';
    // If we're already arrived, keep existing OTP to avoid spamming the customer ("baar baar")
    const isNewArrival = !flow.otpHash || flow.otpExpiry < new Date();

    if (isNewArrival) {
        otp = DeliveryOtpService.generateOtp();
        flow.otpHash = DeliveryOtpService.hashOtp(otp);
        flow.otpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
        flow.otpSentAt = new Date();
        flow.otpAttempts = 0;
        flow.otpDebug = otp;

        // Keep legacy OTP fields in sync for mixed-version compatibility
        order.deliveryOtpHash = flow.otpHash;
        order.deliveryOtpExpiry = flow.otpExpiry;
        order.deliveryOtpSentAt = flow.otpSentAt;
        order.deliveryOtpAttempts = 0;
        order.deliveryOtpDebug = otp;
    }

    // For specialized orders, populate checklist from order items
    const isSpecializedOrder = order.orderType === 'try_and_buy' || order.orderType === 'check_and_buy';
    if (isSpecializedOrder && (!flow.tryAndBuyItems || flow.tryAndBuyItems.length === 0)) {
        flow.tryAndBuyItems = (order.items || []).map(item => ({
            productId: item.productId,
            vendorId: item.vendorId,
            name: item.name,
            image: item.image,
            price: item.price,
            originalPrice: item.originalPrice || item.price,
            quantity: item.quantity,
            variant: item.variant,
            variantKey: item.variantKey,
            decision: 'pending',
        }));
    }

    flow.originalAmount = order.total;
    flow.finalAmount = order.total;
    await order.save();

    // Only send the delivery notification if it's the first arrival or a manual retry
    if (isNewArrival) {
        await DeliveryOtpService.sendDeliveryOtp(order, otp);
    }

    OrderNotificationService.notifyOrderUpdate(order._id, 'arrived', {
        excludeRecipientId: req.user.id,
        title: `Rider Arrived`, message: `Rider has arrived at the delivery location.`,
    }).catch(() => { });

    res.status(200).json(new ApiResponse(200, order, 'Rider arrived. OTP sent to customer.'));
});

// PATCH /api/delivery/orders/:id/try-buy
export const handleTryAndBuy = asyncHandler(async (req, res) => {
    const { items } = req.body; // [{ productId, decision: 'accepted'|'rejected' }]
    if (!Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Items with accept/reject decisions are required.');
    }

    const order = await findOrderForRider(req.params.id, req.user.id);
    const isSpecializedOrder = order.orderType === 'try_and_buy' || order.orderType === 'check_and_buy';

    if (!isSpecializedOrder) {
        throw new ApiError(400, 'This order type does not support item selection.');
    }
    const flow = ensureDeliveryFlow(order);
    if (flow.phase !== 'arrived') {
        throw new ApiError(409, `Item selection requires phase "arrived", current: "${flow.phase}".`);
    }

    const tryItems = flow.tryAndBuyItems || [];
    items.forEach(({ productId, decision, index }, idx) => {
        // Use provided index or fallback to array position since arrays are 1:1 mapped
        const itemIndex = index !== undefined ? index : idx;
        const matched = tryItems[itemIndex];
        
        // Double check productId to ensure it's the right item (backward compatibility)
        if (matched && String(matched.productId) === String(productId)) {
            if (['accepted', 'rejected'].includes(decision)) {
                matched.decision = decision;
            }
        } else {
            // Legacy fallback if index somehow gets out of sync
            const matchedLegacy = tryItems.find(i => String(i.productId) === String(productId));
            if (matchedLegacy && ['accepted', 'rejected'].includes(decision)) {
                matchedLegacy.decision = decision;
            }
        }
    });

    flow.tryAndBuyItems = tryItems;
    flow.tryAndBuyCompletedAt = new Date();
    flow.phase = 'try_and_buy';

    const acceptedItems = tryItems.filter(i => i.decision === 'accepted');

    // Recalculate final amount from accepted items plus fixed fees (shipping, platform fee)
    const acceptedSubtotal = acceptedItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
    const originalSubtotal = order.subtotal || acceptedSubtotal;
    const subtotalRatio = originalSubtotal > 0 ? (acceptedSubtotal / originalSubtotal) : 1;

    // Fixed fees are preserved; tax and discount are scaled by the acceptance ratio
    const shipping = order.shipping || 0;
    const platformFee = order.platformFee || 0;
    const adjustedTax = Math.round((order.tax || 0) * subtotalRatio);
    const adjustedDiscount = Math.round((order.discount || 0) * subtotalRatio);

    // Frontend might have added COD fee or other hidden fees into original order.total
    // Expected original total (without hidden fees)
    const expectedOriginalTotal = originalSubtotal + shipping + platformFee - (order.discount || 0);
    const hiddenFees = (order.total || expectedOriginalTotal) - expectedOriginalTotal;

    // finalAmount should NOT add adjustedTax because acceptedSubtotal (i.price) already includes tax!
    flow.finalAmount = acceptedSubtotal + shipping + platformFee - adjustedDiscount + hiddenFees;
    if (flow.finalAmount < 0) flow.finalAmount = 0;

    // Sync to main order document so all other views (Admin, User, Vendor) see the adjusted price
    order.total = flow.finalAmount;
    order.subtotal = acceptedSubtotal;
    order.tax = adjustedTax;
    order.discount = adjustedDiscount;

    // Synchronize vendorItems to reflect item rejections
    if (order.vendorItems) {
        order.vendorItems.forEach(vi => {
            const matchingTryItem = tryItems.find(ti =>
                String(ti.productId) === String(vi.productId) &&
                getVariantSignature(ti.variant || {}) === getVariantSignature(vi.variant || {})
            );
            if (matchingTryItem && matchingTryItem.decision === 'rejected') {
                vi.quantity = 0;
                vi.subtotal = 0;
                // Also adjust earnings/commission to 0 for rejected items
                vi.vendorEarnings = 0;
                vi.commissionAmount = 0;
            }
        });
    }

    // Store rejected items to be returned to vendors
    const rejectedItems = tryItems.filter(i => i.decision === 'rejected');
    flow.rejectedItems = rejectedItems;

    await order.save();

    // Note: Stock is NO LONGER restored here. It will be restored only after
    // the delivery partner successfully returns the items to the respective vendors.

    res.status(200).json(new ApiResponse(200, order, 'Item decisions recorded. Proceed to payment.'));
});

// PATCH /api/delivery/orders/:id/payment
export const handlePayment = asyncHandler(async (req, res) => {
    const { method } = req.body; // 'cash' | 'qr'
    if (!['cash', 'qr'].includes(method)) {
        throw new ApiError(400, 'Payment method must be "cash" or "qr".');
    }

    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    const isTryAndBuyFlow = order.orderType === 'try_and_buy';
    const isCheckAndBuyFlow = order.orderType === 'check_and_buy';

    // Now both types can go through the selection flow which sets the phase to 'try_and_buy'
    const validFrom = (isTryAndBuyFlow || isCheckAndBuyFlow)
        ? ['try_and_buy', 'payment_pending']
        : ['arrived', 'payment_pending'];

    if (!validFrom.includes(flow.phase)) {
        throw new ApiError(409, `Cannot set payment from phase "${flow.phase}". Valid phases: ${validFrom.join(', ')}`);
    }

    flow.paymentMethod = method;
    flow.phase = 'payment_pending';

    // For online-prepaid orders, auto-mark payment collected
    if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'cash') {
        flow.paymentCollected = true;
        flow.paymentCollectedAt = new Date();
    }

    await order.save();

    const responseData = { order };
    if (method === 'qr') {
        const amt = flow.finalAmount || order.total || 0;
        const key_id = process.env.RAZORPAY_KEY_ID;
        const key_secret = process.env.RAZORPAY_KEY_SECRET;

        if (key_id && key_secret) {
            try {
                const razorpay = new Razorpay({ key_id, key_secret });
                const razorpayQr = await razorpay.qrCode.create({
                    type: "upi_qr",
                    name: "CLOSH Delivery",
                    usage: "single_use",
                    fixed_amount: true,
                    payment_amount: Math.round(amt * 100), // paise
                    description: `Order ${order.orderId}`,
                    close_by: Math.floor(Date.now() / 1000) + 7200, // 2 hours expiry
                    notes: {
                        orderId: order._id.toString()
                    }
                });

                order.razorpayQrId = razorpayQr.id;
                await order.save();

                responseData.qrUrl = razorpayQr.image_url;
                responseData.razorpayQrId = razorpayQr.id;
                responseData.razorpayKeyId = key_id;
                responseData.razorpayAmount = Math.round(amt * 100);
            } catch (razorError) {
                console.error("❌ RAZORPAY_DOORSTEP_QR_CREATION_FAILED:", razorError);
                console.warn("⚠️ Falling back to static QR Code as Razorpay QR might not be enabled.");
                responseData.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=company@upi%26pn=CLOSH%20Platform%26am=${amt}%26cu=INR%26tn=Order_${order.orderId}`;
            }
        } else {
            responseData.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=company@upi%26pn=CLOSH%20Platform%26am=${amt}%26cu=INR%26tn=Order_${order.orderId}`;
        }
    }

    return res.status(200).json(new ApiResponse(200, responseData, 'Payment method set.'));
});

// POST /api/delivery/orders/:id/verify-qr-payment
export const verifyQrPayment = asyncHandler(async (req, res) => {
    const order = await findOrderForRider(req.params.id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    if (order.paymentMethod !== 'qr' && flow.paymentMethod !== 'qr') {
        throw new ApiError(400, "Payment method is not QR.");
    }

    if (flow.paymentCollected || order.paymentStatus === 'paid') {
        return res.status(200).json(new ApiResponse(200, { order }, "Payment already verified."));
    }

    if (!order.razorpayQrId) {
        // Fallback: If no Razorpay QR was generated (e.g., feature not enabled),
        // we trust the delivery partner's verification via the app button.
        flow.paymentCollected = true;
        flow.paymentCollectedAt = new Date();
        order.paymentStatus = 'paid';
        await order.save();
        return res.status(200).json(new ApiResponse(200, { order }, "Manual QR Payment verified successfully."));
    }

    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
        throw new ApiError(500, "Razorpay credentials not configured.");
    }

    const razorpay = new Razorpay({ key_id, key_secret });
    
    try {
        const qrCode = await razorpay.qrCode.fetch(order.razorpayQrId);
        
        if (qrCode.payments_amount_received >= qrCode.payment_amount) {
            flow.paymentCollected = true;
            flow.paymentCollectedAt = new Date();
            order.paymentStatus = 'paid';
            await order.save();
            return res.status(200).json(new ApiResponse(200, { order }, "QR Payment verified successfully."));
        } else {
            return res.status(400).json(new ApiResponse(400, { amount_received: qrCode.payments_amount_received }, "Payment not completed yet."));
        }
    } catch (err) {
        console.error("❌ RAZORPAY_QR_VERIFY_ERROR:", err);
        throw new ApiError(500, "Failed to fetch QR code status from Razorpay.");
    }
});

// POST /api/delivery/orders/:id/verify-payment
export const verifyDoorstepPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new ApiError(400, "Missing payment verification details.");
    }

    const order = await findOrderForRider(id, req.user.id);
    const flow = ensureDeliveryFlow(order);

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpayOrderId + "|" + razorpayPaymentId);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpaySignature) {
        order.paymentStatus = 'failed';
        await order.save();
        throw new ApiError(400, "Invalid payment signature. Payment verification failed.");
    }

    // Update order status
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;

    flow.paymentCollected = true;
    flow.paymentCollectedAt = new Date();

    await order.save();

    res.status(200).json(new ApiResponse(200, order, "Payment verified successfully."));
});

const createTryBuyReturn = async (order, rejectedItems, riderId) => {
    // 1. Group rejected items by vendor
    const vendorGroups = {};
    for (const item of rejectedItems) {
        const vid = item.vendorId ? item.vendorId.toString() : (order.vendorItems?.[0]?.vendorId?.toString() || order.userId?.toString());
        if (!vendorGroups[vid]) {
            vendorGroups[vid] = { items: [] };
        }
        vendorGroups[vid].items.push({
            productId: item.productId,
            name: item.name,
            image: item.image || '',
            price: item.price || item.originalPrice || 0,
            quantity: item.quantity || 1,
            reason: 'Try & Buy Rejected'
        });
    }

    const vendorIds = Object.keys(vendorGroups);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } });
    
    // Build vendorDropoffs array
    let vendorDropoffs = [];
    for (const vendor of vendors) {
        const vid = vendor._id.toString();
        const otp = DeliveryOtpService.generateOtp();
        const fullAddress = vendor.shopAddress
            || [vendor.address?.street, vendor.address?.city, vendor.address?.state, vendor.address?.zipCode]
                .filter(Boolean).join(', ')
            || '';
            
        vendorDropoffs.push({
            vendorId: vendor._id,
            vendorName: vendor.storeName || 'Vendor',
            shopLocation: vendor.shopLocation,
            shopAddress: fullAddress,
            vendorPhone: vendor.phone || '',
            items: vendorGroups[vid].items,
            status: 'pending',
            dropoffOtpHash: DeliveryOtpService.hashOtp(otp),
            dropoffOtpDebug: otp
        });
    }

    // Sort by nearest to customer dropoffLocation
    const customerCoords = order.dropoffLocation?.coordinates;
    if (customerCoords && customerCoords.length >= 2) {
        vendorDropoffs.sort((a, b) => {
            const distA = calculateDistance(customerCoords, a.shopLocation?.coordinates || [0, 0]);
            const distB = calculateDistance(customerCoords, b.shopLocation?.coordinates || [0, 0]);
            return distA - distB;
        });
    }

    // Calculate total distance for return trip
    let totalReturnDistance = 0;
    let lastCoords = customerCoords;
    for (const dropoff of vendorDropoffs) {
        if (lastCoords && dropoff.shopLocation?.coordinates) {
            totalReturnDistance += calculateDistance(lastCoords, dropoff.shopLocation.coordinates);
            lastCoords = dropoff.shopLocation.coordinates;
        }
    }
    
    // Calculate earnings using dynamic fee config
    const feeConfig = await getDeliveryFeeConfig();
    const numDropoffStops = vendorDropoffs.length;
    const stopFee = getVendorDropoffFee(numDropoffStops, feeConfig);
    const distanceFee = getDeliveryEarning(totalReturnDistance, feeConfig);
    const deliveryEarnings = stopFee + distanceFee;

    console.log(`[TryBuyReturn] ReturnDist: ${totalReturnDistance}km | Stops: ${numDropoffStops} | StopFee: ₹${stopFee} | DistFee: ₹${distanceFee} | Total: ₹${deliveryEarnings}`);

    // Create the ReturnRequest
    const returnReq = await ReturnRequest.create({
        orderId: order._id,
        returnId: `RET-${Date.now().toString(36).toUpperCase()}`,
        userId: order.userId,
        vendorId: vendorDropoffs.length === 1 ? vendorDropoffs[0].vendorId : undefined,
        isMultiVendor: vendorDropoffs.length > 1,
        vendorDropoffs,
        trySessionActive: true,
        items: rejectedItems.map(i => ({
            productId: i.productId,
            name: i.name,
            image: i.image || '',
            price: i.price || i.originalPrice || 0,
            quantity: i.quantity || 1,
            reason: 'Try & Buy Rejected'
        })),
        reason: 'Try & Buy Auto-Return',
        status: 'processing', // Already approved and assigned
        deliveryBoyId: riderId,
        originalDeliveryBoyId: riderId,
        pickupLocation: order.dropoffLocation,
        dropoffLocation: vendorDropoffs.length === 1 ? vendorDropoffs[0].shopLocation : order.dropoffLocation,
        refundAmount: 0, // Customer didn't pay for these, so no refund
        deliveryDistance: totalReturnDistance,
        deliveryEarnings: deliveryEarnings,
        pickupOtpHash: DeliveryOtpService.hashOtp('123456'), // Auto pickup from customer (already has it)
        pickupOtpDebug: '123456',
        pickupPhoto: order.deliveryPhoto || order.openBoxPhoto || 'default.jpg' // Use delivery photo as initial pickup photo
    });

    // Notify Rider
    emitEvent(`delivery_${riderId}`, 'try_buy_return_created', {
        returnId: returnReq._id,
        message: 'Auto-return task created for rejected items.'
    });

    // Notify Admin
    emitEvent('admin', 'new_return_request', {
        returnId: returnReq._id,
        orderId: order.orderId
    });

    return returnReq;
};

// PATCH /api/delivery/orders/:id/complete
export const handleCompleteDelivery = asyncHandler(async (req, res) => {
    const { otp, openBoxPhoto, deliveryProofPhoto } = req.body;

    if (!/^\d{6}$/.test(String(otp || '').trim())) {
        throw new ApiError(400, 'Valid 6-digit OTP is required.');
    }
    // Pass true for selectOtp to ensure we have hashes/expiry
    const order = await findOrderForRider(req.params.id, req.user.id, true);
    const flow = ensureDeliveryFlow(order);

    const isCodOrder = order.paymentMethod === 'cod' || order.paymentMethod === 'cash';
    const isTryAndBuy = order.orderType === 'try_and_buy' || order.orderType === 'check_and_buy';

    if (!deliveryProofPhoto) throw new ApiError(400, 'Delivery proof photo is required.');
    if (isCodOrder && !openBoxPhoto) throw new ApiError(400, 'Open box photo (item verification) is required for COD orders.');

    const validPhases = ['payment_pending'];
    // For prepaid orders, we don't force a separate payment method selection step
    if (!isCodOrder) {
        validPhases.push('arrived');
        if (isTryAndBuy) validPhases.push('try_and_buy');
    }

    if (!validPhases.includes(flow.phase)) {
        throw new ApiError(409, `Cannot complete from phase "${flow.phase}". Expected: ${validPhases.join(' or ')}.`);
    }

    // Verify OTP (Check both flow and top-level legacy fields as fallback)
    const normalizedOtp = String(otp).trim();
    const otpHash = flow.otpHash || order.deliveryOtpHash;
    const otpExpiry = flow.otpExpiry || order.deliveryOtpExpiry;

    if (!otpHash || !otpExpiry) throw new ApiError(400, 'OTP was not generated.');
    if (new Date(otpExpiry) < new Date()) throw new ApiError(400, 'OTP has expired. Please resend.');

    const isMatch = otpHash === DeliveryOtpService.hashOtp(normalizedOtp);
    const isDebugMatch = !IS_PRODUCTION && (flow.otpDebug === normalizedOtp || order.deliveryOtpDebug === normalizedOtp);

    if (!isMatch && !isDebugMatch) {
        flow.otpAttempts = (flow.otpAttempts || 0) + 1;
        await order.save();
        throw new ApiError(400, 'Invalid OTP.');
    }

    // ── Finalize ──
    const hasRejectedItems = isTryAndBuy && flow.rejectedItems && flow.rejectedItems.length > 0;
    const finalPhase = hasRejectedItems ? 'returning_unselected' : 'delivered';
    const finalStatus = hasRejectedItems ? 'returning_unselected_items' : 'delivered';

    flow.phase = finalPhase;
    flow.openBoxPhoto = openBoxPhoto;
    flow.deliveryProofPhoto = deliveryProofPhoto;
    flow.otpVerified = true;
    flow.otpVerifiedAt = new Date();
    flow.paymentCollected = true;
    flow.paymentCollectedAt = new Date();

    // Calculate delivery earnings using dynamic fee config (applied at completion)
    const { getDistanceMatrix } = await import('../../../services/googleMaps.service.js');
    const { calculateDistance, calculatePathDistance, getVendorPickupFee, getDeliveryEarning } = await import('../../../utils/geo.js');
    const { getDeliveryFeeConfig } = await import('../../../utils/deliveryFeeConfig.js');
    
    const feeConfig = await getDeliveryFeeConfig();
    const pickup = order.pickupLocation?.coordinates || [0, 0];
    const dropoff = order.dropoffLocation?.coordinates || [0, 0];

    let distanceKm = order.deliveryDistance || 0;

    // Re-verify distance for accuracy
    const matrix = await getDistanceMatrix(pickup, dropoff);
    if (matrix) {
        distanceKm = matrix.distance;
    } else if (!distanceKm) {
        distanceKm = calculateDistance(pickup, dropoff);
    }

    // For multi-vendor: calculate path distance between all vendors for the routing fee
    let vendorRoutingDistance = 0;
    if (order.isMultiVendor && order.vendorPickups?.length > 1) {
        const sortedPickups = [...order.vendorPickups].sort((a, b) => a.sequence - b.sequence);
        const vendorCoords = sortedPickups.map(p => p.shopLocation?.coordinates).filter(c => c && c.length === 2);
        vendorRoutingDistance = calculatePathDistance(vendorCoords);
    }

    const stopFee = getVendorPickupFee(vendorRoutingDistance, feeConfig);
    const distanceFee = getDeliveryEarning(distanceKm, feeConfig);
    const riderEarnings = stopFee + distanceFee;

    console.log(`[OrderComplete] Distance: ${distanceKm}km | VendorRoutingDist: ${vendorRoutingDistance}km | StopFee: ₹${stopFee} | DistFee: ₹${distanceFee} | Total: ₹${riderEarnings}`);

    // Persist earnings and distance on the order
    order.deliveryEarnings = riderEarnings;
    order.deliveryDistance = distanceKm;

    // Sync legacy fields
    order.status = finalStatus;
    if (!hasRejectedItems) {
        order.deliveredAt = new Date();
    }
    order.openBoxPhoto = openBoxPhoto;
    order.deliveryPhoto = deliveryProofPhoto;
    order.deliveryOtpVerifiedAt = new Date();
    if (order.paymentMethod === 'cod' || order.paymentMethod === 'cash' || order.paymentMethod === 'prepaid') {
        order.paymentStatus = 'paid';

        // For COD/Cash, we track settlement; for Prepaid, the platform already has the funds.
        if (order.paymentMethod === 'cod' || order.paymentMethod === 'cash') {
            order.isCashSettled = false;
            order.codCollectionMethod = flow.paymentMethod;
            order.codCollectedAt = new Date();
        }
    }

    // Sync vendorItems statuses — per-vendor check for rejected items
    if (order.vendorItems && order.vendorItems.length > 0) {
        const rejectedItemsList = (flow?.rejectedItems || order.deliveryFlow?.rejectedItems || []);
        order.vendorItems.forEach(group => {
            const vendorGroupId = String(group.vendorId._id || group.vendorId);
            // Check if THIS specific vendor has any rejected items
            const thisVendorHasRejectedItems = hasRejectedItems && rejectedItemsList.some(ri => {
                const riVendorId = ri.vendorId ? String(ri.vendorId._id || ri.vendorId) : null;
                if (riVendorId) return riVendorId === vendorGroupId;
                // Fallback: check if the rejected item's product belongs to this vendor group
                return group.items.some(item => String(item.productId) === String(ri.productId));
            });

            if (thisVendorHasRejectedItems) {
                group.status = 'returning_unselected_items';
            } else {
                group.status = 'delivered';
                group.deliveredAt = new Date();
            }
        });
    }

    // Generate return stops for vendors if needed
    if (hasRejectedItems) {
        const returnVendorIds = [...new Set(flow.rejectedItems.map(i => {
            // Find vendorId from order.vendorItems
            const vi = order.vendorItems.find(g => g.items.some(item => String(item.productId) === String(i.productId)));
            return vi ? String(vi.vendorId._id || vi.vendorId) : null;
        }).filter(Boolean))];

        const returnStops = returnVendorIds.map(vid => {
            const vi = order.vendorItems.find(g => String(g.vendorId._id || g.vendorId) === vid);
            
            // vi.vendorId is populated, so it has shopLocation, shopAddress, phone
            const vendorDoc = vi && vi.vendorId && vi.vendorId._id ? vi.vendorId : null;
            const shopAddress = vendorDoc?.shopAddress 
                || (vendorDoc?.address ? `${vendorDoc.address.street || ''}, ${vendorDoc.address.city || ''}, ${vendorDoc.address.state || ''} ${vendorDoc.address.zipCode || ''}`.replace(/, ,|, $|^, /g, '').trim() : undefined)
                || undefined;

            return {
                vendorId: vid,
                vendorName: vendorDoc?.storeName || (vi ? vi.vendorName : 'Vendor'),
                shopLocation: vendorDoc ? vendorDoc.shopLocation : undefined,
                shopAddress: shopAddress,
                vendorPhone: vendorDoc ? vendorDoc.phone : undefined,
                status: 'pending'
            };
        });
        order.vendorReturnStops = returnStops;
    }

    await order.save();
    await cacheInvalidate(`dash:${req.user.id}`, `profile:${req.user.id}`);

    // Process financial earnings (Rider + Vendor) and ledger entries
    // Only process completion if fully delivered. For Try & Buy with rejects, process after return is complete.
    if (!hasRejectedItems) {
        await WalletService.processOrderCompletion(order).catch(err => {
            console.error(`[Wallet] Error processing earnings for order ${order._id}:`, err);
        });
    }

    let returnReq = null;
    const rejectedItems = flow.tryAndBuyItems ? flow.tryAndBuyItems.filter(i => i.decision === 'rejected') : [];
    if (rejectedItems.length > 0) {
        returnReq = await createTryBuyReturn(order, rejectedItems, req.user.id);
    }

    // Re-enable rider availability if no return task is created, else keep them busy
    const nextRiderStatus = returnReq ? 'busy' : 'available';
    let updatedRider = await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { status: nextRiderStatus }, { new: true }).select('availableBalance totalEarnings totalDeliveries');
    
    if (!hasRejectedItems) {
        // If it was a multi-vendor order, also mark the DeliveryBatch as delivered
        if (order.isMultiVendor) {
            const DeliveryBatch = mongoose.model('DeliveryBatch');
            await DeliveryBatch.findOneAndUpdate(
                { deliveryBoyId: req.user.id, isMultiVendor: true, status: { $ne: 'delivered' } },
                { status: 'delivered' }
            );
        }
    }

    // Notify everyone
    await OrderNotificationService.notifyOrderUpdate(order._id, finalStatus, {
        excludeRecipientId: req.user.id,
        title: `Order #${order.orderId} ${hasRejectedItems ? 'Partial Delivery' : 'Delivered'}`,
        message: hasRejectedItems ? `Order ${order.orderId} customer selection completed. Rider will return unselected items.` : `Order ${order.orderId} has been successfully delivered.`,
    });
    if (!hasRejectedItems) {
        emitEvent(`delivery_${req.user.id}`, 'earnings_updated', {
            availableBalance: updatedRider?.availableBalance,
            totalEarnings: updatedRider?.totalEarnings,
            totalDeliveries: updatedRider?.totalDeliveries,
        });
    }

    const responsePayload = {
        order,
        rider: {
            availableBalance: updatedRider?.availableBalance,
            totalEarnings: updatedRider?.totalEarnings,
            totalDeliveries: updatedRider?.totalDeliveries,
        },
    };
    if (returnReq) {
        responsePayload.returnTask = { id: returnReq._id, returnId: returnReq.returnId };
    }

    res.status(200).json(new ApiResponse(200, responsePayload, 'Delivery completed!'));
});

// POST /api/delivery/orders/:id/vendor-returns/:vendorId/arrive
export const arriveAtVendorReturnStop = asyncHandler(async (req, res) => {
    const { id, vendorId } = req.params;
    const order = await findOrderForRider(id, req.user.id, true);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.status !== 'returning_unselected_items') {
        throw new ApiError(400, 'Order is not in a return state.');
    }

    const vendorStop = order.vendorReturnStops.find(s => String(s.vendorId) === String(vendorId));
    if (!vendorStop) {
        throw new ApiError(404, 'Vendor return stop not found for this order.');
    }

    if (vendorStop.status !== 'pending') {
        throw new ApiError(409, `Stop already in status: ${vendorStop.status}`);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    vendorStop.status = 'arrived';
    vendorStop.arrivedAt = new Date();
    vendorStop.handoverOtp = otp;
    vendorStop.handoverOtpDebug = otp; // plain-text for dev
    vendorStop.handoverOtpSentAt = new Date();

    order.markModified('vendorReturnStops');
    await order.save();

    // Notify vendor
    emitEvent(`vendor_${vendorId}`, 'return_rider_arrived', { 
        orderId: order.orderId, 
        otp 
    });

    res.status(200).json(new ApiResponse(200, { verified: false }, 'Arrived at vendor return stop. OTP generated.'));
});
// POST /api/delivery/orders/:id/vendor-returns/:vendorId/resend-otp
export const resendVendorReturnOtp = asyncHandler(async (req, res) => {
    const { id, vendorId } = req.params;
    const order = await findOrderForRider(id, req.user.id, true);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.status !== 'returning_unselected_items') {
        throw new ApiError(400, 'Order is not in a return state.');
    }

    const vendorStop = order.vendorReturnStops.find(s => String(s.vendorId) === String(vendorId));
    if (!vendorStop) {
        throw new ApiError(404, 'Vendor return stop not found for this order.');
    }

    if (vendorStop.status !== 'arrived') {
        throw new ApiError(409, 'Stop must be in arrived status to resend OTP.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    vendorStop.handoverOtp = otp;
    vendorStop.handoverOtpDebug = otp;
    vendorStop.handoverOtpSentAt = new Date();

    order.markModified('vendorReturnStops');
    await order.save();

    // Notify only the specific vendor
    emitEvent(`vendor_${vendorId}`, 'return_rider_arrived', { 
        orderId: order.orderId, 
        otp 
    });

    res.status(200).json(new ApiResponse(200, { verified: false }, 'Vendor Return OTP resent successfully.'));
});

// POST /api/delivery/orders/:id/vendor-returns/:vendorId/verify-otp
export const verifyVendorReturnOtp = asyncHandler(async (req, res) => {
    const { id, vendorId } = req.params;
    const { otp } = req.body;
    
    if (!otp) throw new ApiError(400, 'OTP is required.');

    const order = await findOrderForRider(id, req.user.id, true);
    if (!order) throw new ApiError(404, 'Order not found.');

    const vendorStop = order.vendorReturnStops.find(s => String(s.vendorId) === String(vendorId));
    if (!vendorStop) {
        throw new ApiError(404, 'Vendor return stop not found for this order.');
    }

    if (vendorStop.status !== 'arrived') {
        throw new ApiError(409, 'Mark arrived at this stop first.');
    }

    const isValid = String(vendorStop.handoverOtp || '') === String(otp) ||
                    String(vendorStop.handoverOtpDebug || '') === String(otp);

    if (!isValid) {
        vendorStop.handoverOtpAttempts = (vendorStop.handoverOtpAttempts || 0) + 1;
        order.markModified('vendorReturnStops');
        await order.save();
        throw new ApiError(400, `Incorrect OTP. Attempt ${vendorStop.handoverOtpAttempts}.`);
    }

    vendorStop.status = 'otp_verified';
    vendorStop.handoverOtpVerifiedAt = new Date();
    order.markModified('vendorReturnStops');
    await order.save();

    res.status(200).json(new ApiResponse(200, { verified: true }, 'Vendor Return OTP verified.'));
});

// POST /api/delivery/orders/:id/vendor-returns/:vendorId/complete
export const markTryBuyVendorReturned = asyncHandler(async (req, res) => {
    const { id, vendorId } = req.params;
    
    // Pass true for selectOtp to get all details, though we might not need otp here.
    const order = await findOrderForRider(id, req.user.id, true);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.status !== 'returning_unselected_items') {
        throw new ApiError(400, 'Order is not in a return state.');
    }

    const flow = order.deliveryFlow;
    if (!flow || flow.phase !== 'returning_unselected') {
        throw new ApiError(400, 'Delivery flow phase is invalid for vendor return.');
    }

    const vendorStop = order.vendorReturnStops.find(s => String(s.vendorId) === String(vendorId));
    if (!vendorStop) {
        throw new ApiError(404, 'Vendor return stop not found for this order.');
    }

    if (vendorStop.status !== 'otp_verified') {
        throw new ApiError(400, 'Verify OTP before confirming return.');
    }

    // Process stock restoration for this vendor's items
    const vendorRejectedItems = flow.rejectedItems.filter(i => {
        const vi = order.vendorItems.find(g => String(g.vendorId._id || g.vendorId) === String(vendorId));
        return vi && vi.items.some(item => String(item.productId) === String(i.productId));
    });

    for (const item of vendorRejectedItems) {
        const qty = Number(item.quantity || 1);
        const variantKey = item.variantKey;

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
    }

    vendorStop.status = 'returned';
    vendorStop.returnedAt = new Date();

    // Check if all return stops are completed
    const allReturned = order.vendorReturnStops.every(s => s.status === 'returned');

    if (allReturned) {
        const isFullyRejected = order.deliveryFlow?.rejectedItems?.length === (order.items?.length || 0) && order.items?.length > 0;
        const newStatus = isFullyRejected ? 'returned' : 'try_buy_completed';
        
        order.status = newStatus;
        flow.phase = newStatus;
        
        const { WalletService } = await import('../../../services/wallet.service.js');
        await WalletService.processOrderCompletion(order).catch(err => {
            console.error(`[Wallet] Error processing earnings for order ${order._id}:`, err);
        });

        const updatedRider = await DeliveryBoy.findByIdAndUpdate(order.deliveryBoyId, { status: 'available' }, { new: true }).select('availableBalance totalEarnings totalDeliveries');

        if (order.isMultiVendor) {
            const DeliveryBatch = mongoose.model('DeliveryBatch');
            await DeliveryBatch.findOneAndUpdate(
                { deliveryBoyId: req.user.id, isMultiVendor: true, status: { $ne: 'delivered' } },
                { status: 'delivered' }
            );
        }

        await OrderNotificationService.notifyOrderUpdate(order._id, newStatus, {
            excludeRecipientId: req.user.id,
            title: `Order #${order.orderId} Completed`,
            message: `Order ${order.orderId} return flow is complete.`
        });
        emitEvent(`delivery_${req.user.id}`, 'earnings_updated', {
            availableBalance: updatedRider?.availableBalance,
            totalEarnings: updatedRider?.totalEarnings,
            totalDeliveries: updatedRider?.totalDeliveries,
        });
    }

    await order.save();
    res.status(200).json(new ApiResponse(200, order, `Returned unselected items to vendor ${vendorId}`));
});

// PATCH /api/delivery/batch/select
export const handleBatchSelect = asyncHandler(async (req, res) => {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new ApiError(400, 'orderIds array is required.');
    }

    const riderId = req.user.id;
    const orders = await Order.find({
        deliveryBoyId: riderId,
        isDeleted: { $ne: true },
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
        $or: orderIds.map(oid => mongoose.isValidObjectId(oid) ? { _id: oid } : { orderId: oid }),
    });

    if (orders.length === 0) throw new ApiError(404, 'No matching orders found for batch.');

    // Group by customer
    const customerId = orders[0].userId;
    const batch = await DeliveryBatch.create({
        batchId: `BATCH-${Date.now().toString(36).toUpperCase()}`,
        deliveryBoyId: riderId,
        customerId,
        status: 'assigned',
        customerLocation: orders[0].dropoffLocation,
        customerAddress: orders[0].shippingAddress,
        customerPhone: orders[0].shippingAddress?.phone,
        customerName: orders[0].shippingAddress?.name,
    });

    // Create Delivery records and link to batch
    const deliveryDocs = [];
    for (const order of orders) {
        let delivery = await Delivery.findOne({ orderId: order._id, status: { $ne: 'delivered' } });
        if (!delivery) {
            delivery = await Delivery.create({
                orderId: order._id,
                vendorId: order.vendorItems?.[0]?.vendorId || order.userId,
                deliveryBoyId: riderId,
                batchId: batch._id,
                status: 'assigned',
                payment: { method: order.paymentMethod === 'cod' ? 'cod' : 'online', originalAmount: order.total },
            });
        } else {
            delivery.batchId = batch._id;
            await delivery.save();
        }
        deliveryDocs.push(delivery._id);
    }

    batch.deliveries = deliveryDocs;
    await batch.save();

    res.status(200).json(new ApiResponse(200, batch, 'Batch created.'));
});


// --- RETURN SYSTEM CONTROLLERS ---
// GET /api/delivery/returns/:id
export const getReturnDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const returnReq = await findReturnRequestByIdOrString(id);

    if (!returnReq) {
        throw new ApiError(404, 'Return request not found.');
    }

    await returnReq.populate('userId', 'name email phone');
    await returnReq.populate('orderId', 'orderId total items paymentMethod shippingAddress dropoffLocation');
    await returnReq.populate('vendorId', 'storeName email phone shopAddress shopLocation address');
    await returnReq.populate('vendorDropoffs.vendorId', 'storeName email phone shopAddress shopLocation address');

    return res.status(200).json(new ApiResponse(200, returnReq, 'Return request detail fetched.'));
});

// GET /api/delivery/returns/available
export const getAvailableReturns = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    // Available returns are approved by vendor but not yet assigned
    const filter = {
        status: 'approved',
        deliveryBoyId: { $exists: false }
    };

    const [returns, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('userId', 'name email phone')
            .populate('orderId', 'orderId total shippingAddress')
            .populate('vendorId', 'storeName email phone shopAddress shopLocation address')
            .populate('vendorDropoffs.vendorId', 'storeName email phone shopAddress shopLocation address')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            returns,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Available returns fetched.')
    );
});

// POST /api/delivery/returns/:id/accept
export const acceptReturnAssignment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deliveryBoyId = req.user.id;

    // ── BLOCKER: Ensure rider doesn't already have an active mission (Order or Return) ──
    const [hasActiveOrder, hasActiveReturn] = await Promise.all([
        Order.exists({
            deliveryBoyId: deliveryBoyId,
            isDeleted: { $ne: true },
            status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived'] }
        }),
        ReturnRequest.exists({
            deliveryBoyId: deliveryBoyId,
            status: 'processing'
        })
    ]);

    if (hasActiveOrder || hasActiveReturn) {
        throw new ApiError(400, 'Mission in progress: You must complete your current task before accepting another.');
    }

    const targetReq = await findReturnRequestByIdOrString(id);
    if (!targetReq) {
        throw new ApiError(404, 'Return request not found.');
    }

    const returnReq = await ReturnRequest.findOneAndUpdate(
        {
            _id: targetReq._id,
            status: 'approved',
            deliveryBoyId: { $exists: false }
        },
        {
            $set: {
                status: 'processing',
                deliveryBoyId: deliveryBoyId
            }
        },
        { new: true }
    ).populate('userId').populate('orderId');

    if (!returnReq) {
        throw new ApiError(409, 'Return request is no longer available or already assigned.');
    }

    // Notify user
    if (returnReq.userId?._id) {
        emitEvent(`user_${returnReq.userId._id}`, 'return_delivery_assigned', {
            returnId: returnReq._id,
            deliveryBoyId
        });
    }

    // Notify vendor
    if (returnReq.vendorId) {
        emitEvent(`vendor_${returnReq.vendorId}`, 'return_delivery_assigned', {
            returnId: returnReq._id,
            deliveryBoyId
        });
    }

    await cacheInvalidate(`dash:${deliveryBoyId}`, `profile:${deliveryBoyId}`);

    res.status(200).json(new ApiResponse(200, returnReq, 'Return assignment accepted.'));
});

// PATCH /api/delivery/returns/:id/status
export const updateReturnStatus = asyncHandler(async (req, res) => {
    const { status, pickupPhoto, deliveryPhoto, otp } = req.body;
    const { id } = req.params;
    const deliveryBoyId = req.user.id;

    const returnReq = await findReturnRequestByIdOrString(id, deliveryBoyId, false);
    if (!returnReq) throw new ApiError(404, 'Return request not found.');
    await returnReq.populate('userId');
    await returnReq.populate('orderId');

    if (status === 'picked_up') {
        const normalizedOtp = String(otp || '').trim();
        const otpHash = DeliveryOtpService.hashOtp(normalizedOtp);

        const isValidOtp = otpHash === returnReq.pickupOtpHash || (!IS_PRODUCTION && normalizedOtp === returnReq.pickupOtpDebug);

        if (!isValidOtp) {
            throw new ApiError(400, 'Invalid OTP for pickup.');
        }

        if (pickupPhoto) {
            returnReq.pickupPhoto = pickupPhoto;
        }
        returnReq.status = 'processing';
        returnReq.pickupPhoto = pickupPhoto;

        const dOtp = DeliveryOtpService.generateOtp();
        returnReq.deliveryOtpHash = DeliveryOtpService.hashOtp(dOtp);
        returnReq.deliveryOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        returnReq.deliveryOtpDebug = dOtp;

        await createNotification({
            recipientId: returnReq.vendorId,
            recipientType: 'vendor',
            title: 'Return Drop-off OTP 🔐',
            message: `The rider is bringing a return. Your drop-off verification OTP is ${dOtp}.`,
            type: 'order',
            data: { returnId: String(returnReq._id), otp: dOtp }
        });

        emitEvent(`user_${returnReq.userId?._id}`, 'return_picked_up', { returnId: returnReq._id });
        emitEvent(`vendor_${returnReq.vendorId}`, 'return_picked_up', { returnId: returnReq._id });
    } else if (status === 'completed') {
        const normalizedOtp = String(otp || '').trim();
        const otpHash = DeliveryOtpService.hashOtp(normalizedOtp);

        const isValidOtp = otpHash === returnReq.deliveryOtpHash || (!IS_PRODUCTION && normalizedOtp === returnReq.deliveryOtpDebug);

        if (!isValidOtp) {
            throw new ApiError(400, 'Invalid OTP for vendor handover.');
        }

        if (deliveryPhoto) {
            returnReq.deliveryPhoto = deliveryPhoto;
        }
        returnReq.status = 'completed';
        returnReq.isUpiRequested = true;

        try {
            const rider = await DeliveryBoy.findById(deliveryBoyId);
            const riderCoords = rider?.currentLocation?.coordinates;

            const order = await Order.findById(returnReq.orderId);
            const customerCoords = order?.dropoffLocation?.coordinates;

            const vendor = await Vendor.findById(returnReq.vendorId);
            const vendorCoords = vendor?.shopLocation?.coordinates;

            if (riderCoords && customerCoords && vendorCoords) {
                const dist1 = calculateDistance(riderCoords, customerCoords);
                const dist2 = calculateDistance(customerCoords, vendorCoords);
                const totalDistance = parseFloat((dist1 + dist2).toFixed(2));

                // Use dynamic fee config for return earnings
                const retFeeConfig = await getDeliveryFeeConfig();
                const numDropoffs = returnReq.vendorDropoffs?.length || 1;
                const stopFee = getVendorDropoffFee(numDropoffs, retFeeConfig);
                const earnings = getDeliveryEarning(totalDistance, retFeeConfig) + stopFee;

                console.log(`[ReturnComplete] Dist: ${totalDistance}km | Dropoffs: ${numDropoffs} | StopFee: ₹${stopFee} | Total: ₹${earnings}`);

                returnReq.deliveryDistance = totalDistance;
                returnReq.deliveryEarnings = earnings;

                if (earnings > 0) {
                    await DeliveryBoy.findByIdAndUpdate(
                        deliveryBoyId,
                        {
                            $inc: {
                                totalEarnings: earnings,
                                availableBalance: earnings
                            }
                        }
                    );
                }
            }
        } catch (calcError) {
            console.error('[Return Earnings Calc Error]', calcError.message);
        }

        await WalletService.processOrderReturn(returnReq);

        const order = await Order.findById(returnReq.orderId);
        if (order) {
            order.status = 'returned';
            await order.save();
        }

        // Restore stock for returned items
        const stockRestores = (returnReq.items || []).map(async (item) => {
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

        // Notify user to submit UPI ID
        await createNotification({
            recipientId: returnReq.userId?._id,
            recipientType: 'user',
            title: 'Submit UPI ID for Refund',
            message: `Your return for order #${order?.orderId || returnReq.returnId} has reached the vendor. Please submit your UPI ID for the refund.`,
            type: 'return',
            data: { returnId: String(returnReq._id) }
        });

        // Notify user and vendor
        emitEvent(`user_${returnReq.userId?._id}`, 'return_completed', { returnId: returnReq._id });
        emitEvent(`vendor_${returnReq.vendorId}`, 'return_completed', { returnId: returnReq._id });
    } else {
        throw new ApiError(400, 'Invalid return status.');
    }

    await returnReq.save();

    emitEvent(`return_${returnReq._id}`, 'return_status_updated', returnReq);

    res.status(200).json(new ApiResponse(200, returnReq, 'Return status updated.'));
});

// POST /api/delivery/returns/:id/pickup-from-customer
export const pickupReturnFromCustomer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { otp, pickupPhoto } = req.body;
    const deliveryBoyId = req.user.id;

    if (!pickupPhoto) throw new ApiError(400, 'Pickup photo is required.');

    const returnReq = await findReturnRequestByIdOrString(id, deliveryBoyId, false);
    if (!returnReq) throw new ApiError(404, 'Return request not found or not assigned to you.');

    if (returnReq.status !== 'processing' && returnReq.status !== 'pending') {
        throw new ApiError(400, `Cannot pick up return in status: ${returnReq.status}`);
    }

    // Verify OTP
    const normalizedOtp = String(otp || '').trim();
    const otpHash = DeliveryOtpService.hashOtp(normalizedOtp);
    const isValidOtp = otpHash === returnReq.pickupOtpHash || (!IS_PRODUCTION && normalizedOtp === returnReq.pickupOtpDebug);

    if (!isValidOtp) throw new ApiError(400, 'Invalid Customer OTP for pickup.');

    returnReq.status = 'processing';
    returnReq.pickupPhoto = pickupPhoto;

    // Generate drop-off OTPs for each vendor
    if (returnReq.isMultiVendor) {
        for (const dropoff of returnReq.vendorDropoffs) {
            const vOtp = DeliveryOtpService.generateOtp();
            dropoff.dropoffOtpHash = DeliveryOtpService.hashOtp(vOtp);
            dropoff.dropoffOtpDebug = vOtp;

            await createNotification({
                recipientId: dropoff.vendorId,
                recipientType: 'vendor',
                title: 'Return Drop-off OTP 🔐',
                message: `The rider is bringing returned items. Your verification OTP is ${vOtp}.`,
                type: 'order',
                data: { returnId: String(returnReq._id), otp: vOtp }
            });
        }
    } else {
        const dOtp = DeliveryOtpService.generateOtp();
        returnReq.deliveryOtpHash = DeliveryOtpService.hashOtp(dOtp);
        returnReq.deliveryOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        returnReq.deliveryOtpDebug = dOtp;

        await createNotification({
            recipientId: returnReq.vendorId,
            recipientType: 'vendor',
            title: 'Return Drop-off OTP 🔐',
            message: `The rider is bringing returned items. Your verification OTP is ${dOtp}.`,
            type: 'order',
            data: { returnId: String(returnReq._id), otp: dOtp }
        });
    }

    await returnReq.save();

    emitEvent(`user_${returnReq.userId}`, 'return_picked_up', { returnId: returnReq._id });
    if (returnReq.isMultiVendor) {
        returnReq.vendorDropoffs.forEach(v => {
            emitEvent(`vendor_${v.vendorId}`, 'return_picked_up', { returnId: returnReq._id });
        });
    } else {
        emitEvent(`vendor_${returnReq.vendorId}`, 'return_picked_up', { returnId: returnReq._id });
    }

    res.status(200).json(new ApiResponse(200, returnReq, 'Return items picked up from customer successfully.'));
});

// POST /api/delivery/returns/:id/dropoff-at-vendor
export const dropoffReturnAtVendor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { vendorId, otp, deliveryPhoto } = req.body;
    const deliveryBoyId = req.user.id;

    if (!deliveryPhoto) throw new ApiError(400, 'Dropoff photo is required.');

    const returnReq = await findReturnRequestByIdOrString(id, deliveryBoyId, false);
    if (!returnReq) throw new ApiError(404, 'Return request not found or not assigned to you.');

    if (returnReq.status !== 'processing') {
        throw new ApiError(400, `Cannot drop off in status: ${returnReq.status}`);
    }

    const normalizedOtp = String(otp || '').trim();
    const otpHash = DeliveryOtpService.hashOtp(normalizedOtp);

    if (returnReq.isMultiVendor) {
        if (!vendorId) throw new ApiError(400, 'vendorId is required for multi-vendor return dropoffs.');

        const dropoff = returnReq.vendorDropoffs.find(d => String(d.vendorId) === vendorId);
        if (!dropoff) throw new ApiError(404, 'Vendor not found in this return request.');
        if (dropoff.status === 'dropped_off') throw new ApiError(400, 'Already dropped off at this vendor.');

        const isValidOtp = otpHash === dropoff.dropoffOtpHash || (!IS_PRODUCTION && normalizedOtp === dropoff.dropoffOtpDebug);
        if (!isValidOtp) throw new ApiError(400, 'Invalid Vendor OTP.');

        dropoff.status = 'dropped_off';
        dropoff.proofPhoto = deliveryPhoto;
        dropoff.droppedOffAt = new Date();

        // Check if all vendors are dropped off
        const allDropped = returnReq.vendorDropoffs.every(d => d.status === 'dropped_off');
        if (allDropped) {
            returnReq.status = 'completed';
            returnReq.isUpiRequested = true;
        }
    } else {
        const isValidOtp = otpHash === returnReq.deliveryOtpHash || (!IS_PRODUCTION && normalizedOtp === returnReq.deliveryOtpDebug);
        if (!isValidOtp) throw new ApiError(400, 'Invalid Vendor OTP.');

        returnReq.deliveryPhoto = deliveryPhoto;
        returnReq.status = 'completed';
        returnReq.isUpiRequested = true;
    }

    await returnReq.save();

    emitEvent(`vendor_${vendorId || returnReq.vendorId}`, 'return_dropped_off', { returnId: returnReq._id });

    if (returnReq.status === 'completed') {
        await WalletService.processOrderReturn(returnReq).catch(e => console.error(e));
    }

    const order = await Order.findById(returnReq.orderId);
    if (order) {
        // Update the specific vendor's status to 'returned'
        if (order.vendorItems && order.vendorItems.length > 0) {
            const currentVendorId = String(vendorId || returnReq.vendorId);
            order.vendorItems.forEach(group => {
                if (String(group.vendorId._id || group.vendorId) === currentVendorId) {
                    group.status = 'returned';
                    group.returnedAt = new Date();
                }
            });
        }

        // Update overall order status ONLY if the entire return request is completed
        if (returnReq.status === 'completed') {
            if (order.subtotal > 0) {
                order.status = 'delivered'; // They kept some items
            } else {
                order.status = 'returned'; // They rejected everything
            }
        }
        await order.save();
    }

    if (returnReq.status === 'completed') {
        await createNotification({
            recipientId: returnReq.userId,
            recipientType: 'user',
            title: 'Submit UPI ID for Refund',
            message: `Your return for order #${order?.orderId || returnReq.returnId} has reached the vendor(s). Please submit your UPI ID for refund.`,
            type: 'return',
            data: { returnId: String(returnReq._id) }
        });
        emitEvent(`user_${returnReq.userId}`, 'return_completed', { returnId: returnReq._id });
    }

    res.status(200).json(new ApiResponse(200, returnReq, 'Return dropped off successfully.'));
});

// POST /api/delivery/returns/:id/resend-vendor-otp
export const resendReturnVendorOtp = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { vendorId } = req.body;
    const deliveryBoyId = req.user.id;

    const returnReq = await findReturnRequestByIdOrString(id, deliveryBoyId, false);
    if (!returnReq) throw new ApiError(404, 'Return request not found or not assigned to you.');

    if (returnReq.status !== 'processing') {
        throw new ApiError(400, `Cannot resend drop-off OTP in status: ${returnReq.status}`);
    }

    let dOtp = '';

    if (returnReq.isMultiVendor) {
        if (!vendorId) throw new ApiError(400, 'vendorId is required for multi-vendor returns.');
        const dropoff = returnReq.vendorDropoffs.find(d => String(d.vendorId) === vendorId);
        if (!dropoff) throw new ApiError(404, 'Vendor not found in this return request.');
        if (dropoff.status === 'dropped_off') throw new ApiError(400, 'Already dropped off at this vendor.');

        dOtp = DeliveryOtpService.generateOtp();
        dropoff.dropoffOtpHash = DeliveryOtpService.hashOtp(dOtp);
        dropoff.dropoffOtpDebug = dOtp;

        await createNotification({
            recipientId: dropoff.vendorId,
            recipientType: 'vendor',
            title: 'Return Drop-off OTP 🔐',
            message: `The rider is bringing returned items. Your verification OTP is ${dOtp}.`,
            type: 'order',
            data: { returnId: String(returnReq._id), otp: dOtp }
        });
    } else {
        dOtp = DeliveryOtpService.generateOtp();
        returnReq.deliveryOtpHash = DeliveryOtpService.hashOtp(dOtp);
        returnReq.deliveryOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        returnReq.deliveryOtpDebug = dOtp;

        await createNotification({
            recipientId: returnReq.vendorId,
            recipientType: 'vendor',
            title: 'Return Drop-off OTP 🔐',
            message: `The rider is bringing returned items. Your verification OTP is ${dOtp}.`,
            type: 'order',
            data: { returnId: String(returnReq._id), otp: dOtp }
        });
    }

    await returnReq.save();

    res.status(200).json(new ApiResponse(200, { ...(IS_PRODUCTION ? {} : { otpDebug: dOtp }) }, 'Vendor OTP resent successfully.'));
});

