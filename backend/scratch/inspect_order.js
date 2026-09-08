import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function check() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    // Let's print the status enum from the compiled schema
    const statusEnum = Order.schema.path('status').enumValues;
    console.log('Compiled Order status enum values:', statusEnum);

    const vendorItemStatusEnum = Order.schema.path('vendorItems.status').enumValues;
    console.log('Compiled vendorItems.status enum values:', vendorItemStatusEnum);

    await mongoose.disconnect();
}

check().catch(console.error);
