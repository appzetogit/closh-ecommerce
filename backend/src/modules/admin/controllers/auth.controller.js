import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';

// POST /api/admin/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) throw new ApiError(401, 'Invalid credentials.');
    if (!admin.isActive) throw new ApiError(403, 'Admin account is deactivated.');

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    const { accessToken, refreshToken } = generateTokens({ id: admin._id, role: admin.role, email: admin.email });
    await persistRefreshSession(admin, refreshToken);
    res.status(200).json(new ApiResponse(200, { accessToken, refreshToken, admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions } }, 'Admin login successful.'));
});

// POST /api/admin/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const admin = await Admin.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt +refreshTokens isActive role');

    if (!admin) throw new ApiError(401, 'Invalid refresh token.');
    if (!admin.isActive) throw new ApiError(403, 'Admin account is deactivated.');

    const payloadRole = admin.role;
    const tokens = await rotateRefreshSession(
        admin,
        { id: admin._id, role: payloadRole, email: admin.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/admin/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const admin = await Admin.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt +refreshTokens');
            if (admin) {
                await clearRefreshSession(admin, refreshToken);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/admin/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user.id);
    if (!admin) throw new ApiError(404, 'Admin not found.');
    res.status(200).json(new ApiResponse(200, admin, 'Profile fetched.'));
});

// PUT /api/admin/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findById(req.user.id);
    
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (email) {
        const existingEmail = await Admin.findOne({ email, _id: { $ne: admin._id } });
        if (existingEmail) throw new ApiError(400, 'Email is already in use by another admin.');
        admin.email = email;
    }
    
    if (password) {
        admin.password = password; // pre-save hook will hash this
    }

    await admin.save();
    
    // We don't return password in response.
    const updatedAdmin = await Admin.findById(req.user.id);
    res.status(200).json(new ApiResponse(200, updatedAdmin, 'Profile updated successfully.'));
});
