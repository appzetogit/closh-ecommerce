import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Uploads go to whatever CLOUDINARY_* is currently in .env (the new qtthyytk account).
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const OLD_CLOUD = 'dfe2xogxj';
const URL_RE = new RegExp(`https://res\\.cloudinary\\.com/${OLD_CLOUD}/[a-zA-Z0-9_/.:-]+`, 'g');
const COLLECTIONS = ['categories', 'products', 'brands', 'orders', 'deliveryboys'];

// Extract the folder/public_id (without extension/version) from an old Cloudinary URL,
// so migrated assets land in the same folder structure in the new account.
function derivePublicId(oldUrl) {
    const match = oldUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    return match ? match[1] : undefined;
}

function collectUrls(obj, found) {
    if (obj == null) return;
    if (typeof obj === 'string') {
        const matches = obj.match(URL_RE);
        if (matches) matches.forEach((m) => found.add(m));
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach((item) => collectUrls(item, found));
        return;
    }
    if (typeof obj === 'object') {
        // Avoid descending into ObjectId/Date/Buffer internals
        if (obj._bsontype || obj instanceof Date) return;
        for (const v of Object.values(obj)) collectUrls(v, found);
    }
}

function replaceUrls(obj, urlMap) {
    let changed = false;
    if (obj == null) return { value: obj, changed };
    if (typeof obj === 'string') {
        let newVal = obj;
        for (const [oldUrl, newUrl] of urlMap.entries()) {
            if (newUrl && newVal.includes(oldUrl)) {
                newVal = newVal.split(oldUrl).join(newUrl);
                changed = true;
            }
        }
        return { value: newVal, changed };
    }
    if (Array.isArray(obj)) {
        const result = obj.map((item) => {
            const r = replaceUrls(item, urlMap);
            if (r.changed) changed = true;
            return r.value;
        });
        return { value: result, changed };
    }
    if (typeof obj === 'object') {
        if (obj._bsontype || obj instanceof Date) return { value: obj, changed: false };
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            const r = replaceUrls(v, urlMap);
            if (r.changed) changed = true;
            result[k] = r.value;
        }
        return { value: result, changed };
    }
    return { value: obj, changed };
}

async function migrateOneUrl(oldUrl) {
    const publicId = derivePublicId(oldUrl);
    try {
        const result = await cloudinary.uploader.upload(oldUrl, {
            public_id: publicId,
            resource_type: 'image',
            overwrite: false,
        });
        return result.secure_url;
    } catch (err) {
        console.error(`  FAILED: ${oldUrl} -> ${err.message}`);
        return null;
    }
}

async function runPool(items, concurrency, worker) {
    const results = new Map();
    let idx = 0;
    let done = 0;
    async function next() {
        while (idx < items.length) {
            const i = idx++;
            const item = items[i];
            const res = await worker(item);
            results.set(item, res);
            done += 1;
            if (done % 25 === 0 || done === items.length) {
                console.log(`  progress: ${done}/${items.length}`);
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, next));
    return results;
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    const db = mongoose.connection.db;

    console.log('\n=== Step 1: collecting unique old-cloud URLs across all collections ===');
    const allUrls = new Set();
    const collDocs = {};
    for (const name of COLLECTIONS) {
        const docs = await db.collection(name).find({}).toArray();
        collDocs[name] = docs;
        docs.forEach((doc) => collectUrls(doc, allUrls));
    }
    console.log(`Found ${allUrls.size} unique URLs to migrate.`);

    console.log('\n=== Step 2: fetch-upload each unique URL into the new Cloudinary account ===');
    const urlMap = await runPool([...allUrls], 6, migrateOneUrl);
    const succeeded = [...urlMap.values()].filter(Boolean).length;
    console.log(`Migrated ${succeeded}/${allUrls.size} images successfully.`);

    console.log('\n=== Step 3: rewriting references in each collection ===');
    for (const name of COLLECTIONS) {
        let updated = 0;
        for (const doc of collDocs[name]) {
            const { value, changed } = replaceUrls(doc, urlMap);
            if (changed) {
                await db.collection(name).replaceOne({ _id: doc._id }, value);
                updated += 1;
            }
        }
        console.log(`${name}: updated ${updated}/${collDocs[name].length} docs`);
    }

    const failedUrls = [...urlMap.entries()].filter(([, v]) => !v).map(([k]) => k);
    if (failedUrls.length) {
        console.log(`\n${failedUrls.length} URLs failed to migrate (left pointing at old cloud):`);
        failedUrls.forEach((u) => console.log(`  - ${u}`));
    }

    await mongoose.disconnect();
    console.log('\nDone.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
