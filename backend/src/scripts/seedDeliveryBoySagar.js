import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import DeliveryBoy from '../models/DeliveryBoy.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}

const seedDeliveryBoySagar = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const phone = '9669002380';
        const email = 'sagar@delivery.com';

        const existing = await DeliveryBoy.findOne({ $or: [{ phone }, { email }] });

        if (existing) {
            existing.password = '123456789';
            existing.name = 'Sagar';
            existing.email = email;
            existing.phone = phone;
            existing.applicationStatus = 'approved';
            existing.isActive = true;
            existing.isAvailable = true;
            await existing.save();
            console.log(`✅ Delivery Boy updated:`);
        } else {
            await DeliveryBoy.create({
                name: 'Sagar',
                email: email,
                password: '123456789',
                phone: phone,
                applicationStatus: 'approved',
                isActive: true,
                isAvailable: true
            });
            console.log(`✅ Delivery Boy created:`);
        }
        
        console.log(`   📧 Email: ${email}`);
        console.log(`   📱 Phone: ${phone}`);
        console.log(`   🔑 Password: 123456789`);
        console.log(`   🔢 Default OTP: 123456`);

    } catch (err) {
        console.error('❌ Seed failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

seedDeliveryBoySagar();
