import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Route imports
import publicRoutes from './routes/public.routes.js';
import userRoutes from './modules/user/routes/user.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import vendorRoutes from './modules/vendor/routes/vendor.routes.js';
import deliveryRoutes from './modules/delivery/routes/delivery.routes.js';
import deliveryEngineRoutes from './modules/delivery/routes/deliveryEngine.routes.js';
import deliveryTrackingRoutes from './modules/delivery/routes/tracking.routes.js';

// Middleware imports
import { apiLimiter } from './middlewares/rateLimiter.js';
import { createImageOptimizer } from './middlewares/imageOptimizer.js';
import { detailedRequestLogger } from './middlewares/debug.middleware.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';

const app = express();
// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// app.use(detailedRequestLogger);

// Trust proxy (necessary for express-rate-limit when behind Nginx)
app.set('trust proxy', 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const deliveryDocsRoot = path.resolve(uploadsRoot, 'delivery-docs');

const isValidDeliveryDocToken = (relativePath, rawToken) => {
    if (!rawToken) return false;
    const [expRaw, providedSignature] = String(rawToken).split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now() || !providedSignature) return false;

    const payload = `${relativePath}|${exp}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'delivery-doc-secret')
        .update(payload)
        .digest('hex');

    if (providedSignature.length !== expectedSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
};

// ─── Security Middleware ─────────────────────────────────────────────────────
const allowedOrigins = [
    process.env.CLIENT_URL,
    'https://www.closh.in',
    'https://closh.in',
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean);

// CORS MUST come before Helmet so preflight OPTIONS get proper headers
app.use(cors({
    origin: (origin, callback) => {
        const isVercel = origin && /\.vercel\.app$/.test(origin);
        if (!origin || allowedOrigins.includes(origin) || isVercel) {
            callback(null, true);
        } else {
            console.error(`CORS BLOCKED for origin: ${origin}`);
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-idempotency-key'],
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(mongoSanitize());

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use(
    '/uploads/delivery-docs',
    (req, res, next) => {
        const relativePath = `/uploads/delivery-docs${req.path}`;
        const token = req.query.docToken;
        if (!isValidDeliveryDocToken(relativePath, token)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(deliveryDocsRoot, { fallthrough: false })
);

app.use(
    '/uploads',
    (req, res, next) => {
        if (req.path.startsWith('/delivery-docs/')) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    // Converts to WebP for browsers that accept it and honours `?w=<px>`,
    // falling through to the original bytes for anything it can't handle.
    createImageOptimizer(uploadsRoot),
    // Originals keep a shorter TTL than derivatives: filenames are usually
    // random, but the upload controllers accept a caller-supplied publicId,
    // so a file *can* be replaced under the same name.
    express.static(uploadsRoot, { maxAge: '7d' })
);
app.use('/api', publicRoutes);            // Public: products, categories, brands, coupons, banners
app.use('/api/user', userRoutes);         // Customer: auth, addresses, wishlist, reviews, orders
app.use('/api/admin', adminRoutes);       // Admin: auth, vendors, orders, catalog, analytics
app.use('/api/vendor', vendorRoutes);     // Vendor: auth, products, orders, earnings
app.use('/api/delivery', deliveryRoutes); // Delivery: auth, orders
app.use('/api/delivery/tracking', deliveryTrackingRoutes); // Delivery: real-time tracking with distance/earnings
app.use('/api/delivery/engine', deliveryEngineRoutes); // Advanced Delivery Batch Engine

// ─── Error Handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
