import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import crypto from 'crypto';
import Vendor from '../../../models/Vendor.model.js';
import VendorDocument from '../../../models/VendorDocument.model.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { sendOTP } from '../../../services/otp.service.js';
import { sendSmsOtp } from '../../../services/sms.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendEmail } from '../../../services/email.service.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { clearCachePattern } from '../../../utils/cache.js';
import { notifyWishlistUsersWhenVendorOnline } from '../../../services/vendorOnlineNotifier.service.js';

export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, storeName, storeDescription, address, shopLocation, gstNumber } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existing = await Vendor.findOne({ email: normalizedEmail });
    if (existing) throw new ApiError(409, 'Email already registered.');

    const cleanPhone = String(phone || '').trim();
    const existingPhone = await Vendor.findOne({ phone: cleanPhone });
    if (existingPhone) throw new ApiError(409, 'Phone number already registered.');

    const vendor = await Vendor.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        password,
        phone: String(phone || '').trim(),
        storeName: String(storeName || '').trim(),
        storeDescription: String(storeDescription || '').trim(),
        address,
        shopLocation,
        gstNumber,
        documents: {
            gst: req.file ? req.file.path || req.file.url : undefined
        },
        status: 'pending'
    });

    if (req.file) {
        await VendorDocument.create({
            vendorId: vendor._id,
            name: 'GST Document',
            category: 'Tax Document',
            fileUrl: req.file.path || req.file.url,
            filePublicId: req.file.filename || req.file.public_id || 'local-file',
            fileName: req.file.originalname || req.file.name || 'GST_Document',
            fileType: req.file.mimetype || 'application/pdf',
            fileSize: req.file.size || 0,
            status: 'pending'
        });
    }

    await sendOTP(vendor, 'vendor_verification');

    // Notify all active admins about a new vendor registration request.
    const admins = await Admin.find({ isActive: true }).select('_id');
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Vendor Registration',
                message: `${vendor.storeName || vendor.name} has registered and is awaiting review.`,
                type: 'system',
                data: {
                    vendorId: String(vendor._id),
                    vendorEmail: vendor.email,
                    status: vendor.status,
                },
            })
        )
    );

    res.status(201).json(new ApiResponse(201, { phone: vendor.phone }, 'Registration submitted. Please verify your phone number and await admin approval.'));
});

// POST /api/vendor/auth/verify-otp
export const verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    
    const query = phone ? { phone: String(phone).trim(), isVerified: false } : { email: String(req.body.email).trim().toLowerCase() };

    const vendor = await Vendor.findOne(query).sort({ createdAt: -1 }).select('+otp +otpExpiry');
    if (!vendor) throw new ApiError(404, 'Vendor not found or already verified.');
    
    const expectedOtp = String(vendor.otp || '').trim();
    const providedOtp = String(otp || '').trim();
    
    if (expectedOtp !== providedOtp) {
        throw new ApiError(400, 'Invalid OTP.');
    }
    
    if (!vendor.otpExpiry || new Date(vendor.otpExpiry).getTime() < Date.now()) {
        throw new ApiError(400, 'OTP has expired.');
    }

    vendor.isVerified = true;
    vendor.otp = undefined;
    vendor.otpExpiry = undefined;
    await vendor.save();

    res.status(200).json(new ApiResponse(200, null, 'Phone number verified. Awaiting admin approval.'));
});

// POST /api/vendor/auth/resend-otp
export const resendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const query = phone ? { phone: String(phone).trim(), isVerified: false } : { email: String(req.body.email).trim().toLowerCase() };
    
    if (!phone && !req.body.email) throw new ApiError(400, 'Phone number is required.');

    const vendor = await Vendor.findOne(query).sort({ createdAt: -1 });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (vendor.isVerified) throw new ApiError(400, 'Phone number is already verified.');

    await sendOTP(vendor, 'vendor_verification');
    res.status(200).json(new ApiResponse(200, null, 'OTP resent successfully. Please check your phone.'));
});

// POST /api/vendor/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    // Keep response generic to avoid account enumeration.
    if (!vendor) {
        return res.status(200).json(
            new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
        );
    }

    let otp = crypto.randomInt(100000, 999999).toString();

    vendor.resetOtp = otp;
    vendor.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    vendor.resetOtpVerified = false;
    await vendor.save({ validateBeforeSave: false });

    // Primary: SMS. Fallback: email.
    const phone = String(vendor.phone || '').replace(/\D/g, '').slice(-10);
    let smsSent = false;
    if (phone.length === 10) {
        try {
            await sendSmsOtp(phone, otp);
            smsSent = true;
        } catch (smsErr) {
            console.warn(`[Vendor ForgotPassword] SMS failed: ${smsErr.message}`);
        }
    }
    if (!smsSent) {
        try {
            await sendEmail({
                to: vendor.email,
                subject: 'Vendor password reset OTP',
                text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
                html: `<p>Your password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
            });
        } catch (emailErr) {
            console.warn(`[Vendor ForgotPassword] Email fallback failed: ${emailErr.message}`);
        }
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Vendor ForgotPassword] phone=+91${phone || 'N/A'} | email=${vendor.email || 'N/A'} | sms=${smsSent} | resetOtp=${otp}`);
    }

    return res.status(200).json(
        new ApiResponse(200, { phone: vendor.phone }, 'If the email exists, a reset OTP has been sent.')
    );
});

// POST /api/vendor/auth/verify-reset-otp
export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!vendor.resetOtp || !vendor.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (vendor.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (vendor.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    vendor.resetOtpVerified = true;
    await vendor.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

// POST /api/vendor/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!vendor.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!vendor.resetOtp || !vendor.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (vendor.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    vendor.password = password;
    vendor.resetOtp = undefined;
    vendor.resetOtpExpiry = undefined;
    vendor.resetOtpVerified = false;
    vendor.refreshTokenHash = undefined;
    vendor.refreshTokenExpiresAt = undefined;
    await vendor.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

// POST /api/vendor/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const vendor = await Vendor.findOne({ email }).select('+password');
    if (!vendor) throw new ApiError(401, 'Invalid credentials.');
    if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');
    if (vendor.status === 'pending') throw new ApiError(403, 'Your account is pending admin approval.');
    if (vendor.status === 'suspended') throw new ApiError(403, `Your account has been suspended. Reason: ${vendor.suspensionReason || 'Contact support.'}`);
    if (vendor.status === 'rejected') throw new ApiError(403, 'Your vendor application was rejected.');

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    // Instead of logging in directly, send OTP for 2FA
    await sendOTP(vendor, 'login_verification');

    res.status(200).json(new ApiResponse(200, {
        is2FA: true,
        email: vendor.email,
        phone: vendor.phone
    }, 'OTP sent to your registered contact. Please verify to login.'));
});

// POST /api/vendor/auth/verify-login-otp
export const verifyLoginOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+password +otp +otpExpiry');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const expectedOtp = String(vendor.otp || '').trim();
    const providedOtp = String(otp || '').trim();

    if (expectedOtp !== providedOtp) {
        throw new ApiError(400, 'Invalid OTP.');
    }

    if (!vendor.otpExpiry || new Date(vendor.otpExpiry).getTime() < Date.now()) {
        throw new ApiError(400, 'OTP has expired. Please login again.');
    }

    // Clear OTP
    vendor.otp = undefined;
    vendor.otpExpiry = undefined;
    await vendor.save({ validateBeforeSave: false });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({ id: vendor._id, role: 'vendor', email: vendor.email });
    await persistRefreshSession(vendor, refreshToken);

    // FCM Token Registration
    const fcmToken = req.body.fcmToken || req.body.deviceToken;
    if (fcmToken) {
        await Vendor.findByIdAndUpdate(vendor._id, {
            $pull: { fcmTokens: { token: fcmToken } }
        });
        await Vendor.findByIdAndUpdate(vendor._id, {
            $push: { 
                fcmTokens: { 
                    $each: [{ token: fcmToken, platform: 'web', lastUsed: new Date() }],
                    $slice: -10 
                } 
            }
        });
    }

    res.status(200).json(new ApiResponse(200, { 
        accessToken, 
        refreshToken, 
        vendor: { 
            id: vendor._id, 
            name: vendor.name, 
            storeName: vendor.storeName, 
            email: vendor.email, 
            storeLogo: vendor.storeLogo, 
            isOnline: vendor.isOnline 
        } 
    }, 'Login successful.'));
});

// POST /api/vendor/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const vendor = await Vendor.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt +refreshTokens status isVerified suspensionReason');

    if (!vendor) throw new ApiError(401, 'Invalid refresh token.');
    if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');
    if (vendor.status === 'pending') throw new ApiError(403, 'Your account is pending admin approval.');
    if (vendor.status === 'suspended') throw new ApiError(403, `Your account has been suspended. Reason: ${vendor.suspensionReason || 'Contact support.'}`);
    if (vendor.status === 'rejected') throw new ApiError(403, 'Your vendor application was rejected.');

    const tokens = await rotateRefreshSession(
        vendor,
        { id: vendor._id, role: 'vendor', email: vendor.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/vendor/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const vendor = await Vendor.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt +refreshTokens');
            if (vendor) {
                await clearRefreshSession(vendor, refreshToken);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/vendor/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id).select('-password -otp -otpExpiry');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, vendor, 'Profile fetched.'));
});

// PUT /api/vendor/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
    const allowed = [
        'name',
        'phone',
        'storeName',
        'storeDescription',
        'storeLogo',
        'address',
        'shopAddress',
        'shopLocation',
        'shippingEnabled',
        'freeShippingThreshold',
        'defaultShippingRate',
        'shippingMethods',
        'handlingTime',
        'processingTime',
        'isOnline',
        'currency',
        'timezone',
    ];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    if (updates.phone) {
        const cleanPhone = String(updates.phone).trim();
        const existingPhone = await Vendor.findOne({ phone: cleanPhone, _id: { $ne: req.user.id } });
        if (existingPhone) throw new ApiError(409, 'Phone number already registered by another vendor.');
        updates.phone = cleanPhone;
    }
    const vendor = await Vendor.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true }).select('-password -otp -otpExpiry');
    res.status(200).json(new ApiResponse(200, vendor, 'Profile updated.'));
});

// PUT /api/vendor/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new ApiError(400, 'Current and new password are required');
    }

    const vendor = await Vendor.findById(req.user.id).select('+password');
    if (!vendor) {
        throw new ApiError(404, 'Vendor not found');
    }

    const isMatch = await vendor.comparePassword(currentPassword);
    if (!isMatch) {
        throw new ApiError(400, 'Invalid current password');
    }

    vendor.password = newPassword;
    await vendor.save();

    res.status(200).json(new ApiResponse(200, null, 'Password changed successfully'));
});

// PUT /api/vendor/auth/bank-details
export const updateBankDetails = asyncHandler(async (req, res) => {
    const { accountName, accountNumber, bankName, ifscCode, upiId } = req.body;
    if (!accountName && !accountNumber && !bankName && !ifscCode && !upiId) {
        throw new ApiError(400, 'At least one bank detail field is required.');
    }

    const updates = {};
    if (accountName) updates['bankDetails.accountName'] = accountName;
    if (accountNumber) updates['bankDetails.accountNumber'] = accountNumber;
    if (bankName) updates['bankDetails.bankName'] = bankName;
    if (ifscCode) updates['bankDetails.ifscCode'] = ifscCode;
    if (upiId !== undefined) updates['bankDetails.upiId'] = upiId;

    const vendor = await Vendor.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -otp -otpExpiry');

    res.status(200).json(new ApiResponse(200, vendor, 'Bank details updated.'));
});

// PUT /api/vendor/auth/location
export const updateLocation = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
        throw new ApiError(400, 'Latitude and longitude are required.');
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new ApiError(400, 'Invalid latitude. Must be a number between -90 and 90.');
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
        throw new ApiError(400, 'Invalid longitude. Must be a number between -180 and 180.');
    }

    const vendor = await Vendor.findByIdAndUpdate(
        req.user.id,
        {
            $set: {
                'shopLocation.coordinates': [longitude, latitude],
                'shopLocation.type': 'Point'
            }
        },
        { new: true, runValidators: true }
    ).select('-password -otp -otpExpiry');

    res.status(200).json(new ApiResponse(200, vendor, 'Shop location updated successfully.'));
});

// PATCH /api/vendor/auth/online-status
export const updateOnlineStatus = asyncHandler(async (req, res) => {
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
        throw new ApiError(400, 'isOnline must be a boolean.');
    }

    const vendor = await Vendor.findByIdAndUpdate(
        req.user.id,
        { $set: { isOnline } },
        { new: true, runValidators: true }
    ).select('-password -otp -otpExpiry');

    await clearCachePattern('products:*');

    if (isOnline === true) {
        notifyWishlistUsersWhenVendorOnline(vendor._id, vendor.storeName).catch(err => {
            console.error('Failed to notify wishlist users:', err.message);
        });
    }

    res.status(200).json(new ApiResponse(200, vendor, `Store is now ${isOnline ? 'online' : 'offline'}.`));
});
