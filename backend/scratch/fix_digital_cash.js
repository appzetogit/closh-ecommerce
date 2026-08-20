/**
 * Corrects orders that were paid ONLINE at the doorstep (Razorpay/UPI QR) but were
 * still recorded as COD, and reverses the cash-in-hand those orders wrongly added to
 * the rider's ledger.
 *
 * Dry run by default. Pass --apply to actually write.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Order } from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';

const APPLY = process.argv.includes('--apply');

// Only orders that actually reached the rider's wallet get their cash reversed.
const SETTLED_STATUSES = ['delivered', 'try_buy_completed', 'returned', 'returning_unselected_items'];

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(APPLY ? '*** APPLY MODE — writing changes ***\n' : '*** DRY RUN — nothing will be written ***\n');

    const affected = await Order.find({
        'deliveryFlow.paymentMethod': { $in: ['qr', 'online'] },
        paymentMethod: { $in: ['cod', 'cash'] },
        paymentStatus: 'paid',
    }).select('orderId status total paymentMethod deliveryBoyId deliveryFlow.paymentMethod deliveryFlow.finalAmount').lean();

    console.log(`Orders paid online at door but recorded as COD: ${affected.length}\n`);

    const perRider = new Map();

    for (const o of affected) {
        const amount = Number(o.deliveryFlow?.finalAmount ?? o.total ?? 0);
        const countsForCash = SETTLED_STATUSES.includes(o.status) && o.deliveryBoyId;
        console.log(` ${o.orderId} | status:${o.status} | ₹${amount} | paymentMethod: cod -> upi`
            + (countsForCash ? ` | reverse ₹${amount} from rider cash` : ' | no cash impact'));

        if (countsForCash) {
            const key = String(o.deliveryBoyId);
            perRider.set(key, (perRider.get(key) || 0) + amount);
        }
    }

    console.log('\n--- Rider cash corrections ---');
    for (const [riderId, wrongAmount] of perRider) {
        const rider = await DeliveryBoy.findById(riderId).select('name cashInHand cashCollected').lean();
        if (!rider) { console.log(` rider ${riderId} not found`); continue; }
        const newInHand = Math.max(0, Number(rider.cashInHand || 0) - wrongAmount);
        const newCollected = Math.max(0, Number(rider.cashCollected || 0) - wrongAmount);
        console.log(` ${rider.name}: cashInHand ₹${rider.cashInHand} -> ₹${newInHand}`
            + ` | cashCollected ₹${rider.cashCollected} -> ₹${newCollected}   (reversing ₹${wrongAmount})`);

        if (APPLY) {
            await DeliveryBoy.updateOne({ _id: riderId }, { $set: { cashInHand: newInHand, cashCollected: newCollected } });
        }
    }

    if (APPLY && affected.length) {
        const res = await Order.updateMany(
            { _id: { $in: affected.map(o => o._id) } },
            { $set: { paymentMethod: 'upi' } }
        );
        console.log(`\nOrders updated to paymentMethod 'upi': ${res.modifiedCount}`);
    }

    console.log(APPLY ? '\nDONE — changes written.' : '\nDry run complete. Re-run with --apply to write.');
    process.exit(0);
};
run().catch(e => { console.error(e); process.exit(1); });
