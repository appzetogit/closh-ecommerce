import Notification from '../models/Notification.model.js';
import { emitEvent } from './socket.service.js';
import admin from '../config/firebase.js';
import { User } from '../models/User.model.js';
import { Vendor } from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { Admin } from '../models/Admin.model.js';

// Helper to safely get messaging instance (prevents crash if firebase not initialized)
const getMessaging = () => {
    try {
        return admin.messaging();
    } catch (error) {
        return null;
    }
};

/**
 * Send a push notification using Firebase Messaging
 * @param {Array} tokens - Array of FCM registration tokens
 * @param {Object} payload - { title, body, data, sound }
 */
const sendPushToTokens = async (tokens, { title, body, data = {}, sound = 'default' }) => {
    if (!tokens || tokens.length === 0) return;

    const messaging = getMessaging();
    
    if (!messaging) {
        console.warn('⚠️ FCM messaging service not initialized. Skipping push notification.');
        return;
    }

    const stringifiedData = {};
    Object.entries(data).forEach(([key, value]) => {
        stringifiedData[key] = String(value);
    });

    const message = {
        notification: { title, body },
        data: { ...stringifiedData, click_action: stringifiedData.click_action || 'FLUTTER_NOTIFICATION_CLICK' }, // Standard for some frameworks
        tokens,
        android: {
            priority: 'high',
            notification: {
                sound: sound === 'default' ? 'default' : sound,
                channelId: sound === 'default' ? 'default_channel' : 'high_priority_channel'
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: sound === 'default' ? 'default' : sound
                }
            }
        }
    };

    try {
        const response = await messaging.sendEachForMulticast(message);
        
        if (response.failureCount > 0) {
            const staleTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const error = resp.error;
                    console.warn(`❌ Token failure: ${error.message} (${tokens[idx].substring(0, 10)}...)`);
                    
                    // Cleanup codes: NotRegistered, InvalidRegistration, etc.
                    const isStale = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(error.code);
                    if (isStale) {
                        staleTokens.push(tokens[idx]);
                    }
                }
            });

            if (staleTokens.length > 0) {
                console.warn(`🧹 Cleaning up ${staleTokens.length} stale FCM tokens from database...`);
                // Use a dynamic cleanup across all potential models
                const models = [User, Vendor, DeliveryBoy, Admin];
                
                // Do this in background
                Promise.all(models.map(Model => 
                    Model.updateMany(
                        { 'fcmTokens.token': { $in: staleTokens } },
                        { $pull: { fcmTokens: { token: { $in: staleTokens } } } }
                    )
                )).catch(err => console.error('FCM Token Cleanup Failed:', err.message));
            }
        }

        console.log(`✅ Push sent: ${response.successCount} success, ${response.failureCount} failed.`);
    } catch (error) {
        console.error('❌ FCM Error:', error.message);
    }
};

/**
 * Create a notification for a user/vendor/delivery/admin and trigger Push/Socket
 * @param {Object} options - { recipientId, recipientType, title, message, type, data, token, tokens }
 */
export const createNotification = async ({ recipientId, recipientType, title, message, type = 'system', data = {}, token, tokens }) => {
    // 1. Persist to DB if recipientId is provided
    let notification = null;
    if (recipientId) {
        notification = await Notification.create({ recipientId, recipientType, title, message, type, data });
        console.log(`💾 [DB NOTIFICATION] ID: ${notification._id}, For: ${recipientType}_${recipientId}`);

        // 2. Real-time socket updates (for active web clients)
        const room = recipientType === 'admin' ? `admin_${recipientId}` : `${recipientType}_${recipientId}`;
        console.log(`📡 [SOCKET NOTIFY] Room: ${room}, Event: new_notification`);
        emitEvent(room, 'new_notification', notification);
    }

    // 3. Trigger Push Notification (for mobile/background)
    try {
        let pushTokens = [];
        
        // Use explicitly provided tokens if available
        if (tokens && Array.isArray(tokens)) pushTokens = tokens;
        else if (token) pushTokens = [token];
        else if (recipientId && recipientType) {
            // Find tokens from DB if not provided
            let recipient;
            switch (recipientType) {
                case 'admin': recipient = await Admin.findById(recipientId).select('fcmTokens').lean(); break;
                case 'vendor': recipient = await Vendor.findById(recipientId).select('fcmTokens').lean(); break;
                case 'delivery': recipient = await DeliveryBoy.findById(recipientId).select('fcmTokens status isAvailable').lean(); break;
                case 'user': recipient = await User.findById(recipientId).select('fcmTokens').lean(); break;
                case 'customer': recipient = await User.findById(recipientId).select('fcmTokens').lean(); break;
            }

            if (recipient && recipient.fcmTokens && recipient.fcmTokens.length > 0) {
                // 3a. Suppression check: If delivery partner is offline, skip push notification
                if (recipientType === 'delivery' && (recipient.status === 'offline' || recipient.isAvailable === false)) {
                    console.log(`🔕 [PUSH SUPPRESSED] Partner ${recipientId} is offline. Skipping push.`);
                    return null;
                }

                pushTokens = recipient.fcmTokens.map(t => typeof t === 'string' ? t : t.token);
            }
        }

        if (pushTokens.length > 0) {
            // Custom sound logic (buzzer)
            let sound = 'default';
            if ((recipientType === 'vendor' || recipientType === 'delivery') && type === 'order') {
                sound = 'mgs_codec.mp3'; // The custom buzzer sound file name
            }

            await sendPushToTokens(pushTokens, { title, body: message, data: { ...data, type }, sound });
        }
    } catch (err) {
        console.error('Failed to trigger push notification:', err.message);
    }

    return notification;
};


/**
 * Get unread notifications for a recipient
 */
export const getUnreadNotifications = async (recipientId, recipientType) => {
    return Notification.find({ recipientId, recipientType, isRead: false }).sort({ createdAt: -1 }).limit(20);
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllAsRead = async (recipientId, recipientType) => {
    return Notification.updateMany({ recipientId, recipientType, isRead: false }, { isRead: true });
};

/**
 * Send a notification to multiple roles/users (Broadcast)
 */
export const broadcastNotifications = async ({ roles, title, message, type = 'broadcast', data = {} }) => {
    const results = {
        successCount: 0,
        failureCount: 0,
        errors: []
    };

    try {
        const roleModels = {
            'user': User,
            'customer': User,
            'vendor': Vendor,
            'delivery': DeliveryBoy,
            'admin': Admin
        };

        for (const role of roles) {
            const Model = roleModels[role.toLowerCase()];
            if (!Model) continue;

            // Fetch all users of this role
            // Note: For large datasets, this should be chunked or handled by a background job
            const users = await Model.find({}).select('_id').lean();

            for (const user of users) {
                try {
                    await createNotification({
                        recipientId: user._id,
                        recipientType: role === 'user' || role === 'customer' ? 'user' : role,
                        title,
                        message,
                        type,
                        data
                    });
                    results.successCount++;
                } catch (err) {
                    results.failureCount++;
                    results.errors.push(`Failed for ${role} ${user._id}: ${err.message}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Global Broadcast Error:', error.message);
        throw error;
    }

    return results;
};

