import React, { useEffect, useMemo } from 'react';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useCategory as useUiCategory } from '../../context/CategoryContext';
import { useNavigate } from 'react-router-dom';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const CategoryContent = () => {
    const { activeCategory } = useUiCategory();
    const { categories, getCategoriesByParent, getRootCategories, isLoading, initialize } = useCategoryStore();
    const navigate = useNavigate();

    useEffect(() => {
        initialize();
    }, [initialize]);

    // Find the current active root category object
    const activeRoot = useMemo(() => {
        return getRootCategories().find(c => c.name === activeCategory);
    }, [activeCategory, getRootCategories]);

    // Get subcategories of the active root
    const subCategories = useMemo(() => {
        if (!activeRoot) return [];
        return getCategoriesByParent(activeRoot.id);
    }, [activeRoot, getCategoriesByParent]);

    if (isLoading && categories.length === 0) return (
        <div className="flex items-center justify-center p-20 animate-pulse bg-[#FAFAFA]">
            <div className="text-[12px] font-bold uppercase  text-black/40">Syncing Collections...</div>
        </div>
    );

    if (!activeRoot && !isLoading) return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-[#FAFAFA]">
            <p className="text-[12px] font-bold uppercase text-black/40">Select a category to explore</p>
        </div>
    );

    return (
        <div className="pb-24 pt-8 bg-[#FAFAFA] min-h-screen">
            {/* Displaying subcategories as a grid in a single section for now, or group them if needed */}
            <div className="px-6 mx-auto max-w-[1920px]">
                <div className="flex items-end justify-between mb-8 pb-4 border-b border-black/5">
                    <h3 className="text-[20px] md:text-[28px] font-bold text-black uppercase er">
                        {activeRoot.name} Collections
                    </h3>
                </div>

                {subCategories.length === 0 ? (
                    <div className="py-24 text-center bg-gray-500 backdrop-blur-xl rounded-[32px] border border-black/5 shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
                        <p className=" text-[14px] font-bold text-black/40 uppercase mb-6">No sub-collections curated yet</p>
                        <button
                            onClick={() => navigate(`/shop?category=${activeRoot.id}`)}
                            className="px-8 py-3.5 bg-white text-gray-900 text-[11px] font-bold uppercase  rounded-full hover:bg-black hover:text-white hover:shadow-[0_10px_30px_rgba(212,175,55,0.3)] transition-all duration-500 active:scale-95"
                        >
                            View All {activeRoot.name}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 md:gap-6">
                        {subCategories.map((item) => (
                            <div
                                key={item.id}
                                className="flex flex-col group cursor-pointer"
                                onClick={() => navigate(`/products?category=${activeRoot.id}&subCategory=${item.id}`)}
                            >
                                {/* Premium Card Container */}
                                <div className="w-full aspect-[4/5] bg-white rounded-[24px] overflow-hidden mb-4 border border-black/5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] group-hover:border-black/30 group-hover:shadow-[0_15px_35px_rgba(212,175,55,0.15)] transition-all duration-500 relative">

                                    {/* Image with extreme smooth scaling */}
                                    <div className="absolute inset-0 p-1.5 md:p-2">
                                        <div className="w-full h-full rounded-[18px] overflow-hidden relative group-hover:rounded-[14px] transition-all duration-500">
                                            <img
                                                src={getOptimizedImageUrl(item.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop', 200)} loading="lazy" decoding="async"
                                                alt={item.name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] filter contrast-[0.95]"
                                            />
                                            {/* Subdued overlay for cinematic feel */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        </div>
                                    </div>

                                    {/* Elevated Category Title (Hover State) */}
                                    <div className="absolute bottom-4 left-0 w-full text-center opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 px-3 z-10">
                                        <span className="block w-full py-2 bg-white/90 backdrop-blur-md rounded-xl text-[10px] font-bold text-black uppercase shadow-sm">
                                            Explore
                                        </span>
                                    </div>
                                </div>
                                {/* Clean Base Title */}
                                <span className=" text-[11px] md:text-[12px] font-bold text-black/70 text-center uppercase  leading-none px-1 group-hover:text-black transition-colors duration-300">
                                    {item.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CategoryContent;
