import { useOrderStore } from '../../../../shared/store/orderStore';
import { useAddressStore } from '../../../../shared/store/addressStore';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useUserLocation } from '../../context/LocationContext';
import LocationModal from '../../components/Header/LocationModal';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import {
    ArrowLeft,
    ChevronRight,
    ChevronDown,
    Banknote,
    Smartphone,
    CreditCard,
    Clock,
    Wallet,
    Percent,
    Landmark,
    Gift,
    ShieldCheck,
    Plus,
    MapPin,
    X,
    Check,
    Package,
    LocateFixed,
    Search,
    MapPinned,
    Tag,
    Heart,
    AlertCircle,
    Bell
} from 'lucide-react';

const TimeRestrictedModal = ({ isOpen, onClose, data }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!isOpen || !data?.startTime) return;

        const updateTimer = () => {
            const now = new Date();
            const [targetH, targetM] = data.startTime.split(':').map(Number);
            
            let targetTime = new Date();
            targetTime.setHours(targetH, targetM, 0, 0);

            if (now.getTime() > targetTime.getTime()) {
                targetTime.setDate(targetTime.getDate() + 1);
            }

            const diffMs = targetTime.getTime() - now.getTime();
            if (diffMs <= 0) {
                setTimeLeft('00:00:00');
                return;
            }

            const h = Math.floor(diffMs / (1000 * 60 * 60));
            const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diffMs % (1000 * 60)) / 1000);

            if (h > 0) {
                setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else {
                setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [isOpen, data]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="bg-[#f0f0f0] rounded-[24px] shadow-2xl w-full max-w-[340px] relative z-10 overflow-hidden flex flex-col items-center pt-8 pb-6 px-6"
                    >
                        {/* Timer Circle with Pulse Effect */}
                        <div className="relative mb-6">
                            <motion.div 
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                className="absolute inset-0 rounded-full bg-black/5"
                            />
                            <div className="w-28 h-28 rounded-full border-[3px] border-black/10 flex flex-col items-center justify-center bg-white relative z-10 shadow-sm">
                                <span className="text-black text-3xl font-bold tracking-tight">
                                    {timeLeft || '00:00'}
                                </span>
                                <span className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mt-0.5">
                                    {timeLeft.split(':').length > 2 ? 'HOURS' : 'MINUTES'}
                                </span>
                            </div>
                        </div>

                        <h3 className="text-xl font-bold text-gray-800 mb-3 text-center">
                            Limited Access
                        </h3>
                        
                        <p className="text-[13px] text-gray-500 text-center mb-8 leading-relaxed px-2 font-medium">
                            {data?.message || "Our catalog is currently closed. We will open again soon."}
                        </p>

                        <div className="w-full space-y-3">
                            <button
                                onClick={() => {
                                    toast.success("We'll notify you when we open!");
                                    onClose();
                                }}
                                className="w-full py-3.5 bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors shadow-md shadow-black/20"
                            >
                                <Bell size={18} />
                                <span>Notify Me</span>
                            </button>
                            
                            <button
                                onClick={onClose}
                                className="w-full py-3.5 bg-transparent border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                            >
                                Close Window
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const PaymentPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { cart, getCartTotal, clearCart } = useCart();
    const { user } = useAuth();
    const { addresses, activeAddress, updateActiveAddress, refreshAddresses } = useUserLocation();
    const { createOrder } = useOrderStore();
    const { settings, initializePublic } = useSettingsStore();

    // Get address from checkout navigation OR from context
    const passedAddress = location.state?.selectedAddress || null;
    const [currentAddress, setCurrentAddress] = useState(passedAddress || activeAddress || null);
    
    const [showLocationModal, setShowLocationModal] = useState(false);

    const [paymentMethod, setPaymentMethod] = useState('');
    const [deliveryType, setDeliveryType] = useState(location.state?.deliveryType === 'standard' ? 'check_and_buy' : (location.state?.deliveryType || 'check_and_buy'));
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeRestrictedError, setTimeRestrictedError] = useState(null);
    const [expandedOption, setExpandedOption] = useState('');
    const isNavigatingToSuccess = useRef(false);

    // Detect multi-vendor cart to enforce Try & Buy only (mirrors CheckoutPage logic)
    const uniqueVendorIds = [...new Set(cart.map(item => String(item.vendorId || '')))].filter(Boolean);
    const isMultiVendor = uniqueVendorIds.length > 1;

    // Multi-vendor carts now support both Try & Buy and Check & Buy

    const isTryAndBuy = deliveryType === 'try_and_buy';


    // Promo Code States
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState(null);
    const [promoError, setPromoError] = useState('');
    const [isApplyingPromo, setIsApplyingPromo] = useState(false);
    const [estimatedShipping, setEstimatedShipping] = useState(null);
    const [isEstimatingShipping, setIsEstimatingShipping] = useState(false);

    useEffect(() => {
        refreshAddresses();
        initializePublic().catch(() => {});
    }, []);

    useEffect(() => {
        if (!currentAddress && addresses.length > 0) {
            setCurrentAddress(addresses[0]);
        }
    }, [addresses, currentAddress]);

    // Check time restriction on mount/settings load to show popup immediately
    useEffect(() => {
        if (settings?.orders?.timeManagement?.enabled) {
            const { startTime = '09:00', endTime = '21:00', message } = settings.orders.timeManagement;
            const now = new Date();
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            
            const currentTotal = currentHours * 60 + currentMinutes;
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            
            let isAllowed = false;
            if (startTotal <= endTotal) {
                isAllowed = currentTotal >= startTotal && currentTotal <= endTotal;
            } else {
                isAllowed = currentTotal >= startTotal || currentTotal <= endTotal;
            }
            
            if (!isAllowed) {
                const customMsg = message || `We are currently not accepting orders. Please try again between ${startTime} and ${endTime}.`;
                setTimeRestrictedError({
                    message: customMsg,
                    startTime
                });
            }
        }
    }, [settings?.orders?.timeManagement]);

    useEffect(() => {
        if (activeAddress) {
            setCurrentAddress(activeAddress);
        }
    }, [activeAddress]);

    const totalMRP = cart.reduce((acc, item) => {
        // originalPrice is the MRP stored in the cart item (set during addToCart)
        const itemMRP = Number(item.originalPrice) || Number(item.price) || 0;
        return acc + (itemMRP * item.quantity);
    }, 0);

    const totalDiscount = totalMRP - getCartTotal();
    
    // Dynamic values from settings
    const shippingThreshold = settings?.shipping?.freeShippingThreshold !== undefined ? Number(settings.shipping.freeShippingThreshold) : 500;
    const defaultShippingRate = settings?.shipping?.defaultShippingRate !== undefined ? Number(settings.shipping.defaultShippingRate) : 40;
    const platformFee = settings?.orders?.platformFee !== undefined ? Number(settings.orders.platformFee) : 20;

    // Force shipping to use global admin settings to match CheckoutPage exactly
    const shipping = getCartTotal() > shippingThreshold ? 0 : defaultShippingRate;

    const subtotal = getCartTotal();
    let promoDiscount = 0;

    if (appliedPromo) {
        if (appliedPromo.type === 'percentage') {
            promoDiscount = (subtotal * appliedPromo.value) / 100;
            if (appliedPromo.maxDiscount) {
                promoDiscount = Math.min(promoDiscount, appliedPromo.maxDiscount);
            }
        } else {
            promoDiscount = appliedPromo.value;
        }
    }

    const taxableAmount = Math.max(0, subtotal - promoDiscount);
    const tax = 0;

    const baseTotal = subtotal - promoDiscount + platformFee + shipping + tax;
    const codFeePercentage = settings?.payment?.paymentFees?.cod !== undefined ? Number(settings.payment.paymentFees.cod) : 0;
    const codFeeAmount = (paymentMethod === 'COD' || paymentMethod === 'cod') ? (baseTotal * codFeePercentage / 100) : 0;

    const finalTotal = baseTotal + codFeeAmount;

    const handleApplyPromo = (codeToApply) => {
        const finalCode = (typeof codeToApply === 'string' ? codeToApply : promoCode).trim();
        if (!finalCode) {
            setPromoError('Please enter a code');
            return;
        }

        setIsApplyingPromo(true);
        setPromoError('');

        // Fetch available coupons from API
        api.get('/coupons/available')
            .then(response => {
                const subtotal = totalMRP - totalDiscount;
                const found = response.data?.find(c => c.code.toUpperCase() === finalCode.toUpperCase());

                if (found) {
                    const now = new Date();
                    const expiry = found.expiresAt || found.endDate || found.expiryDate;
                    if (expiry && new Date(expiry) < now) {
                        setPromoError('This code has expired');
                    } else if (subtotal < (found.minOrderValue || found.minPurchase || 0)) {
                        setPromoError(`Minimum purchase of ₹${found.minOrderValue || found.minPurchase} required`);
                    } else if (found.usageLimit && (found.usedCount || 0) >= found.usageLimit) {
                        setPromoError('Usage limit reached for this code');
                    } else {
                        setAppliedPromo({
                            ...found,
                            value: found.discount || found.value // Normalize value/discount field
                        });
                        setPromoCode(finalCode);
                        toast.success('Promo code applied!');
                    }
                } else {
                    setPromoError('Invalid promo code');
                }
            })
            .catch(error => {
                console.error("Promo fetch error:", error);
                setPromoError('Failed to validate promo code');
            })
            .finally(() => {
                setIsApplyingPromo(false);
            });
    };
    
    // Shipping Estimation logic (Matches Checkout.jsx)
    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            const validItems = cart.map(item => ({
                productId: item?.id || item?._id,
                quantity: Number(item?.quantity || 1),
                variant: item?.variant || undefined,
            })).filter(item => item.productId);

            if (!validItems.length) {
                if (active) setEstimatedShipping(0);
                return;
            }

            setIsEstimatingShipping(true);
            try {
                const response = await api.post("/shipping/estimate", {
                    items: validItems,
                    shippingAddress: {
                        country: 'India',
                        coordinates: currentAddress?.coordinates?.coordinates || currentAddress?.coordinates || null,
                    },
                    shippingOption: 'online',
                    couponType: appliedPromo?.type || null,
                });

                const payload = response?.data ?? response;
                const nextShipping = Number(payload?.shipping);
                if (active) {
                    setEstimatedShipping(Number.isFinite(nextShipping) ? nextShipping : null);
                }
            } catch (err) {
                console.error("Shipping estimation error:", err);
                if (active) setEstimatedShipping(null);
            } finally {
                if (active) setIsEstimatingShipping(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [cart, currentAddress, appliedPromo]);

    useEffect(() => {
        if (location.state?.appliedCode) {
            handleApplyPromo(location.state.appliedCode);
            navigate(location.pathname, { replace: true, state: { ...location.state, appliedCode: undefined } });
        }
    }, [location.state]);

    const handleRemovePromo = () => {
        setAppliedPromo(null);
        setPromoError('');
    };

    const handleSelectAddress = (addr) => {
        setCurrentAddress(addr);
        updateActiveAddress(addr);
        
    };

    const handleLocationModalClose = () => {
        setShowLocationModal(false);
    };

    // Helper: load Razorpay checkout script on demand
    const loadRazorpayScript = () =>
        new Promise((resolve) => {
            if (window.Razorpay) return resolve(true);
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });

    const handlePlaceOrder = async () => {
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }
        if (!currentAddress) {
            toast.error('Please select a shipping address');
            return;
        }

        setIsProcessing(true);
        try {
            let normalizedPaymentMethod = 'cod';
            const lowerPm = paymentMethod.toLowerCase();
            
            // Comprehensive mapping for common payment identifiers
            if (lowerPm.includes('cod') || lowerPm.includes('cash')) {
                normalizedPaymentMethod = 'cod';
            } else if (lowerPm.includes('upi') || lowerPm.includes('gpay') || lowerPm.includes('phonepe') || lowerPm.includes('paytm') || lowerPm.includes('amazon')) {
                normalizedPaymentMethod = 'upi';
            } else if (lowerPm.includes('card') || lowerPm.includes('visa') || lowerPm.includes('master')) {
                normalizedPaymentMethod = 'card';
            } else if (lowerPm.includes('wallet')) {
                normalizedPaymentMethod = 'wallet';
            } else if (lowerPm.includes('bank')) {
                normalizedPaymentMethod = 'bank';

            } else if (lowerPm.includes('prepaid')) {
                normalizedPaymentMethod = 'prepaid';
            }

            const orderPayload = {
                items: cart.map(item => {
                    let variantObj = item.variant || {};
                    if (item.selectedSize) variantObj.size = item.selectedSize;
                    if (item.selectedColor) variantObj.color = item.selectedColor;
                    
                    return {
                        id: item.id || item._id,
                        quantity: item.quantity,
                        price: item.discountedPrice || item.price,
                        variant: Object.keys(variantObj).length > 0 ? variantObj : undefined,
                        variantKey: item.variantKey || undefined
                    };
                }),
                shippingAddress: {
                    name: currentAddress.fullName || currentAddress.name || user?.name || "Customer",
                    email: user?.email || "user@test.com",
                    phone: currentAddress.mobile || currentAddress.phone || user?.mobile || user?.phone || "N/A",
                    address: currentAddress.address || "Street Address",
                    city: currentAddress.city || "City",
                    state: currentAddress.state || "State",
                    zipCode: currentAddress.zipCode || currentAddress.pincode || "000000",
                    country: 'India'
                },
                paymentMethod: normalizedPaymentMethod,
                couponCode: appliedPromo?.code || "",
                shippingOption: 'online',
                orderType: ['try_and_buy', 'check_and_buy'].includes(deliveryType) ? deliveryType : 'check_and_buy',
                deliveryType: 'online',
                dropoffLocation: (function() {
                    const coords = currentAddress?.coordinates?.coordinates || currentAddress?.coordinates;
                    if (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[0])) {
                        return { type: 'Point', coordinates: [Number(coords[0]), Number(coords[1])] };
                    }
                    if (coords && typeof coords === 'object' && (coords.lon || coords.lng) && coords.lat) {
                        return { type: 'Point', coordinates: [Number(coords.lon || coords.lng), Number(coords.lat)] };
                    }
                    return null;
                })(),
                subtotal: subtotal,
                tax: tax,
                shipping: shipping,
                platformFee: platformFee,
                total: finalTotal
            };

            const response = await createOrder(orderPayload);
            if (response && response.id) {
                // Check if it's prepaid but missing Razorpay ID
                if (normalizedPaymentMethod === 'prepaid' && !response.razorpayOrderId) {
                    toast.error('Payment gateway initialization failed. Your order might be recorded as COD. Please contact support.');
                    isNavigatingToSuccess.current = true;
                    clearCart();
                    navigate(`/order-success/${response.id}?warning=payment_init_failed`, { replace: true });
                    return;
                }

                if (normalizedPaymentMethod === 'prepaid' && response.razorpayOrderId) {
                    // If this order was returned via idempotency and is already paid,
                    // skip Razorpay — navigating to success directly.
                    if (response.paymentStatus === 'paid') {
                        toast.success('Order already paid!');
                        isNavigatingToSuccess.current = true;
                        clearCart();
                        navigate(`/order-success/${response.orderId}`, { replace: true });
                        return;
                    }
                    const razorKey = response.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_8sYbzHWidwe5Zw';
                    console.log("💳 [PAYMENT_DEBUG] Initializing Razorpay modal with Key:", razorKey);
                    
                    const options = {
                        key: razorKey,
                        amount: response.razorpayAmount || Math.round(Number(response.total) * 100),
                        currency: 'INR',
                        name: 'CLOSH',
                        description: 'Order Payment',
                        order_id: response.razorpayOrderId,
                        handler: async (paymentResponse) => {
                            try {
                                await api.post('/user/orders/verify-payment', {
                                    orderId: response.orderId,
                                    razorpayPaymentId: paymentResponse.razorpay_payment_id,
                                    razorpayOrderId: paymentResponse.razorpay_order_id,
                                    razorpaySignature: paymentResponse.razorpay_signature
                                });
                                toast.success('Payment successful!');
                                isNavigatingToSuccess.current = true;
                                clearCart();
                                navigate(`/order-success/${response.id}`, { replace: true });
                            } catch (error) {
                                console.error("❌ [PAYMENT_ERROR] Verification Failed:", error);
                                toast.error('Payment verification failed. Please contact support.');
                                navigate(`/order-success/${response.id}?payment=failed`, { replace: true });
                            }
                        },
                        prefill: {
                            name: user?.name || '',
                            email: user?.email || '',
                            contact: currentAddress?.mobile || ''
                        },
                        theme: { color: '#000000' },
                        modal: {
                            ondismiss: async () => {
                                // The order was already created (pending payment) before this
                                // modal opened. If the user backs out of Razorpay without
                                // paying, that order must be cancelled here — otherwise it's
                                // left sitting as "Order Placed" even though nothing was paid.
                                try {
                                    await api.patch(`/user/orders/${response.orderId}/cancel`, {
                                        reason: 'Payment cancelled by customer'
                                    });
                                } catch (err) {
                                    console.error('Failed to cancel unpaid order after payment dismiss:', err);
                                }
                                setIsProcessing(false);
                                toast.error('Payment cancelled. Order was not placed.');
                            }
                        }
                    };
                    // Ensure Razorpay SDK is loaded before opening modal
                    const scriptLoaded = await loadRazorpayScript();
                    if (!scriptLoaded || !window.Razorpay) {
                        toast.error('Payment gateway failed to load. Please refresh and try again.');
                        setIsProcessing(false);
                        return;
                    }
                    const rzp = new window.Razorpay(options);
                    rzp.open();
                } else {
                    toast.success('Order placed successfully!');
                    isNavigatingToSuccess.current = true;
                    clearCart();
                    navigate(`/order-success/${response.id}`, { replace: true });
                }
            }
        } catch (error) {
            if (error.response?.data?.code === 'ORDER_TIME_RESTRICTED' || error.response?.data?.errors?.[0]?.code === 'ORDER_TIME_RESTRICTED' || error.response?.data?.message?.includes('not accepting orders')) {
                const restrictedErrorData = error.response?.data?.errors?.[0] || {};
                setTimeRestrictedError({
                    message: error.response?.data?.message || error.message,
                    startTime: restrictedErrorData.startTime
                });
            } else {
                const errMsg = error?.message || 'Failed to place order. Please check your connection.';
                toast.error(errMsg, { id: `api-error-${errMsg}` });
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleOption = (option) => {
        setExpandedOption(expandedOption === option ? '' : option);
    };

    const PaymentOption = ({ id, icon: Icon, title, subtitle, offers, children }) => (
        <div className="border-b border-gray-100 last:border-0 hover:bg-white hover:text-black">
            <div
                className="flex items-center justify-between p-4 cursor-pointer  transition-colors"
                onClick={() => {
                    toggleOption(id);
                    // Automatically select the method when expanding, for better UX
                    if (id === 'prepaid') setPaymentMethod('prepaid');

                    if (id === 'cod') setPaymentMethod('COD');
                }}
            >
                <div className="flex items-center gap-4">
                    <Icon size={20} className="text-gray-600" />
                    <div>
                        <div className="text-[13px] font-bold text-gray-900">{title}</div>
                        {subtitle && <div className="text-[10px] text-gray-500 font-medium">{subtitle}</div>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {offers && <span className="text-[10px] font-bold text-emerald-600 uppercase">{offers}</span>}
                    {expandedOption === id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </div>
            </div>
            {expandedOption === id && (
                <div className="px-4 pb-4 animate-fadeIn">
                    {children}
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-white pb-24 md:pb-12">
            <header className="bg-white sticky top-0 z-50 border-b border-gray-100 px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white hover:text-black rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold uppercase leading-tight">Review Order</h1>
                        {totalDiscount > 0 && <p className="text-[11px] font-bold text-emerald-600">You're saving ₹{Number(totalDiscount.toFixed(2))}</p>}
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-4 max-w-2xl">
                {/* Progress Bar */}
                <div className="py-6 flex justify-center">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold">1</div>
                        <div className="w-12 h-0.5 bg-black" />
                        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold shadow-[0_0_15px_rgba(0,0,0,0.2)] scale-110">2</div>
                        <div className="w-12 h-0.5 bg-gray-200" />
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px] font-bold">3</div>
                    </div>
                </div>

                {/* Delivery Address Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <MapPin size={18} className="text-gray-900" />
                            <h2 className="text-[14px] font-bold uppercase ">Delivery Address</h2>
                        </div>
                        <button
                            onClick={() => setShowLocationModal(true)}
                            className="text-[12px] font-bold text-[#e53e70] hover:text-[#c4325c] transition-colors"
                        >
                            Change
                        </button>
                    </div>

                    {currentAddress ? (
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[13px] font-bold text-gray-900">{currentAddress.fullName || currentAddress.name}</span>
                                {currentAddress.type && (
                                    <span className="text-[9px] font-bold bg-white text-gray-500 border border-gray-200 px-2 py-0.5 rounded uppercase ">
                                        {currentAddress.type}
                                    </span>
                                )}
                            </div>
                            <p className="text-[12px] text-gray-600 leading-relaxed font-medium">
                                {currentAddress.address}, {currentAddress.locality}, {currentAddress.city}, {currentAddress.state} - {currentAddress.zipCode || currentAddress.pincode}
                            </p>
                            {(currentAddress.mobile || currentAddress.phone) && (
                                <p className="text-[12px] text-gray-900 font-bold mt-2">Mob: {currentAddress.mobile || currentAddress.phone}</p>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowLocationModal(true)}
                            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 font-bold text-[13px] hover:border-black hover:text-black transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Add Delivery Address
                        </button>
                    )}
                </div>



                {/* Payment Options Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                    <div className="p-6 border-b border-gray-100 flex items-center gap-2">
                        <CreditCard size={18} className="text-gray-900" />
                        <h2 className="text-[14px] font-bold uppercase ">Select Payment Method</h2>
                    </div>

                    <div className="space-y-0">
                        {!isTryAndBuy && (
                            <PaymentOption id="prepaid" icon={Smartphone} title="Prepaid (UPI / Cards / Netbanking)" subtitle="Secure Online Payment" offers="FASTEST DELIVERY">
                                <div className="pt-4">
                                    <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${paymentMethod === 'prepaid' ? 'border-[#e53e70] bg-pink-50/50' : 'border-gray-100'}`}>
                                        <div className="flex items-center gap-3">
                                            <ShieldCheck size={20} className={paymentMethod === 'prepaid' ? "text-[#e53e70]" : "text-gray-400"} />
                                            <span className="text-[13px] font-bold">Pay Online (Razorpay)</span>
                                        </div>
                                        <input
                                            type="radio"
                                            name="payment"
                                            className="hidden"
                                            checked={paymentMethod === 'prepaid'}
                                            onChange={() => setPaymentMethod('prepaid')}
                                        />
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'prepaid' ? 'border-[#e53e70] bg-[#e53e70]' : 'border-gray-200'}`}>
                                            {paymentMethod === 'prepaid' && <div className="w-2 h-2 rounded-full bg-white" />}
                                        </div>
                                    </label>
                                </div>
                            </PaymentOption>
                        )}



                        <PaymentOption id="cod" icon={Banknote} title="Pay on Delivery" subtitle="Pay when you receive the order" offers="SAFE">
                            <div className="pt-4">
                                <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${paymentMethod === 'COD' ? 'border-[#e53e70] bg-pink-50/50' : 'border-gray-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <Banknote size={20} className={paymentMethod === 'COD' ? "text-[#e53e70]" : "text-gray-400"} />
                                        <span className="text-[13px] font-bold">Pay on Delivery</span>
                                    </div>
                                    <input
                                        type="radio"
                                        name="payment"
                                        className="hidden"
                                        checked={paymentMethod === 'COD'}
                                        onChange={() => setPaymentMethod('COD')}
                                    />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'COD' ? 'border-[#e53e70] bg-[#e53e70]' : 'border-gray-100'}`}>
                                        {paymentMethod === 'COD' && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                </label>
                            </div>
                        </PaymentOption>
                    </div>
                </div>

                {/* Price Details */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-24">
                    <h3 className="text-[13px] font-bold uppercase  text-gray-900 mb-4 pb-4 border-b border-gray-100">
                        Price Details ({cart.reduce((s, i) => s + i.quantity, 0)} Items)
                    </h3>
                    <div className="space-y-3 mb-4">
                        <div className="flex justify-between text-[13px]">
                            <span className="text-gray-500 font-medium">Total MRP</span>
                            <span className="text-gray-900 font-bold">₹{Number(totalMRP.toFixed(2))}</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                            <span className="text-gray-500 font-medium">Discount price</span>
                            <span className="text-emerald-600 font-bold">-₹{Number(totalDiscount.toFixed(2))}</span>
                        </div>
                        {appliedPromo && (
                            <div className="flex justify-between text-[13px] animate-fadeInUp">
                                <span className="text-gray-500 font-medium flex items-center gap-1.5">
                                    Coupon <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ">{appliedPromo.code}</span>
                                </span>
                                <span className="text-emerald-600 font-bold">-₹{Number(promoDiscount.toFixed(2))}</span>
                            </div>
                        ) }
                        <div className="flex justify-between text-[13px]">
                            <span className="text-gray-500 font-medium">Platform Fee</span>
                            <span className="text-gray-900 font-bold">₹{platformFee}</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                            <span className="text-gray-500 font-medium">Shipping Fee</span>
                            <span className="text-emerald-600 font-bold">{shipping === 0 ? 'FREE' : `₹${shipping}`}</span>
                        </div>
                        {(paymentMethod === 'COD' || paymentMethod === 'cod') && codFeeAmount > 0 && (
                            <div className="flex justify-between text-[13px] animate-fadeInUp">
                                <span className="text-gray-500 font-medium">COD Fee ({codFeePercentage}%)</span>
                                <span className="text-gray-900 font-bold">₹{Number(codFeeAmount.toFixed(2))}</span>
                            </div>
                        )}
                    </div>
                    <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                        <span className="text-[14px] font-bold text-gray-900 uppercase ">Total Amount</span>
                        <span className="text-[17px] font-bold text-gray-900">₹{Number(finalTotal.toFixed(2))}</span>
                    </div>
                </div>

                {/* Fixed Footer for Mobile/Desktop */}
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 sm:p-4 z-[90] md:relative md:border-t-0 md:bg-transparent md:p-0 md:mb-12 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] md:shadow-none pb-safe">
                     <div className="flex items-center justify-between container mx-auto max-w-2xl gap-2 px-1 sm:px-4 md:px-0">
                         <div className="flex flex-col min-w-0 pr-2">
                             <div className="flex items-center gap-1.5 flex-wrap">
                                 <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 line-through">₹{Number((totalMRP + platformFee + shipping).toFixed(2))}</span>
                                 <span className="text-[9px] sm:text-[10px] bg-emerald-100 text-emerald-700 px-1 sm:px-1.5 py-0.5 rounded font-black uppercase tracking-tighter whitespace-nowrap">Save ₹{Number((totalMRP + platformFee + shipping - finalTotal).toFixed(2))}</span>
                             </div>
                             <span className="text-[18px] sm:text-[20px] font-black text-gray-900 leading-tight mt-0.5">₹{Number(finalTotal.toFixed(2))}</span>
                         </div>
                         <button
                             onClick={handlePlaceOrder}
                             disabled={isProcessing || !currentAddress || !paymentMethod}
                             className="bg-black text-white px-5 sm:px-8 py-3.5 sm:py-4 rounded-[14px] sm:rounded-2xl text-[11px] sm:text-[12px] font-bold uppercase hover:bg-gray-800 active:scale-95 transition-all shadow-xl sm:shadow-2xl shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
                         >
                             {isProcessing ? (
                                 <>
                                     <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                                     <span>Processing...</span>
                                 </>
                             ) : (
                                 <>
                                     <span>Place Order</span>
                                     <ArrowLeft size={16} className="rotate-180 shrink-0 hidden sm:block" />
                                 </>
                             )}
                         </button>
                     </div>
                </div>

                {/* Safe Area Padding for iOS */}
                <div className="h-[env(safe-area-inset-bottom)] bg-white md:hidden" />

                <div className="text-center py-12 md:py-24 px-4 opacity-50">
                    <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                        By placing the order, you agree to Clothify's <span className="text-gray-600 font-bold cursor-pointer">Terms of Use</span> and <span className="text-gray-600 font-bold cursor-pointer">Privacy Policy</span>
                    </p>
                </div>
            </div>

            {/* Address Selection Bottom Sheet */}
            
            {/* Time Restricted Modal */}
            <TimeRestrictedModal 
                isOpen={!!timeRestrictedError} 
                onClose={() => setTimeRestrictedError(null)} 
                data={timeRestrictedError} 
            />

            <LocationModal
                isOpen={showLocationModal}
                onClose={handleLocationModalClose}
            />
        </div>
    );
};

export default PaymentPage;
