import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const orders = await db.collection('orders').find({}).toArray();
    const cloudUrls = new Set();
    const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        for (const v of Object.values(o)) {
            if (typeof v === 'string' && v.startsWith('https://res.cloudinary.com/')) cloudUrls.add(v);
            else if (Array.isArray(v)) v.forEach((i) => (typeof i === 'string' && i.startsWith('https://res.cloudinary.com/') ? cloudUrls.add(i) : walk(i)));
            else if (v && typeof v === 'object') walk(v);
        }
    };
    orders.forEach(walk);
    console.log('Order cloudinary URLs found:', [...cloudUrls]);

    // Cross-check: does each of these also exist as a Product.image/images value?
    const products = await db.collection('products').find({}).toArray();
    const productUrls = new Set();
    products.forEach((p) => {
        if (typeof p.image === 'string') productUrls.add(p.image);
        if (Array.isArray(p.images)) p.images.forEach((u) => typeof u === 'string' && productUrls.add(u));
    });
    for (const u of cloudUrls) {
        console.log(`  ${u} -> also in products? ${productUrls.has(u)}`);
    }

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
