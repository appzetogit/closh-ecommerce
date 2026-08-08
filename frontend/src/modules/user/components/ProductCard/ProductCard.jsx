import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';
import { useCategory } from '../../context/CategoryContext';
import { getPlaceholderImage } from '../../../../shared/utils/helpers';

const ProductCard = ({ product }) => {
    const { toggleWishlist, isInWishlist } = useWishlist();
    const { user } = useAuth();
    const { activeCategory } = useCategory();

    return (
        <>
            <div className="group relative w-full h-full flex flex-col bg-white overflow-hidden rounded-xl transition-all duration-500 hover:shadow-[0_15px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1">
                <Link
                    to={`/product/${product.id}`}
                    className="flex flex-col group no-underline text-inherit h-full"
                >
                    {/* Image Container - Compact ratio */}
                    <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-[#F5F5F5] group-hover:rounded-xl transition-all duration-500">
                        <img
                            src={product.image}
                            alt={product.name}
                            className={`absolute inset-0 w-full h-full object-contain transition-transform duration-700 ease-out group-hover:scale-110 ${product.stock === 'out_of_stock' ? 'grayscale opacity-70' : ''}`}
                            onError={(e) => { e.target.onerror = null; e.target.src = getPlaceholderImage(400, 533, 'Image unavailable'); }}
                        />

                        {/* Top Right Actions (Wishlist) - Glassmorphism */}
                        <div className="absolute top-2 right-2 z-10 transition-all duration-500">
                            <button
                                className={`w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-75 ${isInWishlist(product.id) ? 'bg-white shadow-md text-red-500' : 'bg-white/70 text-gray-900 border border-gray-100'}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleWishlist(product);
                                }}
                            >
                                <Heart size={11} className={`${isInWishlist(product.id) ? 'fill-red-500' : ''}`} />
                            </button>
                        </div>
                        {/* Status Badges */}
                        {product.stock === 'out_of_stock' ? (
                            <div className="absolute bottom-0 left-0 bg-red-600 text-white text-[9px] md:text-[11px] font-black px-3 py-0.5 rounded-tr-lg z-20 shadow-lg border-t border-r border-white/10 uppercase tracking-wider">
                                SOLD OUT
                            </div>
                        ) : product.vendorId?.isOnline === false ? (
                            <div className="absolute bottom-0 left-0 bg-[#52b788] text-white text-[9px] md:text-[11px] font-black px-3 py-0.5 rounded-tr-lg z-20 shadow-lg border-t border-r border-white/10 uppercase tracking-wider">
                                STORE OFFLINE
                            </div>
                        ) : (
                                <div className="absolute bottom-0 left-0 bg-[#000033] text-white text-[9px] md:text-[11px] font-black px-3 py-0.5 rounded-tr-lg z-20 shadow-lg border-t border-r border-white/10 uppercase tracking-wider">
                                    Try & Buy
                                </div>
                            )}
                    </div>

                    {/* Content Area - Matching Image 2 Minimalist Style */}
                    <div className="pt-2.5 pb-1.5 flex flex-col flex-1 items-start text-left overflow-hidden">
                        <div className="flex items-center justify-between w-full mb-0.5 gap-1">
                            <h3 className="text-[11px] md:text-[13px] font-black text-gray-900 uppercase tracking-tight truncate flex-1 min-w-0">
                                {(product.brand && product.brand !== 'AAPZETO' && product.brand !== 'Appzeto') ? product.brand : ((product.brandName && product.brandName !== 'AAPZETO' && product.brandName !== 'Appzeto') ? product.brandName : 'CLOSH')}
                            </h3>
                            {product.originalPrice && product.originalPrice > (product.discountedPrice || product.price) && (
                                <div className="bg-[#D8FFBD] text-[#388E3C] text-[9px] md:text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                                    {Math.round(((product.originalPrice - (product.discountedPrice || product.price)) / product.originalPrice) * 100)}% OFF
                                </div>
                            )}
                        </div>

                        <p className="text-[10px] md:text-[12px] font-medium text-gray-500 truncate mb-1 w-full">
                            {product.name}
                        </p>

                        <div className="mt-auto flex flex-nowrap items-center w-full pt-1">
                            <div className="flex items-center gap-1.5 shrink-0 min-w-0 overflow-hidden">
                                <span className="text-[12px] md:text-[14px] font-black text-gray-900 whitespace-nowrap tracking-tight">
                                    ₹{product.discountedPrice || product.price}
                                </span>
                                {product.originalPrice && product.originalPrice > (product.discountedPrice || product.price) && (
                                    <span className="text-[10px] md:text-[12px] text-gray-400 line-through font-semibold whitespace-nowrap truncate">
                                        ₹{product.originalPrice}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </Link>
            </div>
        </>
    );
};

export default ProductCard;
