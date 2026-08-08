import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const COLLECTIONS = ['categories', 'products', 'brands', 'orders', 'deliveryboys'];

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
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../uploads/cloudinary-migration-metadata.json'), 'utf8'));
    const urlMap = new Map(manifest.map((m) => [m.originalUrl, m.newUrl]));
    console.log(`Loaded manifest: ${urlMap.size} URL mappings.`);

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    const db = mongoose.connection.db;

    for (const name of COLLECTIONS) {
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
