import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCartStore } from '../../../shared/store/useStore';
import { useOrderStore } from '../../../shared/store/orderStore';
import { useAddressStore } from '../../../shared/store/addressStore';
import { useAuthStore } from '../../../shared/store/authStore';
import toast from 'react-hot-toast';
import {
    ArrowLeft, ChevronRight, ChevronDown, Banknote, Smartphone, CreditCard, 
    Clock, Wallet, Percent, Landmark, ShieldCheck, Plus, MapPin, X, Check, 
    Package, Tag
} from 'lucide-react';
import { getOptimizedImageUrl } from "../../../shared/utils/helpers";

const PaymentPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { items: cart, getTotal, clearCart } = useCartStore();
    const { user } = useAuthStore();
    const { createOrder, isLoading: isOrderLoading } = useOrderStore();
    const { addresses, fetchAddresses, hasFetched: addressesFetched } = useAddressStore();

    const passedAddress = location.state?.selectedAddress || null;
    const [currentAddress, setCurrentAddress] = useState(passedAddress);
    const [showAddressSheet, setShowAddressSheet] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedOption, setExpandedOption] = useState('');

    // Fetch addresses
    useEffect(() => {
        if (!addressesFetched) fetchAddresses().catch(() => {});
    }, []);

    // Set default address
    useEffect(() => {
        if (!currentAddress && addresses.length > 0) {
            const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
            setCurrentAddress(defaultAddr);
        }
    }, [addresses, currentAddress]);

    // Redirect if cart is empty
    useEffect(() => {
        if (cart.length === 0) {
            navigate('/cart', { replace: true });
        }
    }, [cart.length]);

    const cartTotal = getTotal();
    const totalMRP = cart.reduce((acc, item) => {
        const sellingPrice = Number(item.price || 0);
        const originalPrice = Number(item.originalPrice || 0);
        const mrp = Math.max(sellingPrice, originalPrice);
        return acc + (mrp * item.quantity);
    }, 0);
    const totalDiscount = Math.max(0, totalMRP - cartTotal);
    const shipping = 0;
    const finalTotal = cartTotal;

    const getDeliveryDate = () => {
        const date = new Date();
        date.setDate(date.getDate() + 5 + Math.floor(Math.random() * 3));
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const toggleOption = (option) => {
        setExpandedOption(expandedOption === option ? '' : option);
    };

    const handlePlaceOrder = async () => {
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }
        if (!currentAddress) {
            toast.error('Please select a delivery address');
            return;
        }

        setIsProcessing(true);
        try {
            const orderData = {
                items: cart.map(item => ({
                    id: item.id,
                    productId: item.id,
                    quantity: item.quantity,
                    price: item.price,
                    variant: item.variant,
                })),
                shippingAddress: {
                    name: currentAddress.name || currentAddress.fullName,
                    phone: currentAddress.phone,
                    address: currentAddress.address,
                    city: currentAddress.city,
                    state: currentAddress.state,
                    zipCode: currentAddress.zipCode,
                    country: currentAddress.country || 'India',
                },
                paymentMethod: paymentMethod.startsWith('cod') ? 'cod' : 'online',
                shippingOption: 'standard',
            };

            const createdOrder = await createOrder(orderData);
            clearCart();
            toast.success('Order placed successfully!');
            navigate(`/order-confirmation/${createdOrder.id}`, { replace: true });
        } catch (error) {
            const msg = error?.response?.data?.message || error?.message || 'Failed to place order';
            toast.error(msg);
        } finally {
            setIsProcessing(false);
        }
    };

    const PaymentOption = ({ id, icon: Icon, title, subtitle, offers, children }) => (
        <div className="border-b border-gray-100 last:border-0">
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white hover:text-black transition-colors" onClick={() => toggleOption(id)}>
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
                <div className="px-4 pb-4 animate-fadeIn">{children}</div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-white pb-24">
            {/* Header */}
            <header className="bg-white sticky top-0 z-50 border-b border-gray-100 px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white hover:text-black rounded-full transition-colors"><ArrowLeft size={20} /></button>
                    <div>
                        <h1 className="text-lg font-bold uppercase  leading-tight">Review Order</h1>
                        {totalDiscount > 0 && <p className="text-[11px] font-bold text-emerald-600">You're saving ₹{totalDiscount.toFixed(0)}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-green-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase ">100% Secure</span>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="bg-white border-b border-gray-100 px-4 py-4 mb-4">
                <div className="flex items-center justify-center max-w-sm mx-auto">
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full mb-1"></div>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase ">Bag</span>
                    </div>
                    <div className="flex-1 h-0.5 bg-emerald-500 mx-2 mb-4"></div>
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full mb-1"></div>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase ">Address</span>
                    </div>
                    <div className="flex-1 h-0.5 bg-black mx-2 mb-4"></div>
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-white border-2 border-black rounded-full mb-1"></div>
                        <span className="text-[10px] font-bold text-black uppercase ">Payment</span>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 max-w-2xl">
                {/* Delivery Details */}
                <div className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-50">
                        <MapPin size={16} className="text-gray-700" />
                        <span className="text-[13px] font-bold text-gray-900 uppercase ">Delivery Details</span>
                    </div>

                    {currentAddress ? (
                        <div className="px-4 py-4">
                            <div className="mb-1">
                                <span className="text-[14px] font-bold text-gray-900">{currentAddress.name || currentAddress.fullName}</span>
                                <span className="text-[13px] text-gray-600 font-medium ml-1.5">
                                    {currentAddress.address}{currentAddress.city ? `, ${currentAddress.city}` : ''}{currentAddress.state ? `, ${currentAddress.state}` : ''}{currentAddress.zipCode ? ` - ${currentAddress.zipCode}` : ''}
                                </span>
                            </div>
                            {currentAddress.phone && <p className="text-[12px] text-gray-500 mt-1">Mobile: <span className="font-bold text-gray-700">{currentAddress.phone}</span></p>}
                            <button onClick={() => setShowAddressSheet(true)} className="mt-3 text-[12px] font-bold text-blue-600 flex items-center gap-1 hover:gap-2 transition-all">
                                Change Address <ChevronRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="px-4 py-6 text-center">
                            <MapPin size={28} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-[12px] text-gray-400 font-medium mb-3">No delivery address selected</p>
                            <button onClick={() => navigate('/addresses')} className="text-[12px] font-bold text-blue-600">
                                Add Address <ChevronRight size={14} className="inline" />
                            </button>
                        </div>
                    )}

                    {/* Delivery estimate per item */}
                    {cart.length > 0 && currentAddress && (
                        <div className="border-t border-gray-100">
                            {cart.map((item, idx) => {
                                const imageUrl = Array.isArray(item.images) ? item.images[0] : (item.image || '');
                                return (
                                    <div key={item.cartLineKey || idx} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                                        <img src={getOptimizedImageUrl(imageUrl, 48)} loading="lazy" decoding="async" alt={item.name} className="w-12 h-14 object-cover rounded-lg bg-gray-100" onError={(e) => { e.target.src = 'https://placehold.co/48x56/f3f4f6/9ca3af?text=IMG'; }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <Package size={12} className="text-gray-400 flex-shrink-0" />
                                                <span className="text-[12px] font-bold text-gray-800">Delivery by {getDeliveryDate()}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 font-medium truncate">
                                                {item.name} {item.quantity > 1 ? `• Qty: ${item.quantity}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Recommended Payment */}
                <div className="mb-4">
                    <h2 className="text-[11px] font-bold uppercase  text-gray-500 mb-3 ml-2">Payment Options</h2>
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <label className="flex items-center justify-between p-4 border-b border-gray-100 cursor-pointer hover:bg-white hover:text-black transition-colors">
                            <div className="flex items-center gap-4">
                                <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="accent-black w-4 h-4" />
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-gray-900">Cash on Delivery (Cash/UPI)</span>
                                </div>
                            </div>
                            <Banknote size={20} className="text-gray-400" />
                        </label>

                        <PaymentOption id="upi" icon={Smartphone} title="UPI (Pay via any App)" offers="Coming Soon">
                            <div className="pl-9">
                                <p className="text-xs text-gray-500">Online payment integration coming soon.</p>
                            </div>
                        </PaymentOption>

                        <PaymentOption id="card" icon={CreditCard} title="Credit/Debit Card" offers="Coming Soon">
                            <div className="pl-9">
                                <p className="text-xs text-gray-500">Card payment integration coming soon.</p>
                            </div>
                        </PaymentOption>

                        <PaymentOption id="wallet" icon={Wallet} title="Wallets">
                            <div className="pl-9">
                                <p className="text-xs text-gray-500">Wallet integration coming soon.</p>
                            </div>
                        </PaymentOption>

                        <PaymentOption id="netbanking" icon={Landmark} title="Net Banking">
                            <div className="pl-9">
                                <p className="text-xs text-gray-500">Net banking integration coming soon.</p>
                            </div>
                        </PaymentOption>
                    </div>
                </div>

                {/* Price Details */}
                <div className="bg-white p-6 rounded-xl shadow-sm mb-24">
                    <h3 className="text-[13px] font-bold uppercase  text-gray-900 mb-4 pb-4 border-b border-gray-100">
                        Price Details ({cart.length} Items)
                    </h3>
                    <div className="space-y-3 mb-4">
                        <div className="flex justify-between text-[13px]">
                            <span className="text-gray-500 font-medium">Total MRP</span>
                            <span className="text-gray-900 font-bold">₹{totalMRP.toFixed(0)}</span>
                        </div>
                        {totalDiscount > 0 && (
                            <div className="flex justify-between text-[13px]">
                                <span className="text-gray-500 font-medium">Discount on MRP</span>
                                <span className="text-emerald-600 font-bold">{totalDiscount > 0 ? `-₹${totalDiscount.toFixed(0)}` : "₹0"}</span>
                            </div>
                        )}

                    </div>
                    <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                        <span className="text-[14px] font-bold text-gray-900 uppercase ">Total Amount</span>
                        <span className="text-[16px] font-bold text-gray-900">₹{finalTotal.toFixed(0)}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 z-50">
                <div className="flex items-center justify-between container mx-auto max-w-2xl">
                    <div className="flex flex-col">
                        <span className="text-[16px] font-bold text-gray-900">₹{finalTotal.toFixed(0)}</span>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">{cart.length} item(s)</span>
                    </div>
                    <button
                        onClick={handlePlaceOrder}
                        disabled={isProcessing || isOrderLoading || !currentAddress}
                        className="bg-black text-white px-8 py-3 rounded-lg text-[12px] font-bold uppercase  hover:bg-gray-800 active:scale-95 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isProcessing || isOrderLoading ? 'Placing Order...' : 'Place Order'}
                    </button>
                </div>
            </div>

            {/* Address Selection Sheet */}
            {showAddressSheet && (
                <div className="fixed inset-0 z-[100]">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddressSheet(false)} />
                    <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[20px] max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h2 className="text-[16px] font-bold text-gray-900">Select Address</h2>
                            <button onClick={() => setShowAddressSheet(false)} className="p-2 rounded-full hover:bg-gray-100"><X size={20} className="text-gray-500" /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            {addresses.map(addr => (
                                <button
                                    key={addr.id}
                                    onClick={() => { setCurrentAddress(addr); setShowAddressSheet(false); }}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${currentAddress?.id === addr.id ? 'border-black bg-white' : 'border-gray-100 hover:border-gray-300'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[13px] font-bold text-gray-900">{addr.name || addr.fullName}</span>
                                        {addr.isDefault && <span className="text-[9px] font-bold bg-black text-white px-1.5 py-0.5 rounded uppercase">Default</span>}
                                    </div>
                                    <p className="text-[12px] text-gray-500">{addr.address}, {addr.city}, {addr.state} - {addr.zipCode}</p>
                                    {addr.phone && <p className="text-[11px] text-gray-400 mt-1">Phone: {addr.phone}</p>}
                                </button>
                            ))}
                            <button
                                onClick={() => { setShowAddressSheet(false); navigate('/addresses'); }}
                                className="w-full p-4 rounded-xl border-2 border-dashed border-gray-200 text-center text-[13px] font-bold text-gray-500 hover:border-black hover:text-black transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={16} /> Add New Address
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentPage;
