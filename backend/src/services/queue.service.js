import { Queue, Worker } from 'bullmq';
import redisConnection from '../config/redis.js';
import Order from '../models/Order.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { DeliveryNearbyService } from './nearbyDelivery.service.js';
import { createNotification } from './notification.service.js';
import { emitEvent } from './socket.service.js';
import { calculateDistance } from '../utils/geo.js';

/**
 * BullMQ Job Queue Service
 * Handles Timeouts and Radius Expansion
 */

// Dummy queue for when Redis is disabled/unavailable
class DummyQueue {
    constructor(name) { this.name = name; }
    async add() { console.warn(`[Queue: ${this.name}] Redis is unavailable, ignoring job.`); }
}

const isRedisAvailable = process.env.REDIS_HOST || process.env.REDIS_URL || process.env.NODE_ENV === 'production';

const defaultQueueOptions = {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 }
    }
};

// 1. Order Wait Queue (Vendor Acceptance)
const orderWaitQueue = isRedisAvailable ? new Queue('order-wait-queue', defaultQueueOptions) : new DummyQueue('order-wait-queue');

// 2. Rider Search Queue (Radius Expansion)
const riderSearchQueue = isRedisAvailable ? new Queue('rider-search-queue', defaultQueueOptions) : new DummyQueue('rider-search-queue');

// 3. Order Escalation Queue (10-min admin alert + 20-min user apology)
const orderEscalationQueue = isRedisAvailable ? new Queue('order-escalation-queue', defaultQueueOptions) : new DummyQueue('order-escalation-queue');

// 4. Rider Auto Assign 120s Timeout Queue (Auto-reject if rider doesn't click Accept within 120s)
const riderAutoAssignTimeoutQueue = isRedisAvailable ? new Queue('rider-auto-assign-timeout-queue', defaultQueueOptions) : new DummyQueue('rider-auto-assign-timeout-queue');

// 5. Rider Auto Assign Retry Queue (Retry auto-assignment if no riders were found)
const riderAutoAssignRetryQueue = isRedisAvailable ? new Queue('rider-auto-assign-retry-queue', defaultQueueOptions) : new DummyQueue('rider-auto-assign-retry-queue');


export const QueueService = {

    /**
     * Start Vendor Acceptance Timer
     * @param {Object} orderId - Order document _id
     */
    async scheduleVendorTimeout(orderId, delayMs = 5 * 60 * 1000) {
        await orderWaitQueue.add('check-vendor-accept', { orderId }, { delay: delayMs });
        console.log(`[Queue] Scheduled vendor timeout for ${orderId} in ${delayMs/1000}s`);
    },

    /**
     * Schedule Admin Escalation (10 minutes after searching starts)
     * If no delivery boy accepts within 10 min, escalate to admin with urgent notification + buzzer.
     * @param {String} orderId - Order document _id
     */
    async scheduleAdminEscalation(orderId, delayMs = 10 * 60 * 1000) {
        const jobId = `admin-escalation-${orderId}`;
        await orderEscalationQueue.add('admin-escalation', { orderId, phase: 'admin' }, { delay: delayMs, jobId });
        console.log(`[Queue] Scheduled admin escalation for ${orderId} in ${delayMs / 1000}s (jobId: ${jobId})`);
    },

    /**
     * Schedule User "No Partner" Notification (20 minutes after searching starts)
     * @param {String} orderId - Order document _id
     */
    async scheduleUserNoPartnerNotification(orderId, delayMs = 20 * 60 * 1000) {
        const jobId = `user-no-partner-${orderId}`;
        await orderEscalationQueue.add('user-no-partner', { orderId, phase: 'user' }, { delay: delayMs, jobId });
        console.log(`[Queue] Scheduled user no-partner notification for ${orderId} in ${delayMs / 1000}s (jobId: ${jobId})`);
    },

    /**
     * Start 120-Second Auto Assign Timeout
     * @param {String} orderId 
     * @param {String} deliveryBoyId 
     * @param {Number} delayMs 
     */
    async scheduleRiderAutoAssignTimeout(orderId, deliveryBoyId, delayMs = 120 * 1000) {
        await riderAutoAssignTimeoutQueue.add('check-auto-assign-accept', { orderId, deliveryBoyId }, { delay: delayMs });
        console.log(`[Queue] Scheduled 120s auto-assign timeout for order ${orderId} and rider ${deliveryBoyId}`);
    },

    /**
     * Schedule a retry for auto-assigning a delivery boy if no one is available
     * @param {String} orderId 
     * @param {Number} delayMs 
     */
    async scheduleAutoAssignRetry(orderId, delayMs = 30 * 1000) {
        await riderAutoAssignRetryQueue.add('retry-auto-assign', { orderId }, { delay: delayMs });
        console.log(`[Queue] Scheduled auto-assign retry for order ${orderId} in ${delayMs / 1000}s`);
    },

    /**
     * Start/Repeat Rider Proximity Search
     * @param {Object} orderId - Order document _id
     * @param {Number} radius - radius in km
     */
    async scheduleRiderSearch(orderId, radius = 5, attempt = 1) {
        // Max 3 attempts or 15km
        if (attempt > 3) {
            console.log(`[Queue] Max search attempts reached for order ${orderId}. Notifying Admin...`);
            // Job done, notify admin
            return;
        }

        await riderSearchQueue.add('search-nearby-riders', 
            { orderId, radius, attempt }, 
            { 
               // Recursive delay: 5km (now), 10km (in 2m), 15km (in 4m)
               delay: attempt === 1 ? 0 : 2 * 60 * 1000 
            }
        );
    }
};

/**
 * Worker Logic: Order Wait Check
 */
if (isRedisAvailable) {
    new Worker('order-wait-queue', async job => {
        const { orderId } = job.data;
        const order = await Order.findById(orderId);

        if (!order) return;

        if (order.status === 'pending') {
            console.log(`[Worker] Vendor timeout reached for order ${order.orderId}. Auto-cancelling.`);
            
            // Atomic status check-and-update to 'cancelled'
            const updated = await Order.findOneAndUpdate(
                { _id: orderId, status: 'pending' },
                { 
                    $set: { 
                        status: 'cancelled', 
                        cancellationReason: 'Vendor unresponsive timeout' 
                    } 
                },
                { new: true }
            );

            if (updated) {
                // Notify Customer
                emitEvent(`user_${order.userId}`, 'order_cancelled', { 
                    orderId: order.orderId, 
                    reason: 'No response from vendor within 5 minutes.'
                });
                
                await createNotification({
                    recipientId: order.userId,
                    recipientType: 'user',
                    title: 'Order Cancelled (Timeout)',
                    message: 'No vendor accepted your order within the time limit. Refund initiated if applicable.',
                    type: 'order'
                });
            }
        }
    }, { connection: redisConnection, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
}

/**
 * Worker Logic: Rider Search Loop
 */
if (isRedisAvailable) {
    new Worker('rider-search-queue', async job => {
        const { orderId, radius, attempt } = job.data;
        const order = await Order.findById(orderId);

        if (!order || order.status !== 'searching') return;

        console.log(`[Worker] Attempting rider search (Attempt ${attempt}, Radius ${radius}km) for order ${order.orderId}`);

        const notifiedCount = await DeliveryNearbyService.broadcastToRiders(order, radius);

        // If no one was notified OR we expect a repeat, schedule next attempt with larger radius
        if (order.status === 'searching') {
            await QueueService.scheduleRiderSearch(orderId, radius + 5, attempt + 1);
        }
    }, { connection: redisConnection, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
}

/**
 * Worker Logic: Order Escalation (10-min admin alert + 20-min user notification)
 * Replaces the old 15-min auto-cancel with a structured escalation flow.
 */
if (isRedisAvailable) {
    new Worker('order-escalation-queue', async job => {
        const { orderId, phase } = job.data;
        const order = await Order.findById(orderId).populate('vendorItems.vendorId', '_id name storeName');

        if (!order) return;

        // Only escalate if order is still unassigned (searching or ready_for_pickup)
        if (!['searching', 'ready_for_pickup'].includes(order.status)) {
            console.log(`[Escalation] Order ${order.orderId} is now ${order.status}. Skipping ${phase} escalation.`);
            return;
        }

        if (phase === 'admin') {
            // ── PHASE 2: Admin Escalation (10 minutes) ──
            console.log(`[Escalation] ⚠️ 10-min admin escalation for order ${order.orderId}`);

            // Fetch nearby riders sorted nearest-to-farthest for admin
            let nearbyRiders = [];
            try {
                const pickupCoords = order.pickupLocation?.coordinates;
                if (pickupCoords && pickupCoords.length === 2 && (pickupCoords[0] !== 0 || pickupCoords[1] !== 0)) {
                    const allRiders = await DeliveryBoy.find({
                        applicationStatus: 'approved',
                        isActive: true
                    }).select('name phone status currentLocation vehicleType vehicleNumber').lean();

                    nearbyRiders = allRiders.map(rider => {
                        const riderCoords = rider.currentLocation?.coordinates;
                        const distance = (riderCoords && riderCoords.length === 2)
                            ? calculateDistance(pickupCoords, riderCoords)
                            : 9999;
                        return { ...rider, distance: Math.round(distance * 10) / 10 };
                    }).sort((a, b) => a.distance - b.distance).slice(0, 20);
                }
            } catch (err) {
                console.error('[Escalation] Error fetching nearby riders:', err.message);
            }

            // Emit urgent socket event to admin with buzzer
            emitEvent('admin', 'admin_no_rider_alert', {
                orderId: order.orderId,
                orderObjectId: order._id,
                customer: order.shippingAddress?.name || 'Customer',
                address: order.shippingAddress?.address || 'Address unavailable',
                total: order.total,
                searchingFor: '10 minutes',
                nearbyRiders,
                createdAt: order.createdAt,
                urgent: true
            });

            // Find all admins and create notification for each
            try {
                const { Admin } = await import('../models/Admin.model.js');
                const admins = await Admin.find().select('_id').lean();
                
                await Promise.all(admins.map(adminUser => 
                    createNotification({
                        recipientId: adminUser._id,
                        recipientType: 'admin',
                        title: '🚨 Urgent: No Delivery Partner Found',
                        message: `Order #${order.orderId} has been searching for a rider for 10 minutes. Manual assignment required!`,
                        type: 'order',
                        data: { orderId: order.orderId, status: 'searching', urgent: true, click_action: `/admin/orders/${order._id}` }
                    })
                ));
            } catch (err) {
                console.error('[Escalation] Admin DB notification error:', err);
            }

            console.log(`[Escalation] ✅ Admin notified for order ${order.orderId} with ${nearbyRiders.length} nearby riders.`);
        } else if (phase === 'user') {
            // ── PHASE 3: User Auto-Cancel & Apology (20 minutes) ──
            console.log(`[Escalation] 😔 20-min auto-cancel for order ${order.orderId}`);

            const cancelMessage = 'Sorry for the inconvenience! Your order has been cancelled because no delivery partner is currently available. Please feel free to place a new order.';

            // Emit socket events FIRST (before cancel) so the user sees the popup
            // before the order_status_updated event causes a re-render
            emitEvent(`user_${order.userId}`, 'no_partner_yet', {
                orderId: order.orderId,
                message: cancelMessage
            });
            emitEvent(`order_${order.orderId}`, 'no_partner_yet', {
                orderId: order.orderId,
                message: cancelMessage
            });

            try {
                // Dynamically import to avoid circular dependency
                const { cancelOrderInternal } = await import('../modules/user/controllers/order.controller.js');
                await cancelOrderInternal(order.orderId, order.userId, 'Auto-cancelled due to no delivery partner available');
                console.log(`[Escalation] Order ${order.orderId} successfully auto-cancelled.`);
            } catch (err) {
                console.error(`[Escalation] Error auto-cancelling order ${order.orderId}:`, err);
            }

            // NOTE: cancelOrderInternal already calls notifyOrderUpdate('cancelled')
            // which creates the notification + push for all parties. No extra createNotification needed.

            console.log(`[Escalation] ✅ User notified (auto-cancelled) for order ${order.orderId}`);
        }
    }, { connection: redisConnection, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
}

/**
 * Worker Logic: Rider Auto Assign 120s Timeout Check
 * If an order was auto-assigned but the rider didn't accept in 120s, Auto-Reject and search again.
 */
if (isRedisAvailable) {
    new Worker('rider-auto-assign-timeout-queue', async job => {
        const { orderId, deliveryBoyId } = job.data;
        const order = await Order.findById(orderId);

        if (!order) return;

        // Check if the order is STILL assigned to this rider BUT they haven't explicitly accepted it.
        if (order.status === 'assigned' && String(order.deliveryBoyId) === String(deliveryBoyId) && !order.riderAcceptedAt) {
            console.log(`[Worker] ⏰ Rider ${deliveryBoyId} failed to accept order ${order.orderId} within 120s. Auto-rejecting.`);

            // 1. Mark this rider as rejected
            if (!order.rejectedDeliveryBoys.includes(deliveryBoyId)) {
                order.rejectedDeliveryBoys.push(deliveryBoyId);
            }

            // 2. Clear assignment
            order.deliveryBoyId = undefined;
            order.riderAcceptedAt = null; // Ensure this is cleared
            order.status = 'searching';
            order.vendorPickups = []; // Will be recalculated by new assignment
            await order.save();

            // 3. Make rider available again
            const DeliveryBoy = (await import('../models/DeliveryBoy.model.js')).default;
            await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, { status: 'available' });

            // 4. Delete the DeliveryBatch if any
            const DeliveryBatch = (await import('../models/DeliveryBatch.model.js')).default;
            await DeliveryBatch.deleteMany({
                customerId: order.userId,
                deliveryBoyId: deliveryBoyId,
                status: { $in: ['assigned', 'picked_up', 'arrived', 'try_and_buy', 'payment_pending'] }
            });

            // 5. Notify the rider that they missed it
            emitEvent(`delivery_${deliveryBoyId}`, 'order_missed', { 
                orderId: order.orderId,
                id: order._id,
                message: 'Order was removed because it was not accepted within 120 seconds.'
            });

            // 6. Trigger auto assignment for the next nearest rider
            const { autoAssignDeliveryBoy } = await import('./autoAssignment.service.js');
            autoAssignDeliveryBoy(order._id, [deliveryBoyId]).catch(err => {
                console.error("[Worker] AutoAssign fallback trigger failed:", err);
            });
        }
    }, { connection: redisConnection, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
}

/**
 * Worker Logic: Rider Auto Assign Retry
 * Continuously retry auto-assignment if no riders are available, until the order is accepted or global timeout occurs.
 */
if (isRedisAvailable) {
    new Worker('rider-auto-assign-retry-queue', async job => {
        const { orderId } = job.data;
        const order = await Order.findById(orderId);

        if (!order) return;

        if (order.status === 'searching') {
            // Stop retrying after 10 minutes — admin takes over at this point
            const searchStart = order.searchStartedAt || order.createdAt;
            const elapsedMs = Date.now() - new Date(searchStart).getTime();
            const TEN_MINUTES = 10 * 60 * 1000;

            if (elapsedMs >= TEN_MINUTES) {
                console.log(`[Worker] ⏹️ Auto-assign retries stopped for ${order.orderId} after 10 minutes. Admin escalation active.`);
                return; // Stop retrying — admin handles it now
            }

            console.log(`[Worker] 🔄 Retrying auto-assignment for order ${order.orderId} (${Math.round(elapsedMs/1000)}s elapsed)...`);
            const { autoAssignDeliveryBoy } = await import('./autoAssignment.service.js');
            autoAssignDeliveryBoy(order._id).catch(err => {
                console.error("[Worker] AutoAssign retry trigger failed:", err);
            });
        }
    }, { connection: redisConnection, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } });
}

if (isRedisAvailable) {
    console.log('✅ Queue Workers Initialized');
} else {
    console.log('⚠️ Redis is unavailable in local dev. Queue Workers bypassed.');
}
