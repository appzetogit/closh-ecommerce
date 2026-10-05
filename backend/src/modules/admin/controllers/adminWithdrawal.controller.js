import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import WithdrawalRequest from '../../../models/WithdrawalRequest.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Vendor from '../../../models/Vendor.model.js';
import mongoose from 'mongoose';
import { payoutToUpi } from '../../../services/razorpay.service.js';
import { createNotification } from '../../../services/notification.service.js';

/**
 * Get all withdrawal requests
 */
export const getAllWithdrawalRequests = asyncHandler(async (req, res) => {
    const { status, type, requestType } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.requesterType = type;
    if (requestType) filter.requestType = requestType;

    const requests = await WithdrawalRequest.find(filter)
        .populate({ path: 'requesterId', select: 'name email phone storeName storeLogo avatar' })
        .sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, requests, 'Withdrawal requests fetched.'));
});

/**
 * Approve or Reject a withdrawal request
 */
export const updateWithdrawalStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminNotes, transactionId } = req.body;

    if (!['approved', 'rejected', 'completed'].includes(status)) {
        throw new ApiError(400, 'Invalid status.');
    }

    const session = await mongoose.startSession();
    let request;
    try {
        await session.withTransaction(async () => {
            request = await WithdrawalRequest.findById(id).session(session);
            if (!request) throw new ApiError(404, 'Withdrawal request not found.');

            if (request.status !== 'pending') {
                throw new ApiError(400, 'Request has already been processed.');
            }

            const model = request.requesterType === 'DeliveryBoy' ? DeliveryBoy : Vendor;
            const requester = await model.findById(request.requesterId).session(session);

            // Check if this is a settlement request (linked to commissions)
            const Commission = mongoose.model('Commission');
            const linkedCommissions = await Commission.find({ withdrawalRequestId: request._id }).session(session);
            const isSettlementRequest = linkedCommissions.length > 0;

            if (status === 'approved' || status === 'completed') {
                // For settlements, if they are finalized by cron, they are in availableBalance.
                // If they are requested before cron, they might still be in pendingBalance.
                // We'll check availableBalance first as that's the new standard for 'ready' funds.
                const balanceToCheck = isSettlementRequest ? 'availableBalance' : 'availableBalance';
                let currentBalance = Number(requester?.[balanceToCheck] || 0);
                const requestAmount = Number(request.amount || 0);

                // Fallback for pendingBalance if available is not enough (handling mid-transition requests)
                if (isSettlementRequest && currentBalance < requestAmount) {
                    const pending = Number(requester?.pendingBalance || 0);
                    if (pending >= requestAmount) {
                        // If it's in pending, we'll deduct from pending instead.
                        // This handles requests made before the cron job runs.
                        await model.findByIdAndUpdate(request.requesterId, {
                            $inc: { pendingBalance: -requestAmount }
                        }, { session });
                    } else {
                        throw new ApiError(400, `Insufficient funds. Available: ₹${currentBalance}, Pending: ₹${pending}, Requested: ₹${requestAmount}`);
                    }
                } else {
                    // Standard deduction from availableBalance
                    if (!requester || (Math.round(currentBalance) < Math.round(requestAmount) && !isSettlementRequest)) {
                         throw new ApiError(400, `Requester no longer has sufficient balance. Current: ₹${currentBalance}, Requested: ₹${requestAmount}`);
                    }
                    // Conditional decrement: the read above is stale by the time two admins
                    // approve different requests together, which could overdraw the balance.
                    const debited = await model.findOneAndUpdate(
                        { _id: request.requesterId, [balanceToCheck]: { $gte: requestAmount } },
                        { $inc: { [balanceToCheck]: -requestAmount } },
                        { session, new: true }
                    );
                    if (!debited) {
                        throw new ApiError(400, `Requester no longer has sufficient balance for ₹${requestAmount}.`);
                    }
                }

                // If UPI ID is present, try to process real payout via Razorpay
                // Only attempt if NO transactionId is provided (manual override)
                if (request.bankDetails?.upiId && !transactionId && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'your_key_id') {
                    try {
                        const payout = await payoutToUpi({
                            name: requester.name || requester.storeName,
                            upiId: request.bankDetails.upiId,
                            amount: request.amount,
                            requestId: String(request._id)
                        });
                        request.transactionId = payout.id || request.transactionId;
                        request.adminNotes = `Razorpay Payout ID: ${payout.id}. ` + (adminNotes || '');
                    } catch (error) {
                        console.error('Payout automation failed:', error);
                        // Instead of throwing, we record the error and allow manual completion
                        // This prevents blocking the entire withdrawal process if Razorpay API fails
                        request.adminNotes = `[AUTO-PAY-FAILED] ${error.message}. ` + (adminNotes || '');
                    }
                } else if (transactionId) {
                    // If transactionId is provided manually, use it
                    request.transactionId = transactionId;
                }

                // If it's a settlement request, mark commissions as paid
                if (isSettlementRequest) {
                    await Commission.updateMany(
                        { withdrawalRequestId: request._id },
                        { $set: { status: 'paid', paidAt: new Date() } },
                        { session }
                    );
                }

                request.status = status;
                request.transactionId = transactionId || request.transactionId;
            } else if (status === 'rejected') {
                request.status = 'rejected';
                
                // If it's a settlement request, revert commissions to pending
                if (isSettlementRequest) {
                    await Commission.updateMany(
                        { withdrawalRequestId: request._id },
                        { $set: { status: 'pending' }, $unset: { withdrawalRequestId: "" } },
                        { session }
                    );
                }
            }

            request.adminNotes = adminNotes || request.adminNotes;
            request.processedAt = new Date();
            await request.save({ session });

            // Send notification to requester
            const requesterType = request.requesterType === 'DeliveryBoy' ? 'delivery' : 'vendor';
            let notificationTitle = '';
            let notificationMessage = '';
            let notificationSound = 'default';

            if (status === 'approved' || status === 'completed') {
                notificationTitle = '✅ Payout Approved';
                notificationMessage = `Your payout request of ₹${request.amount} has been approved and will be processed within 24-48 hours.`;
                notificationSound = 'success';
            } else if (status === 'rejected') {
                notificationTitle = '❌ Payout Rejected';
                notificationMessage = `Your payout request of ₹${request.amount} was rejected. ${adminNotes ? `Reason: ${adminNotes}` : 'Please contact support for details.'}`;
                notificationSound = 'alert';
            }

            // Create notification
            await createNotification({
                recipientId: request.requesterId,
                recipientType: requesterType,
                title: notificationTitle,
                message: notificationMessage,
                type: 'payout',
                data: {
                    withdrawalId: String(request._id),
                    amount: request.amount,
                    status: request.status,
                    sound: notificationSound
                }
            });
        });
    } finally {
        await session.endSession();
    }

    res.status(200).json(new ApiResponse(200, request, `Withdrawal request ${status}.`));
});

/**
 * Get commissions associated with a specific withdrawal request
 */
export const getWithdrawalCommissions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const Commission = mongoose.model('Commission');
    const commissions = await Commission.find({ withdrawalRequestId: id })
        .populate('orderId', 'orderId status total items')
        .sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, commissions, 'Withdrawal commissions fetched.'));
});
