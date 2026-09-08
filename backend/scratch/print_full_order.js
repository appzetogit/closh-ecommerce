import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orderId = '6a0c0b142927496b324c25ba';

    const order = await Order.findById(orderId).lean();
    if (!order) {
        console.log('❌ Order not found by _id. Trying orderId field...');
        const order2 = await Order.findOne({ orderId }).lean();
        if (!order2) {
            console.log('❌ Order not found by orderId field either!');
        } else {
            printOrder(order2);
        }
    } else {
        printOrder(order);
    }

    await mongoose.disconnect();
}

function printOrder(order) {
    console.log('✅ Order details:');
    console.log('ID:', order._id);
    console.log('OrderID:', order.orderId);
    console.log('Status:', order.status);
    console.log('DeliveryBoyID:', order.deliveryBoyId);
    console.log('isMultiVendor:', order.isMultiVendor);
    console.log('vendorPickups:', JSON.stringify(order.vendorPickups, null, 2));
    console.log('vendorItems:', order.vendorItems?.map(vi => ({
        vendorId: vi.vendorId,
        status: vi.status
    })));
}

run().catch(console.error);
