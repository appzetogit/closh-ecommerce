import mongoose from 'mongoose';

const DeliveryBatchSchema = new mongoose.Schema({
  batchId: { type: String, unique: true, required: true },
  deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Without this, code that needs "the active batch for this order" had to guess by
  // matching customerId + status alone — which silently grabs a DIFFERENT active batch
  // when the same customer has two orders in flight at once, mutating and notifying the
  // wrong trip/rider entirely. orderId lets that lookup actually be scoped correctly.
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  
  deliveries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' }],
  
  status: {
    type: String,
    enum: ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'try_and_buy', 'payment_pending', 'delivered', 'cancelled'],
    default: 'assigned'
  },
  
  customerLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' } // [lng, lat]
  },
  customerAddress: { type: Object },
  customerPhone: { type: String },
  customerName: { type: String },
  
  // Realtime Delivery Auth
  deliveryOtp: { type: String },
  deliveryOtpHash: { type: String },
  deliveryOtpExpiry: { type: Date },
  deliveryOtpSentAt: { type: Date },
  deliveryOtpAttempts: { type: Number, default: 0 },
  deliveryOtpDebug: { type: String },

  // ── Multi-Vendor Pickup Support ──
  isMultiVendor: { type: Boolean, default: false },
  currentStopIndex: { type: Number, default: 0 },
  pickupStops: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: String,
    shopAddress: String,
    vendorPhone: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    sequence: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'arrived', 'otp_verified', 'picked_up', 'cancelled'],
      default: 'pending',
    },
    arrivedAt: Date,
    pickedUpAt: Date,
    otpVerified: { type: Boolean, default: false },
    proofPhoto: String,
    vendorReadinessStatus: { type: String, default: 'pending' },
  }]
}, { timestamps: true });

const DeliveryBatch = mongoose.model('DeliveryBatch', DeliveryBatchSchema);
export default DeliveryBatch;
