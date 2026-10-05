import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as assignmentController from '../controllers/assignment.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as withdrawalController from '../controllers/withdrawal.controller.js';
import * as settlementController from '../controllers/settlement.controller.js';
import * as mvController from '../controllers/multiVendorPickup.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadDeliveryDocuments, uploadSingle } from '../../../middlewares/upload.js';
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    refreshTokenSchema,
    logoutSchema,
} from '../validators/auth.validator.js';

const router = Router();
const deliveryAuth = [authenticate, authorize('delivery'), enforceAccountStatus];
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Auth
router.post(
    '/auth/register',
    authLimiter,
    uploadDeliveryDocuments([
        { name: 'drivingLicense', maxCount: 1 },
        { name: 'drivingLicenseBack', maxCount: 1 },
        { name: 'aadharCard', maxCount: 1 },
        { name: 'aadharCardBack', maxCount: 1 },
    ]),
    validate(registerSchema),
    authController.register
);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', authLimiter, otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/send-otp', authLimiter, authController.sendOTP); // New OTP login
router.post('/auth/verify-otp', authLimiter, otpVerifyLimiter, authController.verifyOTPAndLogin); // New OTP login
router.post('/auth/check-availability', authLimiter, authController.checkAvailability);
router.post('/auth/send-registration-otp', authLimiter, authController.sendRegistrationOTP);
router.post('/auth/verify-registration-otp', authLimiter, otpVerifyLimiter, authController.verifyRegistrationOTP);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...deliveryAuth, authController.getProfile);
router.put('/auth/profile', ...deliveryAuth, authController.updateProfile);
router.delete('/auth/profile', ...deliveryAuth, authController.deleteAccount);

// Orders
router.get('/orders/available', ...deliveryAuth, orderController.getAvailableOrders);
router.get('/orders', ...deliveryAuth, orderController.getAssignedOrders);
router.get('/orders/dashboard-summary', ...deliveryAuth, orderController.getDashboardSummary);
router.get('/orders/profile-summary', ...deliveryAuth, orderController.getProfileSummary);
router.get('/orders/rejected', ...deliveryAuth, orderController.getRejectedOrders);
router.get('/cancellation-reasons', ...deliveryAuth, orderController.getCancellationReasons);
router.get('/orders/:id', ...deliveryAuth, orderController.getOrderDetail);

if (!IS_PRODUCTION) {
    router.get('/orders/:id/debug-otp', ...deliveryAuth, orderController.getDeliveryOtpForDebug);
}
router.patch('/orders/:id/status', ...deliveryAuth, orderController.updateDeliveryStatus);
router.post('/orders/:id/accept', ...deliveryAuth, assignmentController.acceptOrderAssignment);
router.post('/orders/:id/reject', ...deliveryAuth, assignmentController.rejectOrderAssignment);
router.post('/orders/:id/arrived', ...deliveryAuth, orderController.markArrived);
router.post('/orders/:id/cancel', ...deliveryAuth, orderController.cancelOrder);
router.post('/orders/:id/resend-delivery-otp', ...deliveryAuth, orderController.resendDeliveryOtp);
router.get('/orders/:id/company-qr', ...deliveryAuth, orderController.getCompanyQR);

// ── Antigravity Engine (state-machine endpoints) ──
router.get('/orders/:id/flow', ...deliveryAuth, orderController.getDeliveryFlow);
router.patch('/orders/:id/arrived-vendor', ...deliveryAuth, orderController.markArrivedAtVendor);
router.patch('/orders/:id/pickup', ...deliveryAuth, orderController.handlePickup);
router.patch('/orders/:id/start', ...deliveryAuth, orderController.handleStartDelivery);
router.patch('/orders/:id/location', ...deliveryAuth, orderController.handleLocationUpdate);
router.patch('/orders/:id/arrived', ...deliveryAuth, orderController.handleArrivedAtCustomer);
router.patch('/orders/:id/try-buy', ...deliveryAuth, orderController.handleTryAndBuy);
router.patch('/orders/:id/payment', ...deliveryAuth, orderController.handlePayment);
router.post('/orders/:id/verify-qr-payment', ...deliveryAuth, orderController.verifyQrPayment);
router.post('/orders/:id/verify-payment', ...deliveryAuth, orderController.verifyDoorstepPayment);
router.patch('/orders/:id/complete', ...deliveryAuth, orderController.handleCompleteDelivery);
router.post('/orders/:id/vendor-returns/:vendorId/arrive', ...deliveryAuth, orderController.arriveAtVendorReturnStop);
router.post('/orders/:id/vendor-returns/:vendorId/resend-otp', ...deliveryAuth, orderController.resendVendorReturnOtp);
router.post('/orders/:id/vendor-returns/:vendorId/verify-otp', ...deliveryAuth, orderController.verifyVendorReturnOtp);
router.post('/orders/:id/vendor-returns/:vendorId/complete', ...deliveryAuth, orderController.markTryBuyVendorReturned);
router.patch('/batch/select', ...deliveryAuth, orderController.handleBatchSelect);

// ── Multi-Vendor Pickup Flow ──
router.get('/multi-vendor/available', ...deliveryAuth, mvController.getAvailableMultiVendorOrders);
router.post('/multi-vendor/:orderId/accept', ...deliveryAuth, mvController.acceptMultiVendorOrder);
router.get('/multi-vendor/:orderId/status', ...deliveryAuth, mvController.getMultiVendorOrderStatus);
router.post('/multi-vendor/:orderId/stops/:vendorId/arrive', ...deliveryAuth, mvController.arriveAtVendorStop);
router.post('/multi-vendor/:orderId/stops/:vendorId/verify-otp', ...deliveryAuth, mvController.verifyVendorHandoverOtp);
router.post('/multi-vendor/:orderId/stops/:vendorId/pickup', ...deliveryAuth, mvController.confirmVendorPickup);
router.post('/multi-vendor/:orderId/start-delivery', ...deliveryAuth, mvController.startFinalDelivery);
router.post('/multi-vendor/:orderId/arrive-customer', ...deliveryAuth, mvController.arriveAtCustomer);
router.post('/multi-vendor/:orderId/complete', ...deliveryAuth, mvController.completeMultiVendorDelivery);
router.post('/uploads/image', ...deliveryAuth, uploadSingle('image'), mvController.uploadProofImage);

// Reviews
router.post('/reviews/customer', ...deliveryAuth, reviewController.submitCustomerRating);
router.get('/reviews/order/:orderId', ...deliveryAuth, reviewController.getMyReviewForOrder);

// Returns
router.get('/returns/available', ...deliveryAuth, orderController.getAvailableReturns);
router.get('/returns/completed', ...deliveryAuth, orderController.getCompletedReturns);
router.get('/returns/:id', ...deliveryAuth, orderController.getReturnDetail);
router.post('/returns/:id/accept', ...deliveryAuth, orderController.acceptReturnAssignment);
router.patch('/returns/:id/status', ...deliveryAuth, orderController.updateReturnStatus);
router.post('/returns/:id/pickup-from-customer', ...deliveryAuth, orderController.pickupReturnFromCustomer);
router.post('/returns/:id/dropoff-at-vendor', ...deliveryAuth, orderController.dropoffReturnAtVendor);
router.post('/returns/:id/resend-vendor-otp', ...deliveryAuth, orderController.resendReturnVendorOtp);

// Notifications
router.get('/notifications', ...deliveryAuth, notificationController.getDeliveryNotifications);
router.post('/notifications/fcm-token', ...deliveryAuth, notificationController.registerDeliveryFcmToken);
router.delete('/notifications/fcm-token', ...deliveryAuth, notificationController.removeDeliveryFcmToken);
router.put('/notifications/:id/read', ...deliveryAuth, notificationController.markDeliveryNotificationAsRead);
router.put('/notifications/read-all', ...deliveryAuth, notificationController.markAllDeliveryNotificationsAsRead);
router.delete('/notifications/:id', ...deliveryAuth, notificationController.deleteDeliveryNotification);

// Withdrawals
router.post('/withdrawals', ...deliveryAuth, withdrawalController.requestWithdrawal);
router.get('/withdrawals', ...deliveryAuth, withdrawalController.getWithdrawalHistory);

// Cash Settlements
router.post('/settlements', ...deliveryAuth, settlementController.createSettlementOrder);
router.post('/settlements/verify', ...deliveryAuth, settlementController.verifySettlement);
router.get('/settlements', ...deliveryAuth, settlementController.getSettlementHistory);

export default router;
