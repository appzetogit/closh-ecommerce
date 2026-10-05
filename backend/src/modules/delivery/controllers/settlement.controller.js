import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import CashSettlement from '../../../models/CashSettlement.model.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { cacheInvalidate } from './order.controller.js';

const getRazorpayInstance = () => {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!key_id || !key_secret) {
        console.warn('⚠️ Razorpay keys missing. Settlement orders will fail.');
        return null;
    }
    
    return new Razorpay({ key_id, key_secret });
};

/**
 * Initialize a cash settlement order
 */
export const createSettlementOrder = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const deliveryBoyId = req.user.id;

    if (!amount || amount <= 0) {
        throw new ApiError(400, 'Invalid amount for settlement.');
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId);
    if (!rider) throw new ApiError(404, 'Delivery boy not found.');

    if (amount > rider.cashInHand) {
        throw new ApiError(400, `You cannot settle more than your collected cash (₹${rider.cashInHand}).`);
    }

    const options = {
        amount: Math.round(amount * 100), // convert to paise
        currency: 'INR',
        receipt: `settle_${Date.now()}`,
        notes: {
            deliveryBoyId,
            type: 'cash_settlement'
        }
    };

    try {
        const razorpay = getRazorpayInstance();
        if (!razorpay) throw new ApiError(500, 'Payment gateway not configured.');

        const order = await razorpay.orders.create(options);

        // Create a pending settlement record
        await CashSettlement.create({
            deliveryBoyId,
            amount,
            razorpayOrderId: order.id,
            status: 'pending'
        });

        res.status(200).json(new ApiResponse(200, {
            orderId: order.id,
            amount: amount,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        }, 'Settlement order created successfully.'));
    } catch (error) {
        console.error('Razorpay Order Error:', error);
        throw new ApiError(500, 'Failed to initialize payment with Razorpay.');
    }
});

/**
 * Verify settlement payment and update balances
 */
export const verifySettlement = asyncHandler(async (req, res) => {
    const { 
        razorpay_order_id, 
        razorpay_payment_id, 
        razorpay_signature 
    } = req.body;

    const settlement = await CashSettlement.findOne({ razorpayOrderId: razorpay_order_id });
    if (!settlement) throw new ApiError(404, 'Settlement record not found.');

    // A rider may only verify their own settlement. Without this, any signed-in rider
    // who learned a Razorpay order id could mark another rider's settlement as failed.
    if (String(settlement.deliveryBoyId) !== String(req.user.id)) {
        throw new ApiError(403, 'This settlement does not belong to you.');
    }

    if (settlement.status === 'completed') {
        return res.status(200).json(new ApiResponse(200, settlement, 'Settlement already completed.'));
    }

    // Verify signature (constant-time)
    const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest('hex');
    const expectedBuf = Buffer.from(generatedSignature, 'utf8');
    const providedBuf = Buffer.from(String(razorpay_signature || ''), 'utf8');
    const signatureOk = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!signatureOk) {
        // Only flip a still-pending settlement; never overwrite a completed one.
        await CashSettlement.updateOne({ _id: settlement._id, status: 'pending' }, { $set: { status: 'failed' } });
        throw new ApiError(400, 'Invalid payment signature. Verification failed.');
    }

    // Claim the settlement and debit the rider in ONE transaction. The claim is
    // conditional on status 'pending', so two concurrent verifies cannot both pass and
    // deduct twice; the debit is a single $inc rather than read-modify-save.
    // rider.cashCollected is a lifetime total, so only cashInHand is reduced.
    const session = await mongoose.startSession();
    let completed = null;
    try {
        await session.withTransaction(async () => {
            completed = await CashSettlement.findOneAndUpdate(
                { _id: settlement._id, status: 'pending' },
                {
                    $set: {
                        razorpayPaymentId: razorpay_payment_id,
                        razorpaySignature: razorpay_signature,
                        status: 'completed',
                        settledAt: new Date(),
                    },
                },
                { session, new: true }
            );
            if (!completed) return; // someone else already completed it

            const rider = await DeliveryBoy.findByIdAndUpdate(
                settlement.deliveryBoyId,
                { $inc: { cashInHand: -settlement.amount } },
                { session, new: true }
            );
            if (!rider) throw new ApiError(404, 'Delivery boy not found.');

            // cashInHand never goes below zero.
            if (rider.cashInHand < 0) {
                await DeliveryBoy.updateOne({ _id: rider._id }, { $set: { cashInHand: 0 } }, { session });
            }
        });
    } finally {
        await session.endSession();
    }

    if (!completed) {
        const latest = await CashSettlement.findById(settlement._id);
        return res.status(200).json(new ApiResponse(200, latest, 'Settlement already completed.'));
    }

    // Invalidate dashboard and profile cache to reflect updated balance immediately
    await cacheInvalidate(`dash:${settlement.deliveryBoyId}`, `profile:${settlement.deliveryBoyId}`);

    res.status(200).json(new ApiResponse(200, completed, 'Cash settled successfully via online payment.'));
});

/**
 * Get settlement history for current rider
 */
export const getSettlementHistory = asyncHandler(async (req, res) => {
    const settlements = await CashSettlement.find({ 
        deliveryBoyId: req.user.id,
        status: 'completed'
    }).sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, settlements, 'Settlement history fetched.'));
});
