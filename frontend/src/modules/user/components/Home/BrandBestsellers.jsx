import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrandStore } from '../../../../shared/store/brandStore';
import LazyImage from '../../../../shared/components/LazyImage';
import HomeSection from './HomeSection';

/**
 * "Bestsellers at CLOSH": 3-up brand cards. Brands carry a logo rather than a
 * lifestyle photo, so the logo sits on a soft tinted panel with the name on a
 * dark bar beneath — same silhouette as the reference cards.
 */
const BrandBestsellers = ({ limit = 6 }) => {
    const navigate = useNavigate();
    const { brands, initialize } = useBrandStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

    const items = useMemo(
        () => brands
            .filter((b) => b.isActive !== false && b.logo && b.name)
            .slice(0, limit),
        [brands, limit]
    );

    if (items.length < 3) return null;

    return (
        <HomeSection title="Bestsellers at CLOSH" viewAllTo="/products">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 md:gap-4">
                {items.map((brand) => (
                    <button
                        key={brand.id || brand._id}
                        onClick={() => navigate(`/products?brand=${encodeURIComponent(brand.name)}`)}
                        className="group flex flex-col overflow-hidden rounded-xl md:rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-left active:scale-[0.98] transition-transform"
                    >
                        <div className="relative w-full aspect-[4/5] flex items-center justify-center bg-[#F6F6F8] p-4 md:p-6">
                            <LazyImage
                                src={brand.logo}
                                alt={brand.name}
                                width={240}
                                className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
                            />
                        </div>
                        <div className="w-full bg-gray-900 text-white text-[9px] md:text-[11px] font-black uppercase tracking-wide px-1.5 py-1.5 md:py-2 text-center truncate">
                            {brand.name}
                        </div>
                    </button>
                ))}
            </div>
        </HomeSection>
    );
};

export default BrandBestsellers;
