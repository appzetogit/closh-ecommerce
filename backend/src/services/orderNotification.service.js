import { createNotification } from './notification.service.js';
import { emitEvent } from './socket.service.js';
import Order from '../models/Order.model.js';
import { triggerDeliveryAssignment } from './deliveryAssignment.service.js';

/**
 * Unified service to notify all parties involved in an order (Customer, Vendors, Rider)
 */
export const OrderNotificationService = {
    /**
     * Notify all relevant parties about an order status update
     * @param {string} orderId - The Order ID or Mongo ID
     * @param {string} status - New status
     * @param {Object} options - { title, message, data, excludeRecipientId }
     */
    notifyOrderUpdate: async (orderId, status, options = {}) => {
        try {
            const order = await Order.findById(orderId)
                .populate('vendorItems.vendorId')
                .populate('deliveryBoyId', 'name');

            if (!order) {
                console.error(`❌ [NOTIFICATION ERROR] Order NOT found: ${orderId}`);
                return;
            }

            const { data = {} } = options;
            const recipients = [];

            // Helper to get role-specific message
            const getMessageForRole = (role, status, orderId, riderName) => {
                const s = status.toLowerCase();
                const id = `#${orderId}`;
                
                const messages = {
                    user: {
                        pending: `Your order ${id} has been placed successfully.`,
                        accepted: `Your order ${id} is being prepared.`,
                        ready_for_pickup: `Order ${id} is ready and we're finding a delivery partner.`,
                        searching: `Finding a delivery partner for your order ${id}.`,
                        assigned: `${riderName || 'A rider'} is arriving to pick up your order ${id}.`,
                        picked_up: `Your order ${id} is on the way!`,
                        out_for_delivery: `Your order ${id} is out for delivery.`,
                        delivered: `Enjoy your order ${id}! It has been delivered.`,
                        cancelled: `Your order ${id} has been cancelled.`,
                        default: `Your order ${id} status updated to ${s.replace(/_/g, ' ')}.`
                    },
                    vendor: {
                        pending: `New Order ${id} received! Please accept to start preparation.`,
                        accepted: `You have accepted Order ${id}.`,
                        ready_for_pickup: `Order ${id} is marked as ready for pickup.`,
                        searching: `Searching for a rider for Order ${id}.`,
                        assigned: `${riderName || 'A partner'} has been assigned to pick up Order ${id}.`,
                        picked_up: `Order ${id} has been picked up from your store.`,
                        delivered: `Order ${id} has been delivered successfully.`,
                        cancelled: `Order ${id} was cancelled.`,
                        default: `Order ${id} is now ${s.replace(/_/g, ' ')}.`
                    },
                    delivery: {
                        ready_for_pickup: `New job available: Order ${id} is ready for pickup.`,
                        searching: `New job available nearby: Order ${id}.`,
                        assigned: `You have been assigned to Order ${id}.`,
                        picked_up: `Order ${id} picked up. Head to customer location.`,
                        delivered: `Mission complete! Order ${id} delivered.`,
                        cancelled: `Order ${id} mission was cancelled.`,
                        default: `Order ${id} status: ${s.replace(/_/g, ' ')}.`
                    }
                };

                return (messages[role]?.[s] || messages[role]?.default || `Order ${id} updated to ${s}`).replace(/_/g, ' ');
            };

            // 1. Customer
            if (order.userId) {
                const msg = getMessageForRole('user', status, order.orderId, order.deliveryBoyId?.name);
                recipients.push({ 
                    id: order.userId, 
                    type: 'user', 
                    title: 'Order Update', 
                    message: msg,
                    click_action: `/orders/${order.orderId}`
                });
                
                // Real-time specialized events (Keep these for UI transitions, but avoid dual toasts)
                if (status === 'assigned') emitEvent(`user_${order.userId}`, 'rider_assigned', { orderId: order.orderId, riderName: order.deliveryBoyId?.name });
                if (status === 'delivered') emitEvent(`user_${order.userId}`, 'order_delivered', { orderId: order.orderId });
            }

            // 2. Vendors
            const vendorIds = [...new Set(order.vendorItems.map(vi => String(vi.vendorId?._id || vi.vendorId)))];
            vendorIds.forEach(vId => {
                const msg = getMessageForRole('vendor', status, order.orderId, order.deliveryBoyId?.name);
                
                // Privacy & Clarity: Only send items belonging to this specific vendor
                const vendorGroup = order.vendorItems.find(vi => String(vi.vendorId?._id || vi.vendorId) === vId);
                const vendorSpecificData = {
                    ...order.toObject(),
                    items: vendorGroup?.items || [],
                    total: vendorGroup?.subtotal || 0, // Show the vendor their specific subtotal
                    vendorEarnings: vendorGroup?.vendorEarnings || 0
                };

                recipients.push({ 
                    id: vId, 
                    type: 'vendor', 
                    title: status === 'pending' ? '🚀 New Order!' : 'Order Update', 
                    message: msg,
                    sound: status === 'pending' ? 'buzzer.mp3' : 'default',
                    click_action: `/vendor/dashboard?viewOrder=${order.orderId}`
                });

                // Socket event for dashboard refresh / buzzer
                if (status === 'pending') {
                    emitEvent(`vendor_${vId}`, 'order_created', { ...vendorSpecificData, message: msg });
                }
            });

            // 3. Delivery Partner
            if (order.deliveryBoyId) {
                const msg = getMessageForRole('delivery', status, order.orderId);
                recipients.push({ 
                    id: order.deliveryBoyId, 
                    type: 'delivery', 
                    title: 'Mission Update', 
                    message: msg,
                    sound: (status === 'ready_for_pickup' || status === 'searching') ? 'buzzer.mp3' : 'default',
                    click_action: (status === 'ready_for_pickup' || status === 'searching') 
                        ? `/delivery/dashboard?viewOrder=${order.orderId}`
                        : `/delivery/orders/${order.orderId}`
                });
            }
            
            // Collect metadata for the notifications
            const notificationData = { 
                orderId: order.orderId, 
                status,
                total: order.total,
                customerName: order.shippingAddress?.name,
                deliveryBoy: order.deliveryBoyId ? {
                    id: order.deliveryBoyId._id,
                    name: order.deliveryBoyId.name,
                    phone: order.deliveryBoyId.phone
                } : null
            };

            // 4. Global Socket Updates (Ensures UI synchronization)
            // Notify the specific order room
            const rooms = [`order_${order._id}`, `order_${order.orderId}`];
            rooms.forEach(room => {
                emitEvent(room, 'order_status_updated', notificationData);
                emitEvent(room, 'order_updated', notificationData);
                // Also emit specific milestone events
                if (status === 'picked_up') emitEvent(room, 'order_picked_up', notificationData);
                if (status === 'out_for_delivery') emitEvent(room, 'order_out_for_delivery', notificationData);
                if (status === 'delivered') emitEvent(room, 'order_delivered', notificationData);
                if (status === 'assigned') emitEvent(room, 'order_assigned', notificationData);
            });

            // Role-specific socket rooms for dashboard refreshes
            if (order.userId) {
                const userRoom = `user_${order.userId}`;
                emitEvent(userRoom, 'order_updated', notificationData);
                emitEvent(userRoom, 'order_status_updated', notificationData);
                if (status === 'assigned') emitEvent(userRoom, 'order_assigned', notificationData);
                if (status === 'picked_up') emitEvent(userRoom, 'order_picked_up', notificationData);
                if (status === 'out_for_delivery') emitEvent(userRoom, 'order_out_for_delivery', notificationData);
                if (status === 'delivered') emitEvent(userRoom, 'order_delivered', notificationData);
            }

            vendorIds.forEach(vId => {
                const vendorRoom = `vendor_${vId}`;
                emitEvent(vendorRoom, 'order_updated', notificationData);
                emitEvent(vendorRoom, 'order_status_updated', notificationData);
                if (status === 'picked_up') emitEvent(vendorRoom, 'order_picked_up', notificationData);
                if (status === 'delivered') emitEvent(vendorRoom, 'order_delivered', notificationData);
            });

            if (order.deliveryBoyId) {
                const deliveryId = order.deliveryBoyId._id || order.deliveryBoyId;
                const deliveryRoom = `delivery_${deliveryId}`;
                emitEvent(deliveryRoom, 'order_updated', notificationData);
                emitEvent(deliveryRoom, 'order_status_updated', notificationData);
            }
            
            // Execute notifications (DB persistence + Push via createNotification)
            const tasks = recipients
                .filter(r => String(r.id) !== String(options.excludeRecipientId))
                .map(r => createNotification({
                    recipientId: r.id,
                    recipientType: r.type,
                    title: r.title,
                    message: r.message,
                    type: 'order',
                    data: { ...notificationData, ...data, click_action: r.click_action },
                    sound: r.sound || 'default'
                }));

            // Auto-trigger assignment search ONLY if no delivery boy is assigned yet.
            // Re-check from DB because autoAssignDeliveryBoy may have already assigned someone by now.
            if ((status === 'ready_for_pickup' || status === 'searching') && !order.deliveryBoyId) {
                const freshOrder = await Order.findById(orderId).select('deliveryBoyId status').lean();
                if (!freshOrder?.deliveryBoyId) {
                    triggerDeliveryAssignment(order).catch(err => console.error(`[AutoAssign] Error: ${err.message}`));
                } else {
                    console.log(`[OrderNotification] Skipping broadcast: Order ${order.orderId} already assigned to rider ${freshOrder.deliveryBoyId}`);
                }
            }

            await Promise.allSettled(tasks);
        } catch (error) {
            console.error('OrderNotificationService Error:', error.message);
        }
    }
};

export default OrderNotificationService;
