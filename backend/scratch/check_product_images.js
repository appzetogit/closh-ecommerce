import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../src/models/Product.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const targetId = '6a58e6bdb313e8d2b6e557fa';
    const target = await Product.findById(targetId).select('name image images');
    console.log('Target product from screenshot link:', target ? {
        name: target.name,
        image: target.image,
        images: target.images,
    } : 'NOT FOUND');

    const sample = await Product.find({}).select('name image images').limit(10).sort({ createdAt: -1 });
    console.log(`\nMost recent ${sample.length} products:`);
    for (const p of sample) {
        console.log({ name: p.name, image: p.image, images: p.images });
    }

    // Check how many products have a missing/empty image vs a non-Cloudinary image
    const total = await Product.countDocuments({});
    const missingImage = await Product.countDocuments({ $or: [{ image: { $exists: false } }, { image: '' }, { image: null }] });
    const nonCloudinary = await Product.countDocuments({ image: { $exists: true, $ne: '', $not: /res\.cloudinary\.com/ } });
    console.log(`\nTotals: ${total} products, ${missingImage} with no 'image' field, ${nonCloudinary} with an 'image' NOT pointing to res.cloudinary.com`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
