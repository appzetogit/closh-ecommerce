import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiShoppingBag,
  FiClock,
  FiCheckCircle,
  FiPackage,
  FiTruck,
  FiXCircle,
  FiList,
  FiMapPin,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getAllVendorOrders } from '../services/vendorService';

const Orders = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) return;

        const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const data = await getAllVendorOrders({ limit: 100 });
        setOrders(data?.orders ?? []);
      } catch {
        // errors handled by api.js toast
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [vendorId]);

  // Derive stat counts from real orders
  const orderStats = useMemo(() => {
    const stats = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      total: orders.length,
    };

    orders.forEach((order) => {
      // Each order's vendorItems may carry per-vendor status
      const vendorItem = order.vendorItems?.find(
        (vi) => vi.vendorId?.toString() === vendorId?.toString()
      );
      const globalStatus = String(order.status || '').toLowerCase();
      // Terminal order-level status wins - vendorItem.status is never
      // updated on return/cancel and would otherwise stay "delivered".
      const status = ['returned', 'return requested', 'cancelled', 'canceled'].includes(globalStatus)
        ? globalStatus
        : (vendorItem?.status ?? order.status ?? '').toLowerCase();

      if (status === 'pending') stats.pending++;
      else if (status === 'processing') stats.processing++;
      else if (status === 'shipped') stats.shipped++;
      else if (status === 'delivered') stats.delivered++;
      else if (status === 'cancelled' || status === 'canceled') stats.cancelled++;
    });

    return stats;
  }, [orders, vendorId]);

  const analyticsCards = [
    {
      title: 'Total Orders',
      value: orderStats.total,
      icon: FiShoppingBag,
      bgColor: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      cardBg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    },
    {
      title: 'Pending',
      value: orderStats.pending,
      icon: FiClock,
      bgColor: 'bg-gradient-to-br from-yellow-500 to-amber-600',
      cardBg: 'bg-gradient-to-br from-yellow-50 to-amber-50',
    },
    {
      title: 'Processing',
      value: orderStats.processing,
      icon: FiPackage,
      bgColor: 'bg-gradient-to-br from-indigo-500 to-purple-600',
      cardBg: 'bg-gradient-to-br from-indigo-50 to-purple-50',
    },
    {
      title: 'Shipped',
      value: orderStats.shipped,
      icon: FiTruck,
      bgColor: 'bg-gradient-to-br from-cyan-500 to-blue-600',
      cardBg: 'bg-gradient-to-br from-cyan-50 to-blue-50',
    },
    {
      title: 'Delivered',
      value: orderStats.delivered,
      icon: FiCheckCircle,
      bgColor: 'bg-gradient-to-br from-green-500 to-emerald-600',
      cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50',
    },
    {
      title: 'Cancelled',
      value: orderStats.cancelled,
      icon: FiXCircle,
      bgColor: 'bg-gradient-to-br from-red-500 to-rose-600',
      cardBg: 'bg-gradient-to-br from-red-50 to-rose-50',
    },
  ];

  const optionCards = [
    {
      path: '/vendor/orders/all-orders',
      label: 'All Orders',
      icon: FiList,
      gradient: 'from-blue-500 via-blue-600 to-blue-700',
      lightGradient: 'from-blue-50 via-blue-100/80 to-blue-50',
      shadowColor: 'shadow-blue-500/20',
      hoverShadow: 'hover:shadow-blue-500/30',
      description: 'View and manage your orders',
    },
    {
      path: '/vendor/orders/order-tracking',
      label: 'Order Tracking',
      icon: FiMapPin,
      gradient: 'from-purple-500 via-purple-600 to-purple-700',
      lightGradient: 'from-purple-50 via-purple-100/80 to-purple-50',
      shadowColor: 'shadow-purple-500/20',
      hoverShadow: 'hover:shadow-purple-500/30',
      description: 'Track order status',
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view orders</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 sm:space-y-6"
    >
      {/* Header */}
      <div className="px-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5">
          Orders
        </h1>
        <p className="text-sm sm:text-base text-gray-500">
          Manage and track your orders
        </p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {analyticsCards.map((card, index) => {
          const Icon = card.icon;
          const getStatusFromTitle = (title) => {
            if (title === 'Total Orders') return 'all';
            if (title === 'Cancelled') return 'cancelled';
            return title.toLowerCase();
          };
          const statusFilter = getStatusFromTitle(card.title);

          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate('/vendor/orders/all-orders', { state: { status: statusFilter } })}
              className={`${card.cardBg} rounded-xl p-3 sm:p-4 shadow-md border-2 border-transparent hover:shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden`}
            >
              <div className={`absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 ${card.bgColor} opacity-10 rounded-full -mr-12 -mt-12 sm:-mr-16 sm:-mt-16`}></div>

              <div className="flex items-center justify-between mb-2 sm:mb-3 relative z-10">
                <div className={`${card.bgColor} bg-white/20 p-2 sm:p-2.5 rounded-lg shadow-md`}>
                  <Icon className="text-white text-base sm:text-lg" />
                </div>
              </div>
              <div className="relative z-10">
                <h3 className="text-gray-600 text-xs sm:text-sm font-medium mb-1">
                  {card.title}
                </h3>
                <p className="text-gray-800 text-lg sm:text-xl font-bold">
                  {isLoading ? '—' : card.value.toLocaleString()}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Option Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        {optionCards.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: index * 0.05,
                type: 'spring',
                stiffness: 200,
                damping: 20,
              }}
              onClick={() => navigate(item.path)}
              className="group relative overflow-hidden"
            >
              <div
                className={`
                relative h-full
                flex flex-col items-center justify-center
                p-3 sm:p-6
                bg-white
                rounded-2xl sm:rounded-3xl
                border border-gray-100/80
                ${`bg-gradient-to-br ${item.lightGradient}`}
                ${item.shadowColor} ${item.hoverShadow}
                shadow-md sm:shadow-lg hover:shadow-2xl
                transition-all duration-500 ease-out
                active:scale-[0.96]
                hover:border-transparent
                overflow-hidden
              `}
              >
                <div
                  className={`
                  absolute inset-0
                  bg-gradient-to-br ${item.gradient}
                  opacity-0 group-hover:opacity-10
                  transition-opacity duration-500
                `}
                />
                <div className="absolute -top-6 -right-6 sm:-top-8 sm:-right-8 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                <div
                  className={`
                  relative z-10
                  w-12 h-12 sm:w-20 sm:h-20
                  rounded-xl sm:rounded-3xl
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center
                  mb-2 sm:mb-4
                  ${item.shadowColor}
                  shadow-lg sm:shadow-xl group-hover:shadow-2xl
                  group-hover:scale-110 group-hover:rotate-3
                  transition-all duration-500 ease-out
                  before:absolute before:inset-0
                  before:bg-gradient-to-br before:from-white/20 before:to-transparent
                  before:rounded-xl sm:before:rounded-3xl
                `}
                >
                  <Icon
                    className="text-white text-lg sm:text-3xl relative z-10"
                    strokeWidth={2.5}
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                <div className="relative z-10 text-center space-y-0.5 sm:space-y-1">
                  <h3 className="text-xs sm:text-base font-bold text-gray-900 group-hover:text-gray-950 transition-colors duration-300 leading-tight">
                    {item.label}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300 leading-tight">
                    {item.description}
                  </p>
                </div>

                <div
                  className={`
                  absolute bottom-0 left-0 right-0
                  h-0.5 sm:h-1
                  bg-gradient-to-r ${item.gradient}
                  transform scale-x-0 group-hover:scale-x-100
                  transition-transform duration-500 ease-out
                  origin-left
                `}
                />
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default Orders;
