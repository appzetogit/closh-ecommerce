import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bannerCategories, secondaryBannerCategories } from '../../data';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useCategory } from '../../context/CategoryContext';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const CategoryBanners = () => {
    const { categories, initialize } = useCategoryStore();
    const { setActiveCategory } = useCategory();
    const navigate = useNavigate();

    useEffect(() => {
        initialize();
    }, [initialize]);

    // Filter active categories
    const activeCategories = categories.filter(c => c.isActive);

    const handleCategoryClick = (catName) => {
        setActiveCategory(catName);
        setTimeout(() => {
            const grid = document.getElementById('product-grid');
            if (grid) {
                grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 50); // Small timeout to allow state to settle
    };

    return (
        <div className="py-5 md:py-8 bg-white border-b border-gray-50">
            <div className="px-4 md:px-5 mx-auto max-w-[1600px]">
                {/* Dynamic Categories Row */}
                <div className="flex overflow-x-auto scrollbar-hide md:grid md:grid-cols-6 gap-4 sm:gap-6 md:gap-8 pb-2">
                    {activeCategories.map((category) => (
                        <div
                            key={category.id}
                            onClick={() => handleCategoryClick(category.name)}
                            className="flex flex-col items-center cursor-pointer transition-all group min-w-[76px] sm:min-w-[84px] md:min-w-0 flex-shrink-0"
                        >
                            <div className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-full p-[2px] bg-white shadow-[0_6px_16px_rgba(0,0,0,0.12)] mb-2 md:mb-3">
                                <div className="w-full h-full rounded-full overflow-hidden bg-gray-100">
                                    <img
                                        src={getOptimizedImageUrl(category.image || 'https://placehold.co/150?text=' + category.name, 150)} loading="lazy" decoding="async"
                                        alt={category.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        onError={(e) => { e.target.src = 'https://placehold.co/150?text=' + category.name }}
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] sm:text-xs md:text-sm font-semibold text-center text-gray-600 line-clamp-1">{category.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CategoryBanners;
