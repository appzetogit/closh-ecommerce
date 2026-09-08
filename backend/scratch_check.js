import 'dotenv/config';
import mongoose from 'mongoose';
import { Order } from './src/models/Order.model.js';
import Commission from './src/models/Commission.model.js';

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const order = await Order.findOne({ orderId: 'ORD-260707-PKFK' });
        console.log("Order found:", order ? {
            orderId: order.orderId,
            status: order.status,
            orderType: order.orderType,
            deliveredAt: order.deliveredAt,
            updatedAt: order.updatedAt
        } : null);

        if (order) {
            const comm = await Commission.find({ orderId: order._id });
            console.log("Commissions found:", comm.map(c => ({
                id: c._id,
                status: c.status,
                vendorEarnings: c.vendorEarnings,
                orderId: c.orderId
            })));
        }
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
