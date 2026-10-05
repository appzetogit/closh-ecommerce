import crypto from 'crypto';
import { sendDeliveryOtpSms } from './sms.service.js';
import { createNotification } from './notification.service.js';
import { emitEvent } from './socket.service.js';

const DELIVERY_OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a secure 6-digit OTP
 */
export const generateOtp = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
};

/**
 * Hash an OTP for secure storage
 */
export const hashOtp = (otp) => {
    const secret = process.env.JWT_SECRET || 'delivery-otp-secret';
    return crypto.createHash('sha256').update(`${String(otp)}:${secret}`).digest('hex');
};

/**
 * Send Delivery OTP via all channels (SMS, Push, Socket)
 * @param {Object} order - The Order Mongoose document
 * @param {string} otp - The raw 6-digit OTP
 */
export const sendDeliveryOtp = async (order, otp) => {
    if (!order || !otp) return;

    const phone = order.shippingAddress?.phone || order.guestInfo?.phone;

    // 1. Send SMS (SMS India Hub)
    if (phone) {
        try {
            await sendDeliveryOtpSms(phone, otp, order.orderId);
            console.log(`[Delivery OTP] SMS sent to ${phone} for Order ${order.orderId}`);
        } catch (err) {
            console.error(`[Delivery OTP] SMS failed: ${err.message}`);
        }
    }

    // 2. Send Push Notification (FCM)
    const pushTitle = 'Order Verification Required 🔐';
    const pushMessage = `Order #${order.orderId}: Your delivery verification OTP is ${otp}. Please share this with the delivery partner upon arrival.`;
    
    const notificationPayload = {
        title: pushTitle,
        message: pushMessage,
        type: 'order',
        data: { orderId: order.orderId, otp }
    };

    if (order.userId) {
        createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            ...notificationPayload
        }).catch(err => console.error('[Delivery OTP] User Push failed:', err.message));
    } else if (order.deviceToken) {
        createNotification({
            token: order.deviceToken,
            ...notificationPayload
        }).catch(err => console.error('[Delivery OTP] Guest Push failed:', err.message));
    }

    // 3. Emit Socket Event
    const userRoom = order.userId ? `user_${order.userId}` : `guest_${order.orderId}`;
    // The shared order_<id> room also contains the rider and the vendor, so it must never carry the OTP.
    // Only the customer's own room (below) gets it.
    const socketData = { orderId: order.orderId };

    // Common room for live tracking
    emitEvent(`order_${order._id}`, 'delivery_otp_sent', socketData);
    if (order.orderId) emitEvent(`order_${order.orderId}`, 'delivery_otp_sent', socketData);
    
    // User specific room
    emitEvent(userRoom, 'delivery_otp_sent', { ...socketData, otp });

    console.log(`[Delivery OTP] Multi-channel broadcast complete for Order ${order.orderId}`);
};
