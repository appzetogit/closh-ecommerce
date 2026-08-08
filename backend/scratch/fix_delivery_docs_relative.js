import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PREFIX = 'https://api.closh.in';

function toRelative(doc) {
    let changed = false;
    for (const [key, value] of Object.entries(doc || {})) {
        if (typeof value === 'string' && value.startsWith(`${PREFIX}/uploads/delivery-docs/`)) {
            doc[key] = value.slice(PREFIX.length);
            changed = true;
        } else if (value && typeof value === 'object') {
            if (toRelative(value)) changed = true;
        }
    }
    return changed;
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    const db = mongoose.connection.db;
    const coll = db.collection('deliveryboys');
    const cursor = coll.find({});
    let updated = 0;
    const ops = [];
    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (toRelative(doc)) {
            ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc } });
            updated += 1;
        }
    }
    if (ops.length) await coll.bulkWrite(ops);
    console.log(`deliveryboys: converted ${updated} docs to relative delivery-docs paths`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
