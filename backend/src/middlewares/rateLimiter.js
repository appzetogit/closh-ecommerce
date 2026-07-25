import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.js';

const IS_DEV = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

// Helper to create a store with a unique prefix
const createStore = (prefix) => {
    // In Dev, only use Redis if it's actually ready to avoid connection timeout crashes
    const isReady = redisClient && redisClient.status === 'ready';
    const hasConfig = !!(process.env.REDIS_URL || process.env.REDIS_HOST);
    
    // If not ready and we are in dev, fallback to MemoryStore immediately to prevent startup crash
    if (IS_DEV && !isReady) {
        return undefined;
    }

    // In production, if we have config but not ready yet, we might want to wait or fail
    // but for now, let's just check if it's possible to use it
    if (!redisClient || !hasConfig) {
        return undefined;
    }

    try {
        return new RedisStore({
            sendCommand: async (...args) => {
                // If Redis is not ready, we skip the command to prevent hanging/crashing
                if (redisClient.status !== 'ready') {
                    return 0; 
                }

                try {
                    // rate-limit-redis passes args as individual arguments:
                    // e.g. sendCommand("EVALSHA", sha, numKeys, key, ...)
                    // ioredis.call() expects: call(command, arg1, arg2, ...)
                    return await redisClient.call(...args);
                } catch (err) {
                    console.warn(`⚠️ Redis command failed in ${prefix}:`, err.message);
                    return 0;
                }
            },
            prefix: prefix,
        });
    } catch (err) {
        console.error(`❌ Failed to initialize RedisStore for ${prefix}:`, err.message);
        return undefined;
    }
};

// General API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_DEV ? 10000 : 1000, // Increased from 100 to 1000
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
    store: createStore('rl-api:'),
});

// Strict limiter for auth endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_DEV ? 10000 : 50, // Increased from 5 to 50
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' },
    store: createStore('rl-auth:'),
});

// OTP resend limiter
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: IS_DEV ? 10000 : 3,
    message: { success: false, message: { success: false, message: 'Too many OTP requests, please wait a minute.' } },
    store: createStore('rl-otp:'),
});

// Location update limiter
export const locationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_DEV ? 10000 : 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Location update rate limit reached, retrying shortly.' },
    skip: (req) => !req.body?.currentLocation,
    store: createStore('rl-loc:'),
});
