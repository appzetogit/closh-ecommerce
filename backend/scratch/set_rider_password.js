import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    console.log('Connecting...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const riderEmail = 'rider@closh.com';
    const rider = await DeliveryBoy.findOne({ email: riderEmail });
    if (!rider) {
        console.error('Rider not found!');
        process.exit(1);
    }

    rider.password = 'delivery123';
    // Let Mongoose save and trigger password pre-save hook
    await rider.save();

    console.log('Successfully set password for Test Rider to delivery123');
    await mongoose.disconnect();
}

run().catch(console.error);
