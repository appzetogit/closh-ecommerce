import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Heart, ShieldCheck, ChevronRight, MapPin, ChevronDown, AlertTriangle } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import LocationModal from '../../components/Header/LocationModal';
import { useUserLocation } from '../../context/LocationContext';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const CartPage = () => {
    const { cart, removeFromCart, updateQuantity, getCartTotal } = useCart();
    const { addToWishlist } = useWishlist();
    const { activeAddress } = useUserLocation();
    const navigate = useNavigate();
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

    // Helper: get variant-level stock for a cart item
    const getItemVariantStock = (item) => {
        const size = item.variant?.size || item.selectedSize;
        if (size && item.variants?.stockMap) {
            const keys = [
                `${String(size).toLowerCase()}|`,
                `${String(size)}|`,
                `size=${String(size).toLowerCase()}`,
                `size=${String(size)}`
            ];
            for (const k of keys) {
                if (item.variants.stockMap[k] !== undefined) {
                    return Number(item.variants.stockMap[k]);
                }
            }
        }
        // Fallback to item-level stockQuantity
        return Number(item.stockQuantity ?? 1);
    };

    // Check if any item in cart is out of stock
    const hasOutOfStockItems = useMemo(() => {
        return cart.some(item => getItemVariantStock(item) <= 0);
    }, [cart]);

    const handleCheckout = () => {
        if (hasOutOfStockItems) {
            toast.error('Please remove out-of-stock items before checkout');
            return;
        }
        navigate('/checkout');
    };

    const totalMRP = cart.reduce((acc, item) => {
        const sellingPrice = Number(item.price || 0);
        const originalPrice = Number(item.originalPrice || 0);
        // Ensure MRP is at least the selling price to avoid negative discounts
        const mrp = Math.max(sellingPrice, originalPrice);
        return acc + (mrp * item.quantity);
    }, 0);
    const totalDiscount = Math.max(0, totalMRP - getCartTotal());

    if (cart.length === 0) {
        return (
            <div className="bg-white min-h-[80vh] flex flex-col items-center justify-center px-4 animate-fadeIn">
                <div className="w-32 h-32 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(212,175,55,0.05)]">
                    <ShoppingBag size={48} className="text-black/50" />
                </div>
                <h2 className="text-2xl font-bold uppercase  text-gray-900 mb-2">Your cart is Empty</h2>
                <p className="text-gray-400 font-semibold text-[13px] uppercase  mb-10 text-center max-w-xs leading-relaxed">
                    Looks like you haven't added anything to your cart yet.
                </p>
                <button
                    onClick={() => navigate('/products')}
                    className="px-10 py-4 bg-black text-white text-[12px] font-bold uppercase  rounded-2xl active:scale-95 transition-all shadow-[0_0_20px_rgba(212,175,55,0.2)]"
                >
                    Continue Shopping
                </button>
            </div>
        );
    }

    const handleMoveToWishlist = (item) => {
        addToWishlist(item);
        removeFromCart(item.cartItemId || item.id);
    };

    return (
        <div className="bg-white text-gray-900 min-h-screen pb-32 md:pb-12">
            {/* Mobile Header Nav */}
            <div className="md:hidden sticky top-0 bg-white/90 backdrop-blur-xl z-40 border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
                <button onClick={() => {
                    if (window.history.length > 2) {
                        navigate(-1);
                    } else {
                        navigate('/products');
                    }
                }} className="p-2 -ml-1 rounded-full hover:bg-gray-50 transition-colors"><ArrowLeft size={18} className="text-gray-900" /></button>
                <div className="flex-1">
                    <h1 className="text-sm font-bold uppercase  text-gray-900">Shopping cart</h1>
                    <p className="text-[9px] font-bold text-black uppercase ">{cart.length} Items</p>
                </div>
            </div>

            {/* Address Bar - New Row */}
            <div
                onClick={() => setIsLocationModalOpen(true)}
                className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 cursor-pointer active:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <MapPin size={16} className="text-black shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-bold leading-tight flex items-center gap-2 text-gray-900">
                            {activeAddress ? activeAddress.name : 'Select Location'} <span className="text-[9px] font-normal uppercase  text-gray-400">{activeAddress?.type}</span>
                        </span>
                        <span className="text-[10px] font-medium truncate max-w-[200px] text-gray-500">
                            {activeAddress ? `${activeAddress.address}, ${activeAddress.city}` : 'Add an address to see delivery info'}
                        </span>
                    </div>
                </div>
                <ChevronDown size={14} className="text-gray-400" />
            </div>

            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />

            <div className="container mx-auto px-4 py-8 max-w-7xl">
                <div className="hidden md:block mb-10">
                    <h1 className="text-3xl font-bold uppercase  text-gray-900">Your cart</h1>
                    <p className="text-[14px] font-bold text-black mt-1 uppercase ">{cart.length} Items</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-10">
                    {/* Cart Items List */}
                    <div className="flex-[1.5] space-y-4">
                        {cart.map((item) => {
                            const itemVariantStock = getItemVariantStock(item);
                            const isItemOutOfStock = itemVariantStock <= 0;
                            return (
                            <div key={item.cartLineKey || `${item.id}-${item.variant?.size || item.selectedSize || 'default'}`} className={`bg-white rounded-[24px] overflow-hidden border shadow-sm flex flex-row p-3 sm:p-4 relative group transition-all duration-300 hover:shadow-md ${isItemOutOfStock ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-black/10'}`}>
                                {/* Out of Stock Badge */}
                                {isItemOutOfStock && (
                                    <div className="absolute top-2 right-2 z-10 bg-red-500 text-white text-[8px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1 animate-pulse">
                                        <AlertTriangle size={10} /> Out of Stock
                                    </div>
                                )}
                                {/* Compact Image Section */}
                                <Link to={`/product/${item.id}`} className={`w-24 sm:w-28 aspect-square rounded-2xl overflow-hidden shrink-0 bg-[#F8F8F8] border border-gray-50 ${isItemOutOfStock ? 'opacity-50' : ''}`}>
                                    <img src={getOptimizedImageUrl(item.image, 120)} loading="lazy" decoding="async" alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                </Link>

                                {/* Organized Content Section */}
                                <div className="flex-1 flex flex-col pl-4 min-w-0">
                                    {/* Top Row: Brand & Name with Delete Button */}
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 pr-2">
                                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 truncate">{item.brand}</h3>
                                            <h4 className="text-[14px] font-bold text-gray-900 leading-tight uppercase truncate">{item.name}</h4>
                                        </div>
                                        <button
                                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
                                            onClick={() => removeFromCart(item.cartItemId || item.id)}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    {/* Middle Row: Selectors (Size & Qty) */}
                                    <div className="flex flex-col gap-1.5 mt-2.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">Size</span>
                                                <span className="text-[11px] font-extrabold text-gray-900 uppercase">{item.variant?.size || item.selectedSize || 'M'}</span>
                                            </div>
                                            {isItemOutOfStock ? (
                                                <div className="bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                                                    <span className="text-[9px] font-bold text-red-500 uppercase">Unavailable</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Qty</span>
                                                    <div className="flex items-center gap-2 border-l border-gray-200 ml-1 pl-2">
                                                        <button
                                                            onClick={() => updateQuantity(item.cartItemId || item.id, item.quantity - 1)}
                                                            className="text-gray-400 hover:text-black p-0.5"
                                                        >
                                                            <Minus size={12} strokeWidth={3} />
                                                        </button>
                                                        <span className="text-[11px] font-black min-w-[12px] text-center text-gray-900">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.cartItemId || item.id, item.quantity + 1)}
                                                            className="text-gray-400 hover:text-black p-0.5"
                                                        >
                                                            <Plus size={12} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {!isItemOutOfStock && itemVariantStock <= 10 && (
                                            <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest pl-1">
                                                Only {itemVariantStock} unit(s) available
                                            </span>
                                        )}
                                    </div>

                                    {/* Bottom Row: Wishlist & Pricing */}
                                    <div className="mt-auto pt-3 flex items-end justify-end">
                                        <div className="text-right">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex flex-col items-end leading-none">
                                                    {(Number(item.originalPrice) > Number(item.price)) && (
                                                        <span className="text-[10px] font-bold text-gray-300 line-through mb-1">₹{(Number(item.originalPrice) * item.quantity).toFixed(2)}</span>
                                                    )}
                                                    <span className="text-[16px] font-black text-gray-900">
                                                        ₹{(Number(item.price) * item.quantity).toFixed(2)}
                                                    </span>
                                                </div>

                                                {(Number(item.originalPrice) > Number(item.price)) && (
                                                    <div className="bg-black text-white w-10 h-10 rounded-full flex flex-col items-center justify-center leading-none shrink-0 border border-black group-hover:bg-white group-hover:text-black transition-all">
                                                        <span className="text-[9px] font-black">{Math.round(((Number(item.originalPrice) - Number(item.price)) / Number(item.originalPrice)) * 100)}%</span>
                                                        <span className="text-[6px] font-black uppercase">OFF</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                        })}

                        <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex items-center gap-4 mt-6">
                            <ShieldCheck className="text-black" size={24} />
                            <div>
                                <p className="text-[12px] font-bold uppercase  text-gray-900">Safe and Secure Payments</p>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase ">100% Authentic products guaranteed</p>
                            </div>
                        </div>
                    </div>

                    {/* Price Details Sidebar */}
                    <div className="flex-1 lg:max-w-md">
                        <div className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-xl lg:sticky lg:top-28">
                            <div className="p-8">
                                <h3 className="text-[14px] font-bold uppercase  text-gray-900 mb-8 flex items-center justify-between">
                                    Cart Summary
                                    <ShoppingBag size={18} className="text-black" />
                                </h3>

                                <div className="space-y-6">
                                    <div className="flex justify-between text-[13px] font-bold">
                                        <span className="text-gray-400 uppercase ">Total MRP</span>
                                        <span className="text-gray-900 font-bold ">₹{totalMRP.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-[13px] font-bold">
                                        <span className="text-gray-400 uppercase ">Cart Discount</span>
                                        <span className="text-black font-bold ">{totalDiscount > 0 ? `-₹${totalDiscount.toFixed(2)}` : "₹0.00"}</span>
                                    </div>


                                    <div className="h-px bg-gray-100 my-2"></div>

                                    <div className="flex justify-between items-end py-2">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase  mb-1">Total Amount</p>
                                            <p className="text-2xl font-bold text-gray-900 ">₹{getCartTotal().toFixed(2)}</p>
                                        </div>
                                        {totalDiscount > 0 && (
                                            <div className="text-right">
                                                <p className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">You saved ₹{totalDiscount.toFixed(2)}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* HIDDEN ON MOBILE: Avoids duplicate button with bottom action bar */}
                                    {hasOutOfStockItems && (
                                        <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-2 mb-3">
                                            <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                            <p className="text-[10px] font-bold text-red-600 uppercase">Remove out-of-stock items to proceed</p>
                                        </div>
                                    )}
                                    <button
                                        onClick={handleCheckout}
                                        disabled={hasOutOfStockItems}
                                        className={`hidden lg:flex w-full py-5 text-[13px] font-bold uppercase rounded-2xl active:scale-95 transition-all items-center justify-center gap-3 ${hasOutOfStockItems ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white shadow-[0_4px_20px_rgba(212,175,55,0.2)] hover:bg-gray-100 hover:text-black hover:shadow-xl'}`}
                                    >
                                        Place Order <ChevronRight size={18} />
                                    </button>

                                    <p className="text-center text-[10px] font-semibold text-gray-400 uppercase  mt-4">
                                        24 Hours Easy Returns & Exchanges
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            {/* Mobile Bottom Action Bar - Shifted up to avoid overlap with BottomNav */}
            <div className="lg:hidden fixed bottom-16 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 sm:px-6 py-3 z-50 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.06)]">
                <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase ">Total to Pay</p>
                    <p className="text-xl font-bold text-gray-900 ">₹{getCartTotal().toFixed(2)}</p>
                </div>
                <button
                    onClick={handleCheckout}
                    disabled={hasOutOfStockItems}
                    className={`px-8 sm:px-10 py-3.5 sm:py-4 text-[11px] sm:text-[12px] font-bold uppercase rounded-2xl active:scale-95 transition-all flex items-center justify-center min-w-[140px] sm:min-w-[160px] ${hasOutOfStockItems ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white shadow-[0_0_20px_rgba(212,175,55,0.2)]'}`}
                >
                    {hasOutOfStockItems ? 'Remove OOS Items' : 'Checkout'} <ChevronRight className="inline-block ml-2 w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default CartPage;
