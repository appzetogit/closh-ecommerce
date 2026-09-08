import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import User from '../src/models/User.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orders = await Order.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'phone email name')
        .populate('deliveryBoyId', 'phone email name')
        .lean();

    console.log(`Found ${orders.length} recent orders:`);
    orders.forEach(o => {
        console.log(`-----------------------------------------------`);
        console.log(`Order ID: ${o.orderId} (${o._id})`);
        console.log(`Status: ${o.status}`);
        console.log(`Total: ${o.total}`);
        console.log(`Created At: ${o.createdAt}`);
        console.log(`Customer: ${o.userId?.phone || 'Guest'} | ${o.userId?.name}`);
        console.log(`Rider: ${o.deliveryBoyId?.phone || 'None'} | ${o.deliveryBoyId?.name}`);
        console.log(`Delivery OTP: ${o.deliveryOtpDebug}`);
    });

    await mongoose.disconnect();
}

run().catch(console.error);
