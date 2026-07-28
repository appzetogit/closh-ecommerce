import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import ProductCard from '../ProductCard/ProductCard';
import { useProductStore } from '../../../../shared/store/productStore';
import { useCategory } from '../../context/CategoryContext';

const ProductGrid = () => {
    const navigate = useNavigate();
    const { products, isLoading, fetchPublicProducts } = useProductStore();
    const { activeCategory, getCategoryColor } = useCategory();

    useEffect(() => {
        if (activeCategory === 'All' || activeCategory === 'CLOSH') {
            fetchPublicProducts({ limit: 100, sort: 'newest', diversify: true });
        } else if (activeCategory === 'For You') {
            fetchPublicProducts({ limit: 12, sort: 'newest' });
        } else {
            fetchPublicProducts({ division: activeCategory, limit: 300 });
        }
    }, [activeCategory, fetchPublicProducts]);

    const displayProducts = products.length > 0 ? products : [];

    const dynamicTitle = activeCategory === 'For You' ? 'New Drops' : (activeCategory === 'All' || activeCategory === 'CLOSH') ? 'New Arrivals' : `${activeCategory} Collection`;
    const themeColor = getCategoryColor(activeCategory) || '#111111';

    const getGridBadgeTheme = (categoryName) => {
        const name = categoryName?.toLowerCase() || '';
        // Returning dark premium badges with category-color tinted text, borders, and glows
        if (name === 'hello' || name === 'women') return 'bg-white text-[#FF4081] border border-[#FF4081]/30 shadow-[0_0_15px_rgba(255,64,129,0.15)]';
        if (name === 'men\'s fashion' || name === 'mens' || name === 'men') return 'bg-white text-[#29B6F6] border border-[#29B6F6]/30 shadow-[0_0_15px_rgba(41,182,246,0.15)]';
        if (name === 'bottom wear') return 'bg-white text-[#8BC34A] border border-[#8BC34A]/30 shadow-[0_0_15px_rgba(139,195,74,0.15)]';
        if (name === 'beauty') return 'bg-white text-[#F06292] border border-[#F06292]/30 shadow-[0_0_15px_rgba(240,98,146,0.15)]';
        if (name === 'accessories') return 'bg-white text-[#FFCA28] border border-[#FFCA28]/30 shadow-[0_0_15px_rgba(255,202,40,0.15)]';
        return 'bg-white text-gray-900 border border-transparent shadow-[0_4px_15px_rgba(0,0,0,0.1)]';
    };

    const badgeTheme = getGridBadgeTheme(activeCategory);

    return (
        <section id="product-grid" className="py-4 md:py-8 bg-[#FAFAFA] transition-colors duration-500">
            <div className="max-w-[1600px] mx-auto px-3 sm:px-4 md:px-8">
                <div className="flex flex-row justify-between items-end mb-4 md:mb-5 gap-3 px-0.5">
                    <div className="flex flex-col flex-1 min-w-0">
                        <h2 className="text-[14px] sm:text-[16px] md:text-[32px] font-black uppercase tracking-tight text-gray-900 leading-none whitespace-nowrap truncate">
                            {dynamicTitle}
                        </h2>
                        <div className="w-8 md:w-10 h-[3px] md:h-1 bg-black mt-1.5 md:mt-3 shrink-0" />
                    </div>
                    <button className="text-gray-400 font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:text-black transition-colors flex items-center gap-1 group mb-0.5 shrink-0 whitespace-nowrap" onClick={() => navigate('/shop')}>
                        View All <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {isLoading && displayProducts.length === 0 ? (
                    <div className="premium-product-grid">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex flex-col gap-2">
                                <div className="aspect-[3/4] bg-gray-100 animate-pulse rounded-xl" />
                                <div className="h-3 w-2/3 bg-gray-100 animate-pulse" />
                                <div className="h-3 w-1/3 bg-gray-100 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="premium-product-grid">
                        {displayProducts.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}

                {!isLoading && displayProducts.length === 0 && (
                    <div className="py-12 text-center">
                        <p className="text-gray-400 font-bold uppercase  text-xs">No new drops found</p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default ProductGrid;
