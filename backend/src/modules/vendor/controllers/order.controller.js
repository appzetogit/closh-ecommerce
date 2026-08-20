import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { notifyNearbyDeliveryBoys } from '../../delivery/controllers/assignment.controller.js';
import { emitEvent } from '../../../services/socket.service.js';
import { OrderNotificationService } from '../../../services/orderNotification.service.js';
import { WalletService } from '../../../services/wallet.service.js';
import { calculateDistance } from '../../../utils/geo.js';

const deriveTopLevelOrderStatus = (vendorItems = [], fallback = 'pending') => {
    const statuses = (vendorItems || [])
        .map((item) => String(item?.status || '').toLowerCase())
        .filter(Boolean);

    if (!statuses.length) return String(fallback || 'pending').toLowerCase();

    // Preserve delivery-phase statuses — once a rider is assigned/in-transit, 
    // vendor readiness updates must NOT regress the order status
    const deliveryPhaseStatuses = ['assigned', 'picked_up', 'out_for_delivery', 'delivered'];
    const currentFallback = String(fallback || 'pending').toLowerCase();

    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';
    
    const terminalStatuses = ['delivered', 'returned_to_vendor', 'returned', 'cancelled'];
    if (statuses.every(s => terminalStatuses.includes(s))) {
        if (statuses.includes('delivered')) return 'delivered';
        return 'returned';
    }

    if (statuses.includes('out_for_delivery')) return 'out_for_delivery';
    if (statuses.includes('picked_up')) return 'picked_up';
    // Multi-vendor: ALL vendors ready → special combined status
    if (statuses.length > 1) {
        if (statuses.every((s) => s === 'ready_for_pickup')) {
            // If delivery boy already assigned (status is assigned or later), keep it
            if (deliveryPhaseStatuses.includes(currentFallback)) {
                return currentFallback;
            }
            return 'all_vendors_ready';
        }
        if (statuses.includes('pending')) return deliveryPhaseStatuses.includes(currentFallback) ? currentFallback : 'pending';
        return deliveryPhaseStatuses.includes(currentFallback) ? currentFallback : 'processing';
    }

    if (statuses.includes('ready_for_pickup')) {
        if (deliveryPhaseStatuses.includes(currentFallback)) return currentFallback;
        return 'ready_for_pickup';
    }
    if (statuses.includes('accepted')) return deliveryPhaseStatuses.includes(currentFallback) ? currentFallback : 'accepted';
    if (statuses.includes('pending')) return deliveryPhaseStatuses.includes(currentFallback) ? currentFallback : 'pending';

    return currentFallback;
};

// GET /api/vendor/orders
/**
 * In a Try & Buy order the customer can keep some items and send others back, so a
 * single order-level status ("returning_unselected_items") is wrong for every line.
 * The per-item outcome only lives in deliveryFlow, so resolve it here once and hand
 * the frontend a plain `itemStatus` per line instead of duplicating this logic there.
 */
const buildItemStatusResolver = (order) => {
    const flow = order.deliveryFlow || {};
    const keyOf = (i) => `${String(i.productId || '')}|${i.variantKey || ''}`;

    const decisions = new Map();
    (flow.tryAndBuyItems || []).forEach((i) => {
        if (i.decision) decisions.set(keyOf(i), i.decision);
    });
    // rejectedItems is authoritative — it survives even when tryAndBuyItems is absent.
    (flow.rejectedItems || []).forEach((i) => decisions.set(keyOf(i), 'rejected'));

    return (item, groupStatus) => {
        const fallback = groupStatus || order.status;
        // A cancelled order overrides any earlier per-item decision.
        if (String(fallback) === 'cancelled') return 'cancelled';
        if (decisions.size === 0) return fallback;

        const decision = decisions.get(keyOf(item));
        if (decision === 'rejected') return 'returned';
        if (decision === 'accepted') return 'delivered';
        return fallback;
    };
};

export const getVendorOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const vendorObjectId = new mongoose.Types.ObjectId(req.user.id);
    const filter = status
        ? { vendorItems: { $elemMatch: { vendorId: vendorObjectId, status } } }
        : { 'vendorItems.vendorId': vendorObjectId };

    console.log(`[getVendorOrders] Vendor: ${req.user.id}, Filter:`, JSON.stringify(filter));

    const orders = await Order.find(filter)
        .select('orderId status total orderType paymentMethod paymentStatus items.name items.image items.quantity items.variant items.productId items.variantKey shippingAddress.name guestInfo.name vendorItems.vendorId vendorItems.status vendorItems.items.name vendorItems.items.image vendorItems.items.quantity vendorItems.items.variant vendorItems.items.vendorPrice vendorItems.items.productId vendorItems.items.variantKey vendorItems.subtotal vendorItems.basePrice deliveryFlow.tryAndBuyItems deliveryFlow.rejectedItems createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit)
        .lean();

    // Resolve the real per-line outcome, then drop deliveryFlow — it was only needed
    // to derive itemStatus and would otherwise bloat the list payload.
    orders.forEach((order) => {
        const resolve = buildItemStatusResolver(order);
        const vendorGroup = (order.vendorItems || []).find(
            (g) => String(g.vendorId) === String(req.user.id)
        );
        const groupStatus = vendorGroup?.status || order.status;

        (order.items || []).forEach((item) => { item.itemStatus = resolve(item, groupStatus); });
        (order.vendorItems || []).forEach((group) => {
            (group.items || []).forEach((item) => { item.itemStatus = resolve(item, group.status); });
        });

        delete order.deliveryFlow;
    });

    const total = await Order.countDocuments(filter);
    res.status(200).json(new ApiResponse(200, { orders, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Orders fetched.'));
});

// GET /api/vendor/orders/:id
export const getVendorOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    let order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    })
      .select('+vendorPickups.handoverOtp +vendorPickups.handoverOtpHash +vendorPickups.handoverOtpDebug +vendorReturnStops.handoverOtp +vendorReturnStops.handoverOtpHash +vendorReturnStops.handoverOtpDebug')
      .populate('deliveryBoyId', 'name phone profileImage vehicleNumber status')
      .populate('userId', 'name email phone')
      .populate('items.productId')
      .populate('vendorItems.items.productId', 'hsnCode')
      .lean();
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.isMultiVendor && (!order.vendorPickups || order.vendorPickups.length === 0)) {
        console.log(`[VendorOrderFetch] Generating vendorPickups on fetch for order ${order.orderId}...`);
        const populatedOrder = await Order.findById(order._id).populate('vendorItems.vendorId', 'storeName shopAddress shopLocation');
        const rawStops = (populatedOrder?.vendorItems || []).map((vi, idx) => {
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
        // Fetch again with selections
        order = await Order.findOne({ _id: order._id })
          .select('+vendorPickups.handoverOtp +vendorPickups.handoverOtpHash +vendorPickups.handoverOtpDebug +vendorReturnStops.handoverOtp +vendorReturnStops.handoverOtpHash +vendorReturnStops.handoverOtpDebug')
          .populate('deliveryBoyId', 'name phone profileImage vehicleNumber status')
          .populate('userId', 'name email phone')
          .populate('items.productId')
          .populate('vendorItems.items.productId', 'hsnCode')
          .lean();
    }

    res.status(200).json(new ApiResponse(200, order, 'Order fetched.'));
});

// PATCH /api/vendor/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    // Status is already validated and normalized by the middleware
    const status = req.body.status;
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, 'Order ID is required in URL params.');
    }

    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    });
    if (!order) throw new ApiError(404, 'Order not found.');

    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    
    console.log('\n=======================================');
    console.log('[DEBUG] updateOrderStatus API called:');
    console.log('Order ID:', id);
    console.log('Logged-in req.user.id:', req.user?.id);
    console.log('Found order.vendorItems:');
    order.vendorItems.forEach((vi, idx) => {
        console.log(`  Item ${idx}: vendorId=${vi.vendorId} (String=${String(vi.vendorId)}), status=${vi.status}`);
    });
    console.log('Matched vendorItem:', vendorItem ? { vendorId: vendorItem.vendorId, status: vendorItem.status } : 'NONE');
    console.log('=======================================\n');

    if (!vendorItem) throw new ApiError(404, 'Vendor order item not found.');

    const currentStatus = String(vendorItem.status || 'pending').trim().toLowerCase();

    const transitionMap = {
        pending: ['accepted', 'processing', 'ready_for_pickup', 'cancelled'],
        accepted: ['accepted', 'ready_for_pickup', 'cancelled', 'processing'],
        processing: ['processing', 'ready_for_pickup', 'cancelled', 'accepted'],
        ready_for_pickup: ['ready_for_pickup', 'accepted', 'processing', 'picked_up', 'cancelled'], // picked_up by delivery partner
        picked_up: ['picked_up', 'out_for_delivery'],
        out_for_delivery: ['out_for_delivery', 'delivered'],
        delivered: ['delivered'],
        cancelled: ['cancelled'],
    };

    const allowedNextStatuses = transitionMap[currentStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
        throw new ApiError(409, `Cannot move order from "${currentStatus}" to "${status}". Allowed: ${allowedNextStatuses.join(', ')}`);
    }

    const vendor = await mongoose.model('Vendor').findById(req.user.id);
    const storeName = vendor?.storeName || req.user.email || 'Store';

    console.log(`\n--- 🏪 [VENDOR ORDER UPDATE] ---`);
    console.log(`Order: ${id}, Vendor: ${req.user.id}, Next Status: ${status}`);

    // Update only this vendor's items status
    let statusChangedToCancelled = false;
    (order.vendorItems || []).forEach((vi) => {
        if (vi.vendorId.toString() === req.user.id) {
            if (status === 'cancelled' && vi.status !== 'cancelled') {
                statusChangedToCancelled = true;
            }
            vi.status = status;
        }
    });

    const oldStatus = order.status;
    order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
    console.log(`[VendorUpdate] New Group Status: ${status}, Overall Order Status: ${oldStatus} -> ${order.status}`);
    await order.save();

    // ── Sync Vendor Status to active DeliveryBatch ──
    try {
        const DeliveryBatch = mongoose.model('DeliveryBatch');
        const activeBatch = await DeliveryBatch.findOne({
            customerId: order.userId || order.guestInfo?.phone, // Match user or guest
            status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] }
        });
        
        if (activeBatch) {
            const stop = activeBatch.pickupStops.find(s => s.vendorId.toString() === req.user.id);
            if (stop) {
                stop.vendorReadinessStatus = status;
                
                // If vendor cancelled, mark or remove and recalculate sequence for remaining stops
                if (status === 'cancelled') {
                    stop.status = 'cancelled';
                    
                    // Recalculate sequences for non-cancelled stops
                    const activeStops = activeBatch.pickupStops.filter(s => s.status !== 'cancelled');
                    const DeliveryBoy = mongoose.model('DeliveryBoy');
                    const rider = await DeliveryBoy.findById(activeBatch.deliveryBoyId);
                    const riderCoords = rider?.currentLocation?.coordinates || [0, 0];
                    
                    // Sort remaining stops by distance
                    const sorted = [...activeStops].sort((a, b) => {
                        const distA = calculateDistance(riderCoords, a.location?.coordinates || [0, 0]);
                        const distB = calculateDistance(riderCoords, b.location?.coordinates || [0, 0]);
                        return distA - distB;
                    });
                    
                    // Apply new sequences
                    activeBatch.pickupStops.forEach(s => {
                        if (s.status !== 'cancelled') {
                            const newIdx = sorted.findIndex(sortedStop => sortedStop.vendorId.toString() === s.vendorId.toString());
                            if (newIdx !== -1) s.sequence = newIdx;
                        }
                    });
                }
                
                await activeBatch.save();
                
                // Notify the delivery boy
                console.log(`📡 [Socket Emit] batch_vendor_status_update for rider: ${activeBatch.deliveryBoyId}`);
                emitEvent(`delivery_${activeBatch.deliveryBoyId.toString()}`, 'batch_vendor_status_update', {
                    batchId: activeBatch.batchId,
                    vendorId: req.user.id,
                    vendorReadinessStatus: status,
                    pickupStops: activeBatch.pickupStops
                });
            }
        }
    } catch (batchSyncErr) {
        console.error(`[DeliveryBatch Sync Error]`, batchSyncErr);
    }

    // Restore stock if cancelled by vendor
    if (statusChangedToCancelled) {
        console.log(`[StockRestore] Vendor ${req.user.id} cancelled order ${order.orderId}. Restoring stock...`);
        const vendorGroup = order.vendorItems.find((vi) => vi.vendorId.toString() === req.user.id);
        if (vendorGroup && Array.isArray(vendorGroup.items)) {
            const Product = mongoose.model('Product');
            for (const item of vendorGroup.items) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0 || !item.productId) continue;

                const product = await Product.findById(item.productId);
                if (!product) continue;

                const variantKey = item.variantKey;

                // Increment total stock
                product.stockQuantity = (Number(product.stockQuantity) || 0) + quantity;

                if (variantKey && product.variants) {
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
    }




    // Unified Notification to all parties
    await OrderNotificationService.notifyOrderUpdate(order._id, status, {
        excludeRecipientId: req.user.id, // Vendor already knows it changed
        title: `Order #${order.orderId} ${status.replace(/_/g, ' ')}`,
        message: `Your order from ${storeName} is now ${status.replace(/_/g, ' ')}.`
    });

    // If marked delivered by vendor, process financial earnings
    if (status === 'delivered') {
        await WalletService.processOrderCompletion(order).catch(err => {
            console.error(`[Wallet] Error processing earnings for order ${order._id}:`, err);
        });
    }

    // Multi-vendor: when all vendors are ready, populate vendorPickups and notify riders
    if (order.status === 'all_vendors_ready' && (!order.vendorPickups || order.vendorPickups.length === 0)) {
        try {
            // Mark as multi-vendor and build vendorPickups stops
            const populatedOrder = await Order.findById(order._id).populate('vendorItems.vendorId', 'storeName shopAddress shopLocation phone address');
            const vendorPickups = (populatedOrder?.vendorItems || []).map((vi, idx) => {
                const vendorDoc = vi.vendorId;
                // Generate handover OTP for each vendor
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

            const updatedData = {
                isMultiVendor: true,
                vendorPickups,
            };

            // Set pickupLocation from first vendor so delivery partner search works
            const firstVendorCoords = vendorPickups[0]?.shopLocation?.coordinates;
            if (firstVendorCoords && (firstVendorCoords[0] !== 0 || firstVendorCoords[1] !== 0)) {
                updatedData.pickupLocation = { type: 'Point', coordinates: firstVendorCoords };
            }

            if (order.deliveryBoyId) {
                updatedData.status = 'assigned';

                // Create the DeliveryBatch for the pre-assigned delivery boy
                try {
                    const deliveryBoy = await mongoose.model('DeliveryBoy').findById(order.deliveryBoyId);
                    if (deliveryBoy) {
                        const riderCoords = deliveryBoy.currentLocation?.coordinates;
                        
                        const sortStopsNearestFirst = (stops, coords) => {
                            if (!coords || coords.length < 2) return stops;
                            return [...stops].sort((a, b) => {
                                const distA = calculateDistance(coords, a.shopLocation?.coordinates || [0, 0]);
                                const distB = calculateDistance(coords, b.shopLocation?.coordinates || [0, 0]);
                                return distA - distB;
                            });
                        };

                        const sortedStops = sortStopsNearestFirst(vendorPickups, riderCoords);
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

                        // Resequence stops in updatedData
                        updatedData.vendorPickups = sortedStops.map((stop, idx) => ({ ...stop, sequence: idx }));

                        await mongoose.model('DeliveryBatch').deleteMany({
                            customerId: order.userId,
                            status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] }
                        });

                        const batchId = `MVBATCH-${Date.now()}`;
                        await mongoose.model('DeliveryBatch').create({
                            batchId,
                            deliveryBoyId: order.deliveryBoyId,
                            customerId: order.userId,
                            isMultiVendor: true,
                            currentStopIndex: 0,
                            pickupStops,
                            customerLocation: order.dropoffLocation,
                            customerAddress: order.shippingAddress,
                            customerName: order.shippingAddress?.name,
                            status: 'assigned',
                        });
                        console.log(`[MultiVendor Vendor Ready] Successfully created DeliveryBatch for pre-assigned rider on order ${order.orderId}`);
                    }
                } catch (batchErr) {
                    console.error(`[MultiVendor Vendor Ready] Error creating batch:`, batchErr);
                }
            }

            await Order.findByIdAndUpdate(order._id, updatedData);

            // Notify nearby delivery boys with multi-vendor payload
            const updatedOrder = await Order.findById(order._id);
            await notifyNearbyDeliveryBoys(updatedOrder).catch(err =>
                console.error(`[MultiVendor] Failed to notify delivery boys:`, err)
            );
            console.log(`[MultiVendor] All vendors ready for order ${order.orderId}. Notified nearby riders.`);
        } catch (mvErr) {
            console.error(`[MultiVendor] Setup error for ${order._id}:`, mvErr.message);
        }
    }

    // Single vendor: notify when ready
    if (order.status === 'ready_for_pickup' && !order.isMultiVendor) {
        const updateData = {};
        if (vendor && vendor.shopLocation) {
            updateData.pickupLocation = vendor.shopLocation;
        }
        if (order.deliveryBoyId) {
            updateData.status = 'assigned';
        }
        if (Object.keys(updateData).length > 0) {
            await Order.findByIdAndUpdate(order._id, updateData);
        }
        if (!order.deliveryBoyId) {
            await notifyNearbyDeliveryBoys(order).catch(err =>
                console.error(`[Assignment] Failed to notify delivery boys for order ${order.orderId}:`, err)
            );
        }
    }

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

import Vendor from '../../../models/Vendor.model.js';

// GET /api/vendor/earnings
export const getEarnings = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        settlementsPage = 1,
        settlementsLimit = 50,
    } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 50);
    const commissionSkip = (numericPage - 1) * numericLimit;
    const numericSettlementsPage = Math.max(1, Number(settlementsPage) || 1);
    const numericSettlementsLimit = Math.max(1, Number(settlementsLimit) || 50);
    const settlementSkip = (numericSettlementsPage - 1) * numericSettlementsLimit;

    const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [commissionDocs, totalCommissions, settlements, totalSettlements, aggregationResult] = await Promise.all([
        Commission.find({ vendorId: req.user.id })
            .select('orderId subtotal basePrice vendorEarnings commission commissionRate status createdAt')
            .populate('orderId', 'orderId status orderType deliveredAt updatedAt')
            .sort({ createdAt: -1 })
            .skip(commissionSkip)
            .limit(numericLimit)
            .lean(),
        Commission.countDocuments({ vendorId: req.user.id }),
        Settlement.find({ vendorId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(settlementSkip)
            .limit(numericSettlementsLimit)
            .lean(),
        Settlement.countDocuments({ vendorId: req.user.id }),
        Commission.aggregate([
            { $match: { vendorId: new mongoose.Types.ObjectId(req.user.id) } },
            {
                $lookup: {
                    from: 'orders',
                    localField: 'orderId',
                    foreignField: '_id',
                    as: 'order'
                }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    totalEarnings: { 
                        $sum: { 
                            $cond: [
                                { $not: [{ $in: ["$order.status", ["return requested", "returned", "cancelled"]] }] }, 
                                "$vendorEarnings", 
                                0
                            ] 
                        } 
                    },
                    totalCommission: { 
                        $sum: { 
                            $cond: [
                                { $not: [{ $in: ["$order.status", ["return requested", "returned", "cancelled"]] }] }, 
                                "$commission", 
                                0
                            ] 
                        } 
                    },
                    pendingStatusEarnings: { 
                        $sum: { 
                            $cond: [
                                { 
                                    $and: [
                                        { $eq: ["$status", "pending"] },
                                        { $not: [{ $in: ["$order.status", ["return requested", "returned", "cancelled"]] }] }
                                    ]
                                }, 
                                "$vendorEarnings", 
                                0
                            ] 
                        } 
                    },
                    requestedEarnings: { $sum: { $cond: [{ $eq: ["$status", "requested"] }, "$vendorEarnings", 0] } },
                    paidEarnings: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$vendorEarnings", 0] } },
                    cancelledEarnings: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, "$vendorEarnings", 0] } },
                    totalOrders: { 
                        $sum: { 
                            $cond: [
                                { $not: [{ $in: ["$order.status", ["return requested", "returned", "cancelled"]] }] }, 
                                1, 
                                0
                            ] 
                        } 
                    }
                }
            }
        ])
    ]);

    // Better summary with 24h breakdown - including order status check
    const summaryBreakdown = await Commission.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(req.user.id), status: 'pending' } },
        {
            $lookup: {
                from: 'orders',
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
            }
        },
        { $unwind: '$order' },
        { $match: { 'order.status': { $nin: ['return requested', 'returned', 'cancelled'] } } },
        {
            $project: {
                vendorEarnings: 1,
                isReady: {
                    $or: [
                        { $and: [
                            { $in: ["$order.status", ["delivered", "try_buy_completed"]] },
                            { $eq: ["$order.orderType", "try_and_buy"] }
                        ]},
                        { $and: [
                            { $in: ["$order.status", ["delivered", "try_buy_completed"]] },
                            { $ne: ["$order.orderType", "try_and_buy"] },
                            { $lt: [ { $ifNull: ["$order.deliveredAt", { $ifNull: ["$order.updatedAt", "$createdAt"] }] }, TWENTY_FOUR_HOURS_AGO ] }
                        ]}
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                readyAmount: { $sum: { $cond: ["$isReady", "$vendorEarnings", 0] } },
                pendingAmount: { $sum: { $cond: ["$isReady", 0, "$vendorEarnings"] } }
            }
        }
    ]);

    const currentVendor = await Vendor.findById(req.user.id).select('availableBalance pendingBalance').lean();
    const stats = aggregationResult[0] || { totalEarnings: 0, pendingStatusEarnings: 0, paidEarnings: 0, cancelledEarnings: 0, totalCommission: 0, totalOrders: 0, requestedEarnings: 0 };
    const breakdown = summaryBreakdown[0] || { pendingAmount: 0, readyAmount: 0 };
    
    const summary = {
        ...stats,
        pendingAmount: breakdown.pendingAmount,
        readyAmount: breakdown.readyAmount,
        availableBalance: currentVendor?.availableBalance || 0,
        pendingBalance: currentVendor?.pendingBalance || 0
    };

    const commissions = commissionDocs.map((doc) => {
        const commission = doc;
        const orderRef = commission.orderId?._id || commission.orderId;
        const orderDisplayId = commission.orderId?.orderId || String(orderRef || '');
        const orderDoc = commission.orderId || {};
        const orderStatus = String(orderDoc.status || '').toLowerCase();
        const orderType = orderDoc.orderType;
        const isReturnRelated = orderStatus === 'return requested' || orderStatus === 'returned';
        
        // A commission is truly ready if the cron job has finalized it (status === 'ready')
        const isFinalized = commission.status === 'ready';
        
        let isTimeReady = false;
        if (commission.status === 'pending' && !isReturnRelated) {
            if (orderStatus === 'delivered' || orderStatus === 'try_buy_completed') {
                if (orderType === 'try_and_buy') {
                    isTimeReady = true;
                } else {
                    const deliveredAt = orderDoc.deliveredAt || orderDoc.updatedAt || commission.createdAt;
                    if (new Date(deliveredAt) < TWENTY_FOUR_HOURS_AGO) {
                        isTimeReady = true;
                    }
                }
            }
        }
        
        const isReady = isFinalized || isTimeReady;

        let settlementPhase = 'pending';
        if (commission.status === 'paid') {
            settlementPhase = 'settled';
        } else if (commission.status === 'requested') {
            settlementPhase = 'requested';
        } else if (isReturnRelated || orderStatus === 'cancelled' || commission.status === 'cancelled') {
            settlementPhase = 'void'; // Will be filtered out from Pending/Ready
        } else if (isReady) {
            settlementPhase = 'ready';
        }

        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : String(commission.status || 'pending');
        
        return {
            ...commission,
            orderRef,
            orderDisplayId,
            effectiveStatus,
            settlementPhase,
            isReady,
        };
    });

        res.status(200).json(
            new ApiResponse(
                200,
                {
                    summary,
                    commissions,
                    settlements,
                    pagination: {
                        totalCommissions,
                        page: numericPage,
                        limit: numericLimit,
                        pages: Math.max(1, Math.ceil(totalCommissions / numericLimit)),
                    },
                    settlementsPagination: {
                        totalSettlements,
                        page: numericSettlementsPage,
                        limit: numericSettlementsLimit,
                        pages: Math.max(1, Math.ceil(totalSettlements / numericSettlementsLimit)),
                    },
                },
                'Earnings fetched.'
            )
        );
});
