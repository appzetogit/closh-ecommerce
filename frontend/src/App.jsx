import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import MobileModuleSkeleton from "./shared/components/Skeletons/MobileModuleSkeleton";

import CartDrawer from "./shared/components/Cart/CartDrawer";
import ProtectedRoute from "./shared/components/Auth/ProtectedRoute";
import ErrorBoundary from "./shared/components/ErrorBoundary/ErrorBoundary";
import AdminLogin from "./modules/Admin/pages/Login";
import AdminProtectedRoute from "./modules/Admin/components/AdminProtectedRoute";
import AdminLayout from "./modules/Admin/components/Layout/AdminLayout";
import Attributes from "./modules/Admin/pages/Attributes";
import Dashboard from "./modules/Admin/pages/Dashboard";
import Products from "./modules/Admin/pages/Products";
import ProductForm from "./modules/Admin/pages/ProductForm";
import AdminOrders from "./modules/Admin/pages/Orders";
import OrderDetail from "./modules/Admin/pages/OrderDetail";
import ReturnRequests from "./modules/Admin/pages/ReturnRequests";
import ReturnRequestDetail from "./modules/Admin/pages/ReturnRequestDetail";
import Categories from "./modules/Admin/pages/Categories";
import Brands from "./modules/Admin/pages/Brands";
import Customers from "./modules/Admin/pages/Customers";

import StaffManagement from "./modules/Admin/pages/staff/StaffManagement";
import Campaigns from "./modules/Admin/pages/Campaigns";
import Banners from "./modules/Admin/pages/Banners";
import Reviews from "./modules/Admin/pages/Reviews";
import Suggestions from "./modules/Admin/pages/Suggestions";
import Analytics from "./modules/Admin/pages/Analytics";
import Content from "./modules/Admin/pages/Content";
import Settings from "./modules/Admin/pages/Settings";
import More from "./modules/Admin/pages/More";
import PromoCodes from "./modules/Admin/pages/PromoCodes";
import ServiceAreas from "./modules/Admin/pages/ServiceAreas";
// Orders child pages
import AllOrders from "./modules/Admin/pages/orders/AllOrders";
import OrderTracking from "./modules/Admin/pages/orders/OrderTracking";
import EnquiriesPage from "./modules/Admin/pages/orders/EnquiriesPage";

import Invoice from "./modules/Admin/pages/orders/Invoice";
// Products child pages
import ManageProducts from "./modules/Admin/pages/products/ManageProducts";
import PendingProducts from "./modules/Admin/pages/products/PendingProducts";
import TaxPricing from "./modules/Admin/pages/products/TaxPricing";
import ProductRatings from "./modules/Admin/pages/products/ProductRatings";

// Categories child pages
import ManageCategories from "./modules/Admin/pages/categories/ManageCategories";
import CategoryOrder from "./modules/Admin/pages/categories/CategoryOrder";
// Brands child pages
import ManageBrands from "./modules/Admin/pages/brands/ManageBrands";
// Customers child pages
import ViewCustomers from "./modules/Admin/pages/customers/ViewCustomers";
import CustomerAddresses from "./modules/Admin/pages/customers/Addresses";
import Transactions from "./modules/Admin/pages/customers/Transactions";
import CustomerDetailPage from "./modules/Admin/pages/customers/CustomerDetailPage";
// Delivery Management child pages
import DeliveryBoys from "./modules/Admin/pages/delivery/DeliveryBoys";
import CashCollection from "./modules/Admin/pages/delivery/CashCollection";
import AssignDelivery from "./modules/Admin/pages/delivery/AssignDelivery";
import Withdrawals from "./modules/Admin/pages/delivery/Withdrawals";
import RiderSettlements from "./modules/Admin/pages/delivery/RiderSettlements";
import DeliveryFeeSettings from "./modules/Admin/pages/delivery/DeliveryFeeSettings";
// Vendors child pages
import Vendors from "./modules/Admin/pages/Vendors";
import ManageVendors from "./modules/Admin/pages/vendors/ManageVendors";
import PendingApprovals from "./modules/Admin/pages/vendors/PendingApprovals";
import RegisterVendor from "./modules/Admin/pages/vendors/RegisterVendor";
import VendorDetail from "./modules/Admin/pages/vendors/VendorDetail";
import CommissionRates from "./modules/Admin/pages/vendors/CommissionRates";
import AdminVendorAnalytics from "./modules/Admin/pages/vendors/VendorAnalytics";
import VendorExplorer from "./modules/Admin/pages/vendors/VendorExplorer";

// Offers & Sliders child pages
import HomeSliders from "./modules/Admin/pages/offers/HomeSliders";
import FestivalOffers from "./modules/Admin/pages/offers/FestivalOffers";
// Notifications child pages
import PushNotifications from "./modules/Admin/pages/notifications/PushNotifications";
import AllNotifications from "./modules/Admin/pages/notifications/AllNotifications";
// Support Desk child pages
import LiveChat from "./modules/Admin/pages/support/LiveChat";
import TicketTypes from "./modules/Admin/pages/support/TicketTypes";
import Tickets from "./modules/Admin/pages/support/Tickets";
// Reports child pages
import SalesReport from "./modules/Admin/pages/reports/SalesReport";
import InventoryReport from "./modules/Admin/pages/reports/InventoryReport";
import EarningsReport from "./modules/Admin/pages/reports/EarningsReport";
// Analytics & Finance child pages
import RevenueOverview from "./modules/Admin/pages/finance/RevenueOverview";
import ProfitLoss from "./modules/Admin/pages/finance/ProfitLoss";
import OrderTrends from "./modules/Admin/pages/finance/OrderTrends";
import PaymentBreakdown from "./modules/Admin/pages/finance/PaymentBreakdown";
import Settlements from "./modules/Admin/pages/finance/Settlements";
import TaxReports from "./modules/Admin/pages/finance/TaxReports";
import RefundReports from "./modules/Admin/pages/finance/RefundReports";
// Consolidated Settings pages
import GeneralSettings from "./modules/Admin/pages/settings/GeneralSettings";
import PaymentShippingSettings from "./modules/Admin/pages/settings/PaymentShippingSettings";
import OrdersCustomersSettings from "./modules/Admin/pages/settings/OrdersCustomersSettings";
import ProductsInventorySettings from "./modules/Admin/pages/settings/ProductsInventorySettings";
import ContentFeaturesSettings from "./modules/Admin/pages/settings/ContentFeaturesSettings";
import NotificationsSEOSettings from "./modules/Admin/pages/settings/NotificationsSEOSettings";
import CancellationReasons from "./modules/Admin/pages/settings/CancellationReasons";
import TaxSettings from "./modules/Admin/pages/settings/TaxSettings";
// Policies child pages
import PrivacyPolicy from "./modules/Admin/pages/policies/PrivacyPolicy";
import RefundPolicy from "./modules/Admin/pages/policies/RefundPolicy";
import TermsConditions from "./modules/Admin/pages/policies/TermsConditions";
// Firebase child pages
import PushConfig from "./modules/Admin/pages/firebase/PushConfig";
import Authentication from "./modules/Admin/pages/firebase/Authentication";
import RouteWrapper from "./shared/components/RouteWrapper";
import StoreMaintenanceGuard from "./shared/components/StoreMaintenanceGuard";
import ScrollToTop from "./shared/components/ScrollToTop";
import AppBootstrap from "./shared/components/AppBootstrap";

// User Module Routes (main customer-facing frontend)
import UserLayout from "./modules/user/components/Layout/UserLayout";
import UserProviders from "./modules/user/components/Layout/UserProviders";
import UserHomePage from "./modules/user/pages/Home/HomePage";
import UserProductDetail from "./modules/user/pages/Product/ProductDetailsPage";
import UserShopPage from "./modules/user/pages/Shop/ShopPage";
import UserProductsPage from "./modules/user/pages/Products/ProductsPage";
import UserCartPage from "./modules/user/pages/Cart/CartPage";
import MobileCategories from "./modules/user/pages/categories";
import UserCheckoutPage from "./modules/user/pages/Checkout/CheckoutPage";
import UserPaymentPage from "./modules/user/pages/Payment/PaymentPage";
import UserLoginPage from "./modules/user/pages/Auth/LoginPage";
import UserRegisterPage from "./modules/user/pages/Auth/RegisterPage";
import UserProfilePage from "./modules/user/pages/Profile/ProfilePage";
import UserAccountPage from "./modules/user/pages/Profile/AccountPage";
import UserLegalPage from "./modules/user/pages/Profile/LegalPage";
import UserSupportPage from "./modules/user/pages/Profile/SupportPage";
import UserOrdersPage from "./modules/user/pages/Orders/OrdersPage";
import UserOrderDetailPage from "./modules/user/pages/Orders/OrderDetailsPage";
import UserOrderSuccessPage from "./modules/user/pages/Orders/OrderSuccessPage";
import UserTrackOrderPage from "./modules/user/pages/Orders/TrackOrderPage";
import UserAddressesPage from "./modules/user/pages/Addresses/AddressesPage";
import UserWishlistPage from "./modules/user/pages/Wishlist/WishlistPage";
import UserOffersPage from "./modules/user/pages/Offers/OffersPage";
import UserEventsPage from "./modules/user/pages/Events/EventsPage";
import UserReferPage from "./modules/user/pages/Refer/ReferPage";
import CampaignSale from "./modules/user/pages/CampaignSale";
// Delivery Routes
import DeliveryLogin from "./modules/Delivery/pages/Login";
// Vendor Routes
import VendorLogin from "./modules/Vendor/pages/Login";

// Routes handled via lazy loading below

// Delivery Routes (Lazy Loaded)
const DeliveryRegister = lazy(() => import("@modules/Delivery/pages/Register"));
const DeliveryForgotPassword = lazy(() => import("@modules/Delivery/pages/ForgotPassword"));
const DeliveryResetPassword = lazy(() => import("@modules/Delivery/pages/ResetPassword"));
const DeliveryProtectedRoute = lazy(() => import("@modules/Delivery/components/DeliveryProtectedRoute"));
const DeliveryLayout = lazy(() => import("@modules/Delivery/components/Layout/DeliveryLayout"));
const DeliveryDashboard = lazy(() => import("@modules/Delivery/pages/Dashboard"));
const DeliveryOrders = lazy(() => import("@modules/Delivery/pages/Orders"));
const DeliveryOrderDetail = lazy(() => import("@modules/Delivery/pages/OrderDetail"));
const DeliveryReturnDetail = lazy(() => import("@modules/Delivery/pages/ReturnDetail"));
const DeliveryProfile = lazy(() => import("@modules/Delivery/pages/Profile"));
const DeliveryLegalPage = lazy(() => import("./modules/Delivery/pages/DeliveryLegalPage"));
const DeliveryNotifications = lazy(() => import("@modules/Delivery/pages/Notifications"));
const DeliveryLiveTracking = lazy(() => import("@modules/Delivery/pages/LiveTracking"));
const DeliveryPayouts = lazy(() => import("@modules/Delivery/pages/Payouts"));
const MultiVendorPickup = lazy(() => import("@modules/Delivery/pages/MultiVendorPickup"));

// Vendor Routes (Lazy Loaded)
const VendorRegister = lazy(() => import("@modules/Vendor/pages/Register"));
const VendorVerification = lazy(() => import("@modules/Vendor/pages/Verification"));
const VendorForgotPassword = lazy(() => import("@modules/Vendor/pages/ForgotPassword"));
const VendorResetPassword = lazy(() => import("@modules/Vendor/pages/ResetPassword"));
const VendorProtectedRoute = lazy(() => import("@modules/Vendor/components/VendorProtectedRoute"));
const VendorLayout = lazy(() => import("@modules/Vendor/components/Layout/VendorLayout"));
const VendorDashboard = lazy(() => import("@modules/Vendor/pages/Dashboard"));
const VendorProducts = lazy(() => import("@modules/Vendor/pages/Products"));
const VendorManageProducts = lazy(() => import("@modules/Vendor/pages/products/ManageProducts"));
const VendorAddProduct = lazy(() => import("@modules/Vendor/pages/products/AddProduct"));
const VendorProductForm = lazy(() => import("@modules/Vendor/pages/products/ProductForm"));
const VendorOrders = lazy(() => import("@modules/Vendor/pages/Orders"));
const VendorAllOrders = lazy(() => import("@modules/Vendor/pages/orders/AllOrders"));
const VendorOrderTracking = lazy(() => import("@modules/Vendor/pages/orders/OrderTracking"));
const VendorOrderDetail = lazy(() => import("@modules/Vendor/pages/orders/OrderDetail"));
const VendorSettlements = lazy(() => import("@modules/Vendor/pages/Settlements.jsx"));
const VendorEarnings = lazy(() => import("@modules/Vendor/pages/Earnings.jsx"));
const VendorSettings = lazy(() => import("@modules/Vendor/pages/Settings"));
const VendorStockManagement = lazy(() => import("@modules/Vendor/pages/StockManagement"));
const VendorReturnRequests = lazy(() => import("@modules/Vendor/pages/ReturnRequests"));
const VendorReturnRequestDetail = lazy(() => import("@modules/Vendor/pages/returns/ReturnRequestDetail"));
const VendorProductReviews = lazy(() => import("@modules/Vendor/pages/ProductReviews"));
const VendorHelp = lazy(() => import("@modules/Vendor/pages/VendorHelp"));
const VendorDocuments = lazy(() => import("@modules/Vendor/pages/Documents"));
const VendorNotifications = lazy(() => import("@modules/Vendor/pages/Notifications"));
const VendorSupportTickets = lazy(() => import("@modules/Vendor/pages/SupportTickets"));
const VendorPickupLocations = lazy(() => import("@modules/Vendor/pages/PickupLocations"));
const VendorLanguageSettings = lazy(() => import("@modules/Vendor/pages/LanguageSettings"));

const VendorOfflineSales = lazy(() => import("./modules/Vendor/pages/stock/OfflineSales"));

const renderAdminRoutes = () => (
  <>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="staff" element={<StaffManagement />} />
    <Route path="products" element={<Products />} />
    <Route path="products/:id" element={<ProductForm />} />
    <Route path="products/manage-products" element={<ManageProducts />} />
    <Route path="products/pending" element={<PendingProducts />} />
    <Route path="products/tax-pricing" element={<TaxPricing />} />
    <Route path="products/product-ratings" element={<ProductRatings />} />
    <Route path="more" element={<More />} />
    <Route path="categories" element={<Categories />} />
    <Route
      path="categories/manage-categories"
      element={<ManageCategories />}
    />
    <Route path="categories/category-order" element={<CategoryOrder />} />
    <Route path="brands" element={<Brands />} />
    <Route path="brands/manage-brands" element={<ManageBrands />} />
    <Route path="orders" element={<AdminOrders />} />
    <Route path="orders/:id" element={<OrderDetail />} />
    <Route path="orders/:id/invoice" element={<Invoice />} />
    <Route path="orders/all-orders" element={<AllOrders />} />
    <Route path="orders/order-tracking" element={<OrderTracking />} />
    <Route path="orders/enquiries" element={<EnquiriesPage />} />
    <Route path="return-requests" element={<ReturnRequests />} />
    <Route path="return-requests/:id" element={<ReturnRequestDetail />} />
    <Route path="customers" element={<Customers />} />
    <Route path="customers/view-customers" element={<ViewCustomers />} />
    <Route path="customers/addresses" element={<CustomerAddresses />} />
    <Route path="customers/transactions" element={<Transactions />} />
    <Route path="customers/:id" element={<CustomerDetailPage />} />

    <Route path="delivery" element={<DeliveryBoys />} />
    <Route path="delivery/delivery-boys" element={<DeliveryBoys />} />
    <Route path="delivery/cash-collection" element={<CashCollection />} />
    <Route path="delivery/assign-delivery" element={<AssignDelivery />} />
    <Route path="delivery/withdrawals" element={<Withdrawals />} />
    <Route path="delivery/rider-settlements" element={<RiderSettlements />} />
    <Route path="delivery/fee-settings" element={<DeliveryFeeSettings />} />
    <Route path="vendors" element={<Vendors />} />
    <Route path="vendors/manage-vendors" element={<ManageVendors />} />
    <Route
      path="vendors/pending-approvals"
      element={<PendingApprovals />}
    />
    <Route path="vendors/commission-rates" element={<CommissionRates />} />
    <Route
      path="vendors/vendor-analytics"
      element={<AdminVendorAnalytics />}
    />
    <Route path="vendors/explorer" element={<VendorExplorer />} />
    <Route path="vendors/register" element={<RegisterVendor />} />
    <Route path="vendors/settlements" element={<Settlements />} />
    <Route path="vendors/:id" element={<VendorDetail />} />

    <Route path="attributes" element={<Attributes />} />
    <Route path="attributes/list" element={<Attributes />} />
    <Route path="attributes/sets" element={<Attributes />} />
    <Route path="attributes/values" element={<Attributes />} />

    <Route path="offers" element={<HomeSliders />} />
    <Route path="offers/home-sliders" element={<HomeSliders />} />
    <Route path="offers/festival-offers" element={<FestivalOffers />} />
    <Route path="promo-codes" element={<PromoCodes />} />
    <Route path="promocodes" element={<PromoCodes />} />

    {/* Support Routes */}
    <Route path="chat-support" element={<LiveChat />} />
    <Route path="support" element={<Navigate to="customer-support/live-chat" replace />} />

    <Route path="customer-support">
      <Route index element={<Navigate to="live-chat" replace />} />
      <Route path="live-chat" element={<LiveChat type="customer" />} />
      <Route path="tickets" element={<Tickets type="customer" />} />
    </Route>

    <Route path="vendor-support">
      <Route index element={<Navigate to="live-chat" replace />} />
      <Route path="live-chat" element={<LiveChat type="vendor" />} />
      <Route path="tickets" element={<Tickets type="vendor" />} />
    </Route>

    <Route path="notifications" element={<AllNotifications />} />
    <Route
      path="notifications/push-notifications"
      element={<PushNotifications />}
    />

    <Route path="reports">
      <Route index element={<Navigate to="sales-report" replace />} />
      <Route path="sales-report" element={<SalesReport />} />
      <Route path="inventory-report" element={<InventoryReport />} />
      <Route path="earnings-report" element={<EarningsReport />} />
    </Route>
    <Route path="finance" element={<RevenueOverview />} />
    <Route path="finance/revenue-overview" element={<RevenueOverview />} />
    <Route path="finance/profit-loss" element={<ProfitLoss />} />
    <Route path="finance/order-trends" element={<OrderTrends />} />
    <Route
      path="finance/payment-breakdown"
      element={<PaymentBreakdown />}
    />
    <Route path="finance/tax-reports" element={<TaxReports />} />
    <Route path="finance/refund-reports" element={<RefundReports />} />
    <Route path="analytics" element={<Analytics />} />
    <Route
      path="settings"
      element={<Navigate to="general" replace />}
    />
    <Route path="settings/general" element={<Settings />} />
    <Route path="settings/payment-shipping" element={<Settings />} />
    <Route path="settings/orders-customers" element={<Settings />} />
    <Route path="settings/products-inventory" element={<Settings />} />
    <Route path="settings/content-features" element={<Settings />} />
    <Route path="settings/notifications-seo" element={<Settings />} />
    <Route path="settings/cancellation-reasons" element={<CancellationReasons />} />
    <Route path="settings/tax-settings" element={<Settings />} />
    <Route path="policies" element={<PrivacyPolicy />} />
    <Route path="policies/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="policies/refund-policy" element={<RefundPolicy />} />
    <Route path="policies/terms-conditions" element={<TermsConditions />} />
    <Route path="firebase" element={<PushConfig />} />
    <Route path="firebase/push-config" element={<PushConfig />} />
    <Route path="firebase/authentication" element={<Authentication />} />
    <Route path="campaigns" element={<Campaigns />} />
    <Route path="banners" element={<Banners />} />
    <Route path="reviews" element={<Reviews />} />
    <Route path="suggestions" element={<Suggestions />} />
    <Route path="content" element={<Content />} />
    <Route path="service-areas" element={<ServiceAreas />} />
    {/* Catch-all for unmatched routes in this area */}
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </>
);

// Inner component that has access to useLocation
const AppRoutes = () => {
  return (
    <Suspense fallback={<MobileModuleSkeleton />}>
      <Routes>
        {/* Admin Routes (Prioritized) */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }>
          {renderAdminRoutes()}
        </Route>

        <Route
          path="/staff/:roleName"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }>
          {renderAdminRoutes()}
        </Route>

        <Route element={<StoreMaintenanceGuard />}>
          {/* Delivery Routes */}
          <Route path="/delivery/login" element={<DeliveryLogin />} />
        <Route path="/delivery/register" element={<DeliveryRegister />} />
        <Route path="/delivery/forgot-password" element={<DeliveryForgotPassword />} />
        <Route path="/delivery/reset-password" element={<DeliveryResetPassword />} />
        <Route path="/delivery/privacy" element={<DeliveryLegalPage fixedPageId="privacy" />} />
        <Route path="/delivery/support" element={<DeliveryLegalPage fixedPageId="support" />} />
        <Route
          path="/delivery"
          element={
            <DeliveryProtectedRoute>
              <DeliveryLayout />
            </DeliveryProtectedRoute>
          }>
          <Route index element={<Navigate to="/delivery/dashboard" replace />} />
          <Route path="dashboard" element={<DeliveryDashboard />} />
          <Route path="orders" element={<DeliveryOrders />} />
          <Route path="orders/:id" element={<DeliveryOrderDetail />} />
          <Route path="returns/:id" element={<DeliveryReturnDetail />} />
          <Route path="multi-vendor/:orderId" element={<MultiVendorPickup />} />
          <Route path="live-tracking/:orderId" element={<DeliveryLiveTracking />} />
          <Route path="notifications" element={<DeliveryNotifications />} />
          <Route path="payouts" element={<DeliveryPayouts />} />
          <Route path="profile" element={<DeliveryProfile />} />
        </Route>

        {/* Vendor Routes */}
        <Route path="/vendor/login" element={<VendorLogin />} />
        <Route path="/vendor/register" element={<VendorRegister />} />
        <Route path="/vendor/verification" element={<VendorVerification />} />
        <Route path="/vendor/forgot-password" element={<VendorForgotPassword />} />
        <Route path="/vendor/reset-password" element={<VendorResetPassword />} />
        <Route
          path="/vendor"
          element={
            <VendorProtectedRoute>
              <VendorLayout />
            </VendorProtectedRoute>
          }>
          <Route index element={<Navigate to="/vendor/dashboard" replace />} />
          <Route path="dashboard" element={<VendorDashboard />} />
          <Route path="products" element={<VendorProducts />} />
          <Route
            path="products/manage-products"
            element={<VendorManageProducts />}
          />
          <Route path="products/add-product" element={<VendorAddProduct />} />
          <Route path="products/:id" element={<VendorProductForm />} />
          <Route path="orders" element={<VendorOrders />} />
          <Route path="orders/all-orders" element={<VendorAllOrders />} />
          <Route path="orders/order-tracking" element={<VendorOrderTracking />} />
          <Route path="orders/:id" element={<VendorOrderDetail />} />
          <Route path="settlements" element={<VendorSettlements />} />
          <Route path="settlements/pending" element={<VendorSettlements />} />
          <Route path="settlements/ready" element={<VendorSettlements />} />
          <Route path="settlements/completed" element={<VendorSettlements />} />
          <Route path="earnings" element={<VendorEarnings />} />
          <Route path="earnings/commission-history" element={<VendorEarnings />} />
          <Route path="earnings/settlement-history" element={<VendorEarnings />} />
          <Route path="stock-management">
            <Route index element={<VendorStockManagement />} />
            <Route path="manage" element={<VendorStockManagement />} />
            <Route path="offline-sales" element={<VendorOfflineSales />} />
          </Route>
          <Route path="help" element={<VendorHelp />} />
          <Route path="notifications" element={<VendorNotifications />} />
          <Route path="return-requests" element={<VendorReturnRequests />} />
          <Route
            path="return-requests/:id"
            element={<VendorReturnRequestDetail />}
          />
          <Route path="product-reviews" element={<VendorProductReviews />} />
          <Route path="pickup-locations" element={<VendorPickupLocations />} />
          <Route path="support-tickets" element={<VendorSupportTickets />} />
          <Route path="documents" element={<VendorDocuments />} />
          <Route path="language-settings" element={<VendorLanguageSettings />} />
          <Route path="settings" element={<VendorSettings />} />
          <Route path="settings/store" element={<VendorSettings />} />
          <Route path="settings/payment" element={<VendorSettings />} />
          <Route path="settings/payment-settings" element={<VendorSettings />} />
          <Route path="settings/shipping" element={<VendorSettings />} />
          <Route path="settings/shipping-settings" element={<VendorSettings />} />
          <Route path="settings/location" element={<VendorSettings />} />
          <Route path="profile" element={<VendorSettings />} />
        </Route>

        {/* User Module Routes */}
        <Route
          path="/"
          element={
            <RouteWrapper>
              <UserLayout><UserHomePage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/home"
          element={
            <RouteWrapper>
              <UserLayout><UserHomePage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/shop"
          element={<Navigate to="/categories" replace />}
        />
        <Route
          path="/categories"
          element={
            <RouteWrapper>
              <UserLayout><MobileCategories /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/category/:categoryId"
          element={
            <RouteWrapper>
              <UserLayout><MobileCategories /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/products"
          element={
            <RouteWrapper>
              <UserLayout variant="products"><UserProductsPage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/product/:id"
          element={
            <RouteWrapper>
              <UserLayout variant="product"><UserProductDetail /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/cart"
          element={
            <RouteWrapper>
              <UserLayout variant="cart"><UserCartPage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/checkout"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="checkout"><UserCheckoutPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/payment"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="payment"><UserPaymentPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/wishlist"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout showHeader={false}><UserWishlistPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/offers"
          element={
            <RouteWrapper>
              <UserLayout><UserOffersPage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/events"
          element={
            <RouteWrapper>
              <UserLayout><UserEventsPage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route
          path="/refer"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout><UserReferPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/sale/:slug"
          element={
            <RouteWrapper>
              <UserLayout showCategoryBar={false}><CampaignSale /></UserLayout>
            </RouteWrapper>
          }
        />

        {/* Auth pages - UserProviders only (contexts but no Header/Footer) */}
        <Route
          path="/login"
          element={
            <RouteWrapper>
              <UserLoginPage />
            </RouteWrapper>
          }
        />
        <Route
          path="/register"
          element={
            <RouteWrapper>
              <UserRegisterPage />
            </RouteWrapper>
          }
        />

        {/* Profile & Account */}
        <Route
          path="/profile"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserProfilePage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/account"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserAccountPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        {/* Restored Live Support route */}
        <Route
          path="/support"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserSupportPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/legal/:pageId"
          element={
            <RouteWrapper>
              <UserLayout><UserLegalPage /></UserLayout>
            </RouteWrapper>
          }
        />
        <Route path="/privacy" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="privacy" /></UserLayout></RouteWrapper>} />
        <Route path="/contact" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="contact" /></UserLayout></RouteWrapper>} />
        <Route path="/shipping" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="shipping" /></UserLayout></RouteWrapper>} />
        <Route path="/about" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="about" /></UserLayout></RouteWrapper>} />
        <Route path="/terms" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="terms" /></UserLayout></RouteWrapper>} />
        <Route path="/refund" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="refund" /></UserLayout></RouteWrapper>} />
        <Route path="/return" element={<RouteWrapper><UserLayout><UserLegalPage fixedPageId="return" /></UserLayout></RouteWrapper>} />


        {/* Orders */}
        <Route
          path="/orders"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserOrdersPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/orders/:orderId"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserOrderDetailPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/order-confirmation/:orderId"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout><UserOrderSuccessPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/order-success/:orderId"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout><UserOrderSuccessPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        <Route
          path="/track-order/:orderId"
          element={
            <RouteWrapper>
              <UserLayout><UserTrackOrderPage /></UserLayout>
            </RouteWrapper>
          }
        />

        {/* Addresses */}
        <Route
          path="/addresses"
          element={
            <RouteWrapper>
              <ProtectedRoute>
                <UserLayout variant="account"><UserAddressesPage /></UserLayout>
              </ProtectedRoute>
            </RouteWrapper>
          }
        />
        {/* Catch-all for unmatched routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
        
        </Route>
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}>
        <UserProviders>
          <AppBootstrap />
          <ScrollToTop />
          <AppRoutes />
          <CartDrawer />
          <Toaster
            position="top-center"
            containerStyle={{ zIndex: 99999 }}
            toastOptions={{
              duration: 3500,
              style: {
                background: "rgba(18, 18, 18, 0.92)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: "500",
                borderRadius: "24px",
                padding: "12px 24px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
                maxWidth: "420px",
                textAlign: "center",
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: "#22c55e",
                  secondary: "#fff",
                },
              },
              error: {
                duration: 4000,
                iconTheme: {
                  primary: "#ef4444",
                  secondary: "#fff",
                },
              },
            }}
          />
        </UserProviders>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
