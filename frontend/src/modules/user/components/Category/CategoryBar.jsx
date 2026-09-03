import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useCategory } from '../../context/CategoryContext';
import allImage from '../../../../assets/animations/lottie/image.png';

const CategoryBar = () => {
    const { categories, initialize } = useCategoryStore();
    const { activeCategory, setActiveCategory, getCategoryGradient } = useCategory();
    const location = useLocation();
    const navigate = useNavigate();
    const scrollRef = useRef(null);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const filteredCategories = React.useMemo(() => {
        return categories.filter(cat => 
            (!cat.parentId || cat.parentId === '' || cat.parentId === null) && 
            cat.isActive !== false
        );
    }, [categories]);

    const rootCategories = React.useMemo(() => [
        { _id: 'all', id: 'all', name: 'CLOSH', image: allImage },
        ...filteredCategories
    ], [filteredCategories]);

    const handleCategoryClick = (cat) => {
        setActiveCategory(cat.name);
        
        if (cat.name === 'CLOSH') {
            navigate('/');
            return;
        }

        // If on Home page, only navigate to categories if product-grid is not in DOM (e.g. mobile layout).
        // Otherwise, do not scroll so the user's view isn't abruptly disrupted.
        if (location.pathname === '/' || location.pathname === '/home') {
            setTimeout(() => {
                const grid = document.getElementById('product-grid');
                if (!grid) {
                    navigate('/categories');
                }
            }, 50);
        } else if (location.pathname !== '/categories') {
            navigate('/categories');
        }
    };

    const currentGradient = getCategoryGradient(activeCategory);

    return (
        <motion.div
            initial={false}
            animate={{ background: currentGradient }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="w-full pt-1.5 pb-0 border-b border-gray-100"
        >
            <div 
                ref={scrollRef}
                className="flex overflow-x-auto scrollbar-hide gap-1.5 sm:gap-3 md:gap-6 px-3 sm:px-6 md:px-8 items-end"
            >
                {rootCategories.map((cat) => {
                    const isSelected = activeCategory === cat.name || 
                        ((activeCategory === 'All' || activeCategory === 'CLOSH') && (cat.name === 'CLOSH' || cat.name === 'All'));
                    
                    return (
                        <button
                            key={cat._id || cat.id}
                            onClick={() => handleCategoryClick(cat)}
                            className="relative flex flex-col items-center flex-shrink-0 group px-3 sm:px-4 md:px-5 pt-2 pb-2 focus:outline-none transition-all"
                        >
                            {/* Arched / Oval White Active Tab Background */}
                            {isSelected && (
                                <motion.div
                                    layoutId="activeCategoryArch"
                                    className="absolute inset-0 bg-white rounded-t-full shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-0"
                                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                />
                            )}

                            <div className="relative z-10 flex flex-col items-center">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full p-[2px] transition-transform duration-300 group-hover:scale-105">
                                    <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center p-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
                                        <img
                                            src={cat.image || "https://via.placeholder.com/150"}
                                            alt={cat.name}
                                            className={`w-full h-full object-cover rounded-full transition-transform duration-300 ${isSelected ? 'scale-105' : ''}`}
                                            onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=' + encodeURIComponent(cat.name) }}
                                        />
                                    </div>
                                </div>
                                <span className={`text-[11px] md:text-[12px] mt-1.5 transition-colors duration-200 tracking-tight ${isSelected ? 'font-bold text-gray-900' : 'font-semibold text-gray-600 group-hover:text-gray-900'}`}>
                                    {cat.name}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
            <style dangerouslySetInnerHTML={{ __html: `
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </motion.div>
    );
};

export default CategoryBar;
