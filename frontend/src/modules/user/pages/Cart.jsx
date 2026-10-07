import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Heart, ShieldCheck, ChevronRight } from 'lucide-react';
import { useCartStore } from '../../../shared/store/useStore';
import { useWishlistStore } from '../../../shared/store/wishlistStore';
import { useAuthStore } from '../../../shared/store/authStore';
import { getOptimizedImageUrl } from "../../../shared/utils/helpers";

const CartPage = () => {
    const { items: cart, removeItem, updateQuantity, getTotal } = useCartStore();
    const { addItem: addToWishlist } = useWishlistStore();
    const { isAuthenticated } = useAuthStore();
    const navigate = useNavigate();

    React.useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const cartTotal = getTotal();

    const totalMRP = cart.reduce((acc, item) => {
        const sellingPrice = Number(item.price || 0);
        // Ensure MRP is at least the selling price to avoid negative discounts
        const originalPrice = Number(item.originalPrice || 0);
        const mrp = Math.max(sellingPrice, originalPrice);
        return acc + (mrp * item.quantity);
    }, 0);
    const totalDiscount = Math.max(0, totalMRP - cartTotal);

    const handleMoveToWishlist = (item) => {
        addToWishlist(item);
        removeItem(item.id, item.variant);
    };

    if (!isAuthenticated) {
        return null; // Return null to avoid flashing the empty cart UI before useEffect redirects
    }

    if (cart.length === 0) {
        return (
            <div className="bg-white min-h-[80vh] flex flex-col items-center justify-center px-4 animate-fadeIn">
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8">
                    <ShoppingBag size={48} className="text-gray-200" />
                </div>
                <h2 className="text-2xl font-bold uppercase  text-gray-900 mb-2">Your Cart is Empty</h2>
                <p className="text-gray-500 font-bold text-[13px] uppercase  mb-10 text-center max-w-xs leading-relaxed">
                    Looks like you haven't added anything to your cart yet.
                </p>
                <button
                    onClick={() => navigate('/home')}
                    className="px-10 py-4 bg-black text-white text-[12px] font-bold uppercase  rounded-2xl active:scale-95 transition-all shadow-xl"
                >
                    Continue Shopping
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white min-h-screen pb-24 md:pb-12">
            {/* Header */}
            <div className="sticky top-0 bg-white z-40 border-b border-gray-100 px-4 py-4 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="p-3 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="text-base font-bold uppercase ">Shopping Cart</h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase ">{cart.length} Items</p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 max-w-7xl">
                <div className="flex flex-col lg:flex-row gap-10">
                    {/* Cart Items */}
                    <div className="flex-[1.5] space-y-4">
                        {cart.map((item) => {
                            const sellingPrice = Number(item.price || 0);
                            const originalPrice = Number(item.originalPrice || item.price || 0);
                            const hasDiscount = originalPrice > sellingPrice;
                            const discountPercent = hasDiscount ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;
                            const imageUrl = Array.isArray(item.images) ? item.images[0] : (item.image || '');

                            return (
                                <div key={item.cartLineKey || item.id} className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-sm flex flex-row p-3 sm:p-5 relative group">
                                    <Link to={`/product/${item.id}`} className="w-20 sm:w-28 aspect-square rounded-2xl overflow-hidden shrink-0 bg-white border border-gray-100">
                                        <img src={getOptimizedImageUrl(imageUrl, 120)} loading="lazy" decoding="async" alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    </Link>

                                    <div className="flex-1 flex flex-col pl-4 sm:pl-6">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                {item.vendorName && (
                                                    <h3 className="text-[11px] font-bold text-gray-400 uppercase  mb-1">{item.vendorName}</h3>
                                                )}
                                                <h4 className="text-[15px] font-bold text-gray-800 leading-tight mb-3 uppercase ">{item.name}</h4>
                                            </div>
                                            <button
                                                className="p-2 -mr-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                onClick={() => removeItem(item.id, item.variant)}
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>

                                        {/* Variant info */}
                                        <div className="flex flex-wrap gap-4 mb-5">
                                            {item.variant && Object.entries(item.variant).map(([key, val]) => (
                                                <div key={key} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase ">{key}</span>
                                                    <span className="text-[12px] font-bold uppercase">{val}</span>
                                                </div>
                                            ))}
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase ">Qty</span>
                                                <div className="flex items-center gap-2.5 ml-1">
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant)}
                                                        className="hover:text-black text-gray-400 disabled:opacity-30"
                                                        disabled={item.quantity <= 1}
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <span className="text-[12px] font-bold min-w-[12px] text-center">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant)}
                                                        className="hover:text-black text-gray-400"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-auto flex items-end justify-between">
                                            <button
                                                onClick={() => handleMoveToWishlist(item)}
                                                className="text-[11px] font-bold uppercase  text-black flex items-center gap-2 border-b-2 border-transparent hover:border-black pb-1 transition-all"
                                            >
                                                <Heart size={14} /> Move to Wishlist
                                            </button>
                                            <div className="text-right">
                                                <div className="flex items-center gap-2 justify-end mb-0.5">
                                                    <span className="text-lg font-bold text-black">
                                                        ₹{(sellingPrice * item.quantity).toFixed(0)}
                                                    </span>
                                                    {hasDiscount && (
                                                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                            {discountPercent}% OFF
                                                        </span>
                                                    )}
                                                </div>
                                                {hasDiscount && (
                                                    <span className="text-[12px] font-bold text-gray-400 line-through">₹{originalPrice * item.quantity}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4">
                            <ShieldCheck className="text-emerald-600" size={24} />
                            <div>
                                <p className="text-[12px] font-bold uppercase  text-emerald-900">Safe and Secure Payments</p>
                                <p className="text-[10px] font-bold text-emerald-700/70 uppercase ">100% Authentic products guaranteed</p>
                            </div>
                        </div>
                    </div>

                    {/* Price Summary */}
                    <div className="flex-1 lg:max-w-md">
                        <div className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-xl sticky top-28">
                            <div className="p-8">
                                <h3 className="text-[14px] font-bold uppercase  text-gray-900 mb-8 flex items-center justify-between">
                                    Cart Summary
                                    <ShoppingBag size={18} className="text-gray-300" />
                                </h3>

                                <div className="space-y-6">
                                    <div className="flex justify-between text-[13px] font-bold">
                                        <span className="text-gray-400 uppercase ">Total MRP</span>
                                        <span className="text-gray-900 font-bold ">₹{totalMRP.toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between text-[13px] font-bold">
                                        <span className="text-gray-400 uppercase ">Cart Discount</span>
                                        <span className="text-emerald-600 font-bold ">{totalDiscount > 0 ? `-₹${totalDiscount.toFixed(0)}` : "₹0"}</span>
                                    </div>


                                    <div className="h-px bg-white my-2"></div>

                                    <div className="flex justify-between items-end py-2">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase  mb-1">Total Amount</p>
                                            <p className="text-2xl font-bold text-black ">₹{cartTotal.toFixed(0)}</p>
                                        </div>
                                        {totalDiscount > 0 && (
                                            <div className="text-right">
                                                <p className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">You saved ₹{totalDiscount.toFixed(0)}</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => navigate('/checkout')}
                                        className="w-full py-5 bg-black text-white text-[13px] font-bold uppercase rounded-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
                                    >
                                        Place Order <ChevronRight size={18} />
                                    </button>

                                    <p className="text-center text-[10px] font-bold text-gray-400 uppercase  mt-4">
                                        24 Hours Easy Returns & Exchanges
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 px-6 py-4 z-50 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase ">Total to Pay</p>
                    <p className="text-xl font-bold text-black ">₹{cartTotal.toFixed(0)}</p>
                </div>
                <button
                    onClick={() => navigate('/checkout')}
                    className="px-10 py-4 bg-black text-white text-[12px] font-bold uppercase  rounded-2xl active:scale-95 transition-all shadow-xl"
                >
                    Checkout <ArrowLeft className="rotate-180 inline-block ml-2" size={16} />
                </button>
            </div>
        </div>
    );
};

export default CartPage;
