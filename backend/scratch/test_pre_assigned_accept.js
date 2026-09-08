import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import DeliveryBatch from '../src/models/DeliveryBatch.model.js';

const MONGO_URI = process.env.MONGO_URI;

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    const orderId = '6a0c0b142927496b324c25ba';
    const deliveryBoyId = new mongoose.Types.ObjectId('6a084c96e05571753d443ad4');

    // 1. Reset any existing DeliveryBatch for this order so we can test clean
    await DeliveryBatch.deleteMany({ customerId: new mongoose.Types.ObjectId('6a084c93e05571753d443a53') }); // Customer of this order
    console.log('Cleared existing batches.');

    // 2. Simulate Admin pre-assignment: Set deliveryBoyId in DB and set status to 'processing'
    await Order.findByIdAndUpdate(orderId, {
        $set: {
            status: 'processing',
            deliveryBoyId: deliveryBoyId
        }
    });
    console.log('Simulated Admin pre-assignment: set deliveryBoyId and status=processing in DB.');

    // 3. Import and execute the accept logic dynamically or simulate it exactly as updated
    const idFilter = [{ _id: new mongoose.Types.ObjectId(orderId) }];
    
    // Simulate acceptOrderAssignment logic:
    // With our updated activeOrderQuery that excludes the order being accepted:
    const activeOrderQuery = {
        deliveryBoyId: deliveryBoyId,
        isDeleted: { $ne: true },
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery', 'arrived'] }
    };
    activeOrderQuery._id = { $ne: new mongoose.Types.ObjectId(orderId) };

    const hasActiveOrder = await Order.exists(activeOrderQuery);
    console.log('Has other active order:', hasActiveOrder);

    // Run findOneAndUpdate with our updated query:
    const order = await Order.findOneAndUpdate(
        {
            $and: [
                { $or: idFilter },
                { status: { $in: ['ready_for_pickup', 'all_vendors_ready', 'processing', 'assigned'] } },
                { 
                    $or: [
                        { deliveryBoyId: null }, 
                        { deliveryBoyId: { $exists: false } },
                        { deliveryBoyId: deliveryBoyId } // Allows re-confirming same rider
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
        console.log('❌ Simulated accept failed: Order not found or already assigned to someone else!');
    } else {
        console.log('✅ Simulated accept succeeded!');
        console.log(`Updated Order Status: ${order.status}`);
        console.log(`Updated Order deliveryBoyId: ${order.deliveryBoyId}`);

        // Set up the batch like in acceptOrderAssignment
        try {
            const rider = await DeliveryBoy.findById(deliveryBoyId).select('currentLocation');
            const riderCoords = rider?.currentLocation?.coordinates;

            const rawStops = order.vendorPickups || [];
            const pickupStops = rawStops.map((stop, idx) => ({
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
        } catch (err) {
            console.error('❌ Error creating batch:', err);
        }
    }

    await mongoose.disconnect();
}

run().catch(console.error);
