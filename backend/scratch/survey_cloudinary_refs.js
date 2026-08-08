import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OLD_CLOUD = 'dfe2xogxj';

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log(`\nScanning ${collections.length} collections for any field referencing "${OLD_CLOUD}"...\n`);

    for (const { name } of collections) {
        const coll = db.collection(name);
        // Cheap approach: $where is slow but fine for a one-off audit on a small DB.
        // Use a text-free regex scan via aggregation against stringified docs is expensive;
        // instead just count docs where any known-ish pattern matches via $expr + string search
        // Simpler: sample first doc's keys, then do a targeted query using $regexMatch over common fields
        // Fallback: brute-force scan using JSON.stringify per doc (fine for a few thousand docs).
        const cursor = coll.find({});
        let matchCount = 0;
        let total = 0;
        const sampleFields = new Set();
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            total += 1;
            const str = JSON.stringify(doc);
            if (str.includes(OLD_CLOUD)) {
                matchCount += 1;
                if (sampleFields.size < 5) {
                    const walk = (obj, prefix = '') => {
                        for (const [k, v] of Object.entries(obj || {})) {
                            if (typeof v === 'string' && v.includes(OLD_CLOUD)) {
                                sampleFields.add(prefix + k);
                            } else if (Array.isArray(v)) {
                                v.forEach((item, i) => {
                                    if (typeof item === 'string' && item.includes(OLD_CLOUD)) sampleFields.add(prefix + k + '[]');
                                    else if (item && typeof item === 'object') walk(item, prefix + k + '[].');
                                });
                            } else if (v && typeof v === 'object') {
                                walk(v, prefix + k + '.');
                            }
                        }
                    };
                    walk(doc);
                }
            }
        }
        if (matchCount > 0) {
            console.log(`${name}: ${matchCount}/${total} docs reference ${OLD_CLOUD} — fields: [${[...sampleFields].join(', ')}]`);
        }
    }

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
