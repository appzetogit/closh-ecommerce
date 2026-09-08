import crypto from 'crypto';
import ApiError from '../utils/ApiError.js';
import { verifyRefreshToken } from '../config/jwt.js';
import { generateTokens } from '../utils/generateToken.js';

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const decodeRefreshTokenOrThrow = (token) => {
    try {
        return verifyRefreshToken(String(token || ''));
    } catch {
        throw new ApiError(401, 'Invalid or expired refresh token.');
    }
};

export const persistRefreshSession = async (accountDoc, refreshToken) => {
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    accountDoc.refreshTokenHash = hashToken(refreshToken);
    accountDoc.refreshTokenExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
    await accountDoc.save({ validateBeforeSave: false });
};

export const clearRefreshSession = async (accountDoc) => {
    accountDoc.refreshTokenHash = undefined;
    accountDoc.refreshTokenExpiresAt = undefined;
    await accountDoc.save({ validateBeforeSave: false });
};

export const rotateRefreshSession = async (accountDoc, payload, incomingRefreshToken) => {
    if (!incomingRefreshToken) {
        throw new ApiError(400, 'Refresh token is required.');
    }

    const decoded = decodeRefreshTokenOrThrow(incomingRefreshToken);
    if (!decoded?.id || String(decoded.id) !== String(accountDoc._id)) {
        throw new ApiError(401, 'Invalid refresh token.');
    }

    const incomingHash = hashToken(incomingRefreshToken);
    const storedHash = accountDoc.refreshTokenHash;
    const expiresAt = accountDoc.refreshTokenExpiresAt ? new Date(accountDoc.refreshTokenExpiresAt) : null;

    if (!storedHash || incomingHash !== storedHash) {
        throw new ApiError(401, 'Refresh token is invalid or already rotated.');
    }

    if (expiresAt && expiresAt <= new Date()) {
        await clearRefreshSession(accountDoc);
        throw new ApiError(401, 'Refresh token has expired. Please login again.');
    }

    const { accessToken, refreshToken } = generateTokens(payload);
    await persistRefreshSession(accountDoc, refreshToken);

    return { accessToken, refreshToken };
};
