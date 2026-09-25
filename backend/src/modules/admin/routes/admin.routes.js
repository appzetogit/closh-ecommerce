import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as vendorController from '../controllers/vendor.controller.js';
import * as customerController from '../controllers/customer.controller.js';
import * as deliveryController from '../controllers/delivery.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as suggestionController from '../controllers/suggestion.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as marketingController from '../controllers/marketing.controller.js';
import * as reportController from '../controllers/report.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as employeeController from '../controllers/employee.controller.js';
import * as roleController from '../controllers/role.controller.js';
import * as attributeController from '../controllers/attribute.controller.js';
import * as adminWithdrawalController from '../controllers/adminWithdrawal.controller.js';
import * as serviceAreaController from '../controllers/serviceArea.controller.js';
import * as riderSettlementController from '../controllers/riderSettlement.controller.js';

import cancellationReasonRoutes from './cancellationReason.routes.js';
import enquiryRoutes from './enquiry.routes.js';

import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus, checkPermission, authorizeAdmin } from '../../../middlewares/authorize.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle, uploadDocumentSingle, uploadDocumentMultiple } from '../../../middlewares/upload.js';
import { refreshTokenSchema, logoutSchema, updateProfileSchema } from '../validators/auth.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    taxPricingRulesSchema,
    categoryIdParamSchema,
    createCategorySchema,
    updateCategorySchema,
    reorderCategoriesSchema,
    brandIdParamSchema,
    createBrandSchema,
    updateBrandSchema,
} from '../validators/catalog.validator.js';
import {
    customerListQuerySchema,
    customerIdParamSchema,
    customerUpdateSchema,
    customerStatusUpdateSchema,
    customerAddressParamsSchema,
    customerOrdersQuerySchema,
    customerTransactionsQuerySchema,
    customerAddressesQuerySchema,
} from '../validators/customer.validator.js';
import {
    deliveryListQuerySchema,
    deliveryBoyIdParamSchema,
    createDeliveryBoySchema,
    updateDeliveryBoySchema,
    updateDeliveryStatusSchema,
    updateDeliveryApplicationStatusSchema,
    updateKycStatusSchema,
    settleCashSchema,
} from '../validators/delivery.validator.js';
import {
    vendorListQuerySchema,
    vendorIdParamSchema,
    vendorStatusUpdateSchema,
    vendorCommissionUpdateSchema,
    vendorCommissionsQuerySchema,
    registerVendorSchema,
} from '../validators/vendor.validator.js';
import {
    marketingIdParamSchema,
    campaignListQuerySchema,
} from '../validators/marketing.validator.js';

const router = Router();
const adminAuth = [authenticate, authorizeAdmin, enforceAccountStatus];
const superAdminOnly = [authenticate, authorize('superadmin'), enforceAccountStatus];
const adminManager = [authenticate, authorizeAdmin, enforceAccountStatus]; // Allowing any admin-like role for management, further restricted by permissions

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...adminAuth, authController.getProfile);
router.put('/auth/profile', ...adminAuth, validate(updateProfileSchema), authController.updateProfile);

// ─── Employee Management ──────────────────────────────────────────────────────
router.get('/employees', ...adminManager, checkPermission('staff_manage'), employeeController.getAllEmployees);
router.post('/employees', ...adminManager, checkPermission('staff_manage'), uploadDocumentMultiple('documents', 5), employeeController.createEmployee);
router.put('/employees/:id', ...adminManager, checkPermission('staff_manage'), uploadDocumentMultiple('documents', 5), employeeController.updateEmployee);
router.delete('/employees/:id', ...adminManager, checkPermission('staff_manage'), employeeController.deleteEmployee);

// ─── Role Management ──────────────────────────────────────────────────────────
router.get('/roles', ...adminManager, checkPermission('staff_manage'), roleController.getAllRoles);
router.post('/roles', ...adminManager, checkPermission('staff_manage'), roleController.createRole);
router.put('/roles/:id', ...adminManager, checkPermission('staff_manage'), roleController.updateRole);
router.delete('/roles/:id', ...adminManager, checkPermission('staff_manage'), roleController.deleteRole);


// ─── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics/dashboard', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getDashboardStats);
router.get('/analytics/revenue', ...adminAuth, checkPermission(['finance_view', 'dashboard_view']), analyticsController.getRevenueData);
router.get('/analytics/order-status', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getOrderStatusBreakdown);
router.get('/analytics/top-products', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getTopProducts);
router.get('/analytics/customer-growth', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getCustomerGrowth);
router.get('/analytics/recent-orders', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getRecentOrders);
router.get('/analytics/sales', ...adminAuth, checkPermission(['finance_view', 'dashboard_view']), analyticsController.getSalesData);
router.get('/analytics/finance-summary', ...adminAuth, checkPermission('finance_view'), analyticsController.getFinancialSummary);
router.get('/analytics/inventory-stats', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getInventoryStats);
router.get('/analytics/earnings-summary', ...adminAuth, checkPermission('finance_view'), analyticsController.getAdminEarningsSummary);
router.get('/analytics/earnings-report', ...adminAuth, checkPermission('finance_view'), analyticsController.getDetailedEarningsReport);
router.get('/analytics/vendor-performance', ...adminAuth, checkPermission('dashboard_view'), analyticsController.getVendorPerformance);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', ...adminAuth, checkPermission('orders_manage'), orderController.getAllOrders);
router.get('/orders/:id', ...adminAuth, checkPermission('orders_manage'), orderController.getOrderById);
router.patch('/orders/:id/status', ...adminAuth, checkPermission('orders_manage'), orderController.updateOrderStatus);
router.get('/orders/:id/nearby-riders', ...adminAuth, checkPermission('orders_manage'), orderController.getNearbyRiders);
router.patch('/orders/:id/assign-delivery', ...adminAuth, checkPermission('orders_manage'), orderController.assignDeliveryBoy);
router.delete('/orders/:id', ...adminAuth, checkPermission('orders_manage'), orderController.deleteOrder);

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products', ...adminAuth, checkPermission('products_manage'), catalogController.getAllProducts);
router.get('/products/tax-pricing-rules', ...adminAuth, checkPermission('products_manage'), catalogController.getTaxPricingRules);
router.get('/products/:id', ...adminAuth, checkPermission('products_manage'), catalogController.getProductById);
router.post('/products', ...adminAuth, checkPermission('products_manage'), validate(createProductSchema), catalogController.createProduct);
router.put('/products/tax-pricing-rules', ...adminAuth, checkPermission('products_manage'), validate(taxPricingRulesSchema), catalogController.updateTaxPricingRules);

router.put('/products/:id', ...adminAuth, checkPermission('products_manage'), validate(updateProductSchema), catalogController.updateProduct);
router.patch('/products/:id/approval-status', ...adminAuth, checkPermission('products_manage'), catalogController.updateProductStatus);
router.delete('/products/:id', ...adminAuth, checkPermission('products_manage'), catalogController.deleteProduct);

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', ...adminAuth, checkPermission('categories_manage'), catalogController.getAllCategories);
router.post('/categories', ...adminAuth, checkPermission('categories_manage'), validate(createCategorySchema), catalogController.createCategory);
router.patch('/categories/reorder', ...adminAuth, checkPermission('categories_manage'), validate(reorderCategoriesSchema), catalogController.reorderCategories);
router.put('/categories/:id', ...adminAuth, checkPermission('categories_manage'), validate(categoryIdParamSchema, 'params'), validate(updateCategorySchema), catalogController.updateCategory);
router.delete('/categories/:id', ...adminAuth, checkPermission('categories_manage'), validate(categoryIdParamSchema, 'params'), catalogController.deleteCategory);

// ─── Brands ───────────────────────────────────────────────────────────────────
router.get('/brands', ...adminAuth, checkPermission('brands_manage'), catalogController.getAllBrands);
router.post('/brands', ...adminAuth, checkPermission('brands_manage'), validate(createBrandSchema), catalogController.createBrand);
router.put('/brands/:id', ...adminAuth, checkPermission('brands_manage'), validate(brandIdParamSchema, 'params'), validate(updateBrandSchema), catalogController.updateBrand);
router.delete('/brands/:id', ...adminAuth, checkPermission('brands_manage'), validate(brandIdParamSchema, 'params'), catalogController.deleteBrand);

// ─── Vendors ──────────────────────────────────────────────────────────────────
import * as settlementController from '../controllers/settlement.controller.js';
router.post('/vendors', ...adminAuth, checkPermission('vendors_manage'), uploadSingle('document'), validate(registerVendorSchema), vendorController.registerVendor);
router.get('/vendors', ...adminAuth, checkPermission('vendors_manage'), validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/pending', ...adminAuth, checkPermission('vendors_manage'), (req, res, next) => { req.query.status = 'pending'; next(); }, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendor-documents/pending', ...adminAuth, checkPermission('vendors_manage'), vendorController.getAllPendingDocuments);
router.get('/vendors/:id', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), vendorController.getVendorDetail);
router.get('/vendors/:id/documents', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), vendorController.getVendorDocuments);
router.patch('/vendors/:id/documents/:documentId/status', ...adminAuth, checkPermission('vendors_manage'), vendorController.updateVendorDocumentStatus);
router.get('/vendors/:id/commissions', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), validate(vendorCommissionsQuerySchema, 'query'), vendorController.getVendorCommissions);
router.patch('/vendors/:id/status', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), validate(vendorStatusUpdateSchema), vendorController.updateVendorStatus);
router.patch('/vendors/:id/commission', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), validate(vendorCommissionUpdateSchema), vendorController.updateCommissionRate);
router.patch('/vendors/:id/owner-status', ...adminAuth, checkPermission('vendors_manage'), validate(vendorIdParamSchema, 'params'), vendorController.updateVendorOwnerStatus);

// ─── Vendor Settlements ────────────────────────────────────────────────────────
router.get('/settlements/balances', ...adminAuth, checkPermission('finance_view'), settlementController.getVendorsBalances);
router.post('/settlements/process', ...adminAuth, checkPermission('finance_view'), settlementController.processSettlement);
router.get('/settlements/history', ...adminAuth, checkPermission('finance_view'), settlementController.getSettlementHistory);
router.get('/settlements/vendor/:vendorId/pending-commissions', ...adminAuth, checkPermission('finance_view'), settlementController.getPendingCommissions);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', ...adminAuth, checkPermission('customers_manage'), validate(customerListQuerySchema, 'query'), customerController.getAllCustomers);
router.get('/customers/addresses', ...adminAuth, checkPermission('customers_manage'), validate(customerAddressesQuerySchema, 'query'), customerController.getCustomerAddresses);
router.get('/customers/transactions', ...adminAuth, checkPermission('customers_manage'), validate(customerTransactionsQuerySchema, 'query'), customerController.getCustomerTransactions);
router.get('/customers/:id/orders', ...adminAuth, checkPermission('customers_manage'), validate(customerIdParamSchema, 'params'), validate(customerOrdersQuerySchema, 'query'), customerController.getCustomerOrders);
router.get('/customers/:id', ...adminAuth, checkPermission('customers_manage'), validate(customerIdParamSchema, 'params'), customerController.getCustomerById);
router.put('/customers/:id', ...adminAuth, checkPermission('customers_manage'), validate(customerIdParamSchema, 'params'), validate(customerUpdateSchema), customerController.updateCustomerDetail);
router.patch('/customers/:id/status', ...adminAuth, checkPermission('customers_manage'), validate(customerIdParamSchema, 'params'), validate(customerStatusUpdateSchema), customerController.updateCustomerStatus);
router.delete('/customers/:customerId/addresses/:addressId', ...adminAuth, checkPermission('customers_manage'), validate(customerAddressParamsSchema, 'params'), customerController.deleteCustomerAddress);

// ─── Delivery ─────────────────────────────────────────────────────────────────
router.get('/delivery-boys', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryListQuerySchema, 'query'), deliveryController.getAllDeliveryBoys);
router.post('/delivery-boys', ...adminAuth, checkPermission('delivery_manage'), validate(createDeliveryBoySchema), deliveryController.createDeliveryBoy);
router.get('/delivery-boys/:id', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), deliveryController.getDeliveryBoyById);
router.put('/delivery-boys/:id', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryBoySchema), deliveryController.updateDeliveryBoy);
router.delete('/delivery-boys/:id', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), deliveryController.deleteDeliveryBoy);
router.patch('/delivery-boys/:id/status', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryStatusSchema), deliveryController.updateDeliveryBoyStatus);
router.patch('/delivery-boys/:id/application-status', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryApplicationStatusSchema), deliveryController.updateDeliveryBoyApplicationStatus);
router.patch('/delivery-boys/:id/kyc-status', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), validate(updateKycStatusSchema), deliveryController.updateKycStatus);
router.get('/delivery-boys/:id/cash-history', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), deliveryController.getCashHistory);
router.post('/delivery-boys/:id/settle-cash', ...adminAuth, checkPermission('delivery_manage'), validate(deliveryBoyIdParamSchema, 'params'), validate(settleCashSchema), deliveryController.settleCash);
router.get('/delivery-settlements', ...adminAuth, checkPermission('delivery_manage'), riderSettlementController.getAllSettlements);

// ─── Withdrawal Requests ──────────────────────────────────────────────────────
router.get('/withdrawals', ...adminAuth, checkPermission('finance_view'), adminWithdrawalController.getAllWithdrawalRequests);
router.get('/withdrawals/:id/commissions', ...adminAuth, checkPermission('finance_view'), adminWithdrawalController.getWithdrawalCommissions);
router.patch('/withdrawals/:id/status', ...adminAuth, checkPermission('finance_view'), adminWithdrawalController.updateWithdrawalStatus);

// ─── Return Requests ──────────────────────────────────────────────────────────
router.get('/return-requests', ...adminAuth, checkPermission('orders_manage'), returnController.getAllReturnRequests);
router.get('/return-requests/:id', ...adminAuth, checkPermission('orders_manage'), returnController.getReturnRequestById);
router.patch('/return-requests/:id/status', ...adminAuth, checkPermission('orders_manage'), returnController.updateReturnRequestStatus);
router.post('/return-requests/:id/assign', ...adminAuth, checkPermission('orders_manage'), returnController.assignDeliveryBoyToReturn);

// ─── Support Tickets ──────────────────────────────────────────────────────────
router.get('/support/tickets', ...adminAuth, checkPermission('support_manage'), supportController.getAllTickets);
router.get('/support/tickets/:id', ...adminAuth, checkPermission('support_manage'), supportController.getTicketById);
router.patch('/support/tickets/:id/status', ...adminAuth, checkPermission('support_manage'), supportController.updateTicketStatus);
router.post('/support/tickets/:id/messages', ...adminAuth, checkPermission('support_manage'), supportController.addTicketMessage);
router.get('/support/ticket-types', ...adminAuth, checkPermission('support_manage'), supportController.getAllTicketTypes);
router.post('/support/ticket-types', ...adminAuth, checkPermission('support_manage'), supportController.createTicketType);
router.put('/support/ticket-types/:id', ...adminAuth, checkPermission('support_manage'), supportController.updateTicketType);
router.delete('/support/ticket-types/:id', ...adminAuth, checkPermission('support_manage'), supportController.deleteTicketType);

// ─── Product Reviews ──────────────────────────────────────────────────────────
router.get('/reviews', ...adminAuth, checkPermission('products_manage'), reviewController.getAllReviews);
router.get('/reviews/analytics', ...adminAuth, checkPermission('products_manage'), reviewController.getReviewAnalytics);
router.patch('/reviews/:id/status', ...adminAuth, checkPermission('products_manage'), reviewController.updateReviewStatus);
router.delete('/reviews/:id', ...adminAuth, checkPermission('products_manage'), reviewController.deleteReview);
router.get('/delivery-reviews', ...adminAuth, checkPermission('products_manage'), reviewController.getDeliveryReviews);
router.post('/uploads/image', ...adminAuth, uploadSingle('image'), uploadController.uploadImage);

// ─── Suggestions & Feedback (the "Suggestions & your thoughts" box on every customer page) ──
router.get('/suggestions', ...adminAuth, checkPermission('support_manage'), suggestionController.getAllSuggestions);
router.patch('/suggestions/:id/status', ...adminAuth, checkPermission('support_manage'), suggestionController.updateSuggestionStatus);
router.delete('/suggestions/:id', ...adminAuth, checkPermission('support_manage'), suggestionController.deleteSuggestion);

// ─── Attribute Management ─────────────────────────────────────────────────────
router.get('/attributes', ...adminAuth, checkPermission('attributes_manage'), attributeController.getAllAttributes);
router.post('/attributes', ...adminAuth, checkPermission('attributes_manage'), attributeController.createAttribute);
router.put('/attributes/:id', ...adminAuth, checkPermission('attributes_manage'), attributeController.updateAttribute);
router.delete('/attributes/:id', ...adminAuth, checkPermission('attributes_manage'), attributeController.deleteAttribute);

// Values
router.post('/attributes/:attributeId/values', ...adminAuth, checkPermission('attributes_manage'), attributeController.addAttributeValue);
router.delete('/attributes/:attributeId/values/:valueId', ...adminAuth, checkPermission('attributes_manage'), attributeController.deleteAttributeValue);

// Sets
router.get('/attribute-sets', ...adminAuth, checkPermission('attributes_manage'), attributeController.getAllAttributeSets);
router.post('/attribute-sets', ...adminAuth, checkPermission('attributes_manage'), attributeController.createAttributeSet);
router.put('/attribute-sets/:id', ...adminAuth, checkPermission('attributes_manage'), attributeController.updateAttributeSet);
router.delete('/attribute-sets/:id', ...adminAuth, checkPermission('attributes_manage'), attributeController.deleteAttributeSet);

// ─── Marketing & Promotions ──────────────────────────────────────────────────
// Coupons
router.get('/marketing/coupons', ...adminAuth, checkPermission('marketing_manage'), marketingController.getAllCoupons);
router.post('/marketing/coupons', ...adminAuth, checkPermission('marketing_manage'), marketingController.createCoupon);
router.put('/marketing/coupons/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.updateCoupon);
router.delete('/marketing/coupons/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.deleteCoupon);

// Banners
router.get('/marketing/banners', ...adminAuth, checkPermission('marketing_manage'), marketingController.getAllBanners);
router.post('/marketing/banners', ...adminAuth, checkPermission('marketing_manage'), marketingController.createBanner);
router.patch('/marketing/banners/reorder', ...adminAuth, checkPermission('marketing_manage'), marketingController.reorderBanners);
router.put('/marketing/banners/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.updateBanner);
router.delete('/marketing/banners/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.deleteBanner);

// Campaigns
router.get('/marketing/campaigns', ...adminAuth, checkPermission('marketing_manage'), validate(campaignListQuerySchema, 'query'), marketingController.getAllCampaigns);
router.post('/marketing/campaigns', ...adminAuth, checkPermission('marketing_manage'), marketingController.createCampaign);
router.put('/marketing/campaigns/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.updateCampaign);
router.delete('/marketing/campaigns/:id', ...adminAuth, checkPermission('marketing_manage'), validate(marketingIdParamSchema, 'params'), marketingController.deleteCampaign);

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/sales', ...adminAuth, checkPermission('reports_view'), reportController.getSalesReport);
router.get('/reports/inventory', ...adminAuth, checkPermission('reports_view'), reportController.getInventoryReport);

// ─── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', ...adminAuth, checkPermission(['notifications_manage', 'support_manage']), notificationController.getAdminNotifications);
router.post('/notifications/fcm-token', ...adminAuth, notificationController.registerAdminFcmToken);
router.delete('/notifications/fcm-token', ...adminAuth, notificationController.removeAdminFcmToken);
router.put('/notifications/:id/read', ...adminAuth, checkPermission(['notifications_manage', 'support_manage']), notificationController.markAsRead);
router.put('/notifications/read-all', ...adminAuth, checkPermission(['notifications_manage', 'support_manage']), notificationController.markAllAsRead);
router.post('/notifications/push-to-user', ...adminAuth, checkPermission('notifications_manage'), notificationController.pushToUser);
router.post('/notifications/broadcast', ...adminAuth, checkPermission('notifications_manage'), notificationController.globalBroadcast);

// ─── Settings & Policies ──────────────────────────────────────────────────────
import * as settingsController from '../controllers/settings.controller.js';
router.get('/settings/all', ...adminAuth, settingsController.getAllSettings);
router.get('/settings/:key', ...adminAuth, settingsController.getSetting);
router.put('/settings/:key', ...adminAuth, checkPermission('settings_manage'), settingsController.updateSetting);

// ─── Service Areas & Zones ────────────────────────────────────────────────────
router.get('/service-areas/stats', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.getServiceAreaStats);
router.get('/service-areas', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.getAllServiceAreas);
router.get('/service-areas/:id', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.getServiceAreaById);
router.post('/service-areas', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.createServiceArea);
router.put('/service-areas/:id', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.updateServiceArea);
router.patch('/service-areas/:id/toggle', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.toggleServiceArea);
router.delete('/service-areas/:id', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.deleteServiceArea);

// Pincode Management
router.get('/service-areas/:id/pincodes', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.getPincodesForServiceArea);
router.post('/pincodes', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.addPincode);
router.post('/pincodes/import', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.importPincodes);
router.put('/pincodes/:id', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.updatePincode);
router.delete('/pincodes/:id', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.deletePincode);
router.get('/pincodes/check/:pincode', ...adminAuth, checkPermission('settings_manage'), serviceAreaController.checkPincodeServiceability);

// ─── Enquiries & Cancellation Reasons ──────────────────────────────────────────
router.use('/enquiries', enquiryRoutes);
router.use('/cancellation-reasons', cancellationReasonRoutes);

export default router;
