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
 * A phone's FCM token belongs to whoever logged in on it last. When two rider accounts were
 * used on one phone, both kept the token, so an offer for one rider rang the phone the other
 * rider now holds. Call whenever a rider registers a token.
 */
export const releaseDeliveryTokenFromOtherRiders = (token, riderId) => {
    if (!token) return Promise.resolve();
    return DeliveryBoy.updateMany(
        { _id: { $ne: riderId }, 'fcmTokens.token': token },
        { $pull: { fcmTokens: { token } } }
    ).catch((err) => console.error('[FCM] Could not release rider token from other accounts:', err.message));
};

/**
 * The one phone a rider's push should go to: the token used most recently. A rider can have
 * several tokens (old phone, a browser, a second login); a ringing offer went to all of them,
 * so two phones rang at once. A token that another rider account registered after this one
 * belongs to that rider's phone now, so it is skipped too. Returns [] when nothing qualifies.
 */
export const pickRiderPushTokens = async (riderId, fcmTokens = []) => {
    const entries = fcmTokens
        .map((t) => (typeof t === 'string' ? { token: t, lastUsed: 0 } : { token: t.token, lastUsed: t.lastUsed ? new Date(t.lastUsed).getTime() : 0 }))
        .filter((t) => t.token)
        .sort((a, b) => b.lastUsed - a.lastUsed);
    for (const candidate of entries) {
        const takenByOther = await DeliveryBoy.exists({
            _id: { $ne: riderId },
            fcmTokens: { $elemMatch: { token: candidate.token, lastUsed: { $gt: new Date(candidate.lastUsed) } } },
        }).catch(() => null);
        if (!takenByOther) return [candidate.token];
    }
    return [];
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
// Notification.data is a Map of strings (and FCM data must be strings too). Callers sometimes
// pass nested objects - e.g. order updates carried `deliveryBoy: {id, name, phone}` - which made
// Notification.create throw, so the customer got no notification, socket event or push at all
// once a rider was assigned. Flatten everything to strings here; drop null/undefined.
const toStringMap = (data = {}) => {
    const out = {};
    Object.entries(data || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        out[key] = typeof value === 'object' && !(value instanceof Date) && typeof value.toHexString !== 'function'
            ? JSON.stringify(value)
            : String(value);
    });
    return out;
};

export const createNotification = async ({ recipientId, recipientType, title, message, type = 'system', data = {}, token, tokens, imageUrl, actionLink, ring = false }) => {
    data = toStringMap(data);

    // 1. Persist to DB if recipientId is provided
    let notification = null;
    if (recipientId) {
        try {
            notification = await Notification.create({ recipientId, recipientType, title, message, type, data, imageUrl, actionLink });
            console.log(`💾 [DB NOTIFICATION] ID: ${notification._id}, For: ${recipientType}_${recipientId}`);

            // 2. Real-time socket updates (for active web clients)
            const room = recipientType === 'admin' ? `admin_${recipientId}` : `${recipientType}_${recipientId}`;
            console.log(`📡 [SOCKET NOTIFY] Room: ${room}, Event: new_notification`);
            emitEvent(room, 'new_notification', notification);
        } catch (err) {
            // Still try the push below - a failed DB write must not silence the notification.
            console.error(`Failed to save notification for ${recipientType}_${recipientId}:`, err.message);
        }
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
                // 3a. Suppression check: If delivery partner is offline, skip push notification.
                // A ringing push is a job given to this rider by name (auto-assignment only picks
                // riders who are on duty; an admin can assign anyone), so it always goes out -
                // otherwise an admin-assigned rider who was off duty never heard about the order.
                if (recipientType === 'delivery' && !ring && (recipient.status === 'offline' || recipient.isAvailable === false)) {
                    console.log(`🔕 [PUSH SUPPRESSED] Partner ${recipientId} is offline. Skipping push.`);
                    return null;
                }

                pushTokens = recipientType === 'delivery'
                    ? await pickRiderPushTokens(recipientId, recipient.fcmTokens)
                    : recipient.fcmTokens.map(t => typeof t === 'string' ? t : t.token);
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

            // The partner app rings for any push whose data.type contains "order". Only the new-order
            // offer (ring) should ring; status updates ("Mission Update") used to ring on every step and,
            // without ring, named a channel/sound the app does not have. Send them as plain updates.
            const riderUpdate = recipientType === 'delivery' && !ring && type === 'order';
            if (riderUpdate) sound = 'default';
            const pushData = { ...data, type: riderUpdate ? 'mission_update' : type };
            await sendPushToTokens(pushTokens, { title, body: message, data: pushData, sound, imageUrl, actionLink, ...ringPayload });
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

