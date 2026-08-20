import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FiPackage,
  FiShoppingBag,
  FiTrendingUp,
  FiArrowRight,
} from "react-icons/fi";
import { IndianRupee } from 'lucide-react';
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import { getVendorOrders, getVendorEarnings } from "../services/vendorService";
import { formatPrice, getItemStatusBadge } from "@shared/utils/helpers";
import { formatVariantLabel } from "@shared/utils/variant";
import { FiMapPin, FiAlertCircle } from "react-icons/fi";
import toast from "react-hot-toast";
import SwipeOrderCard from "../components/SwipeOrderCard";
import socketService from "@shared/utils/socket";

const VendorDashboard = () => {
  const navigate = useNavigate();
  const { vendor, updateLocation } = useVendorAuthStore();
  const [locationLoading, setLocationLoading] = useState(false);
  const { products, total: totalProductsCount, fetchProducts } = useVendorProductStore();
  
  const [stats, setStats] = useState({
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  });

  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const vendorId = vendor?.id || vendor?._id;

  const handleSetLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await updateLocation(latitude, longitude);
          if (res.success) {
            toast.success("Shop location updated successfully!");
          }
        } catch (error) {
          toast.error("Failed to update location. Please try again.");
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        setLocationLoading(false);
        toast.error("Please allow location access to set your shop location.");
      },
      { enableHighAccuracy: true }
    );
  };

  const isLocationSet = useMemo(() => {
    return (
      vendor?.shopLocation?.coordinates?.[0] !== 0 ||
      vendor?.shopLocation?.coordinates?.[1] !== 0
    );
  }, [vendor]);

  const loadDashboardData = useCallback(async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const [ordersRes, earningsRes, pendingRes, acceptedRes, processingRes] = await Promise.all([
        getVendorOrders({ page: 1, limit: 5 }),
        getVendorEarnings(),
        getVendorOrders({ page: 1, limit: 1, status: "pending" }),
        getVendorOrders({ page: 1, limit: 1, status: "accepted" }),
        getVendorOrders({ page: 1, limit: 1, status: "processing" }),
      ]);

      const ordersData = ordersRes?.data ?? ordersRes;
      const earningsData = earningsRes?.data ?? earningsRes;
      const pendingData = pendingRes?.data ?? pendingRes;
      const acceptedData = acceptedRes?.data ?? acceptedRes;
      const processingData = processingRes?.data ?? processingRes;

      const orders = ordersData?.orders ?? [];
      const summary = earningsData?.summary ?? {};
      const pendingCount =
        Number(pendingData?.total || 0) +
        Number(acceptedData?.total || 0) +
        Number(processingData?.total || 0);

      setStats((prev) => ({
        ...prev,
        totalOrders: ordersData?.total ?? orders.length,
        pendingOrders: pendingCount,
        totalEarnings: summary.totalEarnings ?? 0,
        pendingEarnings: summary.pendingEarnings ?? 0,
      }));

      setRecentOrders(orders);
    } catch {
      // errors handled by api.js toast
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    if (products.length === 0) {
      fetchProducts();
    }

    loadDashboardData();

    // Custom events from Layout when a new order is received or updated
    const handleNewOrderEvent = () => loadDashboardData();
    const handleOrderUpdatedEvent = () => loadDashboardData();

    window.addEventListener('vendor-new-order', handleNewOrderEvent);
    window.addEventListener('vendor-order-updated', handleOrderUpdatedEvent);

    // Socket listeners for other status updates
    socketService.on("order_created", () => loadDashboardData());
    socketService.on("order_picked_up", () => loadDashboardData());
    socketService.on("order_delivered", () => loadDashboardData());
    socketService.on("order_updated", () => loadDashboardData());
    socketService.on("order_status_updated", () => loadDashboardData());

    const pollInterval = setInterval(() => {
      loadDashboardData();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('vendor-new-order', handleNewOrderEvent);
      window.removeEventListener('vendor-order-updated', handleOrderUpdatedEvent);
      socketService.off("order_created");
      socketService.off("order_picked_up");
      socketService.off("order_delivered");
      socketService.off("order_updated");
      socketService.off("order_status_updated");
    };
  }, [vendorId, fetchProducts, loadDashboardData, products.length]);

  useEffect(() => {
    const inStock = products.filter((p) => p.stock === "in_stock").length;
    setStats((prev) => ({
      ...prev,
      totalProducts: Number(totalProductsCount || 0),
      inStockProducts: inStock,
    }));
  }, [products, totalProductsCount]);

  const statCards = [
    {
      icon: FiPackage,
      label: "Total Products",
      value: stats.totalProducts,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-700",
      link: "/vendor/products",
    },
    {
      icon: FiShoppingBag,
      label: "Total Orders",
      value: stats.totalOrders,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-700",
      link: "/vendor/orders",
    },
    {
      icon: FiTrendingUp,
      label: "Pending Orders",
      value: stats.pendingOrders,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-700",
      link: "/vendor/orders",
    },
    {
      icon: IndianRupee,
      label: "Total Earnings",
      value: formatPrice(stats.totalEarnings || 0),
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-700",
      link: "/vendor/earnings",
    },
  ];

  const topProducts = useMemo(() => products.slice(0, 5), [products]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      
      <div className="flex flex-col gap-4">
        <div className="lg:hidden flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
              Dashboard
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              Welcome back, {vendor?.storeName || vendor?.name}!
            </p>
          </div>
        </div>
      </div>

      {vendor?.isOnline === false && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"
        >
          <div className="bg-red-500 p-2 rounded-lg">
            <FiAlertCircle className="text-white text-xl" />
          </div>
          <div>
            <h3 className="font-bold text-red-800">Your Store is Offline</h3>
            <p className="text-sm text-red-700">Customers cannot see or buy your products. Turn on your store from the top toggle to start receiving orders.</p>
          </div>
        </motion.div>
      )}

      {!isLocationSet && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2 rounded-lg">
              <FiAlertCircle className="text-white text-xl" />
            </div>
            <div>
              <h3 className="font-bold text-orange-800">Shop Location Not Set</h3>
              <p className="text-sm text-orange-700">Please set your shop's GPS location for accurate delivery.</p>
            </div>
          </div>
          <button
            onClick={handleSetLocation}
            disabled={locationLoading}
            className="w-full sm:w-auto px-6 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
          >
            {locationLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiMapPin />}
            Set Current Location
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => stat.link && navigate(stat.link)}
            className={`${stat.bgColor} rounded-xl p-4 cursor-pointer hover:shadow-lg transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`${stat.color} p-3 rounded-lg`}><stat.icon className="text-white text-xl" /></div>
              <FiArrowRight className={`${stat.textColor} text-lg`} />
            </div>
            <h3 className={`${stat.textColor} text-sm font-medium mb-1`}>{stat.label}</h3>
            <p className={`${stat.textColor} text-2xl font-bold`}>{isLoading ? "—" : stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button onClick={() => navigate("/vendor/products/add-product")} className="flex items-center gap-3 p-4 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors text-left">
            <div className="bg-primary-500 p-2 rounded-lg"><FiPackage className="text-white text-xl" /></div>
            <div><h3 className="font-semibold text-gray-800">Add New Product</h3><p className="text-sm text-gray-600">Create a new product listing</p></div>
          </button>
          <button onClick={() => navigate("/vendor/orders")} className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left">
            <div className="bg-green-500 p-2 rounded-lg"><FiShoppingBag className="text-white text-xl" /></div>
            <div><h3 className="font-semibold text-gray-800">View Orders</h3><p className="text-sm text-gray-600">Manage your orders</p></div>
          </button>
          <button onClick={() => navigate("/vendor/earnings")} className="flex items-center gap-3 p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-left">
            <div className="bg-purple-500 p-2 rounded-lg"><IndianRupee className="text-white text-xl" /></div>
            <div><h3 className="font-semibold text-gray-800">View Earnings</h3><p className="text-sm text-gray-600">Check your earnings</p></div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Recent Orders</h2>
            <button onClick={() => navigate("/vendor/orders")} className="text-sm text-primary-600 font-medium">View All</button>
          </div>
          {isLoading ? <p className="text-gray-400 text-center py-8">Loading orders...</p> : recentOrders.length > 0 ? (
            <div className="space-y-4">
              {recentOrders.map((order) => {
                const currentVendorId = vendorId?.toString();
                const vendorItem = order.vendorItems?.find(vi => {
                  const vId = vi.vendorId?._id || vi.vendorId;
                  return vId?.toString() === currentVendorId;
                });
                let displayStatus = (vendorItem?.status || order.status || 'pending').toLowerCase();
                if (['returned', 'return requested', 'cancelled', 'canceled'].includes((order.status || '').toLowerCase())) {
                  displayStatus = order.status.toLowerCase();
                }
                if (['pending', 'accepted', 'processing'].includes(displayStatus)) {
                  return <SwipeOrderCard key={order._id ?? order.orderId} order={order} onStatusUpdate={() => loadDashboardData()} />;
                }
                const lineItems = vendorItem?.items?.length ? vendorItem.items : (order.items || []);
                const displayAmount = vendorItem?.basePrice ??
                                      vendorItem?.items?.reduce((sum, it) => sum + (it.vendorPrice ?? it.price ?? 0) * (it.quantity ?? 1), 0) ??
                                      vendorItem?.subtotal ?? 0;
                return (
                  <div key={order._id ?? order.orderId} onClick={() => navigate(`/vendor/orders/${order.orderId ?? order._id}`)} className="flex items-center justify-between p-3 bg-white hover:bg-gray-100 rounded-lg cursor-pointer transition-colors border border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="bg-white p-2 rounded-lg shadow-sm shrink-0"><FiPackage className="text-gray-400" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate leading-tight">{order.orderId ?? order._id}</p>
                        {lineItems.length === 0 ? (
                          <p className="text-[11px] text-gray-600 font-bold truncate mt-1">Order Details</p>
                        ) : lineItems.map((lineItem, idx) => {
                          const itemBadge = getItemStatusBadge(lineItem.itemStatus, displayStatus);
                          return (
                            <div key={idx} className="mt-1">
                              <p className="text-[11px] text-gray-600 font-bold truncate">{lineItem.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-gray-500 font-medium">Qty: {lineItem.quantity || 1}</span>
                                {formatVariantLabel(lineItem.variant) && (
                                  <span className="text-[10px] text-gray-400 font-medium">
                                    {formatVariantLabel(lineItem.variant)}
                                  </span>
                                )}
                                {itemBadge && (
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border leading-none ${itemBadge.className}`}>
                                    {itemBadge.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right"><p className="font-bold text-gray-800 text-sm">{formatPrice(displayAmount)}</p><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${displayStatus === "delivered" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{displayStatus}</span></div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-500 text-center py-8">No orders yet</p>}
        </div>

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-800">Your Products</h2><button onClick={() => navigate("/vendor/products")} className="text-sm text-primary-600 font-medium">View All</button></div>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((product) => (
                <div key={product._id ?? product.id} onClick={() => navigate(`/vendor/products/${product._id ?? product.id}`)} className="flex items-center gap-3 p-3 bg-white hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
                  <img src={product.image || product.images?.[0]} alt={product.name} className="w-12 h-12 object-cover rounded-lg" />
                  <div className="flex-1 min-w-0"><p className="font-semibold text-gray-800 truncate">{product.name}</p><p className="text-sm text-gray-600">{formatPrice(product.vendorPrice || product.price || 0)}</p></div>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-500 text-center py-8">No products yet</p>}
        </div>
      </div>
    </motion.div>
  );
};

export default VendorDashboard;
