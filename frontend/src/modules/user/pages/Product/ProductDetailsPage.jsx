import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    Heart,
    ShoppingCart,
    Star,
    Share2,
    ChevronLeft,
    ShieldCheck,
    Truck,
    RotateCcw,
    Check,
    ChevronDown,
    ChevronUp,
    Info,
    MapPin,
    X,
    CheckCircle2,
    Tag,
    Ticket,
    LayoutGrid
} from 'lucide-react';
import { useProductStore, normalizeProduct } from '../../../../shared/store/productStore';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import LocationModal from '../../components/Header/LocationModal';
import { useUserLocation } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../../components/Modals/LoginModal';
import { getVariantSignature } from '../../../../shared/utils/variant';
import ProductReviews from '../../components/Product/ProductReviews';
import ProductCard from '../../components/ProductCard/ProductCard';
import api from '../../../../shared/utils/api';

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addToCart, cart, getCartCount } = useCart();
    const { toggleWishlist, isInWishlist } = useWishlist();
    const { activeAddress } = useUserLocation();
    const { fetchProductById } = useProductStore();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSize, setSelectedSize] = useState('');
    const [activeImg, setActiveImg] = useState(0);
    const [openAccordion, setOpenAccordion] = useState('description');
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isSizeChartOpen, setIsSizeChartOpen] = useState(false);
    const [showAddedToast, setShowAddedToast] = useState(false);
    const [promoCodes, setPromoCodes] = useState([]);
    const [copiedCode, setCopiedCode] = useState(null);
    const [similarProducts, setSimilarProducts] = useState([]);
    const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
    const carouselRef = useRef(null);

    const handleThumbnailClick = (idx) => {
        setActiveImg(idx);
        if (carouselRef.current) {
            carouselRef.current.scrollTo({
                left: carouselRef.current.offsetWidth * idx,
                behavior: 'smooth'
            });
        }
    };

    const copyCode = (code) => {
        navigator.clipboard.writeText(code)
            .then(() => {
                setCopiedCode(code);
                toast.success('Promo code copied!');
                setTimeout(() => setCopiedCode(null), 2000);
            })
            .catch(() => {
                toast.error('Failed to copy promo code');
            });
    };

    const handleShare = async () => {
        const shareData = {
            title: product?.name || 'Clouse Product',
            text: `Check out this ${product?.name || 'product'} on Clouse!`,
            url: window.location.href,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    toast.error('Could not share link');
                }
            }
        } else {
            try {
                await navigator.clipboard.writeText(window.location.href);
                toast.success('Product link copied to clipboard!');
            } catch (err) {
                toast.error('Failed to copy link');
            }
        }
    };

    // Dynamic Options from API
    const sizes = useMemo(() => {
        const s = product?.variants?.sizes || [];
        return s.filter(val => val && val.trim?.() !== '');
    }, [product]);

    useEffect(() => {
        const savedCodes = localStorage.getItem('admin-promocodes');
        if (savedCodes) {
            const parsedCodes = JSON.parse(savedCodes);
            const now = new Date();
            const activeCodes = parsedCodes.filter(code =>
                code.status === 'active' &&
                new Date(code.endDate) > now
            );
            setPromoCodes(activeCodes);
        }
    }, []);

    useEffect(() => {
        const loadProductData = async () => {
            setLoading(true);
            const data = await fetchProductById(id);
            if (data) {
                setProduct(data);
                // Set default selections ONLY if explicitly provided by vendor
                if (data.variants?.defaultVariant?.size) {
                    setSelectedSize(data.variants.defaultVariant.size);
                } else {
                    setSelectedSize(null);
                }

                // Fetch similar products
                setIsLoadingSimilar(true);
                try {
                    const response = await api.get('/products', { 
                        params: { category: data.category || data.categoryName, limit: 10 } 
                    });
                    const payload = response?.data || response;
                    const productsList = Array.isArray(payload?.data?.products) 
                        ? payload.data.products 
                        : (Array.isArray(payload?.products) ? payload.products : []);
                    
                    const normalized = productsList.map(normalizeProduct).filter(p => String(p.id) !== String(data.id));
                    setSimilarProducts(normalized);
                } catch (err) {
                    console.error("Failed to fetch similar products", err);
                } finally {
                    setIsLoadingSimilar(false);
                }
            }
            setLoading(false);
        };
        loadProductData();
        window.scrollTo(0, 0);
    }, [id, fetchProductById]);

    // Calculate Dynamic Price based on Variant
    const currentPrice = useMemo(() => {
        if (!product) return 0;

        let finalPrice = product.discountedPrice !== undefined ? product.discountedPrice : product.price;

        if (product.variants?.prices) {
            const signature = getVariantSignature({ size: selectedSize });
            const entries = Object.entries(product.variants.prices || {});

            // 1. Exact match with standardized signature
            let match = entries.find(([k]) => String(k).trim() === signature);

            // 2. Case-insensitive match 
            if (!match && signature) {
                match = entries.find(([k]) => String(k).trim().toLowerCase() === signature.toLowerCase());
            }

            // 3. Legacy legacy format (size)
            if (!match) {
                const s = String(selectedSize || "").trim().toLowerCase();
                const candidates = [s].filter(Boolean);
                for (const cand of candidates) {
                    match = entries.find(([k]) => String(k).trim().toLowerCase() === cand);
                    if (match) break;
                }
            }

            if (match) {
                const parsed = Number(match[1]);
                if (Number.isFinite(parsed) && parsed >= 0) {
                    finalPrice = parsed;
                }
            }
        }
        return finalPrice;
    }, [product, selectedSize]);

    const getSizeStock = (size) => {
        if (!product) return 0;
        if (product.variants?.stockMap && Object.keys(product.variants.stockMap).length > 0) {
            const signature = getVariantSignature({ size });
            const entries = Object.entries(product.variants.stockMap || {});
            
            let match = entries.find(([k]) => String(k).trim() === signature);
            if (!match && signature) {
                match = entries.find(([k]) => String(k).trim().toLowerCase() === signature.toLowerCase());
            }
            
            if (match) {
                return Number(match[1]);
            }

            const keys = [
                `${String(size || "").toLowerCase()}|`,
                `${String(size || "")}|`,
                `size=${String(size || "").toLowerCase()}`,
                `size=${String(size || "")}`
            ];
            for (const k of keys) {
                const variantStock = product.variants.stockMap[k];
                if (variantStock !== undefined) return Number(variantStock);
            }
            // Fix: If a size is not in stockMap, it has 0 stock. Do not fall back to total stock.
            return 0;
        }
        return Number(product.stockQuantity || 0);
    };

    const currentStock = useMemo(() => {
        if (!product) return 0;
        if (!selectedSize) return Number(product.stockQuantity || 0);
        return getSizeStock(selectedSize);
    }, [product, selectedSize]);

    const isOutOfStock = useMemo(() => {
        if (!product) return true;
        if (product.stock === 'out_of_stock') return true;
        // If variants exist but none selected, we don't know yet, so check total
        if ((sizes.length > 0) && (!selectedSize)) {
            return Number(product.stockQuantity || 0) <= 0;
        }
        return currentStock <= 0;
    }, [product, currentStock, sizes.length, selectedSize]);

    const isVendorOffline = useMemo(() => {
        return product?.vendorId?.isOnline === false;
    }, [product]);

    const handleAddToCart = () => {
        if (!user) {
            setIsLoginModalOpen(true);
            return;
        }

        if (sizes.length > 0 && !selectedSize) {
            toast.error('Please select a size first');
            return;
        }



        if (currentStock <= 0) {
            toast.error(`Only 0 units available for selected variant of ${product.name}`);
            return;
        }

        if (isVendorOffline) {
            toast.error('Store is currently offline. You cannot add products to cart.');
            return;
        }

        addToCart({
            ...product,
            price: currentPrice,
            selectedSize,
        });

        setShowAddedToast(true);
        setTimeout(() => setShowAddedToast(false), 3000);
    };

    const toggleAccordion = (id) => {
        setOpenAccordion(openAccordion === id ? null : id);
    };

    // Use actual images from product
    const productImages = useMemo(() => {
        if (!product) return [];

        let variantImage = null;
        if (product.variants?.imageMap) {
            const signature = getVariantSignature({ size: selectedSize });
            const entries = Object.entries(product.variants.imageMap || {});

            // 1. Exact match
            let match = entries.find(([k]) => String(k).trim() === signature);

            // 2. Case-insensitive
            if (!match && signature) {
                match = entries.find(([k]) => String(k).trim().toLowerCase() === signature.toLowerCase());
            }

            // 3. Legacy Candidates
            if (!match) {
                const s = String(selectedSize || "").trim().toLowerCase();
                const candidates = [s].filter(Boolean);
                for (const cand of candidates) {
                    match = entries.find(([k]) => String(k).trim().toLowerCase() === cand);
                    if (match) break;
                }
            }

            if (match) variantImage = match[1];
        }

        let baseImages = [];
        if (product.image) {
            baseImages.push(product.image);
        }
        if (Array.isArray(product.images) && product.images.length > 0) {
            const otherImages = product.images.filter(img => img !== product.image && img);
            baseImages = [...baseImages, ...otherImages];
        }
        if (baseImages.length === 0) {
            baseImages = ['https://via.placeholder.com/800x1000?text=Premium+Piece'];
        }

        if (variantImage) {
            return [variantImage, ...baseImages.filter(img => img !== variantImage)];
        }
        return baseImages;
    }, [product, selectedSize]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-[#D4AF37] rounded-full animate-spin transition-all" />
            <p className="mt-4 text-[10px] font-bold uppercase  text-black animate-pulse">Loading Premium Piece...</p>
        </div>
    );

    if (!product) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                <X size={32} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-bold uppercase  mb-2 text-gray-900">Product Not Found</h2>
            <p className="text-xs font-semibold text-gray-600 uppercase  mb-8">This collection might have moved or ended.</p>
            <button onClick={() => navigate('/shop')} className="px-8 py-4 bg-black text-white text-[11px] font-bold uppercase  rounded-2xl shadow-xl active:scale-95 transition-all">Go to Shop</button>
        </div>
    );

    // Cart count logic
    const cartCount = getCartCount();

    return (
        <div className="bg-white text-gray-900 min-h-screen pb-20 overflow-x-hidden">
            {/* Universal Header - Mimics Mobile View for consistency */}
            <div className="md:hidden sticky top-0 bg-white/95 backdrop-blur-md z-[100] border-b border-gray-200 shadow-sm">
                <div className="container mx-auto flex items-center justify-between px-4 py-2">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                        <ChevronLeft size={24} className="text-gray-900" />
                    </button>
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-sm font-semibold truncate max-w-[150px]">{product.brand}</h1>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4 shrink-0">
                        <button onClick={handleShare} className="p-1 hover:bg-gray-100 rounded-full transition-colors" aria-label="Share product">
                            <Share2 size={20} className="text-gray-900" />
                        </button>
                        <Link to={user ? "/cart" : "/login"} className="relative p-1">
                            <ShoppingCart size={20} className="text-gray-900" />
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-black text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-[#111111]">
                                    {cartCount}
                                </span>
                            )}
                        </Link>
                    </div>
                </div>

                <div className="border-t border-gray-200">
                    <div
                        onClick={() => setIsLocationModalOpen(true)}
                        className="container mx-auto flex items-center justify-between px-4 py-1.5 cursor-pointer hover:bg-gray-50 transition-all font-bold"
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                <MapPin size={14} className="text-gray-900" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[11px] font-bold leading-tight flex items-center gap-2 text-gray-900">
                                    {activeAddress ? activeAddress.name : 'Select Location'}
                                    {activeAddress?.type && (
                                        <span className="text-[8px] font-bold bg-black text-white px-1.5 py-0.5 rounded uppercase">{activeAddress.type}</span>
                                    )}
                                </span>
                                <span className="text-[10px] font-bold truncate max-w-[200px] md:max-w-none text-gray-500">
                                    {activeAddress ? `${activeAddress.address}, ${activeAddress.city}` : 'Add an address to see delivery info'}
                                </span>
                            </div>
                        </div>
                        <ChevronDown size={14} className="text-gray-400" />
                    </div>
                </div>
            </div>

            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />

            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                onSuccess={() => {
                    // Optionally continue with add to cart if desired, or just let them click again
                    setIsLoginModalOpen(false);
                }}
            />

            <div className="container mx-auto px-4 py-2 md:py-6">
                <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">

                    {/* Left: Image Gallery */}
                    <div className="flex-1 lg:flex-[1.2] w-full flex flex-col gap-3 md:gap-6 lg:sticky lg:top-28">
                        {/* Main Image - Carousel */}
                        <div className="relative aspect-square md:aspect-[3/4] lg:aspect-[4/5] lg:max-h-[600px] lg:max-w-[480px] lg:mx-auto w-full rounded-xl md:rounded-[40px] overflow-hidden bg-white shadow-sm md:shadow-2xl group border border-gray-100 md:border-gray-200">
                            
                            <div 
                                ref={carouselRef}
                                className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
                                onScroll={(e) => {
                                    const index = Math.round(e.target.scrollLeft / e.target.offsetWidth);
                                    if(index !== activeImg) {
                                        setActiveImg(index);
                                    }
                                }}
                            >
                                {productImages.map((img, idx) => (
                                    <div key={idx} className="w-full h-full shrink-0 snap-center relative">
                                        <img 
                                            src={img} 
                                            alt={`${product.name} - ${idx}`} 
                                            className="w-full h-full object-contain mix-blend-multiply transition-transform duration-700 group-hover:scale-105 pointer-events-none" 
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Tags/Badges - Smaller on Mobile */}
                            <div className="absolute top-3 left-3 md:top-6 md:left-6 flex flex-col gap-1.5 md:gap-2 z-20 pointer-events-none">
                                {isOutOfStock && (
                                    <div className="bg-white/90 text-[#C2185B] text-[10px] md:text-[12px] font-bold px-4 py-2 rounded-lg shadow-sm border border-gray-100 uppercase tracking-widest backdrop-blur-sm">
                                        Currently unavailable
                                    </div>
                                )}
                                {isVendorOffline && (
                                    <div className="bg-red-500/90 text-white text-[10px] md:text-[12px] font-bold px-4 py-2 rounded-lg shadow-sm border border-red-400 uppercase tracking-widest backdrop-blur-sm">
                                        Store Offline
                                    </div>
                                )}
                                <div className="bg-white text-gray-900 text-[8px] md:text-[10px] font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-full shadow-md border border-gray-200 w-fit">
                                    New Arrival
                                </div>
                                <div className="bg-black text-white text-[8px] md:text-[10px] font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-full shadow-md w-fit">
                                    Top Rated
                                </div>
                            </div>

                            {/* Rating Badge - Compact on Mobile */}
                            {(product.rating > 0 || product.reviewCount > 0) && (
                                <div className="absolute bottom-3 left-3 md:bottom-6 md:left-6 bg-white/90 backdrop-blur-md px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl flex items-center gap-1.5 md:gap-2 shadow-md md:shadow-xl border border-gray-200 pointer-events-none">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[12px] md:text-[15px] font-bold text-gray-900">{product.rating || 0}</span>
                                        <Star size={11} className="fill-[#D4AF37] text-black md:w-[14px] md:h-[14px]" />
                                    </div>
                                    <div className="w-[1px] h-2.5 md:h-3 bg-gray-200" />
                                    <span className="text-[10px] md:text-[13px] font-bold text-gray-600">
                                        {product.reviewCount >= 1000 ? `${(product.reviewCount / 1000).toFixed(1)}k` : product.reviewCount} reviews
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Thumbnails - All Devices */}
                        {productImages.length > 1 && (
                            <div className="flex flex-row gap-2 md:gap-4 w-full overflow-x-auto py-4 px-2 no-scrollbar snap-x snap-mandatory">
                                {productImages.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleThumbnailClick(idx)}
                                        className={`snap-center w-16 md:w-24 aspect-[3/4] rounded-xl md:rounded-2xl overflow-hidden cursor-pointer transition-all border-2 shrink-0 bg-white ${activeImg === idx ? 'border-black shadow-lg scale-105' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                    >
                                        <img src={img} alt="" className="w-full h-full object-contain mix-blend-multiply p-1" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Product Info */}
                    <div className="flex-1 w-full max-w-2xl">
                        <div className="mb-3 md:mb-6">
                            <div className="flex items-center justify-between mb-1">
                                <h2 className="text-[12px] md:text-[14px] font-black text-gray-900 uppercase tracking-widest">{product.brand}</h2>
                                <div className="flex items-center gap-4">
                                    <button onClick={handleShare} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Share product">
                                        <Share2 size={20} className="text-gray-900" />
                                    </button>
                                </div>
                            </div>
                            <h1 className="text-lg md:text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-2 md:mb-3">{product.name}</h1>

                            {product.campaignType === 'festival' && (
                                <div className="mb-3 flex items-center gap-2 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl w-fit animate-pulse">
                                    <Tag size={14} className="text-rose-600 fill-rose-600/10" />
                                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Festival Offer Applied</span>
                                </div>
                            )}

                            <div className="flex items-center gap-4 mb-2">
                                <div className="flex flex-row items-baseline gap-2">
                                    <span className="text-3xl font-black text-gray-900">
                                        ₹{currentPrice}
                                    </span>
                                    {Number(product.originalPrice || product.mrp) > currentPrice && (
                                        <>
                                            <span className="text-lg text-gray-400 line-through font-medium">
                                                ₹{product.originalPrice || product.mrp}
                                            </span>
                                            <span className="text-emerald-600 font-black text-[10px] bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-tight ml-2">
                                                {`${Math.round(((Number(product.originalPrice || product.mrp) - currentPrice) / Number(product.originalPrice || product.mrp)) * 100)}% OFF`}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-5 italic">
                                Inclusive of all taxes
                            </p>
                        </div>

                        {/* Size Selection */}
                        {sizes.length > 0 && (
                            <div className="mb-4 md:mb-8">
                                <div className="flex justify-between items-end mb-3 md:mb-4">
                                    <h3 className="text-[11px] md:text-[12px] font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wide">
                                        Select Size <Info size={12} className="text-gray-400" />
                                    </h3>
                                    <button
                                        onClick={() => setIsSizeChartOpen(true)}
                                        className="text-[10px] md:text-[11px] font-semibold text-black border-b border-black pb-0.5 hover:text-gray-600 transition-colors"
                                    >
                                        Size Chart
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 md:gap-2.5">
                                    {sizes.map((size) => {
                                        const isSizeOutOfStock = getSizeStock(size) <= 0;
                                        return (
                                            <button
                                                key={size}
                                                onClick={() => setSelectedSize(size)}
                                                className={`min-w-[42px] h-11 md:min-w-[64px] md:h-14 rounded-xl md:rounded-2xl flex flex-col items-center justify-center font-bold transition-all relative ${selectedSize === size
                                                        ? 'bg-black text-white shadow-[0_0_15px_rgba(0,0,0,0.15)] scale-105'
                                                        : isSizeOutOfStock
                                                            ? 'bg-gray-50/50 border border-dashed border-gray-200 text-gray-400'
                                                            : 'bg-gray-50 border border-gray-200 text-gray-900 hover:border-black'
                                                    }`}
                                            >
                                                <span className={isSizeOutOfStock ? 'line-through text-gray-400' : ''}>
                                                    {size}
                                                </span>
                                                {isSizeOutOfStock && (
                                                    <span className={`text-[7px] md:text-[9px] font-black uppercase mt-0.5 ${selectedSize === size ? 'text-white/80' : 'text-red-500'}`}>
                                                        Out
                                                    </span>
                                                )}
                                                {selectedSize === size && !isSizeOutOfStock && (
                                                    <div className="absolute -top-1 -right-1 bg-white text-black rounded-full p-0.5 border-2 border-[#111111]">
                                                        <Check size={8} md:size={10} strokeWidth={4} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                {selectedSize && (
                                    getSizeStock(selectedSize) <= 0 ? (
                                        <p className="mt-3 text-[11px] md:text-[13px] font-bold text-red-500 flex items-center gap-1.5 animate-fadeIn">
                                            <Info size={14} className="text-red-500" /> Sold Out - Size {selectedSize} is currently unavailable
                                        </p>
                                    ) : (
                                        <p className="mt-3 text-[11px] md:text-[13px] font-bold text-emerald-600 flex items-center gap-1.5 animate-fadeIn">
                                            <ShieldCheck size={14} /> Fast shipping for size {selectedSize}
                                        </p>
                                    )
                                )}
                            </div>
                        )}



                        {/* Actions - Inline */}
                        {isVendorOffline && (
                            <div className="mb-4 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-3 animate-pulse">
                                <Info size={16} className="text-red-500" />
                                <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                                    This product currently not deliverable. Store is offline.
                                </p>
                            </div>
                        )}
                        <div className="flex gap-2.5 md:gap-4 mb-4 md:mb-8">
                            {isOutOfStock || isVendorOffline ? (
                                <button
                                    disabled
                                    className="flex-[3] h-12 md:h-14 bg-gray-200 text-gray-400 rounded-xl md:rounded-[18px] font-bold text-[11px] md:text-[13px] flex items-center justify-center shadow-inner cursor-not-allowed uppercase"
                                >
                                    {isVendorOffline
                                        ? "Store Offline"
                                        : (selectedSize && getSizeStock(selectedSize) <= 0)
                                            ? "Sold Out"
                                            : "Currently unavailable"
                                    }
                                </button>
                            ) : (
                                <button
                                    onClick={handleAddToCart}
                                    className="flex-[3] h-12 md:h-14 bg-black text-white rounded-xl md:rounded-[18px] font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 md:gap-3 active:scale-95 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:bg-gray-900"
                                >
                                    <ShoppingCart size={16} md:size={18} />
                                    Add to Cart
                                </button>
                            )}
                            <button
                                onClick={() => toggleWishlist(product)}
                                className={`flex-1 h-12 md:h-14 rounded-xl md:rounded-[18px] font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 transition-all border ${isInWishlist(product?.id)
                                    ? 'bg-black/10 border-black text-black'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 hover:border-black'
                                    }`}
                            >
                                <Heart size={16} md:size={18} className={isInWishlist(product?.id) ? 'fill-[#D4AF37]' : ''} />
                                <span className="hidden md:inline">Wishlist</span>
                            </button>
                        </div>


                        {/* USP Features */}
                        <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4 md:mb-8">
                            <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:p-3.5 bg-gray-50 rounded-xl md:rounded-[20px] border border-gray-100 uppercase tracking-tight">
                                <Truck className="text-black shrink-0" size={16} md:size={20} />
                                <div>
                                    <h4 className="text-[9px] md:text-[11px] font-bold text-gray-900">Fast Delivery</h4>
                                    <p className="text-[8px] font-bold text-gray-400">Within 60 min</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:p-3.5 bg-gray-50 rounded-xl md:rounded-[20px] border border-gray-100 uppercase tracking-tight">
                                <RotateCcw className="text-black shrink-0" size={16} md:size={20} />
                                <div>
                                    <h4 className="text-[9px] md:text-[11px] font-bold text-gray-900">Easy Returns</h4>
                                    <p className="text-[8px] font-bold text-gray-400">24 hours policy</p>
                                </div>
                            </div>
                        </div>

                        {/* Promo Codes / Available Offers */}
                        {promoCodes.length > 0 && (
                            <div className="mb-10 animate-fadeIn overflow-hidden">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-[12px] font-bold uppercase  text-black flex items-center gap-2">
                                        Available Offers <Ticket size={14} className="text-emerald-500" />
                                    </h3>
                                </div>
                                <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x -mx-4 px-4 sm:mx-0 sm:px-0">
                                    {promoCodes.map((promo) => (
                                        <div
                                            key={promo.id}
                                            className="min-w-[240px] bg-gray-50 border border-gray-200 rounded-[24px] p-5 snap-start relative overflow-hidden group hover:shadow-xl transition-all duration-500 border-l-4 border-l-[#D4AF37]"
                                        >
                                            {/* Decorative Background Element */}
                                            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-black/10 rounded-full group-hover:scale-150 transition-transform duration-700 -z-0" />

                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Tag size={12} className="text-black" />
                                                    <span className="text-[10px] font-bold text-black uppercase ">
                                                        {promo.type === 'percentage' ? `${promo.value}% Savings` : `₹${promo.value} Discount`}
                                                    </span>
                                                </div>

                                                <h4 className="text-[16px] font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                    {promo.code}
                                                </h4>

                                                <p className="text-[11px] font-bold text-gray-500 mb-4 line-clamp-1">
                                                    Valid on orders above ₹{promo.minPurchase}
                                                </p>

                                                <button
                                                    onClick={() => copyCode(promo.code)}
                                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase  transition-all flex items-center justify-center gap-2 ${copiedCode === promo.code
                                                        ? 'bg-black text-white border-black'
                                                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200 shadow-lg'
                                                        }`}
                                                >
                                                    {copiedCode === promo.code ? (
                                                        <>
                                                            <Check size={12} strokeWidth={4} />
                                                            Copied!
                                                        </>
                                                    ) : (
                                                        'Copy Code'
                                                    )}
                                                </button>
                                            </div>

                                            {/* Ticket Holes */}
                                            <div className="absolute top-1/2 -left-2 w-4 h-4 bg-white rounded-full border border-gray-200 -translate-y-1/2" />
                                            <div className="absolute top-1/2 -right-2 w-4 h-4 bg-white rounded-full border border-gray-200 -translate-y-1/2" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Details Accordion */}
                        <div className="space-y-1">
                            {[
                                {
                                    id: 'description',
                                    title: 'Product Details',
                                    content: (
                                        <div className="space-y-4">
                                            <p className="text-[14px] text-gray-600 leading-relaxed font-medium">
                                                {product.description || `This premium piece from ${product.brand} showcases exceptional craftsmanship and timeless style. Designed for the modern individual who values both comfort and aesthetics.`}
                                            </p>
                                            {product.tags && product.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-4">
                                                    {product.tags.map(tag => (
                                                        <span key={tag} className="text-[10px] font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full uppercase tracking-wider">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    id: 'specifications',
                                    title: 'Specifications',
                                    content: (
                                        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                            <div>
                                                <h5 className="text-[10px] font-bold text-black/40 uppercase mb-1 flex items-center gap-1.5">
                                                    <Tag size={10} /> Brand
                                                </h5>
                                                <p className="text-[13px] font-bold text-gray-900">{product.brand}</p>
                                            </div>
                                            <div>
                                                <h5 className="text-[10px] font-bold text-black/40 uppercase mb-1 flex items-center gap-1.5">
                                                    <LayoutGrid size={10} /> Category
                                                </h5>
                                                <p className="text-[13px] font-bold text-gray-900">{product.category}</p>
                                            </div>
                                            {product.hsnCode && (
                                                <div>
                                                    <h5 className="text-[10px] font-bold text-black/40 uppercase mb-1">HSN Code</h5>
                                                    <p className="text-[13px] font-bold text-gray-900">{product.hsnCode}</p>
                                                </div>
                                            )}
                                            {product.variants?.attributes && product.variants.attributes.map(attr => (
                                                <div key={attr.name}>
                                                    <h5 className="text-[10px] font-bold text-black/40 uppercase mb-1">{attr.name}</h5>
                                                    <p className="text-[13px] font-bold text-gray-900">{attr.values.join(', ')}</p>
                                                </div>
                                            ))}
                                            {product.warrantyPeriod && (
                                                <div>
                                                    <h5 className="text-[10px] font-bold text-black/40 uppercase mb-1">Warranty</h5>
                                                    <p className="text-[13px] font-bold text-gray-900">{product.warrantyPeriod}</p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    id: 'shipping',
                                    title: 'Shipping & Returns',
                                    content: (
                                        <div className="space-y-4">
                                            <div className="bg-gray-50 border border-black/5 rounded-2xl p-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                                                        <Truck size={14} className="text-white" />
                                                    </div>
                                                    <span className="text-[12px] font-bold text-black uppercase">Instant Delivery</span>
                                                </div>
                                                <p className="text-[13px] font-medium text-gray-600 leading-relaxed pl-11">
                                                    Your order will be delivered within 60 minutes in served locations. Order now for the fastest premium service.
                                                </p>
                                            </div>

                                            <div className="bg-gray-50 border border-black/5 rounded-2xl p-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                                                        <RotateCcw size={14} className="text-white" />
                                                    </div>
                                                    <span className="text-[12px] font-bold text-black uppercase">Returns & Exchanges</span>
                                                </div>
                                                <div className="text-[13px] font-medium text-gray-600 leading-relaxed pl-11 space-y-2">
                                                    <p className="flex items-center gap-2">
                                                        {product.returnable ? (
                                                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[10px] font-bold">RETURNABLE</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded text-[10px] font-bold">NON-RETURNABLE</span>
                                                        )}
                                                        {product.cancelable && (
                                                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[10px] font-bold">CANCELABLE</span>
                                                        )}
                                                    </p>
                                                    <p>
                                                        {product.returnable
                                                            ? `You can return or exchange this item within 24 hours of delivery. Ensure items are unused with tags.`
                                                            : `This item is not eligible for return or exchange unless delivered in a damaged or defective state.`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                            ].map(section => (
                                <div key={section.id} className="border-b border-gray-100/80">
                                    <button
                                        onClick={() => toggleAccordion(section.id)}
                                        className="w-full flex items-center justify-between py-3 md:py-6 text-[12px] md:text-[14px] font-bold text-gray-900 uppercase tracking-wide group"
                                    >
                                        <span className="group-hover:translate-x-1 transition-transform duration-300">{section.title}</span>
                                        <div className={`p-1.5 rounded-full transition-all duration-300 ${openAccordion === section.id ? 'bg-black text-white rotate-180' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100'}`}>
                                            <ChevronDown size={12} md:size={14} />
                                        </div>
                                    </button>
                                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${openAccordion === section.id ? 'max-h-[800px] mb-4 md:mb-8 animate-fadeIn' : 'max-h-0'}`}>
                                        {section.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Product Reviews Section */}
                <ProductReviews
                    productId={id}
                    initialRating={product.rating}
                    initialReviewCount={product.reviewCount}
                />

                {/* Similar Products Section */}
                {similarProducts.length > 0 && (
                    <div className="mt-8 mb-4 border-t border-gray-100/80 pt-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[14px] md:text-[18px] font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                More in {product.category}
                            </h2>
                            <Link to={`/shop?category=${product.category}`} className="text-[10px] md:text-[12px] font-bold text-gray-500 hover:text-black uppercase transition-colors border-b border-gray-300 hover:border-black pb-0.5">
                                View All
                            </Link>
                        </div>
                        <div className="flex overflow-x-auto gap-3 md:gap-4 snap-x snap-mandatory pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                            {similarProducts.map((simProduct) => (
                                <div key={simProduct.id} className="w-[140px] md:w-[200px] flex-shrink-0 snap-center">
                                    <ProductCard product={simProduct} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* Removed sticky bottom actions */}
            {/* Size Chart Modal */}
            <SizeChartModal
                isOpen={isSizeChartOpen}
                onClose={() => setIsSizeChartOpen(false)}
                product={product}
            />

            {/* Added to Cart Success Popup */}
            {showAddedToast && createPortal(
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10001] w-[92%] max-w-[400px] animate-fadeInUp">
                    <div className="bg-white border border-gray-200 p-3 md:p-4 rounded-xl md:rounded-[24px] shadow-2xl flex items-center gap-3 md:gap-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-black rounded-lg md:rounded-2xl flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.1)]">
                            <CheckCircle2 size={20} md:size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-gray-900 text-[12px] md:text-[14px] font-bold uppercase ">Added!</h4>
                            <p className="text-gray-500 text-[10px] md:text-[11px] font-bold line-clamp-1 truncate">Item added to your cart</p>
                        </div>
                        <Link
                            to="/cart"
                            className="bg-black text-white px-3 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-[11px] font-bold uppercase hover:bg-gray-900 transition-colors no-underline whitespace-nowrap"
                        >
                            Checkout
                        </Link>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const SizeChartModal = ({ isOpen, onClose, product }) => {
    if (!isOpen) return null;

    const getChartData = () => {
        const category = (product?.category || '').toLowerCase();
        const division = (product?.division || '').toLowerCase();

        // Size Chart Definitions
        const charts = {
            tops: {
                men: [
                    { size: 'S', chest: '38', length: '27', shoulder: '17', sleeves: '24' },
                    { size: 'M', chest: '40', length: '28', shoulder: '18', sleeves: '24.5' },
                    { size: 'L', chest: '42', length: '29', shoulder: '19', sleeves: '25' },
                    { size: 'XL', chest: '44', length: '30', shoulder: '20', sleeves: '25.5' },
                    { size: 'XXL', chest: '46', length: '31', shoulder: '21', sleeves: '26' },
                ],
                women: [
                    { size: 'XS', bust: '32', length: '22', shoulder: '14', sleeves: '22' },
                    { size: 'S', bust: '34', length: '23', shoulder: '15', sleeves: '22.5' },
                    { size: 'M', bust: '36', length: '24', shoulder: '16', sleeves: '23' },
                    { size: 'L', bust: '38', length: '25', shoulder: '17', sleeves: '23.5' },
                    { size: 'XL', bust: '40', length: '26', shoulder: '18', sleeves: '24' },
                ]
            },
            bottoms: {
                men: [
                    { size: '30', waist: '30', length: '40', hip: '38' },
                    { size: '32', waist: '32', length: '41', hip: '40' },
                    { size: '34', waist: '34', length: '41', hip: '42' },
                    { size: '36', waist: '36', length: '42', hip: '44' },
                    { size: '38', waist: '38', length: '42', hip: '46' },
                ],
                women: [
                    { size: '26', waist: '26', length: '38', hip: '36' },
                    { size: '28', waist: '28', length: '39', hip: '38' },
                    { size: '30', waist: '30', length: '39', hip: '40' },
                    { size: '32', waist: '32', length: '40', hip: '42' },
                    { size: '34', waist: '34', length: '40', hip: '44' },
                ]
            },
            footwear: {
                unisex: [
                    { size: 'UK 6', us: '7', eu: '40', cm: '25' },
                    { size: 'UK 7', us: '8', eu: '41', cm: '26' },
                    { size: 'UK 8', us: '9', eu: '42', cm: '27' },
                    { size: 'UK 9', us: '10', eu: '43', cm: '28' },
                    { size: 'UK 10', us: '11', eu: '44', cm: '29' },
                ]
            }
        };

        // Matching Logic
        const isBottom = /pant|pent|jeans|trouser|short|skirt|legging|pajama|jogger|bottom|lower|cargo|track|bagi/i.test(category + ' ' + (product?.name || ''));
        const isFootwear = /shoe|footwear|sandal|sneaker|flip flop|boot|heel|slipper/i.test(category + ' ' + (product?.name || ''));
        const isWomen = /women|girl|female/i.test(division + ' ' + category);

        if (isFootwear) return charts.footwear.unisex;
        if (isBottom) return isWomen ? charts.bottoms.women : charts.bottoms.men;

        // Default to Tops
        return isWomen ? charts.tops.women : charts.tops.men;
    };

    const sizeData = getChartData();
    const headers = Object.keys(sizeData[0] || {}).map(k => k.charAt(0).toUpperCase() + k.slice(1));

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[5px] animate-fadeIn">
            <div className="bg-white border border-gray-200 w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden relative animate-scaleIn">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-lg font-bold uppercase  text-gray-900">Size Guide</h2>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase ">
                            {product?.division} {product?.category} • Measurements in inches
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition-all active:scale-95"
                    >
                        <X size={20} className="text-gray-900" />
                    </button>
                </div>

                {/* Table Content */}
                <div className="p-6">
                    <div className="overflow-hidden border border-gray-200 rounded-[20px] shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50">
                                    {headers.map((header, idx) => (
                                        <th key={header} className={`px-4 py-3 text-[10px] font-bold uppercase border-b border-gray-200 ${idx === 0 ? 'text-black italic' : 'text-gray-500'}`}>
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {sizeData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        {Object.values(row).map((val, vIdx) => (
                                            <td key={vIdx} className={`px-4 py-4 text-[13px] font-bold ${vIdx === 0 ? 'text-gray-900 italic bg-gray-50' : 'text-gray-600'}`}>
                                                {val}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                        <p className="text-[10px] font-bold text-gray-400 italic leading-relaxed">
                            * These are product measurements. For the perfect fit, we recommend comparing these measurements with a similar item you already own.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-black text-white rounded-[20px] font-bold text-[12px] uppercase  shadow-[0_0_15px_rgba(212,175,55,0.2)] active:scale-95 transition-all"
                    >
                        Got It
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ProductDetailsPage;
