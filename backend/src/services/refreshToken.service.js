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

const MAX_SESSIONS = 10;

export const persistRefreshSession = async (accountDoc, refreshToken) => {
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

    // Maintain legacy single-token fields for backwards compatibility
    accountDoc.refreshTokenHash = tokenHash;
    accountDoc.refreshTokenExpiresAt = expiresAt;

    // Maintain multi-session array
    if (!Array.isArray(accountDoc.refreshTokens)) {
        accountDoc.refreshTokens = [];
    }

    // Filter out expired sessions & duplicate entries
    const now = new Date();
    accountDoc.refreshTokens = accountDoc.refreshTokens.filter(
        (session) => session && session.hash && (!session.expiresAt || new Date(session.expiresAt) > now) && session.hash !== tokenHash
    );

    // Push new session
    accountDoc.refreshTokens.push({
        hash: tokenHash,
        expiresAt,
        createdAt: now,
    });

    // Cap at MAX_SESSIONS (remove oldest)
    if (accountDoc.refreshTokens.length > MAX_SESSIONS) {
        accountDoc.refreshTokens = accountDoc.refreshTokens.slice(-MAX_SESSIONS);
    }

    await accountDoc.save({ validateBeforeSave: false });
};

export const clearRefreshSession = async (accountDoc, refreshToken = null) => {
    if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        if (Array.isArray(accountDoc.refreshTokens)) {
            accountDoc.refreshTokens = accountDoc.refreshTokens.filter((s) => s.hash !== tokenHash);
        }
        if (accountDoc.refreshTokenHash === tokenHash) {
            accountDoc.refreshTokenHash = accountDoc.refreshTokens?.[accountDoc.refreshTokens.length - 1]?.hash || undefined;
            accountDoc.refreshTokenExpiresAt = accountDoc.refreshTokens?.[accountDoc.refreshTokens.length - 1]?.expiresAt || undefined;
        }
    } else {
        accountDoc.refreshTokenHash = undefined;
        accountDoc.refreshTokenExpiresAt = undefined;
        accountDoc.refreshTokens = [];
    }
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

    // Check in multi-session array first
    let sessionIndex = -1;
    if (Array.isArray(accountDoc.refreshTokens) && accountDoc.refreshTokens.length > 0) {
        sessionIndex = accountDoc.refreshTokens.findIndex((s) => s.hash === incomingHash);
    }

    // Fallback to legacy single field check if not found in array
    const matchesLegacy = accountDoc.refreshTokenHash === incomingHash;

    if (sessionIndex === -1 && !matchesLegacy) {
        throw new ApiError(401, 'Refresh token is invalid or already rotated.');
    }

    const targetSession = sessionIndex !== -1 ? accountDoc.refreshTokens[sessionIndex] : null;
    const expiresAt = targetSession?.expiresAt || accountDoc.refreshTokenExpiresAt;

    if (expiresAt && new Date(expiresAt) <= new Date()) {
        await clearRefreshSession(accountDoc, incomingRefreshToken);
        throw new ApiError(401, 'Refresh token has expired. Please login again.');
    }

    // Remove incoming session from array
    if (sessionIndex !== -1) {
        accountDoc.refreshTokens.splice(sessionIndex, 1);
    }

    const { accessToken, refreshToken } = generateTokens(payload);
    await persistRefreshSession(accountDoc, refreshToken);

    return { accessToken, refreshToken };
};
