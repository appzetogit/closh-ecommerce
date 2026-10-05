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

// The delivery partner app (closh_delivery, Flutter) rings only on its own channel and sound:
//   Android channel 'critical_order_alerts_v5' + res/raw/order_ringtone.mp3, iOS order_ringtone.mp3,
// and treats a push as an order alert when data.type contains 'order'. Pushes used to name a
// channel ('high_priority_channel') and a sound ('mgs_codec.mp3') the app does not have, so when
// the app was in the background Android fell back to its plain default channel - no ring.
const DELIVERY_RING = {
    androidChannelId: 'critical_order_alerts_v5',
    androidSound: 'order_ringtone',
    apnsSound: 'order_ringtone.mp3',
};

/**
 * Send a push notification using Firebase Messaging
 * @param {Array} tokens - Array of FCM registration tokens
 * @param {Object} payload - { title, body, data, sound, imageUrl, actionLink, androidChannelId, androidSound, apnsSound }
 */
const sendPushToTokens = async (tokens, { title, body, data = {}, sound = 'default', imageUrl, actionLink, androidChannelId, androidSound, apnsSound }) => {
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
    // actionLink, when set, is what the client opens on tap - takes priority
    // over the generic Flutter click_action default.
    if (actionLink) stringifiedData.actionLink = actionLink;

    const message = {
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        data: { ...stringifiedData, click_action: actionLink || stringifiedData.click_action || 'FLUTTER_NOTIFICATION_CLICK' }, // Standard for some frameworks
        tokens,
        android: {
            priority: 'high',
            notification: {
                sound: androidSound || (sound === 'default' ? 'default' : sound),
                channelId: androidChannelId || (sound === 'default' ? 'default_channel' : 'high_priority_channel'),
                ...(imageUrl ? { imageUrl } : {}),
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: apnsSound || (sound === 'default' ? 'default' : sound),
                    'mutable-content': imageUrl ? 1 : 0,
                }
            },
            ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
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
        return response;
    } catch (error) {
        console.error('❌ FCM Error:', error.message);
        return null;
    }
};

/**
 * Create a notification for a user/vendor/delivery/admin and trigger Push/Socket
 * @param {Object} options - { recipientId, recipientType, title, message, type, data, token, tokens }
 */
export const createNotification = async ({ recipientId, recipientType, title, message, type = 'system', data = {}, token, tokens, imageUrl, actionLink, ring = false }) => {
    // 1. Persist to DB if recipientId is provided
    let notification = null;
    if (recipientId) {
        notification = await Notification.create({ recipientId, recipientType, title, message, type, data, imageUrl, actionLink });
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

            // `ring` marks a new-order offer for a delivery partner: use the app's ringing channel.
            const ringPayload = (recipientType === 'delivery' && ring) ? DELIVERY_RING : {};

            await sendPushToTokens(pushTokens, { title, body: message, data: { ...data, type }, sound, imageUrl, actionLink, ...ringPayload });
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

// FCM's sendEachForMulticast accepts at most 500 tokens per call.
const FCM_BATCH_SIZE = 500;
const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

/**
 * Send a notification to multiple roles/users (Broadcast).
 *
 * Unlike createNotification (one recipient), this is built for thousands of
 * recipients at once: one Notification.insertMany per role instead of one
 * Notification.create() per user, and FCM tokens collected across the whole
 * role and sent in batches of up to 500 instead of one sendEachForMulticast
 * call per user. Intended to run inside the broadcast-notification-queue
 * worker (see queue.service.js), not on the request thread.
 */
export const broadcastNotifications = async ({ roles, title, message, type = 'broadcast', data = {}, imageUrl, actionLink }) => {
    const results = {
        recipientCount: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
        errors: []
    };

    const roleModels = {
        'user': User,
        'customer': User,
        'vendor': Vendor,
        'delivery': DeliveryBoy,
        'admin': Admin
    };

    const stringifiedData = {};
    Object.entries(data).forEach(([key, value]) => { stringifiedData[key] = String(value); });

    for (const role of roles) {
        const Model = roleModels[role.toLowerCase()];
        if (!Model) continue;
        const recipientType = (role === 'user' || role === 'customer') ? 'user' : role;

        try {
            const recipients = await Model.find({}).select('_id fcmTokens').lean();
            if (recipients.length === 0) continue;

            // One bulk insert for every recipient's in-app notification record,
            // instead of a Notification.create() round-trip per recipient.
            const now = new Date();
            const docs = recipients.map((recipient) => ({
                recipientId: recipient._id,
                recipientType,
                title,
                message,
                type,
                data: stringifiedData,
                imageUrl,
                actionLink,
                createdAt: now,
                updatedAt: now,
            }));
            const inserted = await Notification.insertMany(docs, { ordered: false });
            results.recipientCount += inserted.length;

            // Real-time update for anyone with an open tab right now.
            inserted.forEach((notification) => {
                const room = recipientType === 'admin' ? `admin_${notification.recipientId}` : `${recipientType}_${notification.recipientId}`;
                emitEvent(room, 'new_notification', notification);
            });

            // Collect every FCM token across the whole role and send in
            // batches of 500, instead of one API call per recipient.
            const allTokens = recipients.flatMap((recipient) =>
                (recipient.fcmTokens || []).map((t) => (typeof t === 'string' ? t : t.token)).filter(Boolean)
            );
            for (const tokenBatch of chunk(allTokens, FCM_BATCH_SIZE)) {
                try {
                    const response = await sendPushToTokens(tokenBatch, {
                        title,
                        body: message,
                        data: { ...stringifiedData, type },
                        imageUrl,
                        actionLink,
                    });
                    if (response) {
                        results.pushSuccessCount += response.successCount || 0;
                        results.pushFailureCount += response.failureCount || 0;
                    }
                } catch (err) {
                    results.errors.push(`Push batch failed for role ${role}: ${err.message}`);
                }
            }
        } catch (error) {
            console.error(`❌ Broadcast error for role ${role}:`, error.message);
            results.errors.push(`Failed for role ${role}: ${error.message}`);
        }
    }

    return results;
};

