import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const signAccessToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

export const signRefreshToken = (payload) =>
    jwt.sign({ ...payload, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });

export const verifyAccessToken = (token) =>
    jwt.verify(token, process.env.JWT_SECRET);

export const verifyRefreshToken = (token) =>
    jwt.verify(token, process.env.JWT_REFRESH_SECRET);
