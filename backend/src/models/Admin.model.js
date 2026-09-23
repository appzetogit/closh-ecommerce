import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true, select: false },
        role: { type: String, default: 'employee' },
        permissions: [{ type: String }], // List of permissions for employees/admins
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        avatar: { type: String },
        documents: [{ type: String }],
        isActive: { type: Boolean, default: true },
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
adminSchema.pre('save', function (next) {
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

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);
export { Admin };
export default Admin;
