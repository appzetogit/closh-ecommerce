import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: { type: String, enum: ['user', 'customer', 'vendor', 'delivery', 'admin'], required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: { type: String, enum: ['order', 'payment', 'payout', 'system', 'promotion', 'broadcast', 'alert', 'chat', 'store_online', 'return', 'new_assignment_broadcast', 'return_pickup_broadcast', 'daily_deal', 'flash_sale', 'special_offer', 'promotional'], default: 'system' },
        isRead: { type: Boolean, default: false, index: true },
        imageUrl: { type: String, default: null },
        actionLink: { type: String, default: null }, // deep link/URL opened on tap
        data: { type: Map, of: String }, // extra metadata
    },
    { timestamps: true }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
