import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendEmail } from '../../../services/email.service.js';
import { cleanupLocalFiles, uploadLocalFileToCloudinaryAndCleanup, deleteFromCloudinary } from '../../../services/upload.service.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import { cacheInvalidate } from './order.controller.js';
import { assertRiderIsFree } from '../../../services/deliveryAvailability.service.js';

// In-memory store for registration OTPs (phone -> { otp, expiry, verified })
const registrationOtpStore = new Map();

// Cleanup expired OTPs every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of registrationOtpStore) {
        if (val.expiry < now) registrationOtpStore.delete(key);
    }
}, 10 * 60 * 1000);

// POST /api/delivery/auth/register
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, emergencyContact, aadharNumber, address, vehicleType, vehicleNumber, fcmToken, platform = 'app',
        bankName, accountNumber, ifscCode, accountHolderName
    } = req.body;

    const drivingLicenseFile = req.files?.drivingLicense?.[0];
    const drivingLicenseBackFile = req.files?.drivingLicenseBack?.[0];
    const aadharCardFile = req.files?.aadharCard?.[0];
    const aadharCardBackFile = req.files?.aadharCardBack?.[0];

    if (!drivingLicenseFile || !drivingLicenseBackFile || !aadharCardFile || !aadharCardBackFile) {
        throw new ApiError(400, 'All document images (Driving License Front/Back and Aadhar Card Front/Back) are required.');
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);
    let deliveryBoy = null;

    try {
        const normalizedVehicle = (vehicleNumber || '').trim().toUpperCase();

        const existingEmail = await DeliveryBoy.findOne({ email: normalizedEmail });
        if (existingEmail) throw new ApiError(409, 'This email address is already registered.');

        const existingPhone = await DeliveryBoy.findOne({ phone: normalizedPhone });
        if (existingPhone) throw new ApiError(409, 'This mobile number is already registered.');

        if (normalizedVehicle) {
            const existingVehicle = await DeliveryBoy.findOne({ vehicleNumber: normalizedVehicle });
            if (existingVehicle) throw new ApiError(409, 'This vehicle number is already registered.');
        }

        if (!isRegistrationPhoneVerified(phone)) {
            throw new ApiError(400, 'Please verify your mobile number via OTP first.');
        }

        const [
            drivingLicenseResult,
            drivingLicenseBackResult,
            aadharCardResult,
            aadharCardBackResult
        ] = await Promise.all([
            uploadLocalFileToCloudinaryAndCleanup(drivingLicenseFile.path, 'delivery/documents/licenses'),
            uploadLocalFileToCloudinaryAndCleanup(drivingLicenseBackFile.path, 'delivery/documents/licenses'),
            uploadLocalFileToCloudinaryAndCleanup(aadharCardFile.path, 'delivery/documents/aadhar'),
            uploadLocalFileToCloudinaryAndCleanup(aadharCardBackFile.path, 'delivery/documents/aadhar'),
        ]);

        deliveryBoy = await DeliveryBoy.create({
            name: String(name || '').trim(),
            email: normalizedEmail,
            password: password || String(Math.random().toString(36).slice(-10)),
            phone: normalizedPhone,
            emergencyContact: String(emergencyContact || '').trim(),
            aadharNumber: String(aadharNumber || '').trim(),
            address: String(address || '').trim(),
            vehicleType: String(vehicleType || '').trim(),
            vehicleNumber: normalizedVehicle,
            documents: {
                drivingLicense: drivingLicenseResult.url,
                drivingLicenseBack: drivingLicenseBackResult.url,
                aadharCard: aadharCardResult.url,
                aadharCardBack: aadharCardBackResult.url,
            },
            bankDetails: {
                bankName: String(bankName || '').trim(),
                accountNumber: String(accountNumber || '').trim(),
                ifscCode: String(ifscCode || '').trim().toUpperCase(),
                accountHolderName: String(accountHolderName || '').trim(),
            },
            applicationStatus: 'pending',
            isActive: false,
            isAvailable: false,
            status: 'offline',
            fcmTokens: fcmToken ? [{ token: fcmToken, platform, lastUsed: new Date() }] : []
        });

        const admins = await Admin.find({ isActive: true }).select('_id');
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'New Delivery Registration',
                    message: `${deliveryBoy.name} has registered as delivery partner and is awaiting approval.`,
                    type: 'system',
                    data: {
                        deliveryBoyId: String(deliveryBoy._id),
                        deliveryEmail: deliveryBoy.email,
                        applicationStatus: deliveryBoy.applicationStatus,
                    },
                })
            )
        );

        // Real-time notification to admin delivery room
        emitEvent('admin_delivery', 'new_delivery_boy', {
            id: String(deliveryBoy._id),
            name: deliveryBoy.name,
            email: deliveryBoy.email
        });

        clearRegistrationOtp(phone);

        res.status(201).json(
            new ApiResponse(201, { email: deliveryBoy.email }, 'Registration submitted. Awaiting admin approval.')
        );
    } catch (error) {
        const shouldCleanupLocalDocs = !deliveryBoy;
        if (shouldCleanupLocalDocs) {
            await cleanupLocalFiles([
                drivingLicenseFile?.path,
                drivingLicenseBackFile?.path,
                aadharCardFile?.path,
                aadharCardBackFile?.path,
            ]);
        }
        throw error;
    }
});

// POST /api/delivery/auth/check-availability
export const checkAvailability = asyncHandler(async (req, res) => {
    const { vehicleNumber } = req.body;

    if (vehicleNumber) {
        const normalizedVehicle = String(vehicleNumber).trim().toUpperCase();
        const existingVehicle = await DeliveryBoy.findOne({ vehicleNumber: normalizedVehicle });
        if (existingVehicle) {
            throw new ApiError(409, 'This vehicle number is already registered.');
        }
    }

    res.status(200).json(new ApiResponse(200, { available: true }, 'Available'));
});

// POST /api/delivery/auth/send-registration-otp
export const sendRegistrationOTP = asyncHandler(async (req, res) => {
    const { phone, email } = req.body;
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (normalizedPhone.length !== 10) {
        throw new ApiError(400, 'Please enter a valid 10-digit mobile number');
    }

    // Check if phone is already registered
    const existingPhone = await DeliveryBoy.findOne({ phone: normalizedPhone });
    if (existingPhone) {
        throw new ApiError(409, 'This mobile number is already registered. Please login instead.');
    }

    // If email is provided, check if it's already registered
    if (normalizedEmail) {
        const existingEmail = await DeliveryBoy.findOne({ email: normalizedEmail });
        if (existingEmail) {
            throw new ApiError(409, 'This email address is already registered. Please login instead.');
        }
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Default OTP for test number
    const testNumbers = ['7894561230', '1234567890', '7879363299', '8817921168'];
    const finalOtp = testNumbers.includes(normalizedPhone) ? '123456' : otp;

    registrationOtpStore.set(normalizedPhone, { otp: finalOtp, expiry, verified: false });

    // Send OTP via SMS and Email
    const results = { sms: false, email: false };

    try {
        if (!testNumbers.includes(normalizedPhone)) {
            const { sendSmsOtp } = await import('../../../services/sms.service.js');
            await sendSmsOtp(normalizedPhone, finalOtp);
            results.sms = true;
        }
        console.log(`✅ Registration OTP sent to ${normalizedPhone}: ${finalOtp}`);
    } catch (smsError) {
        console.warn(`⚠️ SMS failed for ${normalizedPhone}:`, smsError.message);
    }

    if (normalizedEmail) {
        try {
            await sendEmail({
                to: normalizedEmail,
                subject: 'Delivery Partner Registration OTP',
                text: `Your registration OTP for CLOSH is ${finalOtp}. It expires in 5 minutes.`,
                html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                        <h2 style="color: #4F46E5;">CLOSH</h2>
                        <p>Welcome to the CLOSH delivery network!</p>
                        <p>Your registration verification code is:</p>
                        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; margin: 20px 0;">${finalOtp}</div>
                        <p style="color: #64748b; font-size: 12px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
                       </div>`,
            });
            results.email = true;
            console.log(`✅ Registration OTP sent to email ${normalizedEmail}: ${finalOtp}`);
        } catch (emailError) {
            console.warn(`⚠️ Email failed for ${normalizedEmail}:`, emailError.message);
        }
    }

    res.status(200).json(
        new ApiResponse(200, { phone: normalizedPhone, email: normalizedEmail, status: results }, 'OTP sent successfully. Valid for 5 minutes.')
    );
});

// POST /api/delivery/auth/verify-registration-otp
export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);

    if (normalizedPhone.length !== 10) {
        throw new ApiError(400, 'Invalid mobile number');
    }

    const stored = registrationOtpStore.get(normalizedPhone);
    if (!stored) {
        throw new ApiError(400, 'No OTP requested. Please request OTP first.');
    }
    if (stored.expiry < Date.now()) {
        registrationOtpStore.delete(normalizedPhone);
        throw new ApiError(400, 'OTP has expired. Please request a new one.');
    }
    if (stored.otp !== String(otp)) {
        throw new ApiError(401, 'Invalid OTP. Please try again.');
    }

    // Mark as verified
    stored.verified = true;
    registrationOtpStore.set(normalizedPhone, stored);

    res.status(200).json(
        new ApiResponse(200, { phone: normalizedPhone, verified: true }, 'Mobile number verified successfully.')
    );
});

// Helper to check if registration OTP was verified (used in register)
export const isRegistrationPhoneVerified = (phone) => {
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);
    const stored = registrationOtpStore.get(normalizedPhone);
    return stored?.verified === true;
};

// Helper to clear registration OTP after successful registration
export const clearRegistrationOtp = (phone) => {
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);
    registrationOtpStore.delete(normalizedPhone);
};

// POST /api/delivery/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    // Generic response to prevent account enumeration
    if (!deliveryBoy) {
        return res.status(200).json(
            new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
        );
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    deliveryBoy.resetOtp = otp;
    deliveryBoy.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    deliveryBoy.resetOtpVerified = false;
    await deliveryBoy.save({ validateBeforeSave: false });

    try {
        await sendEmail({
            to: deliveryBoy.email,
            subject: 'Delivery password reset OTP',
            text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
            html: `<p>Your password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
        });
    } catch (err) {
        console.warn(`[Delivery Forgot Password] Email send failed for ${deliveryBoy.email}: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Delivery Forgot Password] Reset OTP generated for ${deliveryBoy.email}`);
        }
    }

    return res.status(200).json(
        new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
    );
});

// POST /api/delivery/auth/verify-reset-otp
export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery user not found.');
    if (!deliveryBoy.resetOtp || !deliveryBoy.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (deliveryBoy.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (deliveryBoy.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    deliveryBoy.resetOtpVerified = true;
    await deliveryBoy.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

// POST /api/delivery/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery user not found.');
    if (!deliveryBoy.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!deliveryBoy.resetOtp || !deliveryBoy.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (deliveryBoy.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    deliveryBoy.password = password;
    deliveryBoy.resetOtp = undefined;
    deliveryBoy.resetOtpExpiry = undefined;
    deliveryBoy.resetOtpVerified = false;
    deliveryBoy.refreshTokenHash = undefined;
    deliveryBoy.refreshTokenExpiresAt = undefined;
    await deliveryBoy.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

// POST /api/delivery/auth/send-otp - Send OTP to mobile number
export const sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);
    
    if (normalizedPhone.length !== 10) {
        throw new ApiError(400, 'Please enter a valid 10-digit mobile number');
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone: normalizedPhone }).select('+resetOtp +resetOtpExpiry');
    if (!deliveryBoy) {
        throw new ApiError(404, 'No account found with this mobile number. Please register first.');
    }

    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) {
        throw new ApiError(403, 'Your account has been deactivated. Please contact support.');
    }

    // Generate 6-digit OTP
    const testNumbers = ['7894561230', '1234567890', '7879363299', '8817921168'];
    const otp = testNumbers.includes(normalizedPhone) ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    
    deliveryBoy.resetOtp = otp;
    deliveryBoy.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for easier testing
    deliveryBoy.resetOtpVerified = false;
    await deliveryBoy.save({ validateBeforeSave: false });

    // Send OTP via SMS
    try {
        if (testNumbers.includes(normalizedPhone)) {
            console.log(`🔐 [Static Bypass] OTP for ${normalizedPhone}: ${otp}`);
        } else {
            const { sendSmsOtp } = await import('../../../services/sms.service.js');
            await sendSmsOtp(normalizedPhone, otp);
            console.log(`✅ OTP sent to ${normalizedPhone}: ${otp}`);
        }
    } catch (smsError) {
        console.warn(`⚠️ SMS failed for ${normalizedPhone}:`, smsError.message);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔐 OTP for ${normalizedPhone}: ${otp}`);
        }
    }

    res.status(200).json(
        new ApiResponse(200, { phone: normalizedPhone }, 'OTP sent successfully. Valid for 5 minutes.')
    );
});

// POST /api/delivery/auth/verify-otp - Verify OTP and login
export const verifyOTPAndLogin = asyncHandler(async (req, res) => {
    const { phone, otp, fcmToken, platform = 'app' } = req.body;
    const normalizedPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);

    if (normalizedPhone.length !== 10) {
        throw new ApiError(400, 'Invalid mobile number');
    }

    const deliveryBoy = await DeliveryBoy.findOne({ phone: normalizedPhone }).select('+resetOtp +resetOtpExpiry +refreshTokenHash +refreshTokenExpiresAt');
    const testNumbers = ['7894561230', '1234567890', '7879363299', '8817921168'];
    const staticOtp = '123456';
    const isStaticAuth = testNumbers.includes(normalizedPhone) && String(otp) === staticOtp;

    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) throw new ApiError(403, 'Account is deactivated. Contact admin.');

    if (!isStaticAuth) {
        if (!deliveryBoy.resetOtp || !deliveryBoy.resetOtpExpiry) {
            throw new ApiError(400, 'No OTP requested. Please request OTP first.');
        }
        if (deliveryBoy.resetOtpExpiry < new Date()) {
            throw new ApiError(400, 'OTP has expired. Please request a new one.');
        }
        if (deliveryBoy.resetOtp !== String(otp)) {
            throw new ApiError(401, 'Invalid OTP. Please try again.');
        }
    }

    // Clear OTP after successful verification
    deliveryBoy.resetOtp = undefined;
    deliveryBoy.resetOtpExpiry = undefined;
    deliveryBoy.resetOtpVerified = false;

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({ id: deliveryBoy._id, role: 'delivery' });
    await persistRefreshSession(deliveryBoy, refreshToken);

    // Update FCM token if provided
    if (fcmToken) {
        if (!Array.isArray(deliveryBoy.fcmTokens)) {
            deliveryBoy.fcmTokens = [];
        }
        const existingToken = deliveryBoy.fcmTokens.find(t => t.token === fcmToken);
        if (existingToken) {
            existingToken.lastUsed = new Date();
            existingToken.platform = platform || 'app';
        } else {
            deliveryBoy.fcmTokens.push({ token: fcmToken, platform, lastUsed: new Date() });
        }
    }

    await deliveryBoy.save({ validateBeforeSave: false });

    const sanitized = deliveryBoy.toObject();
    delete sanitized.password;
    delete sanitized.refreshTokenHash;
    delete sanitized.refreshTokenExpiresAt;
    delete sanitized.resetOtp;
    delete sanitized.resetOtpExpiry;

    res.status(200).json(
        new ApiResponse(200, { deliveryBoy: sanitized, accessToken, refreshToken }, 'Login successful')
    );
});

// POST /api/delivery/auth/login - Email/Password Login (Keep for backward compatibility)
export const login = asyncHandler(async (req, res) => {
    const { email, password, fcmToken, platform = 'app' } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+password');
    if (!deliveryBoy) throw new ApiError(401, 'Invalid credentials.');
    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) throw new ApiError(403, 'Account is deactivated. Contact admin.');

    const isMatch = await deliveryBoy.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    if (fcmToken) {
        await DeliveryBoy.findByIdAndUpdate(deliveryBoy._id, {
            $pull: { fcmTokens: { token: fcmToken } }
        });
        await DeliveryBoy.findByIdAndUpdate(deliveryBoy._id, {
            $push: { 
                fcmTokens: { 
                    $each: [{ token: fcmToken, platform, lastUsed: new Date() }],
                    $slice: -10 
                } 
            }
        });
    }

    const { accessToken, refreshToken } = generateTokens({ id: deliveryBoy._id, role: 'delivery', email: deliveryBoy.email });
    await persistRefreshSession(deliveryBoy, refreshToken);
    res.status(200).json(new ApiResponse(200, {
        accessToken,
        refreshToken,
        deliveryBoy: {
            id: deliveryBoy._id,
            name: deliveryBoy.name,
            email: deliveryBoy.email,
            phone: deliveryBoy.phone,
            isAvailable: deliveryBoy.isAvailable,
            status: deliveryBoy.status || (deliveryBoy.isAvailable ? 'available' : 'offline'),
            applicationStatus: deliveryBoy.applicationStatus,
        }
    }, 'Login successful.'));
});

// POST /api/delivery/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const deliveryBoy = await DeliveryBoy.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt applicationStatus rejectionReason isActive');

    if (!deliveryBoy) throw new ApiError(401, 'Invalid refresh token.');
    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) throw new ApiError(403, 'Account is deactivated. Contact admin.');

    const tokens = await rotateRefreshSession(
        deliveryBoy,
        { id: deliveryBoy._id, role: 'delivery', email: deliveryBoy.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/delivery/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const deliveryBoy = await DeliveryBoy.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (deliveryBoy?.refreshTokenHash) {
                deliveryBoy.status = 'offline';
                deliveryBoy.isAvailable = false;
                await deliveryBoy.save();
                await cacheInvalidate(`dash:${deliveryBoy._id}`, `profile:${deliveryBoy._id}`);
                await clearRefreshSession(deliveryBoy);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/delivery/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const deliveryBoy = await DeliveryBoy.findById(req.user.id);
    if (!deliveryBoy) throw new ApiError(404, 'Delivery boy not found.');
    res.status(200).json(new ApiResponse(200, deliveryBoy, 'Profile fetched.'));
});

export const updateProfile = asyncHandler(async (req, res) => {
    const { 
        name, phone, email, 
        vehicleType, vehicleNumber, 
        emergencyContact, aadharNumber,
        currentLocation, isAvailable, status,
        bankDetails, upiId, avatar
    } = req.body;
 
    const boy = await DeliveryBoy.findById(req.user.id);
    if (!boy) throw new ApiError(404, 'Delivery partner not found.');
 
    if (avatar) boy.avatar = avatar;
    if (name) boy.name = name.trim();
    if (phone) boy.phone = phone.trim();
    if (email) {
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail !== boy.email) {
            const existingEmail = await DeliveryBoy.findOne({ email: normalizedEmail, _id: { $ne: req.user.id } });
            if (existingEmail) throw new ApiError(409, 'Email is already in use.');
            boy.email = normalizedEmail;
        }
    }
    if (vehicleType) boy.vehicleType = vehicleType.trim();
    if (vehicleNumber) boy.vehicleNumber = vehicleNumber.trim();
    if (emergencyContact) boy.emergencyContact = emergencyContact.trim();
    if (aadharNumber) boy.aadharNumber = aadharNumber.trim();
    
    // Bank Details handling
    if (bankDetails) {
        const { accountHolderName, accountNumber, ifscCode, bankName } = bankDetails;
        const normalizedBank = {
            accountHolderName: (accountHolderName || '').trim(),
            accountNumber: (accountNumber || '').trim(),
            ifscCode: (ifscCode || '').trim(),
            bankName: (bankName || '').trim()
        };

        const hasChanged = 
            normalizedBank.accountNumber !== boy.bankDetails?.accountNumber ||
            normalizedBank.ifscCode !== boy.bankDetails?.ifscCode;

        boy.bankDetails = normalizedBank;
        if (hasChanged) {
            boy.kycStatus = 'pending';
        }
    }

    if (typeof upiId === 'string') {
        const trimmedUpi = upiId.trim();
        if (trimmedUpi !== boy.upiId) {
            boy.upiId = trimmedUpi;
            boy.kycStatus = 'pending';
        }
    }

    if (currentLocation) boy.currentLocation = currentLocation;

    if (status || typeof isAvailable === 'boolean') {
        if (boy.applicationStatus !== 'approved') {
            throw new ApiError(403, `Your application is currently ${boy.applicationStatus}. You cannot change your status.`);
        }

        let nextStatus;
        let nextIsAvailable;
        if (status) {
            nextStatus = status.toLowerCase();
            nextIsAvailable = nextStatus !== 'offline';
        } else if (typeof isAvailable === 'boolean') {
            nextIsAvailable = isAvailable;
            nextStatus = isAvailable ? 'available' : 'offline';
        }

        if (nextStatus === 'available') {
            // Don't let a rider (or a stale/duplicate client request) self-report
            // available while they still have an active delivery in progress.
            await assertRiderIsFree(boy._id);
        }

        boy.status = nextStatus;
        boy.isAvailable = nextIsAvailable;
    }

    await boy.save();
    await cacheInvalidate(`dash:${boy._id}`, `profile:${boy._id}`);
    res.status(200).json(new ApiResponse(200, boy, 'Profile updated.'));
});

// Helper for extracting Cloudinary public ID
const extractCloudinaryPublicId = (url = '') => {
    if (!url || typeof url !== 'string') return null;
    try {
        // Locally-stored uploads (see upload.service.js) — no Cloudinary /v.../ segment.
        const localMatch = url.match(/\/uploads\/(.+)\.[a-zA-Z0-9]+$/);
        if (localMatch) return localMatch[1];
        const matches = url.match(/\/v\d+\/(.+)\.[a-zA-Z0-9]+$/);
        return matches ? matches[1] : null;
    } catch {
        return null;
    }
};

// DELETE /api/delivery/auth/profile
export const deleteAccount = asyncHandler(async (req, res) => {
    const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('avatar documents');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery Partner not found.');

    const filesToDelete = [];
    if (deliveryBoy.avatar) filesToDelete.push(deliveryBoy.avatar);
    if (deliveryBoy.documents) {
        if (deliveryBoy.documents.drivingLicense) filesToDelete.push(deliveryBoy.documents.drivingLicense);
        if (deliveryBoy.documents.drivingLicenseBack) filesToDelete.push(deliveryBoy.documents.drivingLicenseBack);
        if (deliveryBoy.documents.aadharCard) filesToDelete.push(deliveryBoy.documents.aadharCard);
        if (deliveryBoy.documents.aadharCardBack) filesToDelete.push(deliveryBoy.documents.aadharCardBack);
    }

    // Delete files from Cloudinary
    for (const url of filesToDelete) {
        const publicId = extractCloudinaryPublicId(url);
        if (publicId) {
            await deleteFromCloudinary(publicId).catch((err) => {
                console.error(`[DeleteAccount] Cloudinary cleanup failed for ${publicId}:`, err.message);
            });
        }
    }

    // Delete the delivery boy record
    await DeliveryBoy.findByIdAndDelete(deliveryBoy._id);

    res.status(200).json(new ApiResponse(200, null, 'Account deleted successfully.'));
});
