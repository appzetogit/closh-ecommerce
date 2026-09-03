import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Order } from '../src/models/Order.model.js';
import { ReturnRequest } from '../src/models/ReturnRequest.model.js';

await mongoose.connect(process.env.MONGO_URI);
const orders = await Order.find({ orderId: /^ORD-RETINV-/ }).select('_id orderId');
const orderIds = orders.map((o) => o._id);
const returnsDeleted = await ReturnRequest.deleteMany({ orderId: { $in: orderIds } });
const ordersDeleted = await Order.deleteMany({ _id: { $in: orderIds } });
console.log(`Deleted ${ordersDeleted.deletedCount} test order(s): ${orders.map((o) => o.orderId).join(', ') || '(none)'}`);
console.log(`Deleted ${returnsDeleted.deletedCount} test return request(s).`);
await mongoose.disconnect();
process.exit(0);
