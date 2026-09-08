import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orders = await Order.find({ 
        isMultiVendor: true,
        status: { $nin: ['delivered', 'cancelled', 'returned'] }
    }).lean();

    console.log(`\nFound ${orders.length} active multi-vendor orders:`);
    orders.forEach(o => {
        console.log(`- ID: ${o._id} | OrderID: ${o.orderId} | Status: ${o.status} | deliveryBoyId: ${o.deliveryBoyId}`);
    });

    await mongoose.disconnect();
}

run().catch(console.error);
