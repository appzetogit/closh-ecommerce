import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, X, Heart, Search, MapPin, ChevronDown, ArrowLeft } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import LocationModal from '../../components/Header/LocationModal';
import { useUserLocation } from '../../context/LocationContext';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const WishlistPage = () => {
    const { wishlistItems, toggleWishlist } = useWishlist();
    const { getCartCount } = useCart();
    const cartCount = getCartCount();
    const { activeAddress } = useUserLocation();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

    return (
        <div className="bg-white min-h-screen pb-20">
            {/* Sticky Header Container */}
            <div className="md:hidden sticky top-0 z-40 bg-white">
                {/* Mobile Header Nav */}
                <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={18} /></button>
                        <div className="flex-1">
                            <h1 className="text-sm md:text-base font-black uppercase tracking-tight">Wishlist</h1>
                            <p className="text-[9px] font-bold text-gray-400 uppercase transform -translate-y-0.5">{wishlistItems.length} Items</p>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate(user ? '/cart' : '/login')}
                        className="relative p-2 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 shadow-sm transition-transform active:scale-90"
                    >
                        <ShoppingBag size={18} className="text-gray-800" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-black text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                {cartCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />

            <div className="container mx-auto px-2 sm:px-3 py-2 md:px-4 md:py-8">
                {/* Desktop-only title if needed, or keeping it clean for mobile */}
                <div className="hidden md:flex flex-col mb-8 px-2 md:px-0">
                    <h1 className="text-base md:text-xl font-black uppercase text-gray-900 tracking-tighter">Wishlist Items</h1>
                    <p className="text-[10px] md:text-[13px] font-bold text-gray-400 uppercase transform -translate-y-0.5">{wishlistItems.length} Items</p>
                </div>

                {wishlistItems.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 md:gap-x-6 gap-y-6 md:gap-y-10">
                        {wishlistItems.map((product) => (
                            <div key={product.id} className="group flex flex-col">
                                <div className="relative aspect-[3/4.2] rounded-2xl md:rounded-[24px] overflow-hidden mb-2 md:mb-4 bg-white border border-gray-100/50 shadow-sm group-hover:shadow-md transition-all">
                                    <img
                                        src={getOptimizedImageUrl(product.image, 200)} loading="lazy" decoding="async"
                                        alt={product.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        onClick={() => navigate(`/product/${product.id}`)}
                                    />

                                    {/* Click Collect Connect Banner */}
                                    {product.tryAndBuy && (
                                        <div className="absolute bottom-0 left-0 w-full">
                                            <div className="bg-black/80 backdrop-blur-sm text-white text-[8px] md:text-[9px] font-bold px-2 md:px-4 py-1.5 md:py-2 flex items-center justify-center uppercase text-center">
                                                Click Connect Collect
                                            </div>
                                        </div>
                                    )}

                                    {/* Remove Icon (Filled Heart) */}
                                    <button
                                        onClick={() => toggleWishlist(product)}
                                        className="absolute bottom-2 md:bottom-4 right-2 md:right-4 w-7 md:w-10 h-7 md:h-10 bg-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-90"
                                    >
                                        <Heart size={14} className="fill-red-500 text-red-500 md:hidden" />
                                        <Heart size={20} className="fill-red-500 text-red-500 hidden md:block" />
                                    </button>
                                </div>

                                <div className="px-0.5 flex-1">
                                    <div className="text-[8px] md:text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0">
                                        {(product.brand && product.brand !== 'AAPZETO' && product.brand !== 'Appzeto') ? product.brand : ((product.brandName && product.brandName !== 'AAPZETO' && product.brandName !== 'Appzeto') ? product.brandName : 'CLOSH')}
                                    </div>
                                    <h3 className="text-[11px] md:text-[13px] font-bold text-gray-800 leading-tight line-clamp-1 mb-0.5 md:mb-1">{product.name}</h3>
                                    <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-4">
                                        <span className="text-[12px] md:text-[14px] font-extrabold text-black">₹{product.discountedPrice || product.price}</span>
                                        {(product.originalPrice || product.mrp) && Number(product.originalPrice || product.mrp) > (product.discountedPrice || product.price) && (
                                            <>
                                                <span className="text-[9px] md:text-[12px] font-bold text-gray-400 line-through">₹{product.originalPrice || product.mrp}</span>
                                                <span className="text-[8px] md:text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1 md:px-2 py-0.5 rounded-full">
                                                    {`${Math.round(((Number(product.originalPrice || product.mrp) - (product.discountedPrice || product.price)) / Number(product.originalPrice || product.mrp)) * 100)}% OFF`}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center">
                        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6">
                            <Heart size={40} className="text-gray-200" />
                        </div>
                        <h3 className="text-xl font-bold uppercase ">Your wishlist is empty</h3>
                        <p className="text-gray-500 font-bold text-sm mt-2 mb-8 lowercase first-letter:uppercase">Save your favorite items here!</p>
                        <button
                            onClick={() => navigate('/products')}
                            className="px-10 py-4 bg-black text-white text-[12px] font-bold uppercase  rounded-2xl active:scale-95 transition-all shadow-xl"
                        >
                            Explore Now
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WishlistPage;
