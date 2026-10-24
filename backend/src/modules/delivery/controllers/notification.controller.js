import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Notification from '../../../models/Notification.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import { releaseDeliveryTokenFromOtherRiders } from '../../../services/notification.service.js';

// GET /api/delivery/notifications
export const getDeliveryNotifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (numericPage - 1) * numericLimit;

    const filter = {
        recipientId: req.user.id,
        recipientType: 'delivery',
    };

    if (type && type !== 'all') {
        filter.type = type;
    }
    if (isRead === 'true') {
        filter.isRead = true;
    } else if (isRead === 'false') {
        filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(numericLimit).lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({
            recipientId: req.user.id,
            recipientType: 'delivery',
            isRead: false,
        }),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                notifications,
                total,
                unreadCount,
                page: numericPage,
                pages: Math.ceil(total / numericLimit),
            },
            'Delivery notifications fetched.'
        )
    );
});

// PUT /api/delivery/notifications/:id/read
export const markDeliveryNotificationAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
        {
            _id: req.params.id,
            recipientId: req.user.id,
            recipientType: 'delivery',
        },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        throw new ApiError(404, 'Notification not found.');
    }

    res.status(200).json(
        new ApiResponse(200, notification, 'Delivery notification marked as read.')
    );
});

// PUT /api/delivery/notifications/read-all
export const markAllDeliveryNotificationsAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        {
            recipientId: req.user.id,
            recipientType: 'delivery',
            isRead: false,
        },
        { isRead: true }
    );

    res.status(200).json(
        new ApiResponse(200, null, 'All delivery notifications marked as read.')
    );
});

// DELETE /api/delivery/notifications/:id
export const deleteDeliveryNotification = asyncHandler(async (req, res) => {
    const deleted = await Notification.findOneAndDelete({
        _id: req.params.id,
        recipientId: req.user.id,
        recipientType: 'delivery',
    });

    if (!deleted) {
        throw new ApiError(404, 'Notification not found.');
    }

    res.status(200).json(new ApiResponse(200, null, 'Delivery notification deleted.'));
});
// POST /api/delivery/notifications/fcm-token
export const registerDeliveryFcmToken = asyncHandler(async (req, res) => {
    const token = req.body.token || req.body.fcmToken;
    const platform = req.body.platform || 'web';
    if (!token) throw new ApiError(400, 'FCM token is required.');

    // Atomic Update Pattern to prevent VersionError (Race Conditions)
    // 1. Remove existing token if present to avoid duplicates and update lastUsed indirectly
    await DeliveryBoy.findByIdAndUpdate(req.user.id, {
        $pull: { fcmTokens: { token } }
    });

    // 2. Push new token to the end and slice to keep only last 10
    const updated = await DeliveryBoy.findByIdAndUpdate(req.user.id, {
        $push: { 
            fcmTokens: { 
                $each: [{ token, platform, lastUsed: new Date() }],
                $slice: -10 
            } 
        }
    }, { new: true });

    if (!updated) throw new ApiError(404, 'Delivery Boy not found');
    // The phone now belongs to this rider; another account logged in on it before must not keep it.
    await releaseDeliveryTokenFromOtherRiders(token, updated._id);

    res.status(200).json(new ApiResponse(200, { token, platform }, 'FCM token registered.'));
});

// DELETE /api/delivery/notifications/fcm-token
export const removeDeliveryFcmToken = asyncHandler(async (req, res) => {
    const token = req.body.token || req.body.fcmToken;
    if (!token) throw new ApiError(400, 'FCM token is required.');

    await DeliveryBoy.findByIdAndUpdate(req.user.id, {
        $pull: { fcmTokens: { token } }
    });

    res.status(200).json(new ApiResponse(200, null, 'FCM token removed.'));
});
