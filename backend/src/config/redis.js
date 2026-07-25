import ioredis from 'ioredis';

const baseOptions = {
    retryStrategy: (times) => {
        // Retry every 2-10 seconds
        return Math.min(times * 100, 10000);
    },
    // Prevent unhandled error event crashes
    lazyConnect: false, 
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
};

let redisConnection;
if (process.env.REDIS_URL) {
    redisConnection = new ioredis(process.env.REDIS_URL, baseOptions);
} else {
    redisConnection = new ioredis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        ...baseOptions
    });
}

// A standard, global error handler for the master connection to prevent app crashes
redisConnection.on('error', (err) => {
    // Suppress logs unless it's something special, to avoid spam
    if (err.code !== 'ENOTFOUND' && err.code !== 'ECONNREFUSED') {
        console.error('❌ Redis Master Connection Error:', err.message);
    }
});

const connectRedis = async () => {
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[Redis] Current status: ${redisConnection.status}`);
    
    return new Promise((resolve, reject) => {
        if (redisConnection.status === 'ready') {
            console.log('✅ Redis Connected for Queues (cached)');
            return resolve(redisConnection);
        }
        
        const onReady = async () => {
            console.log('✅ Redis Connected for Queues');
            try {
                await redisConnection.config('SET', 'maxmemory-policy', 'noeviction');
            } catch (err) {
                console.warn('⚠️ Could not set maxmemory-policy programmatically. You may see BullMQ warnings.');
            }
            cleanup();
            resolve(redisConnection);
        };
        
        const onError = (err) => {
            if (isDev) {
                console.warn(`⚠️  Redis Connection Error: ${err.message}. Queues and real-time features may be limited.`);
                cleanup();
                resolve(null); // Resolve to allow app startup in dev
            } else {
                console.error('❌ Redis Connection Error:', err.message);
                cleanup();
                reject(err);
            }
        };

        const cleanup = () => {
            redisConnection.removeListener('ready', onReady);
            redisConnection.removeListener('error', onError);
        };

        redisConnection.once('ready', onReady);
        redisConnection.once('error', onError);

        // Optional: timeout if connection takes too long
        setTimeout(() => {
            if (redisConnection.status !== 'ready' && isDev) {
                console.warn('⚠️  Redis connection timed out during startup. Continuing in dev mode...');
                cleanup();
                resolve(null);
            }
        }, 5000);
    });
};

export { connectRedis };
export default redisConnection;
