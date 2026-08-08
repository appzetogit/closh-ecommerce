import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../src/models/Order.model.js';
import '../src/models/DeliveryBoy.model.js';
import '../src/models/User.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    // Locate the specific stuck order: status 'accepted' but a rider already assigned,
    // matching the customer/amount/date seen in the admin screenshot.
    const candidates = await Order.find({
        status: 'accepted',
        deliveryBoyId: { $ne: null },
        total: 1569,
        paymentMethod: 'cod',
        orderType: 'try_and_buy',
    })
        .populate('deliveryBoyId', 'name phone')
        .populate('userId', 'name email');

    console.log(`Found ${candidates.length} matching order(s).`);
    for (const o of candidates) {
        console.log({
            orderId: o.orderId,
            _id: String(o._id),
            status: o.status,
            total: o.total,
            createdAt: o.createdAt,
            customer: o.shippingAddress?.name || o.guestInfo?.name || o.userId?.name,
            customerEmail: o.shippingAddress?.email || o.guestInfo?.email || o.userId?.email,
            rider: o.deliveryBoyId?.name,
            riderPhone: o.deliveryBoyId?.phone,
        });
    }

    if (candidates.length !== 1) {
        console.log('Aborting: expected exactly 1 match, found', candidates.length, '- no changes made.');
        await mongoose.disconnect();
        return;
    }

    const order = candidates[0];
    order.status = 'assigned';
    await order.save();
    console.log(`Updated order ${order.orderId} (${order._id}) status: accepted -> assigned`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
