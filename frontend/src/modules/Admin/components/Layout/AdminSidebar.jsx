import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiShoppingBag,
  FiRotateCcw,
  FiPackage,
  FiGrid,
  FiTag,
  FiUsers,
  FiTruck,
  FiImage,
  FiPercent,
  FiBell,
  FiMessageCircle,
  FiFileText,
  FiBarChart2,
  FiSettings,
  FiGlobe,
  FiShield,
  FiChevronDown,
  FiX,
  FiUser,
  FiSend,
} from "react-icons/fi";
import { useAdminAuthStore } from "../../store/adminStore";
import { useNotificationStore } from "../../store/notificationStore";
import adminMenu from "../../config/adminMenu.json";
import logo from "../../../../assets/animations/lottie/logo-removebg.png";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Orders: FiShoppingBag,
  "Return Requests": FiRotateCcw,
  Products: FiPackage,
  Categories: FiGrid,
  Brands: FiTag,
  Customers: FiUsers,
  "Delivery Management": FiTruck,
  "Offers & Sliders": FiImage,
  Banners: FiImage,
  "Promo Codes": FiPercent,
  Notifications: FiBell,
  "Customer Support": FiMessageCircle,
  "Vendor Support": FiMessageCircle,
  Reviews: FiMessageCircle,
  Suggestions: FiSend,
  Reports: FiFileText,
  "Analytics & Finance": FiBarChart2,
  Settings: FiSettings,
  Policies: FiShield,
  "Staff Management": FiUsers,
  "Attribute Management": FiGrid,
  "Service Areas": FiGlobe,
};

const getBasePrefix = (admin) => {
  if (!admin) return "/admin";
  const isPrivileged = admin.role === "superadmin" || admin.role === "admin";
  if (isPrivileged) return "/admin";
  // Convert role name to URL friendly format (e.g. "Content Manager" -> "content-manager")
  const roleSlug = admin.role.toLowerCase().trim().replace(/\s+/g, "-");
  return `/staff/${roleSlug}`;
};

// Helper function to convert child name to route path
const getChildRoute = (parentRoute, childName, admin) => {
  const basePrefix = getBasePrefix(admin);
  const routeMap = {
    [`${basePrefix}/orders`]: {
      "All Orders": `${basePrefix}/orders/all-orders`,
      "Order Tracking": `${basePrefix}/orders/order-tracking`,
      "Cancellation Enquiries": `${basePrefix}/orders/enquiries`,
    },
    [`${basePrefix}/products`]: {
      "Manage Products": `${basePrefix}/products/manage-products`,
      "Product Approvals": `${basePrefix}/products/pending`,
      "Tax & Pricing": `${basePrefix}/products/tax-pricing`,
      "Product Ratings": `${basePrefix}/products/product-ratings`,
    },
    [`${basePrefix}/categories`]: {
      "Manage Categories": `${basePrefix}/categories/manage-categories`,
      "Category Order": `${basePrefix}/categories/category-order`,
    },
    [`${basePrefix}/brands`]: {
      "Manage Brands": `${basePrefix}/brands/manage-brands`,
    },
    [`${basePrefix}/customers`]: {
      "View Customers": `${basePrefix}/customers/view-customers`,
      Addresses: `${basePrefix}/customers/addresses`,
      Transactions: `${basePrefix}/customers/transactions`,
    },
    [`${basePrefix}/delivery`]: {
      "Delivery Boys": `${basePrefix}/delivery/delivery-boys`,
      "Cash Collection": `${basePrefix}/delivery/cash-collection`,
      "Payout Requests": `${basePrefix}/delivery/withdrawals?type=DeliveryBoy`,
      "Online Settlements": `${basePrefix}/delivery/rider-settlements`,
      "Fee Settings": `${basePrefix}/delivery/fee-settings`,
    },
    [`${basePrefix}/attributes`]: {
      "Attribute Sets": `${basePrefix}/attributes/sets`,
    },
    [`${basePrefix}/vendors`]: {
      "Manage Vendors": `${basePrefix}/vendors/manage-vendors`,
      "Vendor Explorer": `${basePrefix}/vendors/explorer`,
      "Pending Approvals": `${basePrefix}/vendors/pending-approvals`,
      "Commission Rates": `${basePrefix}/vendors/commission-rates`,
      "Vendor Analytics": `${basePrefix}/vendors/vendor-analytics`,
      "Vendor Registration": `${basePrefix}/vendors/register`,
      "Vendor Settlements": `${basePrefix}/vendors/settlements`,
      "Payout Requests": `${basePrefix}/delivery/withdrawals?type=Vendor`,
    },
    [`${basePrefix}/offers`]: {
      "Home Sliders": `${basePrefix}/offers/home-sliders`,
      "Festival Offers": `${basePrefix}/offers/festival-offers`,
    },
    [`${basePrefix}/notifications`]: {
      "All Notifications": `${basePrefix}/notifications`,
      "Push Notifications": `${basePrefix}/notifications/push-notifications`,
    },
    [`${basePrefix}/customer-support`]: {
      "Live Chat": `${basePrefix}/customer-support/live-chat`,
      "Tickets": `${basePrefix}/customer-support/tickets`,
    },
    [`${basePrefix}/vendor-support`]: {
      "Live Chat": `${basePrefix}/vendor-support/live-chat`,
      "Tickets": `${basePrefix}/vendor-support/tickets`,
    },
    [`${basePrefix}/reports`]: {
      "Sales Report": `${basePrefix}/reports/sales-report`,
      "Inventory Report": `${basePrefix}/reports/inventory-report`,
      "Earnings Report": `${basePrefix}/reports/earnings-report`,
    },
    [`${basePrefix}/finance`]: {
      "Revenue Overview": `${basePrefix}/finance/revenue-overview`,
      "Profit & Loss": `${basePrefix}/finance/profit-loss`,
      "Order Trends": `${basePrefix}/finance/order-trends`,
      "Payment Breakdown": `${basePrefix}/finance/payment-breakdown`,
      "Tax Reports": `${basePrefix}/finance/tax-reports`,
      "Refund Reports": `${basePrefix}/finance/refund-reports`,
    },
    [`${basePrefix}/settings`]: {
      General: `${basePrefix}/settings/general`,
      "Payment & Shipping": `${basePrefix}/settings/payment-shipping`,
      "Orders & Customers": `${basePrefix}/settings/orders-customers`,
      "Products & Inventory": `${basePrefix}/settings/products-inventory`,
      "Content & Features": `${basePrefix}/settings/content-features`,
      "Notifications & SEO": `${basePrefix}/settings/notifications-seo`,
      "Cancellation Reasons": `${basePrefix}/settings/cancellation-reasons`,
      "Tax Settings": `${basePrefix}/settings/tax-settings`,
      "Delivery Fees": `${basePrefix}/settings/delivery-fees`,
    },
    [`${basePrefix}/policies`]: {
      "Privacy Policy": `${basePrefix}/policies/privacy-policy`,
      "Refund Policy": `${basePrefix}/policies/refund-policy`,
      "Terms & Conditions": `${basePrefix}/policies/terms-conditions`,
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

const AdminSidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const { unreadCount } = useNotificationStore();
  const [expandedItems, setExpandedItems] = useState({});
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    // Only close when route actually changes, not when sidebar opens
    if (window.innerWidth < 1024) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // Only trigger on route changes

  // Auto-expand menu items when their route is active (only if viewing a child route)
  useEffect(() => {
    const activeItem = adminMenu.find((item) => {
      if (item.route === "/admin/dashboard") {
        return location.pathname === "/admin/dashboard";
      }
      // Check if current path is a child of this item (not just the parent route itself)
      const isChildRoute =
        location.pathname.startsWith(item.route) &&
        location.pathname !== item.route;
      return isChildRoute;
    });
    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      // Only expand if we're actually on a child route, keep the parent open
      setExpandedItems((prev) => {
        // If the parent is already expanded, keep it expanded (don't close others)
        // This allows navigation between child items without closing the dropdown
        if (prev[activeItem.title]) {
          return prev;
        }
        // Otherwise, close all others and expand this one
        return {
          [activeItem.title]: true,
        };
      });
    } else {
      // If not on a child route, check if we should close expanded items
      // Only close if we're navigating to a completely different parent route
      const currentParent = adminMenu.find((item) => {
        const basePrefix = getBasePrefix(admin);
        const dynamicRoute = item.route.replace("/admin", basePrefix);
        if (dynamicRoute === `${basePrefix}/dashboard`) {
          return location.pathname === `${basePrefix}/dashboard`;
        }
        return location.pathname.startsWith(dynamicRoute);
      });
      // If we're on a parent route without children, close all expanded items
      if (
        currentParent &&
        (!currentParent.children || currentParent.children.length === 0)
      ) {
        setExpandedItems({});
      }
      // If we're on a parent route with children, keep it expanded if it was already expanded
    }
  }, [location.pathname]);

  // Check if a menu item is active
  const isActive = (route) => {
    const basePrefix = getBasePrefix(admin);
    const dynamicRoute = route.replace("/admin", basePrefix);
    if (dynamicRoute === `${basePrefix}/dashboard`) {
      return location.pathname === `${basePrefix}/dashboard`;
    }
    return location.pathname.startsWith(dynamicRoute);
  };

  // Toggle expanded state for menu items with children
  const toggleExpand = (title, closeOthers = true) => {
    setExpandedItems((prev) => {
      if (closeOthers) {
        // Close all other expanded items and toggle the clicked one
        return {
          [title]: !prev[title],
        };
      } else {
        // Just toggle the clicked item
        return {
          ...prev,
          [title]: !prev[title],
        };
      }
    });
  };

  // Close all expanded items
  const closeAllExpanded = () => {
    setExpandedItems({});
  };

  // Handle menu item click
  const handleMenuItemClick = (route, parentTitle = null) => {
    // If navigating to a child route, keep the parent expanded
    if (parentTitle) {
      setExpandedItems((prev) => {
        // Close all other expanded items, but keep the current parent open
        return {
          [parentTitle]: true,
        };
      });
    } else {
      // If navigating to a parent route without children, close all expanded items
      closeAllExpanded();
    }
    navigate(route);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Render menu item
  const renderMenuItem = (item) => {
    const Icon = iconMap[item.title] || FiPackage;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];
    const active = isActive(item.route);

    return (
      <div key={item.route} className="mb-1">
        {/* Main Menu Item */}
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer
            ${active
              ? "bg-primary-600 text-white shadow-sm"
              : "text-gray-300 hover:bg-slate-700"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              // Close all other expanded items when clicking on a parent with children
              toggleExpand(item.title, true);
            } else {
              // Close all expanded items when clicking on a parent without children
              handleMenuItemClick(item.route);
            }
          }}>
          <Icon
            className={`text-xl flex-shrink-0 ${active ? "text-white" : "text-gray-400"
              }`}
          />
          <span className="font-medium flex-1 text-sm">{item.title}</span>
          {item.title === "Notifications" && unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-2 min-w-[1.5rem] text-center shadow-sm">
              {unreadCount}
            </span>
          )}
          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}>
              <FiChevronDown className="text-gray-400 text-sm" />
            </motion.div>
          )}
        </div>

        {/* Children Items */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div className="ml-4 mt-1 pl-4 border-l-2 border-slate-600 space-y-1">
                {item.children.map((child, index) => {
                  const basePrefix = getBasePrefix(admin);
                  const dynamicParentRoute = item.route.replace("/admin", basePrefix);
                  const childRoute = getChildRoute(dynamicParentRoute, child, admin);
                  const isChildActive =
                    location.pathname === childRoute ||
                    (childRoute !== dynamicParentRoute &&
                      location.pathname.startsWith(childRoute));

                  return (
                    <div
                      key={index}
                      onClick={() =>
                        handleMenuItemClick(childRoute, item.title)
                      }
                      className={`
                        px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer
                        ${isChildActive
                          ? "bg-primary-500/20 text-white font-medium"
                          : "text-gray-400 hover:bg-slate-700"
                        }
                      `}>
                      {child}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-800 shadow-xl">
      {/* Header Section */}
      <div className="p-4 border-b border-slate-700 bg-slate-900">
        {/* Header with Close Button and Admin Info */}
        <div className="flex items-center justify-between gap-3">
          {/* Admin User Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-[#0f172a] rounded-xl flex items-center justify-center shadow-md flex-shrink-0 p-2 border border-white/5">
              <img src={logo} alt="CLOSH" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-white text-sm truncate">
                {admin?.name || "Admin User"}
              </h2>
              <p className="text-xs text-gray-400 truncate">
                {admin?.email || "admin@admin.com"}
              </p>
            </div>
          </div>

          {/* Close Button - Mobile Only */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:text-black/10 rounded-lg transition-colors flex-shrink-0 lg:hidden"
            aria-label="Close sidebar">
            <FiX className="text-xl text-gray-300" />
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 scrollbar-admin lg:pb-3">
        {adminMenu
          .filter((item) => {
            if (admin?.role === "superadmin") return true;
            if (!item.permission) return true;
            const itemPerms = Array.isArray(item.permission) ? item.permission : [item.permission];
            return itemPerms.some(p => admin?.permissions?.includes(p));
          })
          .map((item) => {
            const basePrefix = getBasePrefix(admin);
            const dynamicItem = {
              ...item,
              route: item.route.replace("/admin", basePrefix)
            };
            return renderMenuItem(dynamicItem);
          })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: Overlay Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[9998] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-[10000] lg:hidden">
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop Fixed */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-40">
        {sidebarContent}
      </div>
    </>
  );
};

export default AdminSidebar;
