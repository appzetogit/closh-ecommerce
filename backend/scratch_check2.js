import 'dotenv/config';
import mongoose from 'mongoose';
import { Order } from './src/models/Order.model.js';
import ReturnRequest from './src/models/ReturnRequest.model.js';
import DeliveryBoy from './src/models/DeliveryBoy.model.js';

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const order = await Order.findOne({ orderId: 'ORD-260707-PKFK' });
        console.log("Order found:", order ? {
            orderId: order.orderId,
            status: order.status,
            orderType: order.orderType,
            deliveryBoyId: order.deliveryBoyId,
            vendorItems: order.vendorItems.map(vi => vi.status),
            deliveryFlow: order.deliveryFlow
        } : null);

        const returns = await ReturnRequest.find({ orderId: order?._id });
        console.log("Return Requests:", returns.map(r => ({
            id: r._id,
            status: r.status,
            items: r.items.map(i => i.name),
            reason: r.reason,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
        })));
        
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
