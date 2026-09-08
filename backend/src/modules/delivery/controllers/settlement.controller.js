import Razorpay from 'razorpay';
import crypto from 'crypto';
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

    if (settlement.status === 'completed') {
        return res.status(200).json(new ApiResponse(200, settlement, 'Settlement already completed.'));
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
        settlement.status = 'failed';
        await settlement.save();
        throw new ApiError(400, 'Invalid payment signature. Verification failed.');
    }

    // Payment is valid - Update Rider's cashCollected
    const rider = await DeliveryBoy.findById(settlement.deliveryBoyId);
    if (!rider) throw new ApiError(404, 'Delivery boy not found.');

    rider.cashInHand = Math.max(0, rider.cashInHand - settlement.amount);
    // rider.cashCollected is a lifetime total, do not decrement it.
    await rider.save();

    // Invalidate dashboard and profile cache to reflect updated balance immediately
    await cacheInvalidate(`dash:${rider._id}`, `profile:${rider._id}`);

    // Update settlement record
    settlement.razorpayPaymentId = razorpay_payment_id;
    settlement.razorpaySignature = razorpay_signature;
    settlement.status = 'completed';
    settlement.settledAt = new Date();
    await settlement.save();

    res.status(200).json(new ApiResponse(200, settlement, 'Cash settled successfully via online payment.'));
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
