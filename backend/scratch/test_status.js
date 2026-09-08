import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orderId = 'ORD-260519-ZS0F';
    const deliveryBoyId = new mongoose.Types.ObjectId('6a084c96e05571753d443ad4');

    const idFilter = [{ orderId }];
    if (mongoose.isValidObjectId(orderId)) idFilter.push({ _id: orderId });

    // Simulated status fetch
    const order = await Order.findOne({
        $and: [
            { $or: idFilter },
            {
                $or: [
                    { deliveryBoyId },
                    { deliveryBoyId: null },
                    { deliveryBoyId: { $exists: false } }
                ]
            }
        ]
    })
        .select('+vendorPickups.handoverOtpDebug')
        .lean();

    if (!order) {
        console.log('❌ Status fetch failed! (404)');
    } else {
        console.log('✅ Status fetch succeeded!');
        console.log(`Order ID: ${order.orderId}`);
        console.log(`Status: ${order.status}`);
        console.log(`DeliveryBoyID: ${order.deliveryBoyId}`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
