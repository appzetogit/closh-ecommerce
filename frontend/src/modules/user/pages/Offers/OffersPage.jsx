import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AccountLayout from '../../components/Profile/AccountLayout';
import { Tag, ChevronDown, ChevronUp, Percent, ArrowLeft, Calendar, ChevronRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { formatPrice, getOptimizedImageUrl } from '../../../../shared/utils/helpers';

const OffersPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const fromPayment = location.state?.from === 'payment';
    const [promoCodes, setPromoCodes] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [expandedTerms, setExpandedTerms] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchCampaigns = async () => {
             try {
                 // Fetch campaigns with their selected products populated
                 const response = await api.get('/campaigns', { params: { withProducts: 'true' } });
                 const data = Array.isArray(response) ? response : (response?.data && Array.isArray(response.data) ? response.data : (response?.data || []));
                 setCampaigns(data);
             } catch (err) {
                 console.error("Failed to fetch campaigns:", err);
             }
        };
        const fetchPromoCodes = async () => {
             try {
                 const response = await api.get('/coupons/available');
                 const data = Array.isArray(response) ? response : (response?.data && Array.isArray(response.data) ? response.data : (response?.data || []));
                 setPromoCodes(data);
             } catch (err) {
                 console.error("Failed to fetch coupons:", err);
             }
        };
        Promise.all([fetchCampaigns(), fetchPromoCodes()]).finally(() => setIsLoading(false));
    }, []);

    const toggleTerms = (id) => {
        setExpandedTerms(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleBack = () => {
        if (fromPayment) {
            navigate('/payment');
        } else {
            navigate('/account');
        }
    };

    // Helper to get discounted price for a product in a campaign
    const getDiscountedPrice = (product, campaign) => {
        const originalPrice = Number(product.originalPrice || product.price) || 0;
        const price = Number(product.price) || 0;
        const discountValue = Number(campaign.discountValue) || 0;
        
        if (discountValue <= 0) return { price, originalPrice: null };
        
        if (campaign.discountType === 'percentage') {
            const discounted = Math.round(originalPrice * (1 - discountValue / 100));
            return { price: discounted, originalPrice };
        } else if (campaign.discountType === 'fixed') {
            const discounted = Math.max(0, originalPrice - discountValue);
            return { price: discounted, originalPrice };
        }
        return { price, originalPrice: null };
    };

    // Get product image
    const getProductImage = (product) => {
        return product?.image || product?.images?.[0] || '';
    };

    // Get brand name from populated or direct field
    const getBrandName = (product) => {
        const name = (product?.brandId && typeof product.brandId === 'object') ? product.brandId.name : (product?.brandName || product?.brand || '');
        return (name && name !== 'AAPZETO' && name !== 'Appzeto') ? name : 'CLOSH';
    };

    // Get vendor name from populated or direct field
    const getVendorName = (product) => {
        if (product?.vendorId && typeof product.vendorId === 'object') return product.vendorId.storeName;
        return product?.vendorName || '';
    };

    return (
        <AccountLayout hideHeader={fromPayment}>
            {fromPayment && (
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={handleBack}
                        className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center active:scale-95 transition-all shadow-lg"
                    >
                        <ArrowLeft size={20} strokeWidth={3} />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold uppercase  text-gray-900">Available Offers</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase ">Select a code for your order</p>
                    </div>
                </div>
            )}

            {!fromPayment && (
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                        <Tag size={20} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold uppercase  text-gray-900">Available Offers</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase ">Festival deals & promo codes</p>
                    </div>
                </div>
            )}

            <div className="space-y-8">
                {/* === Festival / Campaign Offers with Products === */}
                {campaigns.length > 0 && (
                    <div className="space-y-6">
                        {campaigns.map((camp) => {
                            const products = Array.isArray(camp.products) ? camp.products : [];
                            const productCount = Array.isArray(camp.productIds) ? camp.productIds.length : products.length;

                            return (
                                <div key={camp._id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-500">
                                    {/* Campaign Banner Header */}
                                    <div 
                                        onClick={() => navigate(`/sale/${camp.slug}`)}
                                        className="relative h-[140px] overflow-hidden cursor-pointer group"
                                    >
                                        <img 
                                            src={camp.bannerConfig?.image || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&q=80&w=1000'} 
                                            alt={camp.name}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
                                        <div className="absolute inset-0 p-5 flex flex-col justify-center">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Sparkles size={12} className="text-yellow-400" />
                                                <span className="text-white/70 text-[9px] font-black uppercase tracking-[0.2em]">
                                                    {camp.type?.replace('_', ' ') || 'Special Sale'}
                                                </span>
                                            </div>
                                            <h3 className="text-white text-xl md:text-2xl font-black uppercase leading-tight">{camp.name}</h3>
                                            <div className="flex items-center gap-3 mt-2">
                                                {camp.discountValue > 0 && (
                                                    <span className="bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase">
                                                        {camp.discountType === 'percentage' ? `${camp.discountValue}% OFF` : `₹${camp.discountValue} OFF`}
                                                    </span>
                                                )}
                                                <span className="text-white/60 text-[10px] font-bold">
                                                    {productCount} {productCount === 1 ? 'product' : 'products'}
                                                </span>
                                                {camp.endDate && (
                                                    <span className="text-white/50 text-[9px] font-bold flex items-center gap-1">
                                                        <Calendar size={9} /> Until {new Date(camp.endDate).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {/* View All arrow */}
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-white/20 backdrop-blur-md rounded-full p-2">
                                            <ChevronRight size={18} className="text-white" />
                                        </div>
                                    </div>

                                    {/* Products Strip */}
                                    {products.length > 0 && (
                                        <div className="p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Products in this offer</p>
                                                <button 
                                                    onClick={() => navigate(`/sale/${camp.slug}`)}
                                                    className="text-[10px] font-black uppercase tracking-wider text-black hover:text-emerald-600 transition-colors flex items-center gap-1"
                                                >
                                                    View All <ChevronRight size={12} />
                                                </button>
                                            </div>
                                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                                                {products.slice(0, 8).map((product) => {
                                                    const { price, originalPrice } = getDiscountedPrice(product, camp);
                                                    const image = getProductImage(product);
                                                    const brand = getBrandName(product) || getVendorName(product);
                                                    const productId = product._id || product.id;

                                                    return (
                                                        <Link
                                                            key={productId}
                                                            to={`/product/${productId}`}
                                                            className="flex-shrink-0 w-[130px] group/card"
                                                        >
                                                            {/* Product Image */}
                                                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-2">
                                                                {image ? (
                                                                    <img 
                                                                        src={getOptimizedImageUrl(image, 300)} loading="lazy" decoding="async" 
                                                                        alt={product.name}
                                                                        className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                                        <Tag size={24} />
                                                                    </div>
                                                                )}
                                                                {/* Discount badge */}
                                                                {camp.discountValue > 0 && (
                                                                    <div className="absolute top-1.5 left-1.5 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md">
                                                                        {camp.discountType === 'percentage' ? `${camp.discountValue}%` : `₹${camp.discountValue}`} OFF
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Product Info */}
                                                            <div className="space-y-0.5">
                                                                {brand && (
                                                                    <p className="text-[9px] font-black uppercase text-gray-900 tracking-tight truncate">{brand}</p>
                                                                )}
                                                                <p className="text-[9px] text-gray-500 font-medium truncate leading-tight">{product.name}</p>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] font-bold text-gray-900">
                                                                        {formatPrice(price)}
                                                                    </span>
                                                                    {originalPrice && originalPrice > price && (
                                                                        <span className="text-[9px] text-gray-400 line-through">
                                                                            {formatPrice(originalPrice)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    );
                                                })}
                                                {/* View More card */}
                                                {products.length > 8 && (
                                                    <button
                                                        onClick={() => navigate(`/sale/${camp.slug}`)}
                                                        className="flex-shrink-0 w-[130px] aspect-[3/4] rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:bg-gray-100 transition-colors group/more"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center group-hover/more:bg-black group-hover/more:text-white transition-all">
                                                            <ChevronRight size={18} />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-gray-500">+{products.length - 8} more</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Empty products state */}
                                    {products.length === 0 && (
                                        <div className="p-4 text-center">
                                            <p className="text-xs text-gray-400 font-medium">Products coming soon</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* === Promo Codes Section === */}
                {(promoCodes.length > 0 || campaigns.length > 0) && (
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-500 mb-4 px-1">Promo Codes</h3>
                )}
                {promoCodes.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {promoCodes.map((promo) => (
                            <div key={promo._id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group">
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4 flex-col sm:flex-row gap-4">
                                        <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                                            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                                                <Percent size={22} strokeWidth={3} />
                                            </div>
                                            <div className="border-2 border-dashed border-gray-300 rounded-xl px-4 py-2 bg-white flex flex-col items-center flex-1 sm:flex-initial">
                                                <span className="font-black text-lg text-gray-900 uppercase tracking-tighter">{promo.code}</span>
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-auto">
                                            {fromPayment ? (
                                                <button
                                                    onClick={() => {
                                                        navigate('/payment', { state: { ...location.state, appliedCode: promo.code } });
                                                        toast.success(`Applying ${promo.code}...`);
                                                    }}
                                                    className="w-full sm:w-auto bg-emerald-600 text-white px-8 py-3 rounded-xl font-black text-[11px] hover:bg-emerald-700 transition-all uppercase shadow-lg active:scale-95 tracking-widest"
                                                >
                                                    Apply Code
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(promo.code);
                                                        toast.success('Code copied!');
                                                    }}
                                                    className="w-full sm:w-auto bg-black text-white px-8 py-3 rounded-xl font-black text-[11px] hover:bg-gray-800 transition-all uppercase shadow-lg active:scale-95 tracking-widest"
                                                >
                                                    Copy Code
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-[14px] md:text-[16px] font-black text-gray-900 uppercase tracking-tight leading-tight">
                                            {promo.type === 'percentage' ? `${promo.discount || promo.value}% OFF` : `₹${promo.discount || promo.value} OFF`} ON MIN PURCHASE: ₹{promo.minOrderValue || promo.minPurchase || 0}
                                        </h3>
                                        <p className="text-gray-500 text-[12px] md:text-[13px] font-bold leading-relaxed uppercase tracking-wide opacity-70">
                                            {promo.type === 'percentage'
                                                ? `Get ${promo.discount || promo.value}% off. Max discount ₹${promo.maxDiscount || 'unlimited'}.`
                                                : `Get a flat ₹${promo.discount || promo.value} discount.`
                                            }
                                        </p>
                                        <p className="text-emerald-600 text-[11px] font-black pt-2 flex items-center gap-2 uppercase tracking-widest">
                                            <Tag size={14} strokeWidth={3} /> Valid until {new Date(promo.expiresAt || promo.endDate || promo.expiryDate).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-gray-50 bg-[#fafafa]/50">
                                    <button
                                        onClick={() => toggleTerms(promo._id)}
                                        className="w-full py-3.5 flex items-center justify-center gap-2 text-gray-500 text-[12px] font-bold uppercase  hover:text-gray-900 transition-all"
                                    >
                                        Terms & Conditions {expandedTerms[promo._id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {expandedTerms[promo._id] && (
                                        <div className="px-6 pb-6 animate-fadeInUp">
                                            <ul className="space-y-2 text-[12px] text-gray-500 list-disc pl-4 font-medium italic">
                                                <li>Minimum purchase of ₹{promo.minOrderValue || promo.minPurchase || 0} required.</li>
                                                <li>Offer valid until {new Date(promo.expiresAt || promo.endDate).toLocaleDateString()}.</li>
                                                <li>{promo.usageLimit === -1 ? 'Unlimited usage per user.' : `Limited to ${promo.usageLimit} uses.`}</li>
                                                <li>Offer cannot be clubbed with other coupon codes.</li>
                                                <li>CLOSH reserves the right to withdraw the offer without prior notice.</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    campaigns.length === 0 && (
                        <div className="bg-white rounded-[32px] p-12 border-2 border-dashed border-gray-100 flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6">
                                <Tag size={40} className="text-gray-200" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 uppercase  mb-2">No active offers</h3>
                            <p className="text-gray-400 text-[13px] font-medium max-w-[250px]">Check back later for exciting discounts and promo codes!</p>
                        </div>
                    )
                )}
            </div>
        </AccountLayout>
    );
};

export default OffersPage;
