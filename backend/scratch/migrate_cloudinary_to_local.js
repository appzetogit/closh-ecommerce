import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// These are the credentials for the account that currently holds the live
// assets (qtthyytk) — NOT necessarily what's active in .env right now, since
// .env may be pointed at a different account for future uploads.
cloudinary.config({
    cloud_name: 'qtthyytk',
    api_key: '395275689762367',
    api_secret: 'qEr5zKjniIuWSSoN0aFqZuKeInE',
});

const PUBLIC_BASE_URL = 'https://api.closh.in';
const uploadsRoot = path.resolve(__dirname, '../uploads');

const COLLECTIONS = [
    { name: 'categories', folder: 'categories' },
    { name: 'products', folder: 'products' },
    { name: 'brands', folder: 'brands' },
    { name: 'orders', folder: 'orders' },
    { name: 'deliveryboys', folder: 'delivery-docs' },
];

const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/v(\d+)\/(.+)\.([a-zA-Z0-9]+)$/;

function parseCloudinaryUrl(url) {
    const m = url.match(CLOUDINARY_URL_RE);
    if (!m) return null;
    const [, cloud, resourceType, version, publicId, ext] = m;
    return { cloud, resourceType, version, publicId, ext };
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

function collectUrls(doc, found) {
    if (!doc || typeof doc !== 'object') return;
    for (const value of Object.values(doc)) {
        if (typeof value === 'string' && value.startsWith('https://res.cloudinary.com/')) {
            found.add(value);
        } else if (Array.isArray(value)) {
            value.forEach((item) => {
                if (typeof item === 'string' && item.startsWith('https://res.cloudinary.com/')) {
                    found.add(item);
                } else if (item && typeof item === 'object') {
                    collectUrls(item, found);
                }
            });
        } else if (value && typeof value === 'object') {
            collectUrls(value, found);
        }
    }
}

function replaceUrls(doc, urlMap) {
    let changed = false;
    for (const [key, value] of Object.entries(doc || {})) {
        if (typeof value === 'string' && urlMap.has(value)) {
            doc[key] = urlMap.get(value);
            changed = true;
        } else if (Array.isArray(value)) {
            value.forEach((item, i) => {
                if (typeof item === 'string' && urlMap.has(item)) {
                    value[i] = urlMap.get(item);
                    changed = true;
                } else if (item && typeof item === 'object') {
                    if (replaceUrls(item, urlMap)) changed = true;
                }
            });
        } else if (value && typeof value === 'object') {
            if (replaceUrls(value, urlMap)) changed = true;
        }
    }
    return changed;
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    const db = mongoose.connection.db;

    for (const { folder } of COLLECTIONS) {
        fs.mkdirSync(path.join(uploadsRoot, folder), { recursive: true });
    }

    // ── Step 1: collect every unique Cloudinary URL, tagged with its target folder ──
    console.log('\n=== Step 1: collecting unique Cloudinary URLs per collection ===');
    const urlToFolder = new Map(); // url -> folder
    for (const { name, folder } of COLLECTIONS) {
        const coll = db.collection(name);
        const found = new Set();
        const cursor = coll.find({});
        while (await cursor.hasNext()) {
            collectUrls(await cursor.next(), found);
        }
        console.log(`  ${name}: ${found.size} unique URLs`);
        for (const url of found) {
            if (!urlToFolder.has(url)) urlToFolder.set(url, folder);
        }
    }
    console.log(`Total unique URLs across all collections: ${urlToFolder.size}`);

    // ── Step 2: download each file + fetch its Cloudinary metadata ──
    console.log('\n=== Step 2: downloading files and fetching metadata ===');
    const urlMap = new Map(); // old absolute cloudinary URL -> new absolute local URL
    const metadata = [];
    let done = 0;
    let failCount = 0;
    for (const [url, folder] of urlToFolder.entries()) {
        const parsed = parseCloudinaryUrl(url);
        if (!parsed) {
            console.warn(`  SKIP (unparseable): ${url}`);
            failCount += 1;
            continue;
        }
        const filename = `${path.basename(parsed.publicId)}.${parsed.ext}`;
        const destPath = path.join(uploadsRoot, folder, filename);
        const newUrl = `${PUBLIC_BASE_URL}/uploads/${folder}/${filename}`;

        try {
            await downloadFile(url, destPath);
            let resourceMeta = null;
            try {
                resourceMeta = await cloudinary.api.resource(parsed.publicId, { resource_type: parsed.resourceType });
            } catch (metaErr) {
                console.warn(`  metadata fetch failed for ${parsed.publicId}: ${metaErr.message}`);
            }
            metadata.push({
                originalUrl: url,
                publicId: parsed.publicId,
                resourceType: parsed.resourceType,
                format: resourceMeta?.format || parsed.ext,
                width: resourceMeta?.width ?? null,
                height: resourceMeta?.height ?? null,
                bytes: resourceMeta?.bytes ?? null,
                createdAt: resourceMeta?.created_at ?? null,
                folder,
                localFile: `uploads/${folder}/${filename}`,
                newUrl,
            });
            urlMap.set(url, newUrl);
        } catch (err) {
            console.error(`  FAILED: ${url} -> ${err.message}`);
            failCount += 1;
        }

        done += 1;
        if (done % 25 === 0 || done === urlToFolder.size) {
            console.log(`  progress: ${done}/${urlToFolder.size} (failed: ${failCount})`);
        }
    }
    console.log(`Downloaded ${urlMap.size}/${urlToFolder.size} files successfully (${failCount} failed).`);

    // ── Step 3: write metadata manifest ──
    const manifestPath = path.join(uploadsRoot, 'cloudinary-migration-metadata.json');
    fs.writeFileSync(manifestPath, JSON.stringify(metadata, null, 2));
    console.log(`\nMetadata manifest written: ${manifestPath} (${metadata.length} entries)`);

    if (process.env.SKIP_DB_UPDATE === 'true') {
        console.log('\nSKIP_DB_UPDATE=true — stopping before Step 4 (no DB writes made). Re-run without it to apply the rewrite.');
        await mongoose.disconnect();
        return;
    }

    // ── Step 4: rewrite references in each collection ──
    console.log('\n=== Step 4: rewriting references in each collection ===');
    for (const { name } of COLLECTIONS) {
        const coll = db.collection(name);
        const cursor = coll.find({});
        let updated = 0;
        const ops = [];
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            if (replaceUrls(doc, urlMap)) {
                ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc } });
                updated += 1;
            }
        }
        if (ops.length) await coll.bulkWrite(ops);
        console.log(`${name}: updated ${updated} docs`);
    }

    console.log('\nDone.');
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
