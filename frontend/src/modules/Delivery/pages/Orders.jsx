import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  FiPackage, 
  FiMapPin, 
  FiClock, 
  FiCheckCircle, 
  FiXCircle, 
  FiNavigation, 
  FiPhone, 
  FiCreditCard,
  FiChevronRight,
  FiSearch,
  FiFilter,
  FiActivity,
  FiTruck,
  FiAlertTriangle,
  FiRefreshCw,
  FiSlash,
  FiBarChart2,
  FiRotateCcw,
  FiDollarSign
} from 'react-icons/fi';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../shared/utils/api';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import socketService from '../../../shared/utils/socket';
import OrderCardSkeleton from '../../../shared/components/Skeletons/OrderCardSkeleton';

const CountdownTimer = ({ assignedAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState(120);

  const onExpireRef = useRef(onExpire);
  
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const startTime = assignedAt ? new Date(assignedAt).getTime() : Date.now();
    const endTime = startTime + 120000;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        if (onExpireRef.current) onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [assignedAt]);

  return (
    <div className="flex items-center gap-1.5 justify-center mb-2">
      <FiClock className={timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-amber-500'} size={12} />
      <span className="font-mono text-xs font-bold w-10 text-center">
        {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
      </span>
      <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Left to Accept</span>
    </div>
  );
};

const DeliveryOrders = () => {
  const navigate = useNavigate();
  const {
    orders,
    returns,
    ordersPagination,
    isLoadingOrders,
    isUpdatingOrderStatus,
    fetchOrders,
    fetchDashboardSummary,
    acceptOrder,
    rejectOrder,
    completeOrder,
    deliveryBoy,
  } = useDeliveryAuthStore();
  
  const isOnline = ['available', 'busy'].includes(deliveryBoy?.status);
  const [filter, setFilter] = useState(isOnline ? 'available' : 'pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [mvOrders, setMvOrders] = useState([]);
  const [mvLoading, setMvLoading] = useState(false);
  // Rejected orders state
  const [rejectedOrders, setRejectedOrders] = useState([]);
  const [rejectedSummary, setRejectedSummary] = useState({ cancelledAssigned: 0, riderRejected: 0, total: 0 });
  const [rejectedLoading, setRejectedLoading] = useState(false);
  // Returned orders state
  const [returnedOrders, setReturnedOrders] = useState([]);
  const [returnedSummary, setReturnedSummary] = useState({ total: 0, totalEarnings: 0 });
  const [returnedLoading, setReturnedLoading] = useState(false);
  const PAGE_SIZE = 20;

  const getBackendStatusFilter = (value) => {
    if (value === 'pending') return 'open';
    if (value === 'in-transit') return 'shipped';
    if (value === 'delivered') return 'delivered';
    return undefined;
  };

  const loadOrders = async (page = currentPage, activeFilter = filter) => {
    try {
      // Use unified fetchOrders for both tabs to prevent data mixing
      // 'open' now covers ALL running statuses assigned to the rider in the backend
      const statusParam = activeFilter === 'available' ? 'open' : 'delivered';

      const promises = [
        fetchOrders({
          page,
          limit: PAGE_SIZE,
          status: statusParam
        })
      ];

      if (activeFilter === 'available') {
        promises.push(fetchDashboardSummary());
      }

      await Promise.all(promises);
    } catch (err) {
      console.error("Order Load Error:", err);
    }
  };


  useEffect(() => {
    loadOrders(currentPage, filter);
    const interval = setInterval(() => loadOrders(currentPage, filter), 120000);
    const handleGlobalRefresh = () => {
      loadOrders(1, filter);
    };
    window.addEventListener('delivery-dashboard-refresh', handleGlobalRefresh);

    // Fetch multi-vendor available orders
    if (filter === 'multi-vendor' && isOnline) {
      setMvLoading(true);
      api.get('/delivery/multi-vendor/available')
        .then(r => setMvOrders(r.data.data || []))
        .catch(() => {})
        .finally(() => setMvLoading(false));
    }

    // Fetch rejected orders
    if (filter === 'rejected') {
      setRejectedLoading(true);
      api.get('/delivery/orders/rejected', { params: { page: currentPage, limit: PAGE_SIZE } })
        .then(r => {
          const payload = r.data?.data || r.data || {};
          setRejectedOrders(payload.orders || []);
          setRejectedSummary(payload.summary || { cancelledAssigned: 0, riderRejected: 0, total: 0 });
        })
        .catch(() => toast.error('Failed to load rejected orders'))
        .finally(() => setRejectedLoading(false));
    }

    // Fetch completed returns history
    if (filter === 'returned') {
      setReturnedLoading(true);
      api.get('/delivery/returns/completed', { params: { page: currentPage, limit: PAGE_SIZE } })
        .then(r => {
          const payload = r.data?.data || r.data || {};
          setReturnedOrders(payload.returns || []);
          setReturnedSummary(payload.summary || { total: 0, totalEarnings: 0 });
        })
        .catch(() => toast.error('Failed to load return history'))
        .finally(() => setReturnedLoading(false));
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('delivery-dashboard-refresh', handleGlobalRefresh);
    };
  }, [currentPage, filter]);

  const getStatusStyle = (status) => {
    const s = String(status || '').toLowerCase().replace(/_/g, ' ');
    if (['delivered', 'completed'].includes(s)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (['cancelled', 'failed', 'rejected'].includes(s)) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (['in-transit', 'shipped', 'out_for_delivery', 'out for delivery', 'picked-up', 'picked_up', 'picked up'].includes(s)) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (['return requested', 'return_requested', 'awaiting return', 'awaiting_return'].includes(s)) return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  const handleAcceptOrder = async (orderId, type = 'order') => {
    try {
      if (type === 'return') {
        await useDeliveryAuthStore.getState().acceptReturn(orderId);
        toast.success('Mission assigned! Get started.');
        navigate(`/delivery/returns/${orderId}`);
      } else {
        const res = await acceptOrder(orderId);
        toast.success('Mission assigned! Get started.');
        if (res?.isMultiVendor) {
          navigate(`/delivery/multi-vendor/${orderId}`);
        } else {
          navigate(`/delivery/orders/${orderId}`);
        }
      }
    } catch(err) {}
  };

  const handleRejectMission = async (e, orderId) => {
    e.stopPropagation();
    const confirm = window.confirm("Are you sure you want to decline this mission?");
    if (!confirm) return;
    try {
      toast.loading("Declining order...", { id: "decline-order" });
      await rejectOrder(orderId);
      toast.success("Mission declined successfully", { id: "decline-order" });
      // If we are on available tab, we might need to manually trigger a refetch if optimistic update isn't perfectly synced
      if (filter === 'available') {
         loadOrders(currentPage, filter);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to decline order", { id: "decline-order" });
    }
  };

  const handleAcceptMultiVendor = async (orderId) => {
    const confirm = window.confirm("Accept this combined multi-vendor order? This will assign all pickups to you.");
    if (!confirm) return;

    try {
      toast.loading("Assigning order...", { id: "mv-assign" });
      await api.post(`/delivery/multi-vendor/${orderId}/accept`);
      toast.success("Order assigned successfully!", { id: "mv-assign" });
      navigate(`/delivery/multi-vendor/${orderId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept order.", { id: "mv-assign" });
    }
  };

  const handleCompleteOrder = async (orderId) => {
    const otp = window.prompt('Enter 6-digit delivery OTP:');
    if (!otp) return;
    if (!/^\d{6}$/.test(otp.trim())) {
      toast.error('Invalid OTP format');
      return;
    }

    try {
      await completeOrder(orderId, otp.trim());
      toast.success('Delivery confirmed! Earning added.');
    } catch(err) {}
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F8FAFC]">
        {/* AI Elite Sub-Header (High-Trust) */}
        <div className="bg-[#0F172A] pt-6 pb-12 px-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 flex items-center justify-between">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
                 <FiActivity size={18} className="text-white" />
              </div>
              Mission History
            </h1>
            <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest">
               Platform Secure
            </div>
          </div>

          <div className="relative z-10 mt-6 flex gap-2 overflow-x-auto scrollbar-hide">
             {['available', 'multi-vendor', 'delivered', 'returned', 'rejected'].filter(t => t !== 'available' || isOnline).map((tab) => (
               <button
                 key={tab}
                 onClick={() => { setFilter(tab); setCurrentPage(1); }}
                 className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12px] font-bold tracking-tight transition-all duration-300 border whitespace-nowrap ${
                   filter === tab 
                   ? (tab === 'rejected' ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/30' 
                     : tab === 'returned' ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30'
                     : 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30')
                   : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                 }`}
               >
                 {tab === 'multi-vendor' && <Layers size={12} />}
                 {tab === 'rejected' && <FiSlash size={11} />}
                 {tab === 'returned' && <FiRotateCcw size={11} />}
                 {tab === 'available' ? 'Active Duty' : tab === 'multi-vendor' ? 'Multi-Vendor' : tab === 'rejected' ? 'Rejected' : tab === 'returned' ? 'Returned' : 'Delivered'}
               </button>
             ))}
          </div>
        </div>

        {/* Task List Section */}
        <div className="px-4 sm:px-6 -mt-8 sm:-mt-12 relative z-20 pb-16 transition-all duration-500">
          <div className="space-y-3 sm:space-y-4">
            {/* Multi-Vendor tab */}
            {filter === 'multi-vendor' && (
              mvLoading ? (
                Array(3).fill(0).map((_, i) => <OrderCardSkeleton key={i} />)
              ) : mvOrders.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[32px] border border-slate-100 shadow-sm">
                  <Layers className="text-slate-200 mx-auto mb-3" size={40} />
                  <p className="text-slate-500 font-black text-base">No Combined Orders</p>
                  <p className="text-slate-400 text-xs mt-1">Multi-vendor orders appear here when all vendors are ready.</p>
                </div>
              ) : (
                mvOrders.map((order, idx) => (
                  <motion.div
                    key={order._id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    onClick={() => handleAcceptMultiVendor(order.orderId)}
                    className="bg-white rounded-xl p-3 shadow-md border border-indigo-100 hover:border-indigo-300 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">Multi-Vendor</p>
                        <p className="text-sm font-black text-slate-900">#{order.orderId}</p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-sm font-black text-slate-900">{formatPrice(order.total)}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{order.vendorItems?.length} vendors</p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(order.vendorItems || []).map((vi, i) => (
                        <span key={i} className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-bold">
                          {vi.vendorName}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[10px] text-slate-400 font-medium">{order.shippingAddress?.city}</p>
                      <span className="text-[10px] font-black text-indigo-600 flex items-center gap-1">
                        Accept & Start <FiChevronRight size={10} />
                      </span>
                    </div>
                  </motion.div>
                ))
              )
            )}

            {/* Returned Orders tab */}
            {filter === 'returned' && (
              returnedLoading ? (
                Array(4).fill(0).map((_, i) => <OrderCardSkeleton key={i} />)
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Returns</p>
                      <p className="text-xl font-black text-slate-800">{returnedSummary.total}</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">completed</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-purple-100 shadow-sm text-center">
                      <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1">Total Earned</p>
                      <p className="text-xl font-black text-purple-600">{formatPrice(returnedSummary.totalEarnings || 0)}</p>
                      <p className="text-[8px] text-purple-300 font-medium mt-0.5">from returns</p>
                    </div>
                  </div>

                  {returnedOrders.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-[28px] border border-slate-100 shadow-sm">
                      <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <FiRotateCcw size={26} className="text-purple-300" />
                      </div>
                      <p className="text-slate-600 font-black text-base">No Returns Yet</p>
                      <p className="text-slate-400 text-xs mt-1">Completed return pickups will appear here.</p>
                    </div>
                  ) : (
                    returnedOrders.map((ret, idx) => {
                      const orderId = ret.orderId?.orderId || ret.returnId || String(ret._id || '').slice(-6);
                      const customerName = ret.userId?.name || ret.orderId?.shippingAddress?.name || ret.orderId?.guestInfo?.name || 'Customer';
                      const vendorName = ret.vendorId?.storeName || (ret.vendorDropoffs?.[0]?.vendorName) || 'Vendor';
                      const dateFormatted = ret.updatedAt ? new Date(ret.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
                      const itemCount = ret.items?.length || 0;
                      const isMultiVendor = ret.isMultiVendor || (ret.vendorDropoffs?.length > 1);
                      return (
                        <motion.div
                          key={ret._id || idx}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="bg-white rounded-xl p-3 shadow-sm border border-purple-100 relative overflow-hidden"
                        >
                          {/* Left accent bar */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-purple-500" />
                          <div className="pl-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[7px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-tighter shrink-0">#{String(orderId).slice(-6)}</span>
                                <p className="font-bold text-slate-800 text-[12px] truncate">{customerName}</p>
                              </div>
                              <p className="font-bold text-[12px] text-emerald-600 ml-2 shrink-0">+ {formatPrice(ret.deliveryEarnings || 0)}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[6px] font-black uppercase px-1.5 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-200">RETURN</span>
                                {isMultiVendor && <span className="text-[6px] font-black uppercase px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-200">MULTI-VENDOR</span>}
                                <span className="text-[6px] font-black uppercase px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200">Completed</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-400">
                                <FiClock size={9} />
                                <span className="text-[8px] font-medium">{dateFormatted}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-slate-50">
                              <span className="flex items-center gap-1 text-slate-400 text-[9px] font-bold">
                                <FiPackage size={10} className="text-slate-400" /> {itemCount} item{itemCount !== 1 ? 's' : ''}
                              </span>
                              {ret.deliveryDistance > 0 && (
                                <span className="flex items-center gap-1 text-slate-400 text-[9px] font-bold">
                                  <FiNavigation size={10} className="text-sky-500" /> {ret.deliveryDistance} km
                                </span>
                              )}
                              <span className="text-[9px] font-medium text-slate-400 truncate">→ {vendorName}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </>
              )
            )}

            {/* Rejected Orders tab */}
            {filter === 'rejected' && (
              rejectedLoading ? (
                Array(4).fill(0).map((_, i) => <OrderCardSkeleton key={i} />)
              ) : (
                <>
                  {/* Analytics Summary Cards */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                      <p className="text-xl font-black text-slate-800">{rejectedSummary.total}</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">all time</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-rose-100 shadow-sm text-center">
                      <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-1">Cancelled</p>
                      <p className="text-xl font-black text-rose-600">{rejectedSummary.cancelledAssigned}</p>
                      <p className="text-[8px] text-rose-300 font-medium mt-0.5">while assigned</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-amber-100 shadow-sm text-center">
                      <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Skipped</p>
                      <p className="text-xl font-black text-amber-600">{rejectedSummary.riderRejected}</p>
                      <p className="text-[8px] text-amber-300 font-medium mt-0.5">by you</p>
                    </div>
                  </div>

                  {/* Resolve Tip Banner */}
                  {rejectedSummary.total > 0 && (
                    <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3 mb-3">
                      <FiAlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-black text-rose-700">How to resolve</p>
                        <p className="text-[9px] text-rose-500 mt-0.5 leading-relaxed">
                          High reject/cancel rate affects your rating. Stay online & accept orders promptly to improve your score.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Order List */}
                  {rejectedOrders.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-[28px] border border-slate-100 shadow-sm">
                      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <FiCheckCircle size={26} className="text-emerald-400" />
                      </div>
                      <p className="text-slate-600 font-black text-base">Clean Record</p>
                      <p className="text-slate-400 text-xs mt-1">No rejected or cancelled orders. Keep it up!</p>
                    </div>
                  ) : (
                    rejectedOrders.map((order, idx) => {
                      const isCancelled = order.rejectionType === 'cancelled_assigned';
                      const orderId = order.orderId || String(order._id || '').slice(-6);
                      const customerName = order.shippingAddress?.name || order.guestInfo?.name || 'Customer';
                      const dateStr = order.cancelledAt || order.updatedAt;
                      const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
                      return (
                        <motion.div
                          key={order._id || idx}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="bg-white rounded-xl p-3 shadow-sm border border-rose-100 relative overflow-hidden"
                        >
                          {/* Left accent bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${isCancelled ? 'bg-rose-500' : 'bg-amber-400'}`} />
                          <div className="pl-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[7px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-tighter shrink-0">#{String(orderId).slice(-6)}</span>
                                <p className="font-bold text-slate-800 text-[12px] truncate">{customerName}</p>
                              </div>
                              <p className="font-bold text-[12px] text-slate-700 ml-2 shrink-0">{formatPrice(order.total || 0)}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                  isCancelled
                                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                                    : 'bg-amber-50 text-amber-600 border-amber-200'
                                }`}>
                                  {isCancelled ? 'Cancelled' : 'Skipped by You'}
                                </span>
                                {order.cancellationReason && (
                                  <span className="text-[6px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded max-w-[90px] truncate">
                                    {order.cancellationReason}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-slate-400">
                                <FiClock size={9} />
                                <span className="text-[8px] font-medium">{dateFormatted}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </>
              )
            )}

            {/* Normal orders tab */}
            {filter !== 'multi-vendor' && filter !== 'rejected' && (() => {
              const activeReturns = filter === 'available' ? (returns || []).filter(r => 
                ['processing', 'accepted'].includes(r.status?.toLowerCase()) || r.rawStatus === 'processing'
              ) : [];
              const displayTasks = filter === 'available' ? [...orders, ...activeReturns] : orders;

              return isLoadingOrders ? (
                Array(6).fill(0).map((_, i) => <OrderCardSkeleton key={i} />)
              ) : displayTasks.length === 0 ? (
                <div className="text-center py-12 sm:py-20 bg-white rounded-[32px] sm:rounded-[40px] border border-slate-100 shadow-sm">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <FiPackage size={30} className="text-slate-200 sm:hidden" />
                     <FiPackage size={40} className="text-slate-200 hidden sm:block" />
                  </div>
                  <p className="text-slate-500 font-black text-base sm:text-lg">Empty Queue</p>
                  <p className="text-slate-400 text-[11px] sm:text-sm mt-1">No orders matched your filter.</p>
                </div>
              ) : (
                displayTasks.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => {
                      if (order.type === 'return') {
                        navigate(`/delivery/returns/${order.id}`);
                      } else if (order.isMultiVendor) {
                        navigate(`/delivery/multi-vendor/${order.orderId || order.id}`);
                      } else {
                        navigate(`/delivery/orders/${order.id}`);
                      }
                    }}
                    className="bg-white rounded-xl p-3 shadow-md shadow-slate-200/50 border border-slate-100 hover:border-slate-300 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[7.5px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-tighter shrink-0">#{String(order.id || order.orderId || '').slice(-6)}</span>
                        <h3 className="font-bold text-slate-800 text-[13px] tracking-tight truncate">{order.customer || 'Guest User'}</h3>
                      </div>
                      <p className={`font-bold text-[13px] shrink-0 ml-2 ${order.status === 'delivered' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {order.status === 'delivered' ? `+ ${formatPrice(order.deliveryEarnings || 0)}` : formatPrice(order.total || 0)}
                      </p>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                         {order.type === 'return' ? (
                           <span className="text-[6px] font-bold uppercase px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">
                             RETURN
                           </span>
                         ) : (
                           <span className={`text-[6px] font-bold uppercase px-1.5 py-0.5 rounded border ${order.paymentMethod === 'cod' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                             {order.paymentMethod?.toUpperCase()}
                           </span>
                         )}
                         <span className={`text-[6px] font-bold uppercase px-1.5 py-0.5 rounded border ${getStatusStyle(order.status)}`}>
                           {order.status.replace(/_/g, ' ')}
                         </span>
                         <div className="h-3 w-[1px] bg-slate-200 mx-1" />
                         <div className="flex items-center gap-2.5 text-slate-500 text-[9px] font-bold shrink-0">
                            <span className="flex items-center gap-1"><FiPackage size={11} className="text-slate-400" /> {order.items?.length || 0}</span>
                            <span className="flex items-center gap-1"><FiNavigation size={11} className="text-sky-600" /> {order.deliveryDistance ? `${order.deliveryDistance} km` : order.distance || 'MAP'}</span>
                         </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/10 relative">
                        <FiTruck size={16} />
                        {order.items?.length > 0 && (
                          <div className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[7px] font-black min-w-[14px] h-[14px] rounded-full flex items-center justify-center px-0.5 border border-white">
                            {order.items.length}
                          </div>
                        )}
                      </div>
                    </div>
                    {filter === 'available' && order.type !== 'return' && !order.riderAcceptedAt && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col">
                        <CountdownTimer
                          assignedAt={order.assignedAt || order.updatedAt}
                          onExpire={() => {
                            // Automatically trigger the rejection to notify backend to assign the next rider
                            try {
                              rejectOrder(order.id || order.orderId, { auto: true });
                            } catch (e) {
                              console.error("Auto-reject failed", e);
                            }
                            
                            const currentOrders = useDeliveryAuthStore.getState().orders;
                            const updated = currentOrders.filter(o => o.id !== order.id && o.orderId !== order.orderId);
                            useDeliveryAuthStore.setState({ orders: updated });
                          }}
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => handleRejectMission(e, order.id)}
                            disabled={isUpdatingOrderStatus}
                            className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all"
                          >
                            Decline
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleAcceptOrder(order.id, order.type); }}
                            disabled={isUpdatingOrderStatus}
                            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    )}
                    {filter === 'available' && order.type !== 'return' && order.riderAcceptedAt && (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Mission Active</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">Tap to continue this delivery</p>
                      </div>
                    )}
                  </motion.div>
                ))
              );
            })()}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default DeliveryOrders;
