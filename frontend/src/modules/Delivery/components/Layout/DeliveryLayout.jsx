 import { useState, useRef, useEffect, useCallback } from "react";
import logo from "../../../../assets/animations/lottie/logo-removebg.png";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { FiLogOut, FiTruck, FiPackage, FiHome, FiUser, FiMenu, FiBell, FiAlertCircle, FiTrash2 } from "react-icons/fi";
import { useDeliveryAuthStore, syncServerClock } from "../../store/deliveryStore";
import { useDeliveryEngineStore } from "../../store/deliveryEngineStore";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DeliveryBottomNav from "./DeliveryBottomNav";
import { useDeliveryTracking } from "@shared/hooks/useDeliveryTracking";
import { formatPrice } from "@shared/utils/helpers";
import socketService from "@shared/utils/socket";
import NewOrderModal from "../NewOrderModal";
import { useJsApiLoader } from "@react-google-maps/api";
const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry', 'drawing'];

const DeliveryLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    deliveryBoy, logout, deleteAccount, isAuthenticated, acceptOrder, 
    acceptReturn, fetchProfileSummary, updateStatus, 
    isUpdatingStatus 
  } = useDeliveryAuthStore();
  const isOnline = deliveryBoy?.status === 'available' || deliveryBoy?.status === 'busy';

  const handleToggleOnline = () => {
    if (isUpdatingStatus) return;

    if (deliveryBoy?.applicationStatus && deliveryBoy.applicationStatus !== 'approved') {
      toast.error(`Your application is currently ${deliveryBoy.applicationStatus}. You cannot go online until it is approved.`);
      return;
    }

    const wasOnline = isOnline;
    const newStatus = wasOnline ? 'offline' : 'available';
    
    // 🚀 Instant Feedback
    toast.success(wasOnline ? 'Going Offline...' : 'Going Online...');
    
    updateStatus(newStatus).then(() => {
      window.dispatchEvent(new CustomEvent('delivery-dashboard-refresh'));
    }).catch((err) => {
      const msg = err?.response?.data?.message || 'Failed to update status';
      toast.error(msg);
    });
  };
  const { unreadCount, fetchNotifications } = useDeliveryNotificationStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const initialFetch = () => {
      fetchProfileSummary();
      fetchNotifications(1);
    };

    initialFetch();

    // 🔗 Deep Link Handling (e.g. from Push Notifications)
    const params = new URLSearchParams(location.search);
    const viewOrderId = params.get('viewOrder');
    const isReturn = params.get('isReturn') === 'true';

    if (viewOrderId) {
      console.log(`🔗 [DELIVERY] Deep link detected for ${isReturn ? 'Return' : 'Order'}: ${viewOrderId}`);
      
      const fetchTaskDetails = async () => {
        try {
          // Use the specific detail endpoint to get fresh data for the modal
          const api = useDeliveryAuthStore.getState().api || (await import('@shared/utils/api')).default;
          const res = await api.get(`/delivery/orders/${viewOrderId}`);
          if (res.data?.success || res.data) {
             const taskData = res.data?.data || res.data;
             console.log('✅ [DELIVERY] Deep link task data fetched:', taskData);
             setSelectedNewOrder({ ...taskData, isReturn });
             setShowNewOrderModal(true);
             startBuzzer();
          }
        } catch (err) {
          console.error('❌ [DELIVERY] Deep link fetch failed:', err);
        }
      };

      fetchTaskDetails();
      
      // Clean up the URL to prevent re-triggering on refresh
      const newRelativePathQuery = window.location.pathname;
      window.history.replaceState(null, '', newRelativePathQuery);
    }

    const interval = setInterval(() => {
      Promise.all([fetchProfileSummary(), fetchNotifications(1)]);
    }, 120000); // Polling every 2 minutes for better mobile performance

    return () => clearInterval(interval);
  }, [isAuthenticated, location.search]);

  useEffect(() => {
    // Throttled refresh to prevent storm of calls from multiple socket events
    let lastRefresh = 0;
    const handleGlobalRefresh = () => {
      const now = Date.now();
      if (now - lastRefresh < 2000) return;
      lastRefresh = now;
      fetchProfileSummary();
      fetchNotifications(1);
    };
    window.addEventListener('delivery-dashboard-refresh', handleGlobalRefresh);
    return () => window.removeEventListener('delivery-dashboard-refresh', handleGlobalRefresh);
  }, []);

  // Global Buzzer & Notification State
  const [isBuzzerActive, setIsBuzzerActive] = useState(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [selectedNewOrder, setSelectedNewOrder] = useState(null);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const buzzerRef = useRef(null);

  // Initialize Buzzer on first interaction to bypass browser policies
  const initBuzzer = useCallback(() => {
    if (buzzerRef.current) return;
    try {
      const audio = new Audio('/sounds/buzzer.mp3');
      audio.loop = true;
      audio.volume = 1.0;
      audio.load();
      buzzerRef.current = audio;
      console.log('🔊 [DELIVERY] Buzzer audio initialized.');
    } catch (err) {
      console.error('Failed to init buzzer:', err);
    }
  }, []);

  const stopBuzzer = useCallback(() => {
    if (buzzerRef.current) {
      try {
        buzzerRef.current.pause();
        buzzerRef.current.currentTime = 0;
      } catch (e) { }
    }
    setIsBuzzerActive(false);
  }, []);

  const startBuzzer = useCallback(() => {
    console.log('🎵 [DELIVERY] startBuzzer called. Active:', isBuzzerActive);
    if (!buzzerRef.current) initBuzzer();
    
    if (buzzerRef.current) {
      buzzerRef.current.play()
        .then(() => console.log('✅ [DELIVERY] Buzzer playing successfully'))
        .catch(err => {
          console.error('❌ [DELIVERY] Audio playback failed (likely blocked):', err);
        });
      setIsBuzzerActive(true);
      // Auto-stop after 2 minutes
      const currentAudio = buzzerRef.current;
      setTimeout(() => { 
        if (buzzerRef.current === currentAudio && isBuzzerActive) {
          console.log('⏱️ [DELIVERY] Auto-stopping buzzer after timeout');
          stopBuzzer(); 
        }
      }, 120000);
    }
  }, [initBuzzer, stopBuzzer, isBuzzerActive]);

  // Audio Policy Unlock: User interaction required
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      initBuzzer();
      if (buzzerRef.current) {
        buzzerRef.current.play().then(() => {
          buzzerRef.current.pause();
          buzzerRef.current.currentTime = 0;
        }).catch(() => { });
      }
      audioUnlockedRef.current = true;
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [initBuzzer]);

  // Global listeners for new tasks
  const handleNewOrder = useCallback((data) => {
    console.log('⚡ [DELIVERY] New Order Broadcast Received:', data);
    const id = data.orderId || data.id;
    if (!id) {
        console.warn('⚠️ [DELIVERY] Received order broadcast with NO ID:', data);
        return;
    }
    
    const currentStatus = useDeliveryAuthStore.getState().deliveryBoy?.status;
    if (currentStatus === 'offline') {
      console.warn('⚠️ Order received while offline. Ignoring popup.');
      return;
    }

    if (data.serverTime) syncServerClock(data.serverTime);

    // Never re-offer an order this rider has already accepted (the same event can be
    // delivered again after a reconnect or a re-sent alert); showing Accept/Decline for it
    // again is what made riders accept the same mission over and over.
    const incomingIds = [data.orderId, data.id, data._id].filter(Boolean).map(String);
    const alreadyAccepted = (useDeliveryAuthStore.getState().orders || []).some(
      o => o.riderAcceptedAt && [o.id, o._id, o.orderId].some(k => k && incomingIds.includes(String(k)))
    );
    if (alreadyAccepted) {
      console.log(`✅ [DELIVERY] Order ${id} already accepted by this partner. Not re-opening the popup.`);
      return;
    }

    setIsAcceptingOrder(false);

    // BLOCKER: Do not show or alert for new orders if already on a mission
    const store = useDeliveryAuthStore.getState();
    const activeTasks = [
      ...(store.orders || []),
      ...(store.returns || [])
    ].filter(t => ['assigned', 'picked_up', 'out_for_delivery', 'arrived', 'processing', 'accepted'].includes(t.status?.toLowerCase()));

    // Allow manual/auto assignments to bypass the "busy" blocker so they ring on the partner's device.
    // Also bypass if the only active task is the incoming order itself.
    const isIncomingOrderTheOnlyActiveTask = activeTasks.length === 1 && String(activeTasks[0].id || activeTasks[0]._id) === String(id);
    
    if (activeTasks.length > 0 && !isIncomingOrderTheOnlyActiveTask && data.type !== 'new_assignment_broadcast' && data.type !== 'auto_assigned_alert') {
      console.log(`📦 [DELIVERY] Order ${id} skipped. Partner is BUSY with ${activeTasks.length} active tasks.`);
      return;
    }

    console.log(`🔊 [DELIVERY] Attempting to play buzzer for Order: ${id}`);
    startBuzzer();
    
    // Full details required for the modal
    if (selectedNewOrder?.id !== id || !showNewOrderModal) {
        setSelectedNewOrder(data);
        setShowNewOrderModal(true);
    }
    
    toast.success(`⚡ NEW ORDER AVAILABLE!`, { 
      duration: 8000, 
      icon: '📦',
      style: { fontWeight: '900', border: '2px solid #4f46e5' } 
    });

    // Vibrate if mobile
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    window.dispatchEvent(new CustomEvent('delivery-dashboard-refresh'));
  }, [startBuzzer]);

  const handleNewReturn = useCallback((data) => {
    const currentStatus = useDeliveryAuthStore.getState().deliveryBoy?.status;
    if (currentStatus === 'offline') return;
    
    startBuzzer();
    setSelectedNewOrder({ ...data, isReturn: true });
    setShowNewOrderModal(true);
    toast.success(`📦 NEW RETURN PICKUP!`, { duration: 8000 });
    window.dispatchEvent(new CustomEvent('delivery-dashboard-refresh'));
  }, [startBuzzer]);

  const handleViewOrder = useCallback((e) => {
    const order = e.detail;
    if (order) {
      setSelectedNewOrder(order);
      setShowNewOrderModal(true);
    }
  }, []);

  // Socket management
  useEffect(() => {
    const isOnline = deliveryBoy?.status === 'available' || deliveryBoy?.status === 'busy';
    if (!isOnline || !deliveryBoy?.id) return;

    socketService.connect();
    socketService.deliveryRegister(deliveryBoy.id);

    const registerOnConnect = () => socketService.deliveryRegister(deliveryBoy.id);
    socketService.socket?.on('connect', registerOnConnect);

    socketService.on('order_ready_for_pickup', handleNewOrder);
    socketService.on('return_ready_for_pickup', handleNewReturn);
    socketService.on('newOrder', handleNewOrder);
    socketService.on('new_order', handleNewOrder);
    
    const onOrderTaken = (data) => {
      // Use ref-like logic or fresh state from store inside the callback
      const currentModalOpen = showNewOrderModal; // This might be stale if not careful
      // Better to check global dashboard refresh trigger or store
      window.dispatchEvent(new CustomEvent('delivery-dashboard-refresh'));
    };
    socketService.on('order_taken', onOrderTaken);

    socketService.on('balance_updated', (data) => {
      useDeliveryAuthStore.getState().setBalance(data);
    });

    const handleBatchVendorStatusUpdate = (data) => {
      console.log('📡 [Socket] batch_vendor_status_update received:', data);
      // Update active batch inside delivery engine store if matched
      try {
        const engineStore = useDeliveryEngineStore.getState();
        if (engineStore.activeBatch && engineStore.activeBatch.batchId === data.batchId) {
          useDeliveryEngineStore.setState({
            activeBatch: {
              ...engineStore.activeBatch,
              pickupStops: data.pickupStops
            }
          });
        }
      } catch (err) {
        console.error('Error updating active batch in store:', err);
      }
      
      // Dispatch custom event so pages can update local state
      window.dispatchEvent(new CustomEvent('batch-vendor-status-updated', { detail: data }));
      toast.success('🏪 Vendor product readiness updated!');
    };
    socketService.on('batch_vendor_status_update', handleBatchVendorStatusUpdate);

    window.addEventListener('delivery-view-order', handleViewOrder);

    return () => {
      socketService.socket?.off('connect', registerOnConnect);
      socketService.off('order_ready_for_pickup', handleNewOrder);
      socketService.off('return_ready_for_pickup', handleNewReturn);
      socketService.off('order_taken');
      socketService.off('balance_updated');
      socketService.off('batch_vendor_status_update', handleBatchVendorStatusUpdate);
      window.removeEventListener('delivery-view-order', handleViewOrder);
      stopBuzzer();
    };
  }, [deliveryBoy?.id, deliveryBoy?.status]); // Removed selectedNewOrder dependency

  const handleAcceptNewTask = async (id) => {
    setIsAcceptingOrder(true);
    try {
      const isReturn = !!selectedNewOrder?.isReturn;
      if (isReturn) {
        await acceptReturn(id);
      } else {
        await acceptOrder(id);
      }
      stopBuzzer();
      setShowNewOrderModal(false);
      toast.success('Accepted successfully');
      
      // 🚀 Instant Redirect to Detail Page
      if (isReturn) {
        navigate(`/delivery/returns/${id}`);
      } else {
        navigate(`/delivery/orders/${id}`);
      }
      
      window.dispatchEvent(new CustomEvent('delivery-dashboard-refresh'));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to accept task');
      // Let the swipe control know it failed so it can reset and allow another try.
      throw err;
    } finally {
      setIsAcceptingOrder(false);
    }
  };

  const riderLocation = useDeliveryTracking(deliveryBoy?.id);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/delivery/login");
  };

  const menuItems = [
    { icon: FiHome, label: "Dashboard", path: "/delivery/dashboard" },
    { icon: FiPackage, label: "Orders", path: "/delivery/orders" },
    { icon: FiBell, label: "Notifications", path: "/delivery/notifications" },
    { icon: FiUser, label: "Profile", path: "/delivery/profile" },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "busy": return "bg-yellow-500";
      case "offline": return "bg-slate-500";
      default: return "bg-slate-500";
    }
  };

  return (
    <div id="delivery-layout-root" className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Mobile Header */}
      <header className="sticky top-0 left-0 z-50 bg-[#0f172a] backdrop-blur-lg border-b border-white/5 shadow-none shrink-0">
        <div className="flex items-center gap-3 px-4 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 border border-white/5"
            aria-label="Open menu">
            <FiMenu className="text-white text-xl" />
          </button>

          <div className="flex flex-col ml-1">
             <h1 className="text-[11px] font-black text-white leading-tight tracking-tighter">CLOSH</h1>
             <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest -mt-1">PARTNER APP</span>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {/* Premium Status Toggle */}
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isOnline ? 'Live' : 'Off'}
              </span>
              <button 
                onClick={handleToggleOnline} 
                disabled={isUpdatingStatus}
                className={`group relative h-5 w-10 flex-shrink-0 items-center rounded-full transition-all duration-500 border border-white/10 ${isOnline ? 'bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800'}`}
              >
                <div className={`absolute inset-0 rounded-full transition-opacity duration-500 ${isOnline ? 'opacity-100 bg-emerald-500/20 animate-pulse' : 'opacity-0'}`} />
                <motion.div 
                  animate={{ x: isOnline ? 22 : 2 }} 
                  transition={{ type: "spring", stiffness: 600, damping: 30 }}
                  className={`relative h-3.5 w-3.5 rounded-full shadow-lg flex items-center justify-center transition-colors duration-300 ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`}
                >
                  {isOnline && <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-25" />}
                </motion.div>
              </button>
            </div>

            <div className="flex items-center gap-2 pl-3 border-l border-white/10">
              <div className="w-10 h-10 bg-[#1e293b] rounded-xl flex items-center justify-center p-1 shadow-2xl border border-white/10 overflow-hidden">
                <img src={logo} alt="CLOSH" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {sidebarOpen && (
          <div className="contents">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-[110] overflow-y-auto">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-indigo-100/50 shadow-sm">
                    {deliveryBoy?.avatar ? (
                      <img src={deliveryBoy.avatar} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                      <FiTruck className="text-white text-xl" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-800">{deliveryBoy?.name || "Partner"}</h2>
                    <p className="text-xs text-gray-600 truncate max-w-[140px]">{deliveryBoy?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(deliveryBoy?.status)}`}></div>
                  <span className="text-xs text-gray-600 capitalize font-bold">{deliveryBoy?.status || "offline"}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-100">
                  {deliveryBoy ? (
                    <>
                      <div className="p-2 bg-orange-50 rounded-xl border border-orange-100/50">
                        <p className="text-[9px] font-black text-orange-500 uppercase tracking-tighter">In Hand</p>
                        <p className="text-[13px] font-black text-orange-700">{formatPrice(deliveryBoy?.cashInHand || 0)}</p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-xl border border-green-100/50">
                        <p className="text-[9px] font-black text-green-500 uppercase tracking-tighter">Collected</p>
                        <p className="text-[13px] font-black text-green-700">{formatPrice(deliveryBoy?.totalCashCollected || 0)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 animate-pulse h-12" />
                      <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 animate-pulse h-12" />
                    </>
                  )}
                </div>
              </div>

              <nav className="p-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-colors ${isActive ? "bg-primary-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"}`}>
                      <Icon className="text-xl" />
                      <span className="font-medium">{item.label}</span>
                      {item.path === "/delivery/notifications" && unreadCount > 0 && (
                        <span className="ml-auto min-w-[20px] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold text-center">{unreadCount}</span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="p-2 border-t border-gray-200 mt-auto">
                <button onClick={async () => {
                  if (window.confirm("Are you sure you want to delete your account? This action is permanent and cannot be undone.")) {
                    try {
                      await deleteAccount();
                      toast.success("Account deleted successfully.");
                    } catch (err) {
                      toast.error(err?.response?.data?.message || "Failed to delete account");
                    }
                  }
                }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors mb-2">
                  <FiTrash2 className="text-xl" />
                  <span className="font-medium">Delete Account</span>
                </button>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors">
                  <FiLogOut className="text-xl" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main id="delivery-scroll-container" className="flex-1 overflow-y-auto pb-20 scrollbar-responsive">
        <Outlet context={{ startBuzzer, stopBuzzer, isLoaded }} />
      </main>

      <DeliveryBottomNav />

      {/* Global Notifications Layer */}
      <AnimatePresence>
        {isBuzzerActive && (
          <motion.div
            initial={{ y: 100, x: 0, opacity: 0 }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            exit={{ y: 100, x: 0, opacity: 0 }}
            className="fixed bottom-24 right-6 z-[1000] flex flex-col gap-2 pointer-events-none"
          >
            <button
              onClick={stopBuzzer}
              className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl animate-bounce flex items-center gap-2 font-black uppercase text-xs tracking-widest border-2 border-white pointer-events-auto"
            >
              <FiAlertCircle className="animate-pulse" /> 🛑 Stop Alarm
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <NewOrderModal
        isOpen={showNewOrderModal}
        order={selectedNewOrder}
        isAccepting={isAcceptingOrder}
        onAccept={handleAcceptNewTask}
        onClose={() => { 
          stopBuzzer(); 
          setShowNewOrderModal(false); 
          setIsAcceptingOrder(false); // Safety reset
        }}
        riderLocation={riderLocation}
      />
    </div>
  );
};

export default DeliveryLayout;
