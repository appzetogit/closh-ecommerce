import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deliveryBoySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, required: true, unique: true, trim: true },
        emergencyContact: { type: String, trim: true },
        aadharNumber: { type: String, trim: true },
        address: { type: String, trim: true },
        vehicleType: { type: String, trim: true },
        vehicleNumber: { 
            type: String, 
            trim: true, 
            unique: true, 
            sparse: true,
            validate: {
                validator: function(v) {
                    if (!v) return true; // Allow empty if not required
                    // Standard Indian vehicle number format: MH12AB1234
                    return /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/.test(v.replace(/[-\s]/g, '').toUpperCase());
                },
                message: props => `${props.value} is not a valid vehicle number!`
            }
        },
        avatar: { type: String },
        applicationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        rejectionReason: { type: String, trim: true },
        documents: {
            drivingLicense: { type: String, trim: true },
            drivingLicenseBack: { type: String, trim: true },
            aadharCard: { type: String, trim: true },
            aadharCardBack: { type: String, trim: true },
        },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        isActive: { type: Boolean, default: true },
        isAvailable: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['available', 'busy', 'offline'],
            default: 'offline',
        },
        currentLocation: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point',
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: [0, 0],
            },
        },
        totalDeliveries: { type: Number, default: 0 },
        // Drives fair rotation in autoAssignment.service.js — without it, the nearest
        // available rider wins every single order forever, since distance alone never
        // changes between two riders parked at the same spot.
        lastAssignedAt: { type: Date, default: null },
        rating: { type: Number, default: 0 },
        cashInHand: { type: Number, default: 0 },
        cashCollected: { type: Number, default: 0 }, // keeping for compatibility, will update logic to sync both
        totalEarnings: { type: Number, default: 0 },
        availableBalance: { type: Number, default: 0 },
        bankDetails: {
            accountHolderName: { 
                type: String, 
                trim: true
            },
            accountNumber: { 
                type: String, 
                trim: true
            },
            ifscCode: { 
                type: String, 
                trim: true
            },
            bankName: { 
                type: String, 
                trim: true
            },
        },
        upiId: { type: String, trim: true },
        kycStatus: {
            type: String,
            enum: ['none', 'pending', 'verified', 'rejected'],
            default: 'none',
        },
        kycRejectionReason: { type: String, trim: true },
        fcmTokens: [
            {
                token: { type: String },
                platform: { type: String, enum: ['web', 'app', 'android', 'ios'], default: 'web' },
                deviceName: String,
                lastUsed: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

// Auto-migrate old string tokens to object format
deliveryBoySchema.pre('save', function (next) {
    if (this.fcmTokens) {
        if (!Array.isArray(this.fcmTokens)) {
            const oldVal = this.fcmTokens;
            this.fcmTokens = [];
            if (typeof oldVal === 'string' && oldVal.trim()) {
                this.fcmTokens.push({ token: oldVal, platform: 'web', lastUsed: new Date() });
            }
        }
        
        this.fcmTokens = this.fcmTokens.map(tokenItem => {
            if (typeof tokenItem === 'string') {
                return { token: tokenItem, platform: 'web', lastUsed: new Date() };
            }
            return tokenItem;
        }).filter(t => t && t.token); // Remove invalid entries
    }
    next();
});

deliveryBoySchema.index({ currentLocation: '2dsphere' });

deliveryBoySchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

deliveryBoySchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const DeliveryBoy = mongoose.model('DeliveryBoy', deliveryBoySchema);
export default DeliveryBoy;
