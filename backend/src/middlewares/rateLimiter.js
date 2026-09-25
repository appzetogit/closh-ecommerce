import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.js';

const IS_DEV = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

// server.js imports app.js (which imports this file, building these rate
// limiters) BEFORE it awaits connectRedis() - so redisClient is never
// 'ready' yet at the exact moment RedisStore's constructor fires its
// one-time SCRIPT LOAD calls. Those calls need a real string reply; our old
// code returned a bare `0` whenever the client wasn't ready, which failed
// rate-limit-redis's own `typeof result !== 'string'` check and threw
// "unexpected reply from redis client" as an unhandled rejection on every
// single boot (visible in the error log as loadIncrementScript/
// loadGetScript failures). Waiting for the 'ready' event instead - bounded,
// since production either reaches 'ready' or connectRedis() rejects and the
// server never starts serving traffic - fixes this at the source instead of
// masking it with a fake reply.
const waitForRedisReady = (timeoutMs = 15000) =>
    new Promise((resolve) => {
        if (redisClient.status === 'ready') return resolve(true);
        const onReady = () => { cleanup(); resolve(true); };
        const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
        const cleanup = () => { redisClient.off('ready', onReady); clearTimeout(timer); };
        redisClient.once('ready', onReady);
    });

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
                // Wait out the startup race instead of faking a reply: this
                // fires immediately at RedisStore construction (SCRIPT LOAD),
                // which happens before connectRedis() resolves. `0` is not a
                // valid reply for any of these commands and was what actually
                // caused the crash-logged TypeErrors, not Redis being slow.
                if (redisClient.status !== 'ready') {
                    const becameReady = await waitForRedisReady();
                    if (!becameReady) {
                        throw new Error(`Redis never became ready for rate limiter "${prefix}"`);
                    }
                }

                // rate-limit-redis passes args as individual arguments:
                // e.g. sendCommand("EVALSHA", sha, numKeys, key, ...)
                // ioredis.call() expects: call(command, arg1, arg2, ...)
                return await redisClient.call(...args);
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
    // A genuine Redis hiccup mid-request should never turn into a 500 for a
    // real user over what's fundamentally a non-critical safety feature -
    // skip rate-limiting for that one request instead (express-rate-limit
    // logs it). Startup-time failures are handled separately by
    // waitForRedisReady() above, not by this.
    passOnStoreError: true,
});

// Strict limiter for auth endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_DEV ? 10000 : 50, // Increased from 5 to 50
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' },
    store: createStore('rl-auth:'),
    passOnStoreError: true,
});

// OTP resend limiter
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: IS_DEV ? 10000 : 3,
    message: { success: false, message: { success: false, message: 'Too many OTP requests, please wait a minute.' } },
    store: createStore('rl-otp:'),
    passOnStoreError: true,
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
    passOnStoreError: true,
});
