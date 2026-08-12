import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * On-the-fly image optimisation for locally-stored uploads.
 *
 * Replaces what Cloudinary's `f_auto,q_auto,w_<n>` transforms used to do for
 * us before the migration to local storage:
 *
 *   - `f_auto`  -> serves WebP to any browser that advertises `image/webp`,
 *                  regardless of what format is actually on disk. The bulk of
 *                  the migrated catalogue is 1-2 MB PNG, which lands around
 *                  100-150 KB as WebP.
 *   - `w_<n>`   -> `?w=400` renders a resized derivative, so a 40px table
 *                  thumbnail no longer downloads a 1024x1536 original.
 *   - caching   -> derivatives are written to disk once and then served with a
 *                  one-year immutable cache header.
 *
 * Derivatives are keyed by source mtime+size, so replacing a file on disk
 * transparently invalidates every derivative of it.
 *
 * Anything this middleware can't handle (non-image, missing file, decode
 * failure) simply calls next() and falls through to express.static, so the
 * original bytes are still served.
 */

const OPTIMIZABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Requested widths are snapped up to one of these buckets. Without an
// allowlist, `?w=1,2,3...` would let anyone fill the disk with derivatives.
const WIDTH_BUCKETS = [64, 128, 200, 300, 400, 600, 800, 1000, 1200, 1600, 2000];

const DEFAULT_QUALITY = 78;
const MIN_QUALITY = 40;
const MAX_QUALITY = 95;

const snapWidth = (requested) => {
    if (!Number.isFinite(requested) || requested <= 0) return null;
    return WIDTH_BUCKETS.find((bucket) => bucket >= requested) ?? WIDTH_BUCKETS.at(-1);
};

const clampQuality = (requested) => {
    if (!Number.isFinite(requested)) return DEFAULT_QUALITY;
    return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, requested));
};

export const createImageOptimizer = (uploadsRoot, { cacheRoot } = {}) => {
    const resolvedUploadsRoot = path.resolve(uploadsRoot);
    const resolvedCacheRoot = path.resolve(
        cacheRoot || path.join(resolvedUploadsRoot, '..', '.image-cache')
    );

    fsSync.mkdirSync(resolvedCacheRoot, { recursive: true });

    // Collapses concurrent requests for the same derivative into one encode.
    const inFlight = new Map();

    const buildDerivative = (cachePath, sourcePath, { width, quality, format }) => {
        if (inFlight.has(cachePath)) return inFlight.get(cachePath);

        const job = (async () => {
            const pipeline = sharp(sourcePath, { failOn: 'none' })
                // Bakes in EXIF orientation; sharp also drops metadata on output.
                .rotate();

            if (width) {
                pipeline.resize({ width, withoutEnlargement: true });
            }

            if (format === 'webp') {
                pipeline.webp({ quality });
            } else if (format === 'jpeg') {
                pipeline.jpeg({ quality, mozjpeg: true });
            } else {
                pipeline.png({ compressionLevel: 9, palette: true });
            }

            // Encode to a unique temp name first so a crash mid-write can never
            // leave a truncated file sitting in the cache under a valid key.
            const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
            try {
                await pipeline.toFile(tempPath);
                await fs.rename(tempPath, cachePath);
            } catch (error) {
                await fs.unlink(tempPath).catch(() => {});
                throw error;
            }
        })();

        inFlight.set(cachePath, job);
        job.catch(() => {}).finally(() => inFlight.delete(cachePath));
        return job;
    };

    return async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        let relativePath;
        try {
            relativePath = decodeURIComponent(req.path);
        } catch {
            return next();
        }

        const extension = path.extname(relativePath).toLowerCase();
        if (!OPTIMIZABLE_EXTENSIONS.has(extension)) return next();

        const sourcePath = path.resolve(resolvedUploadsRoot, `.${relativePath}`);
        // Path traversal guard: the resolved file must stay inside uploads/.
        if (!sourcePath.startsWith(resolvedUploadsRoot + path.sep)) return next();

        const width = snapWidth(parseInt(req.query.w, 10));
        const quality = clampQuality(parseInt(req.query.q, 10));

        // Serve WebP whenever the client says it can decode it.
        const acceptsWebp = String(req.headers.accept || '').includes('image/webp');
        const format = acceptsWebp ? 'webp' : extension === '.png' ? 'png' : 'jpeg';

        // Nothing to gain: already the target format and no resize requested.
        if (!width && (!acceptsWebp || extension === '.webp')) return next();

        let stats;
        try {
            stats = await fs.stat(sourcePath);
        } catch {
            return next();
        }
        if (!stats.isFile()) return next();

        // mtime + size in the key means a replaced source file invalidates all
        // of its derivatives without any explicit cache busting.
        const cacheKey = crypto
            .createHash('sha1')
            .update(
                `${relativePath}|${stats.mtimeMs}|${stats.size}|${width || 'full'}|${quality}|${format}`
            )
            .digest('hex');
        const cachePath = path.join(resolvedCacheRoot, `${cacheKey}.${format}`);

        try {
            if (!fsSync.existsSync(cachePath)) {
                await buildDerivative(cachePath, sourcePath, { width, quality, format });
            }
        } catch (error) {
            // Corrupt or unsupported image: fall through and let express.static
            // serve the original rather than 500-ing on a product photo.
            console.error(`[imageOptimizer] ${relativePath}: ${error.message}`);
            return next();
        }

        res.type(`image/${format}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // The response body depends on the request's Accept header, so shared
        // caches must not hand a WebP to a client that never asked for one.
        res.setHeader('Vary', 'Accept');

        return res.sendFile(cachePath, (error) => {
            if (error && !res.headersSent) next();
        });
    };
};

export default createImageOptimizer;
