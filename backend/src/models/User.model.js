import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        email: { type: String, sparse: true, unique: true, lowercase: true, index: true },
        phone: { type: String, trim: true, sparse: true, unique: true },
        password: { type: String, required: false, select: false },
        dob: { type: String, trim: true },
        gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
        ageRange: { type: String, trim: true },
        stylePreference: { type: String, trim: true },
        preferredFit: { type: String, trim: true },
        avatar: { type: String }, // Cloudinary URL
        role: { type: String, enum: ['customer', 'delivery'], default: 'customer' },
        isVerified: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
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
        passwordResetToken: { type: String, select: false },
        passwordResetExpiry: { type: Date, select: false },
        fcmTokens: [
            {
                token: { type: String },
                platform: { type: String, enum: ['web', 'app', 'android', 'ios'], default: 'web' },
                deviceName: String,
                lastUsed: { type: Date, default: Date.now },
            },
        ],
        // Service area preference
        preferredLocation: {
            serviceAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceArea' },
            pincode: String,
            city: String,
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: null
            },
            lastUpdated: { type: Date, default: Date.now }
        },
    },
    { timestamps: true }
);

// Auto-migrate old string tokens to object format
userSchema.pre('save', function (next) {
    if (this.fcmTokens && this.fcmTokens.length > 0) {
        this.fcmTokens = this.fcmTokens.map(tokenItem => {
            if (typeof tokenItem === 'string') {
                return { token: tokenItem, platform: 'web', lastUsed: new Date() };
            }
            return tokenItem;
        });
    }
    next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.password || !this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export { User };
export default User;
