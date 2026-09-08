import mongoose from 'mongoose';

const vendorDropoffSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: String,
    shopLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
    },
    shopAddress: String,
    vendorPhone: String,
    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            name: String,
            image: String,
            price: Number,
            quantity: Number,
            variant: mongoose.Schema.Types.Mixed,
            selectedSize: String,
        }
    ],
    status: {
        type: String,
        enum: ['pending', 'arrived', 'dropped_off'],
        default: 'pending',
    },
    dropoffOtpHash: { type: String },
    dropoffOtpDebug: { type: String },
    proofPhoto: String,
    droppedOffAt: Date,
}, { _id: false });

const returnRequestSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        returnId: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        isMultiVendor: { type: Boolean, default: false },
        vendorDropoffs: [vendorDropoffSchema],
        trySessionActive: { type: Boolean, default: false },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                name: String,
                image: String,
                price: Number,
                quantity: Number,
                reason: String,
                variant: mongoose.Schema.Types.Mixed,
                selectedSize: String,
            },
        ],
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: ['pending', 'approved', 'processing', 'rejected', 'completed'],
            default: 'pending',
            index: true,
        },
        refundAmount: Number,
        refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
        refundId: String,
        refundNotes: String,
        adminNote: String,
        rejectionReason: String,
        images: [String],
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        originalDeliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        pickupLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] },
        },
        dropoffLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] },
        },
        pickupPhoto: String,
        deliveryPhoto: String,
        upiId: String,
        isUpiRequested: { type: Boolean, default: false },
        pickupOtpHash: { type: String },
        pickupOtpDebug: { type: String },
        pickupOtpExpiry: { type: Date },
        deliveryOtpHash: { type: String },
        deliveryOtpDebug: { type: String },
        deliveryOtpExpiry: { type: Date },
        deliveryDistance: { type: Number, default: 0 },
        deliveryEarnings: { type: Number, default: 0 },
    },
    { timestamps: true }
);

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export { ReturnRequest };
export default ReturnRequest;
