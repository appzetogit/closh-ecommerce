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
            // The exact stockMap key that was decremented at order time (e.g.
            // "size=m|color=red") - needed to restock the same variant bucket
            // instead of just the flat stockQuantity. See utils/orderVariant.js.
            variantKey: String,
            hasSpecificVariantStock: { type: Boolean, default: false },
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
    // Atomic idempotency claim - restock this vendor's items exactly once.
    // Set via ReturnRequest.updateOne with a $exists:false guard, never via a
    // plain in-memory status check, so two concurrent requests can't both win.
    restockedAt: Date,
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
        // Created automatically when a customer rejects items at the door (Try & Buy).
        // Those items were never part of what the vendor got paid for, so closing this
        // request must not reverse vendor earnings, restock a second time or change the
        // order's overall status. See utils/tryBuyReturn.js.
        isTryBuyAutoReturn: { type: Boolean, default: false },
        // Claimed atomically when the rider's return-trip fee is credited, so the several
        // paths that can complete a return (rider, vendor, admin) pay it only once.
        riderCreditedAt: { type: Date },
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
                variantKey: String,
                hasSpecificVariantStock: { type: Boolean, default: false },
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
        // Atomic idempotency claim for the single-vendor restock path - same
        // purpose as vendorDropoffSchema.restockedAt above.
        restockedAt: Date,
    },
    { timestamps: true }
);

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export { ReturnRequest };
export default ReturnRequest;
