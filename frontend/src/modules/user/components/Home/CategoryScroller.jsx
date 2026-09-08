import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import LazyImage from '../../../../shared/components/LazyImage';
import HomeSection from './HomeSection';

/**
 * "Shop by category": horizontally scrolling portrait tiles with the name
 * underneath, matching the reference's tall-card treatment.
 */
const CategoryScroller = () => {
    const navigate = useNavigate();
    const { categories, initialize } = useCategoryStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

    const items = useMemo(
        () => categories.filter((c) => !c.parentId && c.isActive !== false && c.image),
        [categories]
    );

    if (items.length === 0) return null;

    return (
        <HomeSection title="Shop by category" viewAllTo="/categories">
            <div className="-mx-4 md:mx-0">
                <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide px-4 md:px-0 pb-1 snap-x snap-mandatory">
                    {items.map((cat) => (
                        <button
                            key={cat.id || cat._id}
                            onClick={() => navigate(`/category/${cat.id || cat._id}`)}
                            className="group shrink-0 w-[112px] md:w-[160px] snap-start text-left active:scale-[0.98] transition-transform"
                        >
                            <div className="relative w-full aspect-[3/4] overflow-hidden rounded-xl md:rounded-2xl bg-gray-100">
                                <LazyImage
                                    src={cat.image}
                                    alt={cat.name}
                                    width={320}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                            </div>
                            <p className="mt-1.5 text-[11px] md:text-[13px] font-bold text-gray-800 text-center truncate">
                                {cat.name}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </HomeSection>
    );
};

export default CategoryScroller;
