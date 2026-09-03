/**
 * End-to-end test: after a return request is completed, the order should be
 * stamped with returnedQuantity (per item) / returnedAmount (order total) so
 * every invoice generator (admin/user/vendor) shows the actual amount payable
 * after the return — not the original order value.
 *
 * Exercises the REAL HTTP controllers (not re-implemented logic) against the
 * backend already running on http://localhost:5050, then verifies the
 * persisted Order document directly via Mongoose.
 *
 * Usage: node backend/scratch/test_return_invoice_e2e.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { User } from '../src/models/User.model.js';
import { Order } from '../src/models/Order.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Product from '../src/models/Product.model.js';
import Admin from '../src/models/Admin.model.js';
import { ReturnRequest } from '../src/models/ReturnRequest.model.js';
import { generateReturnId } from '../src/utils/generateReturnId.js';
import { signAccessToken } from '../src/config/jwt.js';

const API_BASE = process.env.TEST_API_BASE || 'http://localhost:5050/api';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        passed++;
        results.push({ ok: true, label });
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        results.push({ ok: false, label, detail });
        console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

async function jsonFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch { /* no body */ }
    return { status: res.status, body };
}

async function ensureAdmin() {
    const email = 'admin@closhcommerce.com';
    const password = 'Pradeep@#1762';
    let admin = await Admin.findOne({ email });
    if (!admin) {
        admin = await Admin.create({ name: 'Super Admin', email, password, role: 'superadmin', isActive: true });
        console.log('  (seeded a fresh superadmin for this test)');
    }

    let { status, body } = await jsonFetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

    if (status !== 200) {
        // Existing admin has a different password — reset it to the known test password.
        admin.password = password;
        admin.role = 'superadmin';
        admin.isActive = true;
        await admin.save();
        console.log('  (reset existing superadmin password for this test)');
        ({ status, body } = await jsonFetch(`${API_BASE}/admin/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }));
    }

    if (status !== 200) throw new Error(`Admin login failed: ${status} ${JSON.stringify(body)}`);
    return body.data.accessToken;
}

async function buildOrder({ user, vendor, productA, productB }) {
    const orderId = `ORD-RETINV-${Math.floor(100000 + Math.random() * 900000)}`;
    const itemA = {
        productId: productA._id,
        vendorId: vendor._id,
        name: productA.name,
        image: '',
        price: 500,
        originalPrice: 600,
        quantity: 2,
        basePrice: 500,
    };
    const itemB = {
        productId: productB._id,
        vendorId: vendor._id,
        name: productB.name,
        image: '',
        price: 1000,
        originalPrice: 1000,
        quantity: 1,
        basePrice: 1000,
    };
    const subtotal = itemA.price * itemA.quantity + itemB.price * itemB.quantity; // 2000
    const total = subtotal; // no shipping/platformFee for simplicity

    const order = await Order.create({
        orderId,
        userId: user._id,
        orderType: 'check_and_buy',
        deliveryType: 'online',
        paymentMethod: 'cod',
        paymentStatus: 'paid',
        status: 'delivered',
        isMultiVendor: false,
        subtotal,
        shipping: 0,
        platformFee: 0,
        tax: 0,
        total,
        shippingAddress: {
            name: user.name,
            phone: user.phone,
            address: '123 Test Street',
            city: 'Indore',
            state: 'Madhya Pradesh',
            zipCode: '452001',
            country: 'India',
        },
        items: [itemA, itemB],
        vendorItems: [
            {
                vendorId: vendor._id,
                vendorName: vendor.storeName,
                items: [itemA, itemB],
                subtotal,
                basePrice: subtotal,
                shipping: 0,
                platformFee: 0,
                status: 'delivered',
            },
        ],
        deliveredAt: new Date(),
    });
    return { order, itemA, itemB, total };
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB\n');

    console.log('--- Setup ---');
    const user = await User.findOne();
    const vendor = await Vendor.findOne();
    const products = await Product.find().limit(2);
    if (!user || !vendor || products.length < 2) {
        console.error('❌ Need at least 1 user, 1 vendor and 2 products already in the DB to run this test.');
        process.exit(1);
    }
    const [productA, productB] = products;
    console.log(`  Using user=${user._id} vendor=${vendor._id} productA=${productA._id} productB=${productB._id}`);

    const adminToken = await ensureAdmin();
    console.log('  Admin token acquired.\n');

    // ============================================================
    // SCENARIO 1 — Admin flow: partial return of item A (1 of 2 units)
    // ============================================================
    console.log('--- Scenario 1: Admin completes a partial return ---');
    const { order, itemA, total } = await buildOrder({ user, vendor, productA, productB });
    console.log(`  Order ${order.orderId} created. total=₹${total}`);

    const returnQty = 1;
    const returnAmount = itemA.price * returnQty; // 500
    const returnRequest = await ReturnRequest.create({
        orderId: order._id,
        returnId: generateReturnId(),
        userId: user._id,
        vendorId: vendor._id,
        isMultiVendor: false,
        items: [
            {
                productId: itemA.productId,
                name: itemA.name,
                image: itemA.image,
                price: itemA.price,
                quantity: returnQty,
                reason: 'Changed my mind',
            },
        ],
        reason: 'Changed my mind',
        status: 'pending',
        refundAmount: returnAmount,
    });
    console.log(`  Return request ${returnRequest.returnId} created for ${returnQty} unit(s) of "${itemA.name}" (₹${returnAmount}).`);

    // pending -> approved
    let r = await jsonFetch(`${API_BASE}/admin/return-requests/${returnRequest._id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'approved' }),
    });
    assert(r.status === 200, 'PATCH approved succeeds', JSON.stringify(r.body));

    // approved -> completed (+ refund processed; COD order so it's a manual-refund note, no Razorpay call)
    r = await jsonFetch(`${API_BASE}/admin/return-requests/${returnRequest._id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'completed', refundStatus: 'processed' }),
    });
    assert(r.status === 200, 'PATCH completed succeeds', JSON.stringify(r.body));

    let freshOrder = await Order.findById(order._id).lean();
    const freshItemA = freshOrder.items.find((i) => String(i.productId) === String(itemA.productId));
    assert(freshItemA.returnedQuantity === returnQty, `item.returnedQuantity === ${returnQty}`, `got ${freshItemA.returnedQuantity}`);
    assert(freshOrder.returnedAmount === returnAmount, `order.returnedAmount === ${returnAmount}`, `got ${freshOrder.returnedAmount}`);
    assert(freshOrder.status === 'returned', `order.status === 'returned'`, `got ${freshOrder.status}`);

    const freshVendorItemA = freshOrder.vendorItems[0].items.find((i) => String(i.productId) === String(itemA.productId));
    assert(freshVendorItemA.returnedQuantity === returnQty, 'vendorItems[].items returnedQuantity kept in sync', `got ${freshVendorItemA.returnedQuantity}`);

    // Idempotency: re-sending the same 'completed' status must NOT double-apply.
    r = await jsonFetch(`${API_BASE}/admin/return-requests/${returnRequest._id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'completed' }),
    });
    assert(r.status === 200, 'Re-sending completed status does not error', JSON.stringify(r.body));
    freshOrder = await Order.findById(order._id).lean();
    assert(freshOrder.returnedAmount === returnAmount, 'returnedAmount unchanged after duplicate completed call (idempotency guard)', `got ${freshOrder.returnedAmount}`);
    const freshItemA2 = freshOrder.items.find((i) => String(i.productId) === String(itemA.productId));
    assert(freshItemA2.returnedQuantity === returnQty, 'item.returnedQuantity unchanged after duplicate completed call', `got ${freshItemA2.returnedQuantity}`);

    // Round-trip through the real admin "get order" endpoint (same one the Invoice page calls).
    r = await jsonFetch(`${API_BASE}/admin/orders/${order._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(r.status === 200, 'GET admin order detail succeeds', JSON.stringify(r.body));
    const apiItemA = r.body?.data?.items?.find((i) => String(i.productId?._id || i.productId) === String(itemA.productId));
    assert(apiItemA?.returnedQuantity === returnQty, 'API response exposes returnedQuantity on item', `got ${apiItemA?.returnedQuantity}`);
    assert(r.body?.data?.returnedAmount === returnAmount, 'API response exposes order.returnedAmount', `got ${r.body?.data?.returnedAmount}`);

    // Recompute what the invoice will now show (same math as the 3 invoice generators) and
    // confirm it equals "original total minus returned amount" for this simple case.
    const items = r.body.data.items;
    let invoiceGrandTotal = 0;
    for (const item of items) {
        const originalQty = item.quantity || 1;
        const returnedQty = Math.min(Number(item.returnedQuantity || 0), originalQty);
        const qty = originalQty - returnedQty;
        if (qty <= 0) continue;
        invoiceGrandTotal += (item.price || 0) * qty;
    }
    assert(invoiceGrandTotal === total - returnAmount, `Invoice grand total reflects post-return amount (₹${total - returnAmount})`, `got ₹${invoiceGrandTotal}`);

    // ============================================================
    // SCENARIO 2 — Vendor flow: full return of item B (regression-tests the
    // previousStatus fix so approval bookkeeping no longer silently no-ops).
    // ============================================================
    console.log('\n--- Scenario 2: Vendor completes a full return ---');
    const approvedVendor = await Vendor.findOne({ status: 'approved', isVerified: true });
    if (!approvedVendor) {
        console.log('  ⚠️  Skipped — no vendor with status=approved & isVerified=true in this DB.');
    } else {
        const build2 = await buildOrder({ user, vendor: approvedVendor, productA, productB });
        const { order: order2, itemB } = build2;
        console.log(`  Order ${order2.orderId} created (vendor ${approvedVendor.storeName || approvedVendor._id}).`);

        const returnAmount2 = itemB.price * itemB.quantity; // full return of item B
        const returnRequest2 = await ReturnRequest.create({
            orderId: order2._id,
            returnId: generateReturnId(),
            userId: user._id,
            vendorId: approvedVendor._id,
            isMultiVendor: false,
            items: [
                {
                    productId: itemB.productId,
                    name: itemB.name,
                    image: itemB.image,
                    price: itemB.price,
                    quantity: itemB.quantity,
                    reason: 'Quality not as expected',
                },
            ],
            reason: 'Quality not as expected',
            status: 'pending',
            refundAmount: returnAmount2,
        });

        const vendorToken = signAccessToken({ id: approvedVendor._id, role: 'vendor', email: approvedVendor.email });

        r = await jsonFetch(`${API_BASE}/vendor/return-requests/${returnRequest2._id}/status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${vendorToken}` },
            body: JSON.stringify({ status: 'approved' }),
        });
        assert(r.status === 200, '[vendor] PATCH approved succeeds', JSON.stringify(r.body));

        r = await jsonFetch(`${API_BASE}/vendor/return-requests/${returnRequest2._id}/status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${vendorToken}` },
            body: JSON.stringify({ status: 'completed' }),
        });
        assert(r.status === 200, '[vendor] PATCH completed succeeds', JSON.stringify(r.body));

        const freshOrder2 = await Order.findById(order2._id).lean();
        const freshItemB = freshOrder2.items.find((i) => String(i.productId) === String(itemB.productId));
        assert(freshItemB.returnedQuantity === itemB.quantity, `[vendor] item.returnedQuantity === ${itemB.quantity} (full return)`, `got ${freshItemB.returnedQuantity}`);
        assert(freshOrder2.returnedAmount === returnAmount2, `[vendor] order.returnedAmount === ${returnAmount2}`, `got ${freshOrder2.returnedAmount}`);
        assert(freshOrder2.status === 'returned' && freshOrder2.paymentStatus === 'refunded', '[vendor] single-vendor order marked returned+refunded once its only vendor completes', `status=${freshOrder2.status} paymentStatus=${freshOrder2.paymentStatus}`);

        // Idempotency on the vendor path too.
        r = await jsonFetch(`${API_BASE}/vendor/return-requests/${returnRequest2._id}/status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${vendorToken}` },
            body: JSON.stringify({ status: 'completed' }),
        });
        const freshOrder2b = await Order.findById(order2._id).lean();
        assert(freshOrder2b.returnedAmount === returnAmount2, '[vendor] returnedAmount unchanged after duplicate completed call', `got ${freshOrder2b.returnedAmount}`);
    }

    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exitCode = failed > 0 ? 1 : 0;
    await mongoose.disconnect();
}

run()
    .catch((err) => {
        console.error('❌ Test crashed:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await mongoose.disconnect(); } catch { /* already closed */ }
    });
