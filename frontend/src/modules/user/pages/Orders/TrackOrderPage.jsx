import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { ArrowLeft, CheckCircle, Package, Truck, MapPin, Clock, Shield, Phone, ChevronUp, ChevronDown, Store, Navigation, RefreshCw, ChevronRight, ShoppingBag } from 'lucide-react';
import { useOrderStore } from '../../../../shared/store/orderStore';
import socketService from '../../../../shared/utils/socket';
import TrackingMap from '../../../../shared/components/TrackingMap';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

// Statuses that mean a rider has been assigned (show live tracking map)
const ASSIGNED_STATUSES = ['assigned', 'picked_up', 'shipped', 'out_for_delivery', 'delivered', 'try_active', 'returning_unselected_items', 'returned_to_vendor', 'try_buy_completed'];

const TrackOrderPage = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const dragControls = useDragControls();
    const { fetchOrderById, fetchPublicTrackingOrder, resendDeliveryOtp } = useOrderStore();
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [riderLiveLocation, setRiderLiveLocation] = useState(null);
    const [riderArrived, setRiderArrived] = useState(false);
    const [cardExpanded, setCardExpanded] = useState(false);
    const [noPartnerMsg, setNoPartnerMsg] = useState('');
    const cooldownRef = useRef(null);



    const loadOrder = async () => {
        if (!orderId) return;
        try {
            let foundOrder = await fetchOrderById(orderId).catch(() => null);
            if (!foundOrder) {
                foundOrder = await fetchPublicTrackingOrder(orderId).catch(() => null);
            }

            if (foundOrder) {
                setOrder(foundOrder);
            }
        } catch (error) {
            console.error("Failed to load order for tracking:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrder();

        // Socket.io for real-time tracking
        socketService.connect();
        if (orderId) {
            socketService.joinRoom(`order_${orderId}`);
        }

        const handleLocationUpdate = (data) => {
            console.log('📍 Live Rider Update:', data);
            setRiderLiveLocation({ lat: data.lat, lng: data.lng });
        };

        const handleStatusUpdate = (data) => {
            console.log('📦 Order Status updated:', data);
            loadOrder();
        };

        const handleRiderArrived = () => {
            setRiderArrived(true);
            loadOrder();
        };

        socketService.on('location_updated', handleLocationUpdate);
        socketService.on('order_status_updated', handleStatusUpdate);
        socketService.on('rider_assigned', handleStatusUpdate);
        socketService.on('rider_arrived', handleRiderArrived);

        const handleOtpSent = (data) => {
            console.log('🔐 OTP Sent/Updated:', data);
            loadOrder();
        };

        const handleNoPartner = (data) => {
            if (data.orderId === orderId || (order && data.orderId === order.orderId)) {
                setNoPartnerMsg(data.message);
            }
        };

        socketService.on('delivery_otp_sent', handleOtpSent);
        socketService.on('delivery_otp_resent', handleOtpSent);
        socketService.on('no_partner_yet', handleNoPartner);

        // Fallback polling (every 30 seconds)
        const interval = setInterval(loadOrder, 30000);

        return () => {
            clearInterval(interval);
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            socketService.off('location_updated', handleLocationUpdate);
            socketService.off('order_status_updated', handleStatusUpdate);
            socketService.off('rider_assigned', handleStatusUpdate);
            socketService.off('rider_arrived', handleRiderArrived);
            socketService.off('delivery_otp_sent', handleOtpSent);
            socketService.off('delivery_otp_resent', handleOtpSent);
            socketService.off('no_partner_yet', handleNoPartner);
        };
    }, [orderId]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white font-sans">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Locating Order...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-2">Order Not Found</h2>
                  <p className="text-sm text-gray-500 mb-6">We couldn't find the order details for tracking.</p>
                  <button onClick={() => navigate('/home')} className="bg-black text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest">Go Home</button>
                </div>
            </div>
        );
    }

    const status = order?.status?.toLowerCase() || 'pending';
    const trackingNumber = order.trackingNumber || `TRK${String(order.orderId || orderId).slice(-8).toUpperCase()}`;
    const address = order.shippingAddress;

    const isCancelled = status === 'cancelled' || status === 'canceled';
    const isReturned = ['returned', 'returned_to_vendor', 'returning_unselected_items', 'return_requested'].includes(status) || order.returnRequest;
    
    // ─── Multi-vendor pickup progress ───
    const isMultiVendor = !!(order.isMultiVendor || (order.vendorItems && order.vendorItems.length > 1));
    const vendorPickups = order.vendorPickups || [];
    const allVendorsPickedUp = isMultiVendor && vendorPickups.length > 0
        ? vendorPickups.every(vp => vp.status === 'picked_up')
        : true;
    const pickedUpCount = vendorPickups.filter(vp => vp.status === 'picked_up').length;
    const totalVendorStops = vendorPickups.length;

    // For multi-vendor orders with 2+ stops, show vendor pickup progress in the pre-assignment view
    const multiVendorStillPickingUp = isMultiVendor && totalVendorStops > 1
        && ASSIGNED_STATUSES.includes(status) && !!((order.deliveryBoyId || order.assignedDeliveryBoy) && order.riderAcceptedAt)
        && !['picked_up', 'shipped', 'out_for_delivery', 'delivered'].includes(status);

    // Statuses that mean the order has been picked up and is on its way to customer (show map)
    const POST_PICKUP_STATUSES = ['picked_up', 'shipped', 'out_for_delivery', 'delivered', 'try_active', 'returning_unselected_items', 'returned_to_vendor', 'try_buy_completed'];

    // Show map/live-tracking only AFTER order is picked up (not just 'assigned').
    // 'assigned' means rider is heading to vendor — user sees the status page, not map.
    const isRiderAssigned = POST_PICKUP_STATUSES.includes(status) && !isReturned;

    const getStepState = (stepIndex) => {
        if (isCancelled) return 'pending';
        
        const vendorStatuses = (order.vendorItems || []).map(vi => String(vi.status || 'pending').toLowerCase());
        
        // Step 1: Confirm (Vendor confirmed)
        const isConfirmed = vendorStatuses.length > 0 && vendorStatuses.some(s => 
            ['accepted', 'processing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(s)
        );
        
        // Step 2: Ready for Pickup (Prepared at shop)
        const isReadyForPickup = vendorStatuses.length > 0 && vendorStatuses.every(s => 
            ['ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(s)
        );
        
        // Step 3: Picked Up (Collected by rider)
        const isPickedUp = ['picked_up', 'out_for_delivery', 'delivered'].includes(status);
        
        // Step 4: Out for Delivery (On the way to you)
        const isOutForDelivery = ['out_for_delivery', 'delivered'].includes(status);
        
        // Step 5: Delivered (Arrived safely)
        const isDelivered = status === 'delivered';
        
        if (stepIndex === 1) {
            if (isConfirmed) return 'completed';
            return 'active';
        }
        
        if (stepIndex === 2) {
            if (isReadyForPickup) return 'completed';
            if (isConfirmed) return 'active';
            return 'pending';
        }
        
        if (stepIndex === 3) {
            if (isPickedUp) return 'completed';
            if (isReadyForPickup) return 'active';
            return 'pending';
        }
        
        if (stepIndex === 4) {
            if (isOutForDelivery) return 'completed';
            if (isPickedUp) return 'active';
            return 'pending';
        }
        
        if (stepIndex === 5) {
            if (isDelivered) return 'completed';
            if (isOutForDelivery) return 'active';
            return 'pending';
        }
        
        return 'pending';
    };

    const steps = [
        {
            label: 'Confirm',
            subtitle: 'Vendor confirmed',
            icon: CheckCircle,
            date: order.vendorAcceptedAt || order.createdAt,
            state: getStepState(1)
        },
        {
            label: 'Ready for Pickup',
            subtitle: 'Prepared at shop',
            icon: Package,
            date: order.readyAt,
            state: getStepState(2)
        },
        {
            label: 'Picked Up',
            subtitle: 'Collected by rider',
            icon: Store,
            date: order.pickedUpAt,
            state: getStepState(3)
        },
        {
            label: 'Out for Delivery',
            subtitle: 'On the way to you',
            icon: Truck,
            date: (status === 'out_for_delivery' || status === 'delivered') ? (order.updatedAt || order.pickedUpAt) : null,
            state: getStepState(4)
        },
        {
            label: 'Delivered',
            subtitle: 'Arrived safely',
            icon: MapPin,
            date: order.deliveredAt,
            state: getStepState(5)
        }
    ];

    const getStatusColor = () => {
        if (status === 'delivered') return 'bg-emerald-100 text-emerald-800';
        if (status === 'cancelled') return 'bg-red-100 text-red-800';
        if (['shipped', 'out_for_delivery', 'picked_up', 'assigned'].includes(status)) return 'bg-blue-100 text-blue-800';
        return 'bg-amber-100 text-amber-800';
    };

    // Locations for map
    const initialRiderLoc = order?.deliveryBoyId?.currentLocation?.coordinates;
    const deliveryLocation = riderLiveLocation || (Array.isArray(initialRiderLoc) && initialRiderLoc.length === 2 ? { lat: initialRiderLoc[1], lng: initialRiderLoc[0] } : null);
    
    // Convert GeoJSON [lng, lat] to {lat, lng}
    const dropLoc = order?.dropoffLocation?.coordinates;
    const customerLocation = Array.isArray(dropLoc) && dropLoc.length === 2 && dropLoc[0] !== 0 ? { lat: dropLoc[1], lng: dropLoc[0] } : null;

    const vLoc = order?.pickupLocation?.coordinates;
    const vendorLocation = Array.isArray(vLoc) && vLoc.length === 2 && vLoc[0] !== 0 ? { lat: vLoc[1], lng: vLoc[0] } : null;

    const formatDate = (date) => {
        if (!date || date === 'Pending') return 'Pending';
        if (date === 'Completed' || date === 'In Transit') return date;
        const d = new Date(date);
        if (isNaN(d.getTime())) return date; // Return as is if not a valid date
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const hasRider = !!((order.deliveryBoyId || order.assignedDeliveryBoy) && order.riderAcceptedAt);
    const riderName = order.deliveryBoyId?.name || order.assignedDeliveryBoy?.name;
    const riderPhone = order.deliveryBoyId?.phone || order.assignedDeliveryBoy?.phone;
    const isActiveDelivery = ['picked_up', 'out_for_delivery'].includes(status) || (status === 'assigned' && hasRider);
    const showOtp = (riderArrived || status === 'out_for_delivery' || status === 'picked_up') && order.deliveryOtpDebug;

    // ─────────── Helper: get dispatching status label & progress for pre-assignment view ───────────
    const getDispatchingInfo = () => {
        const vendorStatuses = (order.vendorItems || []).map(vi => String(vi.status || 'pending').toLowerCase());
        const isConfirmed = vendorStatuses.length > 0 && vendorStatuses.some(s => ['accepted', 'processing', 'ready_for_pickup'].includes(s));
        const isReadyForPickup = vendorStatuses.length > 0 && vendorStatuses.every(s => ['ready_for_pickup'].includes(s));

        // Multi-vendor: rider assigned but still picking up from vendors
        if (multiVendorStillPickingUp && hasRider) {
            if (pickedUpCount > 0 && pickedUpCount < totalVendorStops) {
                return { label: 'COLLECTING FROM VENDORS', progress: 4 };
            }
            return { label: 'RIDER ASSIGNED — PICKING UP', progress: 4 };
        }

        // Single-vendor: rider assigned, heading to vendor for pickup
        if (status === 'assigned' && hasRider) {
            return { label: 'RIDER ASSIGNED — PICKING UP', progress: 4 };
        }
        
        if (status === 'searching' || status === 'all_vendors_ready' || status === 'ready_for_delivery' || (status === 'assigned' && !hasRider)) {
            return { label: 'SEARCHING RIDER', progress: 3 };
        }
        if (isReadyForPickup) {
            return { label: 'READY FOR PICKUP', progress: 2 };
        }
        if (status === 'processing' || isConfirmed) {
            return { label: 'PREPARING ORDER', progress: 1 };
        }
        if (status === 'accepted') {
            return { label: 'ORDER ACCEPTED', progress: 1 };
        }
        if (isCancelled) {
            return { label: 'ORDER CANCELLED', progress: 0 };
        }
        if (isReturned) {
            return { label: 'ORDER RETURNED', progress: 0 };
        }
        return { label: 'ORDER PLACED', progress: 0 };
    };

    const dispatchInfo = getDispatchingInfo();

    // ═══════════════════════════════════════════════════════
    // PRE-ASSIGNMENT VIEW: "Finding your delivery partner..."
    // ═══════════════════════════════════════════════════════
    if (!isRiderAssigned) {
        return (
            <div className="min-h-screen bg-[#F5F7FA] font-sans flex flex-col select-none">
                {/* Top Header */}
                <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                    <button 
                        onClick={() => navigate(-1)} 
                        className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-slate-600 active:scale-95 transition-transform shadow-sm border border-slate-100"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-[17px] font-black text-slate-900 leading-tight">
                            {isCancelled ? 'Order Cancelled' : isReturned ? 'Order Returned' : 'Finding your delivery partner...'}
                        </h1>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-28">
                    {/* Image / Animation */}
                    <motion.div 
                        className="flex justify-center py-6"
                        initial={{ opacity: 0, y: 30, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                    >
                        {isCancelled ? (
                            <div className="relative w-52 h-44 md:w-60 md:h-52 flex flex-col items-center justify-center">
                                <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="15" y1="9" x2="9" y2="15"></line>
                                        <line x1="9" y1="9" x2="15" y2="15"></line>
                                    </svg>
                                </div>
                            </div>
                        ) : isReturned ? (
                            <div className="relative w-52 h-44 md:w-60 md:h-52 flex flex-col items-center justify-center">
                                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                                    </svg>
                                </div>
                            </div>
                        ) : (
                        <div className="relative" style={{ perspective: '800px' }}>
                            {/* Soft shadow underneath */}
                            <motion.div
                                className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-40 h-6 rounded-[50%] bg-slate-900/10 blur-xl"
                                animate={{ 
                                    scaleX: [1, 1.1, 1, 0.95, 1],
                                    opacity: [0.3, 0.2, 0.3, 0.35, 0.3]
                                }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            />
                            
                            {/* 3D Floating Image */}
                            <motion.div
                                animate={{ 
                                    y: [0, -12, 0, -6, 0],
                                    rotateY: [0, 3, 0, -3, 0],
                                    rotateX: [0, -2, 0, 2, 0],
                                    rotateZ: [0, 1, 0, -1, 0],
                                }}
                                transition={{ 
                                    duration: 4, 
                                    repeat: Infinity, 
                                    ease: "easeInOut" 
                                }}
                                style={{ transformStyle: 'preserve-3d' }}
                                className="relative"
                            >
                                <div className="relative w-52 h-44 md:w-60 md:h-52 flex items-center justify-center">
                                    {/* Clothes falling animation */}
                                    {['👕', '👖', '👗', '👚', '🧥', '🧦'].map((emoji, idx) => (
                                        <motion.div
                                            key={idx}
                                            className="absolute top-0 left-1/2 text-2xl md:text-3xl z-0"
                                            style={{ 
                                                marginLeft: `${(idx % 3 - 1) * 20}px`, 
                                                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))'
                                            }}
                                            animate={{
                                                y: [-80, 40, 80, 80],
                                                opacity: [0, 1, 0, 0],
                                                scale: [0.5, 1, 0.2, 0.2],
                                                rotate: [0, Math.random() * 60 - 30, Math.random() * 120 - 60]
                                            }}
                                            transition={{
                                                duration: 3.5,
                                                repeat: Infinity,
                                                times: [0, 0.4, 0.6, 1],
                                                delay: idx * 0.15,
                                                ease: "easeIn"
                                            }}
                                        >
                                            {emoji}
                                        </motion.div>
                                    ))}

                                    {/* Box Image with squash/stretch animation */}
                                    <motion.img 
                                        src="/pickup-removebg-preview.png" 
                                        alt="Pickup Box" 
                                        className="w-full h-full object-contain drop-shadow-2xl relative z-10"
                                        style={{ filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }}
                                        animate={{ 
                                            scaleY: [1, 1, 0.85, 1.1, 1],
                                            scaleX: [1, 1, 1.05, 0.95, 1],
                                        }}
                                        transition={{ 
                                            duration: 3.5, 
                                            repeat: Infinity, 
                                            times: [0, 0.6, 0.7, 0.8, 1],
                                            ease: "easeInOut" 
                                        }}
                                    />
                                </div>
                                
                                {/* Subtle glow ring behind */}
                                <motion.div
                                    className="absolute inset-0 -z-10 rounded-full"
                                    style={{
                                        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
                                        transform: 'scale(1.3) translateZ(-20px)',
                                    }}
                                    animate={{ 
                                        scale: [1.3, 1.4, 1.3],
                                        opacity: [0.6, 1, 0.6]
                                    }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                />
                            </motion.div>
                        </div>
                        )}
                    </motion.div>

                    {/* Status Badge */}
                    <motion.div 
                        className="flex justify-center mb-4"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100">
                            <motion.div 
                                className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{dispatchInfo.label}</span>
                        </div>
                    </motion.div>

                    {/* Main Heading */}
                    <motion.div 
                        className="text-center mb-6"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <h2 className="text-[22px] font-black text-slate-900 leading-tight mb-2">
                            {isCancelled ? 'Order Cancelled' :
                             isReturned ? 'Order Returned' :
                             multiVendorStillPickingUp ? 'Collecting your items...' :
                             (status === 'assigned' && hasRider) ? 'Rider is on the way to store...' :
                             dispatchInfo.progress >= 3 ? 'Finding your delivery partner...' :
                             dispatchInfo.progress >= 2 ? 'Order is ready!' :
                             dispatchInfo.progress >= 1 ? 'Preparing your order...' :
                             'Processing your order...'}
                        </h2>
                        <p className="text-[13px] text-slate-500 font-medium leading-relaxed px-4">
                            {isCancelled ? 'This order has been cancelled.' :
                             isReturned ? 'This order has been returned. Your refund has been processed or is being processed according to the return request.' :
                             multiVendorStillPickingUp ? `Your rider is picking up items from ${totalVendorStops} vendor${totalVendorStops > 1 ? 's' : ''}. ${pickedUpCount} of ${totalVendorStops} collected.` :
                             (status === 'assigned' && hasRider) ? 'Your rider has been assigned and is heading to the store to pick up your order.' :
                             dispatchInfo.progress >= 3 ? "We're matching your order with the nearest delivery partner. High fashion is worth the wait." :
                             dispatchInfo.progress >= 2 ? "Your items are ready and waiting for a delivery partner to pick them up." :
                             dispatchInfo.progress >= 1 ? "The store is carefully preparing your items for dispatch." :
                             "Your order has been placed and is being reviewed."}
                        </p>
                    </motion.div>

                    {/* Order Info Cards */}
                    <motion.div 
                        className="flex gap-3 mb-6"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="flex-1 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order ID</p>
                            <p className="text-[15px] font-black text-slate-900">#{(order.orderId || orderId).slice(-10)}</p>
                        </div>
                        <div className="flex-1 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Est. Delivery</p>
                            <p className="text-[15px] font-black text-slate-900">
                                60 Mins
                            </p>
                        </div>
                    </motion.div>

                    {/* Order Status Card */}
                    <motion.div 
                        className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-6"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Order Status</p>
                            <ChevronRight size={16} className="text-slate-300" />
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                <Package size={22} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-[14px] font-black text-slate-900 leading-tight">
                                    {isCancelled ? 'Order Cancelled' :
                                     isReturned ? 'Order Returned' :
                                     multiVendorStillPickingUp ? `Picking Up (${pickedUpCount}/${totalVendorStops})` :
                                     (status === 'assigned' && hasRider) ? 'Rider Assigned' :
                                     (status === 'assigned' && !hasRider) || dispatchInfo.progress >= 3 ? 'Searching for Rider' :
                                     dispatchInfo.progress >= 2 ? 'Ready for Pickup' :
                                     dispatchInfo.progress >= 1 ? 'Preparing Luxury Parcel' :
                                     'Order Received'}
                                </h3>
                            </div>
                        </div>

                        {/* Progress Steps */}
                        {!isCancelled && !isReturned && (
                            <div className="flex items-center gap-0">
                                {['Accepted', 'In Transit', 'Delivered'].map((label, idx) => {
                                    // Phase 1: Accepted/Preparing/Assigned, Phase 2: Picked Up/In Transit, Phase 3: Delivered
                                    const timelinePhase = ['delivered', 'try_buy_completed'].includes(status) ? 3 :
                                                          ['picked_up', 'shipped', 'out_for_delivery', 'try_active', 'returning_unselected_items', 'returned_to_vendor'].includes(status) ? 2 :
                                                          ['accepted', 'processing', 'ready_for_pickup', 'searching', 'all_vendors_ready', 'assigned', 'ready_for_delivery'].includes(status) ? 1 : 0;
                                    
                                    const isCompleted = timelinePhase > idx;
                                    const isActive = false; // Keep it clean: either filled (completed) or empty
                                    return (
                                        <div key={label} className="flex-1 text-center">
                                            <div className={`h-[3px] rounded-full mb-2 mx-0.5 transition-all duration-500 ${
                                                isCompleted ? 'bg-indigo-600' : 
                                                isActive ? 'bg-indigo-300' : 
                                                'bg-slate-100'
                                            }`} />
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                                isCompleted ? 'text-indigo-600' : 
                                                isActive ? 'text-indigo-400' : 
                                                'text-slate-300'
                                            }`}>
                                                {label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>

                    {/* ── Multi-Vendor Pickup Progress (only when rider is collecting) ── */}
                    {multiVendorStillPickingUp && vendorPickups.length > 0 && (
                        <motion.div
                            className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-6"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.55 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Vendor Pickup Progress</p>
                                <span className="text-[10px] font-black text-slate-500">{pickedUpCount}/{totalVendorStops}</span>
                            </div>

                            <div className="space-y-3">
                                {[...vendorPickups].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((vp, idx) => {
                                    const vpStatus = String(vp.status || 'pending').toLowerCase();
                                    const isDone = vpStatus === 'picked_up';
                                    const isArrived = vpStatus === 'arrived' || vpStatus === 'otp_verified';
                                    const isPending = vpStatus === 'pending';
                                    return (
                                        <div key={vp.vendorId || idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                                            isDone ? 'bg-emerald-50 border-emerald-200' :
                                            isArrived ? 'bg-amber-50 border-amber-200' :
                                            'bg-slate-50 border-slate-100'
                                        }`}>
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                                isDone ? 'bg-emerald-500 text-white' :
                                                isArrived ? 'bg-amber-500 text-white' :
                                                'bg-slate-200 text-slate-400'
                                            }`}>
                                                {isDone ? <CheckCircle size={18} /> : <Store size={18} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-[12px] font-bold truncate ${
                                                    isDone ? 'text-emerald-800' :
                                                    isArrived ? 'text-amber-800' :
                                                    'text-slate-600'
                                                }`}>
                                                    {`closh${idx + 1}`}
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-medium truncate">
                                                    {isDone ? 'Picked up ✓' :
                                                     isArrived ? 'Rider at store' :
                                                     'Awaiting pickup'}
                                                </p>
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${
                                                isDone ? 'bg-emerald-100 text-emerald-700' :
                                                isArrived ? 'bg-amber-100 text-amber-700' :
                                                'bg-slate-100 text-slate-400'
                                            }`}>
                                                {isDone ? 'Done' : isArrived ? 'At Store' : 'Pending'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Overall progress bar */}
                            <div className="mt-4">
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-emerald-500 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: totalVendorStops > 0 ? `${(pickedUpCount / totalVendorStops) * 100}%` : '0%' }}
                                        transition={{ duration: 0.6, ease: 'easeOut' }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium mt-1.5 text-center">
                                    {pickedUpCount === 0 ? 'Rider heading to first vendor...' :
                                     pickedUpCount < totalVendorStops ? `${totalVendorStops - pickedUpCount} vendor${totalVendorStops - pickedUpCount > 1 ? 's' : ''} remaining` :
                                     'All vendors collected!'}
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* Items Preview */}
                    {order.items && order.items.length > 0 && (
                        <motion.div 
                            className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-6"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                        >
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                                {order.items.length} item{order.items.length > 1 ? 's' : ''} in order
                            </p>
                            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                                {order.items.slice(0, 4).map((item, idx) => (
                                    <div key={idx} className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                                        <img src={getOptimizedImageUrl(item.image, 80)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
                                    </div>
                                ))}
                                {order.items.length > 4 && (
                                    <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                        <span className="text-[11px] font-black text-slate-500">+{order.items.length - 4}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    .scrollbar-hide::-webkit-scrollbar { display: none; }
                    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                `}} />
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════
    // POST-ASSIGNMENT VIEW: Live Tracking Map
    // ═══════════════════════════════════════════════════════
    return (
        <div className="h-screen w-full bg-[#F8FAFC] flex flex-col relative overflow-hidden font-sans select-none">
            
            {/* FULL-SCREEN LIVE MAP (Background) */}
            <div className="absolute inset-0 z-0">
                <TrackingMap 
                    deliveryLocation={deliveryLocation}
                    customerLocation={customerLocation}
                    vendorLocation={vendorLocation}
                    followMode={true}
                    status={status}
                />
            </div>

            {/* FLOATING TOP HEADER */}
            <div className="absolute top-0 inset-x-0 p-4 z-40 pointer-events-none flex flex-col gap-3">
                <div className="bg-white/90 backdrop-blur-xl px-5 py-4 rounded-3xl shadow-xl shadow-slate-900/5 border border-white/50 flex items-center justify-between pointer-events-auto shrink-0">
                    <button 
                        onClick={() => navigate(-1)} 
                        className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="text-center">
                        <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Tracking Order</p>
                        <h2 className="text-sm md:text-base font-black text-slate-900">#{order.orderId || orderId}</h2>
                    </div>
                    <div className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${status === 'delivered' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
                        {(status === 'assigned' && !hasRider) ? 'searching' : status === 'assigned' ? 'assigned to pickup' : status.replace(/_/g, ' ')}
                    </div>
                </div>

                {/* Live Status Banner */}
                {isActiveDelivery && deliveryLocation && (
                    <div className="flex items-center justify-between bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm pointer-events-auto shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white animate-pulse shadow-lg shadow-red-100 shrink-0">
                                <Navigation size={20} />
                            </div>
                            <div>
                                <h4 className="text-[12px] font-bold text-red-900 uppercase tracking-tight">Rider is Moving</h4>
                                <p className="text-[11px] text-red-700 font-medium leading-tight">Heading to your location</p>
                            </div>
                        </div>
                        <div className="bg-white px-3 py-1 rounded-full shadow-sm shrink-0">
                            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">Live</span>
                        </div>
                    </div>
                )}


            </div>

            {/* DRAGGABLE BOTTOM SHEET */}
            <motion.div
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 450 }}
                dragElastic={0.05}
                initial={{ y: 450 }}
                animate={{ y: cardExpanded ? 0 : 450 }}
                onDragEnd={(e, info) => {
                    if (info.offset.y > 50) {
                        setCardExpanded(false); // Swipe Down
                    } else if (info.offset.y < -50) {
                        setCardExpanded(true); // Swipe Up
                    }
                }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="absolute inset-0 z-50 bg-white rounded-t-[32px] shadow-[0_-15px_40px_rgba(0,0,0,0.1)] border-t border-slate-100 flex flex-col overflow-hidden"
                style={{ top: '80px' }}
            >
                {/* Drag Handle Area */}
                <div 
                    onClick={() => setCardExpanded(!cardExpanded)}
                    onPointerDown={(e) => dragControls.start(e)}
                    className="w-full flex flex-col items-center py-5 shrink-0 cursor-pointer touch-none"
                >
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mb-2" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        {cardExpanded ? 'Swipe down to collapse' : 'Swipe up for details'}
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-12 scrollbar-hide pt-2">

                    {/* Journey Timeline */}
                    <div className="mb-10">
                        <div className="flex items-center justify-between mb-6">
                            <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Package size={16} />
                                Order Journey
                            </h4>
                        </div>
                        
                        <div className="space-y-8 px-2">
                            {steps.map((step, idx) => {
                                const Icon = step.icon;
                                const isCompleted = step.state === 'completed';
                                const isActive = step.state === 'active';
                                return (
                                    <div key={idx} className="flex gap-5 relative">
                                        {idx !== steps.length - 1 && (
                                            <div className={`absolute left-[21px] top-12 w-[2px] h-10 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                                        )}
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 z-10 transition-all duration-300 relative ${
                                            isCompleted ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10' 
                                            : isActive ? 'bg-slate-900 text-white shadow-lg' 
                                            : 'bg-slate-50 text-slate-300 border border-slate-100'}`}>
                                            <Icon size={20} />
                                            {isActive && (
                                                <div className="absolute inset-0 rounded-xl border border-slate-900 animate-ping opacity-60" />
                                            )}
                                        </div>
                                        <div className="flex-1 pt-1.5">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4 className={`text-[13px] font-black uppercase tracking-wider ${
                                                        isActive ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                                                    }`}>
                                                        {step.label}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{step.subtitle}</p>
                                                </div>
                                                {step.date && (
                                                    <span className={`text-[10px] font-bold ${isActive ? 'text-slate-900' : 'text-slate-400'} bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md`}>
                                                        {formatDate(step.date)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>


                </div>
            </motion.div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .animate-spin-slow {
                    animation: spin 4s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .touch-none {
                    touch-action: none;
                }
            `}} />

            {/* No Partner Popup Modal */}
            {noPartnerMsg && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-500" />
                        <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            ⏳
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">We're Still Looking!</h3>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            {noPartnerMsg}
                        </p>
                        <button 
                            onClick={() => setNoPartnerMsg('')}
                            className="w-full py-3 bg-gray-100 text-gray-800 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Got it
                        </button>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default TrackOrderPage;
