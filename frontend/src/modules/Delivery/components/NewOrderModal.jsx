import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMapPin, FiPackage, FiClock, FiX, FiNavigation, FiZap, FiTarget } from 'react-icons/fi';
import { formatPrice } from '../../../shared/utils/helpers';
import SwipeToAccept from './SwipeToAccept';
import { getServerNow } from '../store/deliveryStore';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

const NewOrderModal = ({ order, isOpen, onClose, onAccept, isAccepting, riderLocation }) => {
    const [timeLeft, setTimeLeft] = useState(120);
    // Calculate live distance from rider to pickup
    const [liveDistance, setLiveDistance] = useState(order?.distance || '...');
    
    useEffect(() => {
        if (isOpen && order) {
            // Count down to the SERVER's accept deadline (assignedAt + 120s, on the server's
            // clock), not a fresh 120s from whenever the popup happened to open. Re-opening
            // it for an order that was offered a minute ago used to show "2:00" while the
            // server was about to reassign - so Accept landed on an order that was gone.
            // Returns / orders without assignedAt keep the plain 120s from now.
            const startMs = order.assignedAt ? new Date(order.assignedAt).getTime() : getServerNow();
            const endMs = startMs + 120000;
            const secondsLeft = () => Math.max(0, Math.ceil((endMs - getServerNow()) / 1000));

            setTimeLeft(secondsLeft());
            const timer = setInterval(() => {
                const left = secondsLeft();
                setTimeLeft(left);
                if (left <= 0) {
                    clearInterval(timer);
                    toast.error('Order request expired (Auto Cancelled)');
                    onClose();
                }
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isOpen, order?.id]); // Removed onClose to prevent resets on re-renders

    useEffect(() => {
        if (riderLocation && order && window.google) {
            const isRet = !!order?.isReturn;
            const pickupCoords = isRet 
                ? order?.customerLocation?.coordinates 
                : (order?.pickupLocation?.coordinates || order?.vendorLocation?.coordinates);
            
            if (Array.isArray(pickupCoords) && pickupCoords.length === 2 && pickupCoords[0] !== 0) {
                const pickupLat = pickupCoords[1];
                const pickupLng = pickupCoords[0];
                
                const p1 = new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng);
                const p2 = new window.google.maps.LatLng(pickupLat, pickupLng);
                const distMeters = window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
                setLiveDistance(`${(distMeters / 1000).toFixed(1)} km`);
            }
        }
    }, [riderLocation, order]);

    // Safety guard
    if (!order && isOpen) return null;

    const isReturn = !!order?.isReturn;
    
    const safeString = (val, fallback = '') => {
        if (typeof val === 'string') return val;
        if (val && typeof val === 'object') return val.address || val.name || JSON.stringify(val);
        return String(val || fallback);
    };

    // For standard: Pickup from Vendor, Deliver to Customer
    // For returns: Pickup from Customer, Deliver to Vendor
    const pickupTitle = isReturn ? 'Pickup From Customer' : 'Pickup From Vendor';
    const pickupNameRaw = isReturn ? (order?.customer) : (order?.vendorName);
    const pickupAddressRaw = isReturn ? (order?.address) : (order?.vendorAddress);
    
    const pickupName = safeString(pickupNameRaw, isReturn ? 'Customer' : 'Vendor');
    const pickupAddress = safeString(pickupAddressRaw, isReturn ? 'Customer Address' : 'Vendor Address');
    
    const deliverTitle = isReturn ? 'Deliver To Vendor' : 'Deliver To Customer';
    const deliverNameRaw = isReturn ? (order?.vendorName) : (order?.customer);
    const deliverAddressRaw = isReturn ? (order?.vendorAddress) : (order?.address);

    const deliverName = safeString(deliverNameRaw, isReturn ? 'Vendor' : 'Customer');
    const deliverAddress = safeString(deliverAddressRaw, 'Address unavailable');

    const themeColor = isReturn ? 'from-orange-600 to-orange-700' : 'from-green-600 to-green-700';
    const badgeColor = isReturn ? 'bg-orange-50 border-orange-100 text-orange-800' : 'bg-green-50 border-green-100 text-green-800';
    const accentColor = isReturn ? 'text-orange-600' : 'text-green-600';

    return createPortal(
        <AnimatePresence>
            {isOpen && order && (
                <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
                    {/* Premium Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                        onClick={onClose}
                    />

                    {/* Bottom Sheet Modal Content */}
                    <motion.div
                        drag="y"
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.5 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 150 || info.velocity.y > 500) {
                                onClose();
                            }
                        }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ 
                            type: 'spring', 
                            damping: 25, 
                            stiffness: 200, 
                            mass: 0.8,
                            velocity: 2
                        }}
                        className="relative bg-white rounded-t-[40px] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] overflow-hidden max-h-[94vh] flex flex-col z-[10000]"
                    >
                        {/* Timer Progress Bar */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-100 z-50">
                            <motion.div 
                                initial={{ width: '100%' }}
                                animate={{ width: `${(timeLeft / 120) * 100}%` }}
                                transition={{ duration: 1, ease: 'linear' }}
                                className={`h-full ${timeLeft < 10 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                            />
                        </div>

                        {/* Drag Handle / Indicator */}
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-6 mb-2 shrink-0" />

                        {/* Header Area */}
                        <div className="px-8 pt-10 pb-8 border-b border-slate-50 relative flex flex-col items-center text-center">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-6 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors z-10"
                            >
                                <FiX size={20} />
                            </button>

                            {/* Large Centered Timer */}
                            <div className="relative mb-6">
                                <motion.div 
                                    initial={{ scale: 0.9 }}
                                    animate={{ scale: 1 }}
                                    className={`w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 transition-all duration-300 shadow-2xl ${timeLeft < 10 ? 'border-rose-500 bg-rose-50 shadow-rose-100' : 'border-indigo-600 bg-indigo-50 shadow-indigo-100'}`}
                                >
                                    <span className={`text-4xl font-black leading-none ${timeLeft < 10 ? 'text-rose-600 animate-pulse' : 'text-indigo-700'}`}>{timeLeft}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest mt-1 ${timeLeft < 10 ? 'text-rose-400' : 'text-indigo-400'}`}>sec</span>
                                </motion.div>
                                
                                {/* Status Badge inside Header */}
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${order?.paymentMethod === 'prepaid' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-slate-900 text-white border-slate-700'}`}>
                                        {order?.paymentMethod === 'prepaid' ? 'PREPAID' : 'CASH ON DELIVERY'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4">
                                <p className={`${isReturn ? 'text-orange-500' : 'text-indigo-500'} text-[11px] font-black uppercase tracking-[0.3em] mb-1`}>
                                    Incoming {isReturn ? 'Return' : 'Request'}
                                </p>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                    {isReturn ? `Ref: #${order.orderId || String(order.id || '').slice(-6)}` : `Order #${order.orderId || String(order.id || '').slice(-6).toUpperCase()}`}
                                </h2>
                            </div>
                        </div>

                        {/* Content Scroll Area */}
                        <div className="px-8 py-6 overflow-y-auto overflow-x-hidden">

                            {/* Key Stats: Earnings, Time, Distance */}
                            <div className="grid grid-cols-3 gap-3 mb-8">
                                {[
                                    { label: 'Earnings', value: formatPrice(order.deliveryFee || order.deliveryEarnings || 0), icon: <FiZap className={`${isReturn ? 'text-orange-500' : 'text-amber-500'}`} />, bg: isReturn ? 'bg-orange-50' : 'bg-amber-50' },
                                    { label: 'Est. Time', value: order.estimatedTime || '15 min', icon: <FiClock className="text-blue-500" />, bg: 'bg-blue-50' },
                                    { label: 'Distance', value: liveDistance, icon: <FiTarget className="text-emerald-500" />, bg: 'bg-emerald-50' }
                                ].map((stat) => (
                                    <div key={stat.label} className={`${stat.bg} rounded-3xl p-4 flex flex-col items-center text-center border border-white`}>
                                        <div className="mb-2">{stat.icon}</div>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</span>
                                        <span className="font-black text-slate-800 text-sm whitespace-nowrap">{stat.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Delivery Route Visualization */}
                            <div className="relative pl-10">
                                {/* Connector Line */}
                                <div className="absolute left-[19px] top-6 bottom-6 w-[2px] bg-slate-100 border-l-2 border-dashed border-slate-200" />

                                {/* Pickups list */}
                                {order.isMultiVendor && order.vendorPickups && order.vendorPickups.length > 0 ? (
                                    order.vendorPickups.map((stop, index) => (
                                        <div key={index} className="relative mb-10">
                                            <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-200">
                                                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                            </div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pickup {index + 1}: {stop.vendorName || 'Vendor'}</p>
                                            <h3 className="font-black text-slate-900 text-base mb-1">{stop.vendorName || 'Vendor Shop'}</h3>
                                            <p className="text-slate-500 text-xs font-medium leading-relaxed">{stop.shopAddress || 'Address details in active task'}</p>
                                        </div>
                                    ))
                                ) : (
                                    /* Single Pickup Location */
                                    <div className="relative mb-10">
                                        <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-200">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                        </div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{pickupTitle}</p>
                                        <h3 className="font-black text-slate-900 text-base mb-1">{pickupName}</h3>
                                        <p className="text-slate-500 text-xs font-medium leading-relaxed">{pickupAddress}</p>
                                    </div>
                                )}

                                {/* Dropoff Location */}
                                <div className="relative">
                                    <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-200">
                                        <FiNavigation size={14} className="text-indigo-600" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{deliverTitle}</p>
                                    <h3 className="font-black text-slate-900 text-base mb-1">{deliverName}</h3>
                                    <p className="text-slate-500 text-xs font-medium leading-relaxed">{deliverAddress}</p>
                                </div>
                            </div>

                            {/* Order Total Info */}
                            <div className="mt-10 py-4 border-y border-slate-50 flex justify-between items-center px-2">
                                <span className="text-slate-400 text-sm font-bold">Total Order Value</span>
                                <span className="text-slate-900 font-black text-lg">{formatPrice(order.total || 0)}</span>
                            </div>

                            {/* Action Section */}
                            <div className="pt-10 pb-12">
                                <SwipeToAccept
                                    onAccept={() => onAccept(order?.id)}
                                    isLoading={isAccepting}
                                    color={isReturn ? '#f97316' : '#16a34a'}
                                />
                                
                                <button
                                    onClick={onClose}
                                    disabled={isAccepting}
                                    className="w-full mt-4 py-4 rounded-3xl bg-slate-50 border border-slate-200 text-slate-500 font-black text-xs uppercase tracking-[0.2em] shadow-sm active:scale-95 transition-all hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 disabled:opacity-50"
                                >
                                    Decline Request
                                </button>

                                <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-6">
                                    Action required to proceed
                                </p>
                            </div>

                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default NewOrderModal;
