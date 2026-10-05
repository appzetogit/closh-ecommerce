import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as addressController from '../controllers/address.controller.js';
import * as wishlistController from '../controllers/wishlist.controller.js';
import * as cartController from '../controllers/cart.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as supportController from '../controllers/support.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle } from '../../../middlewares/upload.js';
import {
    registerSchema,
    loginSchema,
    loginOtpSchema,
    registerOtpSchema,
    checkPhoneSchema,
    otpSchema,
    resendOtpSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    updateProfileSchema,
    changePasswordSchema,
} from '../validators/auth.validator.js';
import {
    createAddressSchema,
    updateAddressSchema,
} from '../validators/address.validator.js';
import { placeOrderSchema, createReturnRequestSchema } from '../validators/order.validator.js';

const router = Router();
const customerAuth = [authenticate, authorize('customer'), enforceAccountStatus];

// Auth routes
router.post('/auth/check-phone', authLimiter, validate(checkPhoneSchema), authController.checkPhone);
router.post('/auth/register', authLimiter, validate(registerSchema), authController.register);
router.post('/auth/register-otp', authLimiter, validate(registerOtpSchema), authController.registerOtp);
router.post('/auth/login-otp', authLimiter, validate(loginOtpSchema), authController.loginOtp);
router.post('/auth/verify-otp', otpVerifyLimiter, validate(otpSchema), authController.verifyOTP);
router.post('/auth/resend-otp', otpLimiter, validate(resendOtpSchema), authController.resendOTP);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', authLimiter, otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...customerAuth, authController.getProfile);
router.put('/auth/profile', ...customerAuth, validate(updateProfileSchema), authController.updateProfile);
router.delete('/auth/profile', ...customerAuth, authController.deleteAccount);
router.post('/auth/profile/avatar', ...customerAuth, uploadSingle('avatar'), authController.uploadProfileAvatar);
router.post('/auth/change-password', ...customerAuth, validate(changePasswordSchema), authController.changePassword);

// Address routes (protected)
router.get('/addresses', ...customerAuth, addressController.getAddresses);
router.post('/addresses', ...customerAuth, validate(createAddressSchema), addressController.addAddress);
router.put('/addresses/:id', ...customerAuth, validate(updateAddressSchema), addressController.updateAddress);
router.delete('/addresses/:id', ...customerAuth, addressController.deleteAddress);
router.patch('/addresses/:id/default', ...customerAuth, addressController.setDefaultAddress);

// Wishlist routes (protected)
router.get('/wishlist', ...customerAuth, wishlistController.getWishlist);
router.post('/wishlist', ...customerAuth, wishlistController.addToWishlist);
router.delete('/wishlist/:productId', ...customerAuth, wishlistController.removeFromWishlist);

// Cart routes (protected)
router.get('/cart', ...customerAuth, cartController.getCart);
router.post('/cart', ...customerAuth, cartController.addToCart);
router.put('/cart/:itemId', ...customerAuth, cartController.updateCartItem);
router.delete('/cart/clear', ...customerAuth, cartController.clearCart);
router.delete('/cart/:itemId', ...customerAuth, cartController.removeCartItem);

// Review routes
router.get('/reviews/product/:productId', reviewController.getProductReviews);
router.post('/reviews', ...customerAuth, reviewController.addReview);
router.post('/reviews/:id/helpful', reviewController.voteHelpful);
router.post('/reviews/delivery', ...customerAuth, reviewController.submitDeliveryReview);
router.get('/reviews/order/:orderId', ...customerAuth, reviewController.getMyReviewsForOrder);

// Order routes
router.post('/orders', ...customerAuth, validate(placeOrderSchema), orderController.placeOrder);
router.post('/orders/verify-payment', ...customerAuth, orderController.verifyPayment);
router.get('/orders', ...customerAuth, orderController.getUserOrders);
router.get('/orders/:id', ...customerAuth, orderController.getOrderDetail);
router.patch('/orders/:id/cancel', ...customerAuth, orderController.cancelOrder);
router.post('/orders/:id/returns', ...customerAuth, validate(createReturnRequestSchema), orderController.createReturnRequest);
router.post('/orders/:id/resend-delivery-otp', ...customerAuth, orderController.resendDeliveryOtp);
router.get('/returns', ...customerAuth, orderController.getUserReturnRequests);
router.get('/returns/:id', ...customerAuth, orderController.getUserReturnRequestById);
router.post('/returns/:id/upi', ...customerAuth, orderController.submitReturnUPI);

// Notification routes (protected)
router.get('/notifications', ...customerAuth, notificationController.getUserNotifications);
router.post('/notifications/fcm-token', ...customerAuth, notificationController.registerUserFcmToken);
router.delete('/notifications/fcm-token', ...customerAuth, notificationController.removeUserFcmToken);
router.put('/notifications/:id/read', ...customerAuth, notificationController.markUserNotificationAsRead);
router.put('/notifications/read-all', ...customerAuth, notificationController.markAllUserNotificationsAsRead);
router.delete('/notifications/:id', ...customerAuth, notificationController.deleteUserNotification);

// Support routes
router.get('/support/tickets', ...customerAuth, supportController.getUserTickets);
router.get('/support/tickets/:id', ...customerAuth, supportController.getUserTicketById);
router.post('/support/tickets', ...customerAuth, supportController.createSupportTicket);
router.post('/support/tickets/:id/messages', ...customerAuth, supportController.addUserTicketMessage);

export default router;
