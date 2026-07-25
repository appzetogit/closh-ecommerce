import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Vendor from '../models/Vendor.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in .env');
  process.exit(1);
}

const seedVendorIsha = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const phone = '7879363299';
    const email = 'isha@gmail.com';

    // Check if vendor already exists by phone or email
    const existing = await Vendor.findOne({ $or: [{ phone }, { email }] });

    if (existing) {
      existing.password = '123456789';
      existing.name = 'Isha';
      existing.email = email;
      existing.phone = phone;
      existing.storeName = 'Isha Store';
      existing.status = 'approved';
      existing.isVerified = true;
      existing.otp = '123456';
      existing.otpExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
      if (!existing.gstNumber) existing.gstNumber = 'GST' + Date.now();
      await existing.save();
      console.log(`✅ Vendor updated:`);
    } else {
      await Vendor.create({
        name: 'Isha',
        email: email,
        password: '123456789',
        phone: phone,
        storeName: 'Isha Store',
        status: 'approved',
        isVerified: true,
        otp: '123456',
        otpExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        gstNumber: 'GST' + Date.now(),
      });
      console.log(`✅ Vendor created:`);
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

seedVendorIsha();
