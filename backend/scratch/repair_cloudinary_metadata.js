import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

cloudinary.config({
    cloud_name: 'qtthyytk',
    api_key: '395275689762367',
    api_secret: 'qEr5zKjniIuWSSoN0aFqZuKeInE',
});

const PUBLIC_BASE_URL = 'https://api.closh.in';
const uploadsRoot = path.resolve(__dirname, '../uploads');
const manifestPath = path.join(uploadsRoot, 'cloudinary-migration-metadata.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function fetchMetaWithRetry(publicId, resourceType, attempts = 4) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await cloudinary.api.resource(publicId, { resource_type: resourceType });
        } catch (err) {
            const wait = 2000 * (i + 1);
            console.warn(`  retry ${i + 1}/${attempts} for ${publicId} after ${wait}ms (${err.error?.message || err.message || 'unknown error'})`);
            await sleep(wait);
        }
    }
    return null;
}

async function run() {
    const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const byUrl = new Map(metadata.map((m) => [m.originalUrl, m]));

    // ── Fix the 2 missing downloads ──
    const missing = [
        {
            url: 'https://res.cloudinary.com/qtthyytk/image/upload/v1786016102/categories/mqdukbqwhzxelga2txfl.png',
            publicId: 'categories/mqdukbqwhzxelga2txfl',
            folder: 'categories',
            filename: 'mqdukbqwhzxelga2txfl.png',
        },
        {
            url: 'https://res.cloudinary.com/qtthyytk/image/upload/v1786016237/vendors/products/wpxjdmidwr9c94cexzi4.png',
            publicId: 'vendors/products/wpxjdmidwr9c94cexzi4',
            folder: 'products',
            filename: 'wpxjdmidwr9c94cexzi4.png',
        },
    ];

    console.log('=== Repairing 2 missing downloads ===');
    for (const item of missing) {
        if (byUrl.has(item.url)) {
            console.log(`  already in manifest, skipping: ${item.url}`);
            continue;
        }
        const destPath = path.join(uploadsRoot, item.folder, item.filename);
        await downloadFile(item.url, destPath);
        const meta = await fetchMetaWithRetry(item.publicId, 'image');
        const entry = {
            originalUrl: item.url,
            publicId: item.publicId,
            resourceType: 'image',
            format: meta?.format || 'png',
            width: meta?.width ?? null,
            height: meta?.height ?? null,
            bytes: meta?.bytes ?? null,
            createdAt: meta?.created_at ?? null,
            folder: item.folder,
            localFile: `uploads/${item.folder}/${item.filename}`,
            newUrl: `${PUBLIC_BASE_URL}/uploads/${item.folder}/${item.filename}`,
        };
        metadata.push(entry);
        byUrl.set(item.url, entry);
        console.log(`  downloaded + metadata fetched: ${item.publicId}`);
    }

    // ── Re-fetch metadata for every entry that came back null ──
    const missingMeta = metadata.filter((m) => m.width == null || m.bytes == null);
    console.log(`\n=== Re-fetching metadata for ${missingMeta.length} entries with missing data ===`);
    let fixed = 0;
    let stillFailing = 0;
    for (let i = 0; i < missingMeta.length; i++) {
        const entry = missingMeta[i];
        const meta = await fetchMetaWithRetry(entry.publicId, entry.resourceType);
        if (meta) {
            entry.format = meta.format || entry.format;
            entry.width = meta.width;
            entry.height = meta.height;
            entry.bytes = meta.bytes;
            entry.createdAt = meta.created_at;
            fixed += 1;
        } else {
            stillFailing += 1;
            console.error(`  PERMANENTLY FAILED: ${entry.publicId}`);
        }
        // Pace requests to stay well under Cloudinary's Admin API rate limit.
        await sleep(300);
        if ((i + 1) % 50 === 0) {
            console.log(`  progress: ${i + 1}/${missingMeta.length} (fixed: ${fixed}, still failing: ${stillFailing})`);
            fs.writeFileSync(manifestPath, JSON.stringify(metadata, null, 2)); // checkpoint save
        }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(metadata, null, 2));
    console.log(`\nDone. Fixed ${fixed}/${missingMeta.length} metadata entries. Still failing: ${stillFailing}.`);
    console.log(`Total manifest entries: ${metadata.length}.`);
    const stillNull = metadata.filter((m) => m.width == null).length;
    console.log(`Entries still missing width/height/bytes: ${stillNull}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
