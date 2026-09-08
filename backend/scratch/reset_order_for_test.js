import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import DeliveryBatch from '../src/models/DeliveryBatch.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orderId = 'ORD-260519-ZS0F';

    // 1. Delete all delivery batches related to this customer
    await DeliveryBatch.deleteMany({ customerId: new mongoose.Types.ObjectId('6a084c93e05571753d443a53') });
    console.log('Deleted existing DeliveryBatches.');

    // 2. Reset order status to 'processing' and clear deliveryBoyId/vendorPickups
    const result = await Order.findOneAndUpdate(
        { orderId },
        {
            $set: {
                status: 'processing',
                vendorPickups: []
            },
            $unset: {
                deliveryBoyId: 1
            }
        },
        { new: true }
    );

    if (result) {
        console.log(`✅ Successfully reset order ${orderId} to processing and unassigned.`);
    } else {
        console.log(`❌ Order ${orderId} not found.`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
