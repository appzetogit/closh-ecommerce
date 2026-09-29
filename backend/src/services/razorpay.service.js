import Razorpay from 'razorpay';
import ApiError from '../utils/ApiError.js';
import axios from 'axios';

/**
 * Razorpay Payouts Service
 * Note: Payouts usually require RazorpayX API which is separate from standard Razorpay API.
 * However, we can use the Payouts API if available on the account.
 */

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const ACCOUNT_NUMBER = process.env.RAZORPAYX_ACCOUNT_NUMBER;

// Basic Auth for Razorpay API calls not covered by the SDK
const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');

/**
 * Step 1: Create a Contact in RazorpayX
 */
export const createContact = async ({ name, email, phone, reference_id, type = 'vendor' }) => {
    try {
        const response = await axios.post('https://api.razorpay.com/v1/contacts', {
            name,
            email,
            contact: phone,
            type, // 'vendor' | 'customer' | 'employee' | 'self' — RazorpayX-recognized contact types
            reference_id
        }, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        return response.data;
    } catch (error) {
        console.error('Razorpay Create Contact Error:', error.response?.data || error.message);
        throw new ApiError(500, 'Failed to create Razorpay contact.');
    }
};

/**
 * Step 2: Create a Fund Account (UPI)
 */
export const createFundAccount = async ({ contact_id, upi_vpa }) => {
    try {
        const response = await axios.post('https://api.razorpay.com/v1/fund_accounts', {
            contact_id,
            account_type: 'vpa',
            vpa: { address: upi_vpa }
        }, {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        return response.data;
    } catch (error) {
        console.error('Razorpay Create Fund Account Error:', error.response?.data || error.message);
        throw new ApiError(500, 'Failed to create Razorpay fund account.');
    }
};

/**
 * Step 3: Create a Payout
 */
export const createPayout = async ({ amount, fund_account_id, reference_id, purpose = 'payout' }) => {
    try {
        const response = await axios.post('https://api.razorpay.com/v1/payouts', {
            account_number: ACCOUNT_NUMBER,
            fund_account_id,
            amount: Math.round(amount * 100), // convert to paise
            currency: 'INR',
            mode: 'UPI',
            purpose,
            reference_id,
            queue_if_low_balance: true,
        }, {
            headers: {
                'Authorization': `Basic ${auth}`,
                // Lets a retried call (e.g. a flaky network response after the
                // payout actually went through) safely resolve to the same
                // payout instead of firing money twice for the same reference.
                'X-Payout-Idempotency': reference_id,
            }
        });
        return response.data;
    } catch (error) {
        console.error('Razorpay Payout Error:', error.response?.data || error.message);
        const errData = error.response?.data?.error || {};
        throw new ApiError(500, `Razorpay Payout Failed: ${errData.description || error.message}`);
    }
};

/**
 * Combined function to payout to a UPI ID.
 * `contactType`/`purpose` let callers reuse this for different payout kinds
 * (vendor/delivery settlements vs. customer refunds) instead of hardcoding
 * 'vendor'/'payout' for everything.
 */
export const payoutToUpi = async ({ name, email, phone, upiId, amount, requestId, contactType = 'vendor', purpose = 'payout' }) => {
    if (!KEY_ID || !KEY_SECRET || !ACCOUNT_NUMBER) {
        throw new ApiError(400, 'Razorpay configuration is missing in environment variables.');
    }

    // 1. Create/Get Contact (In real app, you might want to store contact_id in DB)
    const contact = await createContact({ name, email, phone, reference_id: requestId, type: contactType });

    // 2. Create Fund Account
    const fundAccount = await createFundAccount({ contact_id: contact.id, upi_vpa: upiId });

    // 3. Process Payout
    return await createPayout({ amount, fund_account_id: fundAccount.id, reference_id: requestId, purpose });
};

/**
 * Refund a specific payment
 */
export const refundPayment = async ({ paymentId, amount, notes = {} }) => {
    if (!paymentId) {
        throw new ApiError(400, "Payment ID is required for refund.");
    }
    
    try {
        const instance = new Razorpay({
            key_id: KEY_ID,
            key_secret: KEY_SECRET,
        });

        const payload = {
            amount: Math.round(amount * 100), // convert to paise
            notes,
            speed: 'optimum', // Use optimum speed for instant refunds
        };

        if (notes.receipt) {
            payload.receipt = notes.receipt;
        }

        const refund = await instance.payments.refund(paymentId, payload);
        
        return refund;
    } catch (error) {
        console.error('Razorpay Refund Error:', error);
        throw new ApiError(500, `Razorpay Refund Failed: ${error.message || 'Unknown error'}`);
    }
};
