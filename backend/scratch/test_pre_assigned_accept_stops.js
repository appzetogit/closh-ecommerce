import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import DeliveryBatch from '../src/models/DeliveryBatch.model.js';
import Vendor from '../src/models/Vendor.model.js'; // Import Vendor model so it registers

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orderId = '6a0c0b142927496b324c25ba';
    const deliveryBoyId = new mongoose.Types.ObjectId('6a084c96e05571753d443ad4');

    // 1. Reset any existing DeliveryBatch for this order so we can test clean
    await DeliveryBatch.deleteMany({ customerId: new mongoose.Types.ObjectId('6a084c93e05571753d443a53') }); // Customer of this order
    console.log('Cleared existing batches.');

    // 2. Simulate Admin pre-assignment: Set deliveryBoyId in DB, set status to 'processing', and CLEAR vendorPickups so it simulates the bug
    await Order.findByIdAndUpdate(orderId, {
        $set: {
            status: 'processing',
            deliveryBoyId: deliveryBoyId,
            vendorPickups: []
        }
    });
    console.log('Simulated Admin pre-assignment: set deliveryBoyId, status=processing, and vendorPickups=[] in DB.');

    // 3. Simulate acceptOrderAssignment logic with the dynamic builder
    const idFilter = [{ _id: new mongoose.Types.ObjectId(orderId) }];

    const order = await Order.findOneAndUpdate(
        {
            $and: [
                { $or: idFilter },
                { status: { $in: ['ready_for_pickup', 'all_vendors_ready', 'processing', 'assigned'] } },
                { 
                    $or: [
                        { deliveryBoyId: null }, 
                        { deliveryBoyId: { $exists: false } },
                        { deliveryBoyId: deliveryBoyId }
                    ] 
                }
            ]
        },
        {
            $set: {
                status: 'assigned',
                deliveryBoyId: deliveryBoyId
            }
        },
        { new: true }
    );

    if (!order) {
        console.log('❌ Simulated accept failed!');
    } else {
        console.log('✅ Simulated accept succeeded!');
        
        // Dynamic populator logic:
        let rawStops = order.vendorPickups || [];
        if (rawStops.length === 0) {
            console.log('Building vendorPickups dynamically...');
            const populatedOrder = await Order.findById(order._id).populate('vendorItems.vendorId', 'storeName shopAddress shopLocation');
            rawStops = (populatedOrder?.vendorItems || []).map((vi, idx) => {
                const vendorDoc = vi.vendorId;
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                return {
                    vendorId: vi.vendorId?._id || vi.vendorId,
                    vendorName: vendorDoc?.storeName || vi.vendorName,
                    shopLocation: vendorDoc?.shopLocation || { type: 'Point', coordinates: [0, 0] },
                    shopAddress: vendorDoc?.shopAddress || '',
                    sequence: idx,
                    status: 'pending',
                    handoverOtp: otp,
                    handoverOtpHash: otp,
                    handoverOtpDebug: otp,
                    handoverOtpSentAt: new Date(),
                };
            });
            await Order.findByIdAndUpdate(order._id, { vendorPickups: rawStops });
            order.vendorPickups = rawStops;
        }

        console.log(`Generated ${order.vendorPickups.length} vendorPickups!`);

        // Set up the batch like in acceptOrderAssignment
        try {
            const rider = await DeliveryBoy.findById(deliveryBoyId).select('currentLocation');
            const riderCoords = rider?.currentLocation?.coordinates;

            const pickupStops = order.vendorPickups.map((stop, idx) => ({
                vendorId: stop.vendorId,
                vendorName: stop.vendorName,
                shopAddress: stop.shopAddress,
                location: stop.shopLocation,
                sequence: idx,
                status: 'pending',
                otpVerified: false,
            }));

            const batchId = `MVBATCH-${Date.now()}`;
            const batch = await DeliveryBatch.create({
                batchId,
                deliveryBoyId,
                customerId: order.userId,
                isMultiVendor: true,
                currentStopIndex: 0,
                pickupStops,
                customerLocation: order.dropoffLocation,
                customerAddress: order.shippingAddress,
                customerName: order.shippingAddress?.name,
                status: 'assigned',
            });
            console.log(`✅ Successfully created DeliveryBatch for order ${order.orderId}: batchId = ${batchId}`);
            console.log(`Stops in batch:`, JSON.stringify(batch.pickupStops, null, 2));
        } catch (err) {
            console.error('❌ Error creating batch:', err);
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
