import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from './src/models/DeliveryBoy.model.js';

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const dboy = await DeliveryBoy.findById('6a4cc1b987884e31e7bf2f4e');
        console.log("Delivery Boy:", dboy);
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
