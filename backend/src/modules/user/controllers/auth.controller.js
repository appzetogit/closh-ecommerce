import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import crypto from 'crypto';
import User from '../../../models/User.model.js';
import Address from '../../../models/Address.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { sendOTP } from '../../../services/otp.service.js';
import { sendSmsOtp } from '../../../services/sms.service.js';
import { sendEmail } from '../../../services/email.service.js';
import {
    uploadLocalFileToCloudinaryAndCleanup,
    deleteFromCloudinary,
    cleanupLocalFiles,
} from '../../../services/upload.service.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';

const extractCloudinaryPublicId = (url = '') => {
    const raw = String(url || '').trim();
    if (!raw) return null;
    // Locally-stored uploads (see upload.service.js) — no Cloudinary /upload/v.../ segment.
    const localMatch = raw.match(/\/uploads\/(.+)\.[a-zA-Z0-9]+$/);
    if (localMatch) return localMatch[1];
    if (!raw.includes('/upload/')) return null;
    try {
        const afterUpload = raw.split('/upload/')[1] || '';
        const withoutTransform = afterUpload.includes('/') ? afterUpload.substring(afterUpload.indexOf('/') + 1) : afterUpload;
        const cleaned = withoutTransform.replace(/^v\d+\//, '');
        const withoutExtension = cleaned.replace(/\.[^/.]+$/, '');
        return withoutExtension || null;
    } catch {
        return null;
    }
};

// POST /api/user/auth/register
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, address: addressData, fcmToken, platform = 'app' } = req.body;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
    const normalizedPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : undefined;

    if (!normalizedEmail && !normalizedPhone) {
        throw new ApiError(400, 'Either email or phone number is required.');
    }

    const query = [];
    if (normalizedEmail) query.push({ email: normalizedEmail });
    if (normalizedPhone) query.push({ phone: normalizedPhone });

    const existing = await User.findOne({ $or: query });
    if (existing) {
        const field = existing.email === normalizedEmail ? 'Email' : 'Phone number';
        throw new ApiError(409, `${field} already registered.`);
    }

    const user = await User.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        ...(password ? { password } : {}), // Password is optional now
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    });

    if (addressData) {
        await Address.create({
            userId: user._id,
            name: 'Home',
            fullName: user.name,
            phone: user.phone || normalizedPhone,
            address: addressData.street || addressData.address,
            city: addressData.city,
            state: addressData.state,
            zipCode: addressData.zipCode || addressData.pincode,
            country: 'India',
            isDefault: true
        });
    }

    await sendOTP(user, 'email_verification');

    res.status(201).json(new ApiResponse(201, { email: user.email }, 'Registration successful. Please verify your email.'));
});

// POST /api/user/auth/verify-otp
export const verifyOTP = asyncHandler(async (req, res) => {
    const { email: identifier, otp, fcmToken, platform = 'app' } = req.body;
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    console.log(`[VerifyOTP] Login request: ${normalizedIdentifier}, OTP: ${otp}`);
    const user = await User.findOne({
        $or: [
            { email: normalizedIdentifier },
            { phone: normalizedIdentifier }
        ]
    }).sort({ createdAt: -1 }).select('+otp +otpExpiry +isVerified +isActive');

    if (!user) {
        console.warn(`[VerifyOTP] User not found: ${normalizedIdentifier}`);
        throw new ApiError(404, 'User not found.');
    }
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');

    const expectedOtp = String(user.otp || '').trim();
    const providedOtp = String(otp || '').trim();

    if (expectedOtp !== providedOtp) {
        console.warn(`[VerifyOTP] Invalid OTP for ${normalizedIdentifier}. Expected: ${expectedOtp}, Received: ${providedOtp}`);
        throw new ApiError(400, 'Invalid OTP.');
    }

    if (!user.otpExpiry || new Date(user.otpExpiry).getTime() < Date.now()) {
        console.warn(`[VerifyOTP] OTP expired for ${normalizedIdentifier}`);
        throw new ApiError(400, 'OTP has expired. Please request a new one.');
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;

    if (fcmToken) {
        await User.findByIdAndUpdate(user._id, {
            $pull: { fcmTokens: { token: fcmToken } }
        });
        await User.findByIdAndUpdate(user._id, {
            $push: {
                fcmTokens: {
                    $each: [{ token: fcmToken, platform, lastUsed: new Date() }],
                    $slice: -10
                }
            }
        });
    }

    await user.save();

    const { accessToken, refreshToken } = generateTokens({ id: user._id, role: 'customer', email: user.email });
    await persistRefreshSession(user, refreshToken);

    // Return the user object (excluding sensitive fields)
    const userToReturn = user.toObject();
    delete userToReturn.password;
    delete userToReturn.otp;
    delete userToReturn.otpExpiry;
    delete userToReturn.refreshTokenHash;
    delete userToReturn.refreshTokenExpiresAt;

    res.status(200).json(new ApiResponse(200, {
        accessToken,
        refreshToken,
        user: {
            id: user._id,
            ...userToReturn
        }
    }, 'Email verified successfully.'));
});

// POST /api/user/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email: identifierInput, password, fcmToken, platform = 'app' } = req.body;
    const identifier = String(identifierInput || '').trim().toLowerCase();

    const user = await User.findOne({
        $or: [
            { email: identifier },
            { phone: identifier }
        ]
    }).select('+password +isActive +isVerified email');
    if (!user) throw new ApiError(401, 'Invalid email or password.');
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');
    if (!user.isVerified) {
        await sendOTP(user, 'email_verification');
        throw new ApiError(403, 'Email not verified. A new OTP has been sent to your email.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid email or password.');

    if (fcmToken) {
        await User.findByIdAndUpdate(user._id, {
            $pull: { fcmTokens: { token: fcmToken } }
        });
        await User.findByIdAndUpdate(user._id, {
            $push: {
                fcmTokens: {
                    $each: [{ token: fcmToken, platform, lastUsed: new Date() }],
                    $slice: -10
                }
            }
        });
    }

    const { accessToken, refreshToken } = generateTokens({ id: user._id, role: 'customer', email: user.email });
    await persistRefreshSession(user, refreshToken);

    const userToReturn = user.toObject();
    delete userToReturn.password;

    res.status(200).json(new ApiResponse(200, {
        accessToken,
        refreshToken,
        user: {
            id: user._id,
            ...userToReturn
        }
    }, 'Login successful.'));
});

// POST /api/user/auth/check-phone
export const checkPhone = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const user = await User.findOne({ phone: normalizedPhone });
    res.status(200).json(new ApiResponse(200, { exists: !!user, email: user ? user.email : null }, 'Phone check result.'));
});

// POST /api/user/auth/login-otp
export const loginOtp = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) throw new ApiError(404, 'User not found with this mobile number.');
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');

    await sendOTP(user, 'login_verification');
    res.status(200).json(new ApiResponse(200, { email: user.email }, 'OTP sent successfully.'));
});

// POST /api/user/auth/register-otp
export const registerOtp = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) throw new ApiError(409, 'Email already registered.');

    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) throw new ApiError(409, 'Phone number already registered.');

    const user = await User.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
    });

    await sendOTP(user, 'email_verification');
    res.status(201).json(new ApiResponse(201, { email: user.email }, 'Registration successful. OTP sent.'));
});

// POST /api/user/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const user = await User.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt isActive isVerified');

    if (!user) throw new ApiError(401, 'Invalid refresh token.');
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');
    if (!user.isVerified) throw new ApiError(403, 'Please verify your email first.');

    const tokens = await rotateRefreshSession(
        user,
        { id: user._id, role: 'customer', email: user.email },
        refreshToken
    );

    return res.status(200).json(
        new ApiResponse(200, tokens, 'Session refreshed successfully.')
    );
});

// POST /api/user/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const user = await User.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (user?.refreshTokenHash) {
                await clearRefreshSession(user);
            }
        } catch {
            // Keep logout idempotent.
        }
    }
    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// POST /api/user/auth/resend-otp
export const resendOTP = asyncHandler(async (req, res) => {
    const { email: identifier } = req.body;
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();

    const user = await User.findOne({
        $or: [
            { email: normalizedIdentifier },
            { phone: normalizedIdentifier }
        ],
        isVerified: false
    }).sort({ createdAt: -1 });
    if (!user) throw new ApiError(404, 'User not found.');

    await sendOTP(user, 'otp_request');
    return res.status(200).json(new ApiResponse(200, null, 'OTP sent successfully.'));
});

// POST /api/user/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    // Generic response to avoid account enumeration.
    if (!user) {
        return res.status(200).json(new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.'));
    }
    if (!user.isVerified) {
        await sendOTP(user, 'email_verification');
        throw new ApiError(403, 'Please verify your email first. A new verification OTP has been sent.');
    }

    let otp = crypto.randomInt(100000, 999999).toString();

    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.resetOtpVerified = false;
    await user.save({ validateBeforeSave: false });

    // Primary: SMS. Fallback: email.
    const phone = String(user.phone || '').replace(/\D/g, '').slice(-10);
    let smsSent = false;
    if (phone.length === 10) {
        try {
            await sendSmsOtp(phone, otp);
            smsSent = true;
        } catch (smsErr) {
            console.warn(`[User ForgotPassword] SMS failed: ${smsErr.message}`);
        }
    }
    if (!smsSent) {
        try {
            await sendEmail({
                to: user.email,
                subject: 'Password reset OTP',
                text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
                html: `<p>Your password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
            });
        } catch (emailErr) {
            console.warn(`[User ForgotPassword] Email fallback failed: ${emailErr.message}`);
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.'));
});

// POST /api/user/auth/verify-reset-otp
export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!user) throw new ApiError(404, 'User not found.');
    if (!user.resetOtp || !user.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (user.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (user.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    user.resetOtpVerified = true;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

// POST /api/user/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!user) throw new ApiError(404, 'User not found.');
    if (!user.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!user.resetOtp || !user.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (user.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    user.password = password;
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    user.resetOtpVerified = false;
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

// GET /api/user/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new ApiError(404, 'User not found.');
    res.status(200).json(new ApiResponse(200, user, 'Profile fetched.'));
});

// PUT /api/user/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
    const { name, firstName, lastName, phone, dob, gender, ageRange, stylePreference, preferredFit, email } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);

    const updatePayload = {
        name: normalizedName,
        firstName,
        lastName,
        phone: normalizedPhone || undefined,
        dob,
        gender,
        ageRange,
        stylePreference,
        preferredFit
    };

    if (email) {
        updatePayload.email = String(email).trim().toLowerCase();
    }

    const user = await User.findByIdAndUpdate(
        req.user.id,
        updatePayload,
        { new: true, runValidators: true }
    );
    if (!user) throw new ApiError(404, 'User not found.');
    res.status(200).json(new ApiResponse(200, user, 'Profile updated.'));
});

// POST /api/user/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new ApiError(400, 'Current password and new password are required.');
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) throw new ApiError(404, 'User not found.');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new ApiError(400, 'Current password is incorrect.');
    if (String(currentPassword) === String(newPassword)) {
        throw new ApiError(400, 'New password must be different from current password.');
    }
    if (String(newPassword).length < 6) {
        throw new ApiError(400, 'New password must be at least 6 characters.');
    }

    user.password = newPassword;
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();

    res.status(200).json(new ApiResponse(200, null, 'Password changed successfully.'));
});

// POST /api/user/auth/profile/avatar
export const uploadProfileAvatar = asyncHandler(async (req, res) => {
    if (!req.file?.path) {
        throw new ApiError(400, 'Avatar image file is required.');
    }

    let uploaded = null;
    try {
        uploaded = await uploadLocalFileToCloudinaryAndCleanup(
            req.file.path,
            'users/avatars'
        );

        const existingUser = await User.findById(req.user.id).select('avatar');
        if (!existingUser) throw new ApiError(404, 'User not found.');
        const previousAvatar = String(existingUser.avatar || '').trim();

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { avatar: uploaded.url },
            { new: true, runValidators: true }
        );
        if (!user) throw new ApiError(404, 'User not found.');

        const previousPublicId = extractCloudinaryPublicId(previousAvatar);
        if (previousPublicId && previousPublicId !== uploaded.publicId) {
            await deleteFromCloudinary(previousPublicId).catch(() => null);
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                { user, avatar: uploaded.url, publicId: uploaded.publicId },
                'Profile picture updated successfully.'
            )
        );
    } catch (error) {
        if (!uploaded) {
            await cleanupLocalFiles([req.file?.path]);
        }
        if (uploaded?.publicId) {
            await deleteFromCloudinary(uploaded.publicId).catch(() => null);
        }
        throw error;
    }
});
// DELETE /api/user/auth/profile
export const deleteAccount = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('avatar');
    if (!user) throw new ApiError(404, 'User not found.');

    // Cleanup avatar if exists on Cloudinary
    const publicId = extractCloudinaryPublicId(user.avatar);
    if (publicId) {
        await deleteFromCloudinary(publicId).catch((err) => {
            console.error(`[DeleteAccount] Cloudinary cleanup failed for ${publicId}:`, err.message);
        });
    }

    // Delete associated addresses
    await Address.deleteMany({ userId: user._id });

    // Delete the user record
    await User.findByIdAndDelete(user._id);

    res.status(200).json(new ApiResponse(200, null, 'Account deleted successfully.'));
});
