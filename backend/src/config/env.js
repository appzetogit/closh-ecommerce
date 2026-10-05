// Validates required environment variables at startup
const requiredEnvVars = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
];

export const validateEnv = () => {
    const missing = requiredEnvVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // The static test OTP is a login backdoor; it must never be switched on in production.
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && process.env.ENABLE_TEST_OTP === 'true') {
        throw new Error('ENABLE_TEST_OTP=true is not allowed when NODE_ENV=production (static OTP login backdoor).');
    }
    if (process.env.ENABLE_TEST_OTP === 'true') {
        console.warn('⚠️  ENABLE_TEST_OTP=true: static OTP 123456 is active for the dev test numbers. Never set this on a server.');
    }

    console.log('Environment variables validated successfully');
};
