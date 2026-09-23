import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const vendorSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, index: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, required: true, unique: true, index: true, trim: true },
        storeName: { type: String, required: true },
        storeLogo: { type: String },
        storeDescription: { type: String },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended', 'rejected'],
            default: 'pending',
            index: true,
        },
        isOwner: { type: Boolean, default: false },
        isOnline: { type: Boolean, default: true },
        suspensionReason: { type: String },
        commissionRate: { type: Number, default: 10, min: 0, max: 100 },
        isVerified: { type: Boolean, default: false },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        pendingBalance: { type: Number, default: 0 },
        availableBalance: { type: Number, default: 0 },
        shippingEnabled: { type: Boolean, default: true },
        freeShippingThreshold: { type: Number, default: 100, min: 0 },
        defaultShippingRate: { type: Number, default: 5, min: 0 },
        shippingMethods: {
            type: [{ type: String, enum: ['standard', 'express', 'overnight'] }],
            default: ['standard'],
        },
        handlingTime: { type: Number, default: 1, min: 0 },
        processingTime: { type: Number, default: 1, min: 0 },
        timezone: { type: String, default: 'UTC' },
        currency: { type: String, default: 'INR' },
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: String,
        },
        gstNumber: { type: String, trim: true },
        shopAddress: { type: String, trim: true },
        shopLocation: {
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
        bankDetails: {
            accountName: { type: String },
            accountNumber: { type: String },
            bankName: { type: String },
            ifscCode: { type: String },
            upiId: { type: String },
        },
        documents: {
            gst: String,
            pan: String,
            aadhar: String,
            businessLicense: String,
        },
        otp: { type: String, select: false },
        otpExpiry: { type: Date, select: false },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        refreshTokens: {
            type: [
                {
                    hash: { type: String },
                    expiresAt: { type: Date },
                    createdAt: { type: Date, default: Date.now },
                },
            ],
            select: false,
        },
        joinDate: { type: Date, default: Date.now },
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
vendorSchema.pre('save', function (next) {
    if (this.fcmTokens) {
        if (!Array.isArray(this.fcmTokens)) {
            // If it was a string or something else, make it an empty array (or convert if possible)
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
vendorSchema.index({ shopLocation: '2dsphere' });

vendorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

vendorSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Vendor = mongoose.model('Vendor', vendorSchema);
export { Vendor };
export default Vendor;
