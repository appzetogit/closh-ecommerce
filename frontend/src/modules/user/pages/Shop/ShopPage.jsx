import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategory } from '../../context/CategoryContext';
import { useProductStore } from '../../../../shared/store/productStore';
import { ChevronLeft, ChevronDown, Compass, Loader2, ArrowLeft, Filter, Search, ArrowDownAZ, Check } from 'lucide-react';
import ProductCard from '../../components/ProductCard/ProductCard';
import ProductSkeleton from '../../components/ProductCard/ProductSkeleton';
import { categories as localCategories } from '../../data/index';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const ShopPage = () => {
    const navigate = useNavigate();
    const { activeCategory, setActiveCategory, activeSubCategory, setActiveSubCategory, getCategoryColor } = useCategory();
    const { products, isLoading, fetchPublicProducts } = useProductStore();

    // Pull-to-refresh logic
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const scrollContainerRef = useRef(null);
    const touchStartY = useRef(0);

    const handleTouchStart = (e) => {
        if (scrollContainerRef.current?.scrollTop === 0) {
            touchStartY.current = e.touches[0].clientY;
        } else {
            touchStartY.current = 0;
        }
    };

    const handleTouchMove = (e) => {
        if (touchStartY.current === 0) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - touchStartY.current;

        if (diff > 0 && scrollContainerRef.current?.scrollTop === 0) {
            setPullDistance(Math.min(diff * 0.4, 60)); // Resistance map
            if (e.cancelable) e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (pullDistance > 50) {
            setIsRefreshing(true);
            if (navigator.vibrate) navigator.vibrate(40);

            // Re-fetch simulated
            fetchPublicProducts({ category: activeCategory, limit: 100, sort: 'newest' }).finally(() => {
                setTimeout(() => {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }, 800);
            });
        } else {
            setPullDistance(0);
        }
        touchStartY.current = 0;
    };

    // 3-Level State UI modes
    // Level 1: activeSubCategory === 'All' -> Show Left Sidebar with Subcategories
    // The filter mode (Level 2) has been fully delegated to ProductsPage.jsx
    const isFilterMode = false;

    // Local Filter States
    const [selectedFilters, setSelectedFilters] = useState({
        brand: [],
        size: [],
        fit: [],
        fabric: [],
        pattern: [],
        closureType: [],
        gender: []
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [openFilterSections, setOpenFilterSections] = useState({
        brand: true,
        size: false,
        fit: false,
        fabric: false,
        pattern: false,
        closureType: false,
        gender: false,
    });
    const [sortBy, setSortBy] = useState('Recommended');
    const [isSortOpen, setIsSortOpen] = useState(false);

    const toggleFilterSection = (id) => {
        setOpenFilterSections(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleFilterToggle = (category, value) => {
        setSelectedFilters(prev => {
            const current = prev[category] || [];
            if (current.includes(value)) {
                return { ...prev, [category]: current.filter(item => item !== value) };
            } else {
                return { ...prev, [category]: [...current, value] };
            }
        });
    };

    const clearAllFilters = () => {
        setSelectedFilters({
            brand: [],
            size: [],
            fit: [],
            fabric: [],
            pattern: [],
            closureType: [],
            gender: []
        });
        setSearchQuery('');
    };

    // Fetch deep taxonomy data for current root category
    const currentCategoryData = useMemo(() => {
        let root = activeCategory === 'For You' ? 'Women' : activeCategory;
        const data = localCategories.find(c => c.name.toLowerCase() === root.toLowerCase());
        return data || localCategories[0];
    }, [activeCategory]);

    // Fallback images matching the theme
    const categoryImages = {
        'Women': 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=100&q=80',
        'Men': 'https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?auto=format&fit=crop&w=100&q=80',
        'Beauty': 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=100&q=80',
        'Accessories': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=100&q=80',
        'Footwear': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=100&q=80',
        'Home': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=100&q=80',
        'Travel': 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=100&q=80'
    };

    useEffect(() => {
        // Enforce a valid root category since "For You" doesn't have a structured sidebar
        if (activeCategory === 'For You') {
            setActiveCategory('Women');
        }

        // Fetch products based on Level 1 (Root) or Level 2 (SubCategory)
        const categoryToFetch = isFilterMode ? activeSubCategory : activeCategory;
        if (categoryToFetch && categoryToFetch !== 'For You') {
            fetchPublicProducts({ category: categoryToFetch, limit: 100, sort: 'newest' });
        }

    }, [activeCategory, activeSubCategory, fetchPublicProducts, setActiveCategory, isFilterMode]);

    const handleClose = () => {
        setActiveCategory('For You');
        navigate('/');
    };

    const handleBackToRoot = () => {
        setActiveSubCategory('All');
        clearAllFilters();
    };

    // Extract dynamic options from loaded products
    const availableFilterOptions = useMemo(() => {
        const brands = ['AEROPOSTALE', 'AGARO', 'Adidas', 'Allen Solly', 'American Tourister', 'BONKERS CORNER', 'Bata', 'Bewakoof', 'Catwalk', 'Cetaphil', 'Forever 21', 'H&M', 'Highlander', 'Himalaya', 'Home Centre', 'Lakme', 'Lavie', "Levi's", 'Marks & Spencer', 'Maybelline', 'Monte Carlo', 'Nykaa', 'OUTZIDR', 'Roadster', 'SILISOUL', 'Skybags', 'Slikk X Revolte', 'Snitch', 'The Bear House', 'Titan', 'US Polo Assn', 'Van Heusen', 'WallMantra', 'Wildcraft', 'Zara'];
        const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];
        const fits = ['Regular Fit', 'Slim Fit', 'Oversized', 'Boxy Fit', 'Loose Fit', 'Relaxed Fit'];
        const fabrics = ['Cotton', 'Polyester', 'Denim', 'Silk', 'Linen', 'Wool', 'Fleece', 'Nylon', 'Rayon', 'Viscose'];
        const patterns = ['Solid', 'Printed', 'Striped', 'Checked', 'Graphic', 'Textured', 'Embroidered', 'Colorblocked'];
        const closureTypes = ['Button', 'Zipper', 'Pullover', 'Slip-On', 'Lace-Up', 'Drawstring', 'Elastic'];
        const genders = ['Men', 'Women', 'Unisex', 'Boys', 'Girls'];

        let brandArr = brands;
        if (searchQuery.trim()) {
            brandArr = brandArr.filter(b => b.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        return {
            brand: brandArr,
            size: sizes,
            fit: fits,
            fabric: fabrics,
            pattern: patterns,
            closureType: closureTypes,
            gender: genders,
        };
    }, [searchQuery]);

    const filterCategories = [
        { id: 'brand', title: 'Brand', options: availableFilterOptions.brand },
        { id: 'size', title: 'Size', options: availableFilterOptions.size },
        { id: 'fit', title: 'Fit', options: availableFilterOptions.fit },
        { id: 'fabric', title: 'Fabric', options: availableFilterOptions.fabric },
        { id: 'pattern', title: 'Pattern', options: availableFilterOptions.pattern },
        { id: 'closureType', title: 'Closure Type', options: availableFilterOptions.closureType },
        { id: 'gender', title: 'Gender', options: availableFilterOptions.gender }
    ].filter(cat => cat.options.length > 0); // Only show categories that have options available in the fetched data

    // Derived filtering logic for Level 3
    const displayProducts = useMemo(() => {
        let result = products || [];

        // Apply selected filters
        if (selectedFilters.brand.length > 0) {
            result = result.filter(p => selectedFilters.brand.includes(p.brand));
        }
        if (selectedFilters.size.length > 0) {
            result = result.filter(p => {
                const pSizes = p.sizes ? (Array.isArray(p.sizes) ? p.sizes.map(s => s.name || s) : [p.sizes]) : (p.size ? [p.size] : []);
                return selectedFilters.size.some(size => pSizes.includes(size));
            });
        }
        if (selectedFilters.fit.length > 0) {
            result = result.filter(p => selectedFilters.fit.includes(p.fit));
        }
        if (selectedFilters.fabric.length > 0) {
            result = result.filter(p => selectedFilters.fabric.includes(p.fabric || p.material));
        }
        if (selectedFilters.pattern.length > 0) {
            result = result.filter(p => selectedFilters.pattern.includes(p.pattern));
        }
        if (selectedFilters.closureType.length > 0) {
            result = result.filter(p => selectedFilters.closureType.includes(p.closureType));
        }
        if (selectedFilters.gender.length > 0) {
            result = result.filter(p => selectedFilters.gender.includes(p.gender || p.division));
        }

        // Sorting
        switch (sortBy) {
            case 'Price: Low to High':
                result = [...result].sort((a, b) => Number(a.price) - Number(b.price));
                break;
            case 'Price: High to Low':
                result = [...result].sort((a, b) => Number(b.price) - Number(a.price));
                break;
            case 'Newest Arrivals':
                result = [...result].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                break;
            case 'Discount':
                result = [...result].sort((a, b) => {
                    const discountA = Number(a.originalPrice) ? ((Number(a.originalPrice) - Number(a.price)) / Number(a.originalPrice)) * 100 : 0;
                    const discountB = Number(b.originalPrice) ? ((Number(b.originalPrice) - Number(b.price)) / Number(b.originalPrice)) * 100 : 0;
                    return discountB - discountA;
                });
                break;
            default:
                // 'Recommended' - rely on default query ordering
                break;
        }

        return result;
    }, [products, selectedFilters, sortBy]);

    return (
        <div className="flex w-full h-[calc(100vh-140px)] md:h-[calc(100vh-80px)] overflow-hidden bg-white animate-fade-in-up">
            {/* Left Sidebar Layout */}
            <div className="w-[85px] md:w-[220px] lg:w-[260px] h-full overflow-y-auto scrollbar-hide bg-gray-50 border-r border-gray-100 flex flex-col shrink-0 shadow-[2px_0_15px_rgba(0,0,0,0.5)] transition-all duration-300 relative z-20">

                {/* STATE 1: Sub-Categories Sidebar */}
                {!isFilterMode ? (
                    <div className="flex flex-col py-0 md:py-4 w-full h-full">
                        {/* Go Back Home */}
                        <div className="px-2 md:px-6 mb-4 md:mb-6 pt-3 md:pt-0 sticky top-0 bg-gray-50 z-10 border-b border-white/[0.02]">
                            <button
                                onClick={handleClose}
                                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl bg-gray-50 text-gray-900 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_rgba(212,175,55,0.2)] hover:border-black/50 border border-transparent transition-all group"
                            >
                                <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                                <span className="text-[10px] md:text-[11px] uppercase font-bold  hidden md:inline">Back Home</span>
                                <span className="text-[10px] md:text-[11px] uppercase font-bold  md:hidden">Home</span>
                            </button>
                        </div>

                        {/* Sections & Items Mapping */}
                        <div className="flex flex-col w-full">
                            {currentCategoryData.sections?.map((section, sIdx) => (
                                <div key={sIdx} className="w-full mb-6">
                                    <h3 className="px-3 md:px-6 text-gray-500 text-[10px] md:text-[11px] font-bold uppercase  mb-3 flex items-center gap-2">
                                        {section.title}
                                        <div className="h-[1px] flex-1 bg-gray-50" />
                                    </h3>

                                    <div className="flex flex-col w-full">
                                        {section.items.map((item, iIdx) => {
                                            const isSelected = activeSubCategory === (item.name || item);
                                            // Apply a subtle tinted left border depending on activeCategory
                                            let glowClass = 'border-transparent';
                                            if (isSelected) {
                                                const catLower = activeCategory?.toLowerCase() || '';
                                                if (catLower === 'women' || catLower === 'hello') glowClass = 'border-[#FF4081] bg-white/[0.03] shadow-[inset_2px_0_10px_rgba(255,64,129,0.1)]';
                                                else if (catLower === 'men\'s fashion' || catLower === 'men') glowClass = 'border-[#4FC3F7] bg-white/[0.03] shadow-[inset_2_0_10px_rgba(79,195,247,0.1)]';
                                                else if (catLower === 'beauty') glowClass = 'border-[#F06292] bg-white/[0.03] shadow-[inset_2px_0_10px_rgba(240,98,146,0.1)]';
                                                else if (catLower === 'bottom wear') glowClass = 'border-[#9CCC65] bg-white/[0.03] shadow-[inset_2px_0_10px_rgba(156,204,101,0.1)]';
                                                else if (catLower === 'accessories') glowClass = 'border-[#FFB300] bg-white/[0.03] shadow-[inset_2px_0_10px_rgba(255,179,0,0.1)]';
                                                else glowClass = 'border-black bg-white/[0.03] shadow-[inset_2px_0_10px_rgba(212,175,55,0.1)]';
                                            }

                                            return (
                                                <button
                                                    key={iIdx}
                                                    onClick={() => {
                                                        // Note: We use navigate here directly on item click to hit the new ProductsPage
                                                        navigate(`/products?category=${encodeURIComponent(activeCategory)}&subCategory=${encodeURIComponent(item.name || item)}`);
                                                    }}
                                                    className={`w-full relative px-2 md:px-6 py-4 flex flex-col items-center md:flex-row md:items-center gap-2 md:gap-3 group border-b border-white/[0.02] last:border-0 hover:bg-gray-50 border-l-[3px] transition-all ${glowClass}`}
                                                >
                                                    {/* Mobile Vertical Fallback */}
                                                    <div className={`md:hidden w-[50px] h-[50px] rounded-[16px] overflow-hidden bg-gray-50 flex-shrink-0 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all p-0.5 border ${isSelected ? 'border-gray-1000' : 'border-transparent'}`}>
                                                        <img
                                                            src={getOptimizedImageUrl(item.image || categoryImages[activeCategory], 200)} loading="lazy" decoding="async"
                                                            alt={item.name || item}
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 rounded-[14px]"
                                                        />
                                                    </div>

                                                    <span className={`text-[10px] md:text-[13px] font-semibold text-center md:text-left leading-tight md: truncate w-full group-hover:text-black transition-colors ${isSelected ? 'font-bold text-gray-900' : 'text-gray-900/70'}`}>
                                                        {item.name || item}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* STATE 2: Filters Sidebar */
                    <div className="flex flex-col w-full bg-[#FAFAFA] h-full">
                        {/* Filters Header */}
                        <div className="flex items-center justify-center md:justify-start p-4 md:p-6 bg-white border-b border-black/5 sticky top-0 z-10 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Filter size={16} className="text-black" />
                                <h3 className="text-[12px] md:text-[13px] font-bold text-black uppercase  hidden md:block">Filters</h3>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto pb-20">
                            {/* Dynamic Filters Mapping */}
                            {filterCategories.map((filterCategory, cIdx) => (
                                <div key={cIdx} className="w-full border-b border-black/5 last:border-none">
                                    <div
                                        className={`flex items-center justify-between px-3 md:px-5 py-4 cursor-pointer group transition-colors ${openFilterSections[filterCategory.id] ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-gray-100 hover:text-black'}`}
                                        onClick={() => toggleFilterSection(filterCategory.id)}
                                    >
                                        <h4 className="text-[10px] md:text-[11px] font-bold text-black/70 uppercase  group-hover:text-black">{filterCategory.title}</h4>
                                        <ChevronDown size={14} className={`text-black/40 transition-transform duration-300 ${openFilterSections[filterCategory.id] ? 'rotate-180' : ''}`} />
                                    </div>

                                    {/* Selectable Options List */}
                                    <div className={`transition-all duration-300 overflow-hidden bg-[#FAFAFA] ${openFilterSections[filterCategory.id] ? 'max-h-[300px] overflow-y-auto' : 'max-h-0'}`}>

                                        {/* Search Filter Box (Only for Brands if many) */}
                                        {openFilterSections[filterCategory.id] && filterCategory.id === 'brand' && (
                                            <div className="relative px-3 md:px-5 py-2 sticky top-0 bg-[#FAFAFA] z-10 border-b border-black/5 mb-1">
                                                <Search size={12} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Find..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full bg-white border border-black/5 rounded-md py-1.5 pl-7 pr-2 text-[10px] font-medium text-black focus:outline-none focus:border-black/50 focus:ring-1 focus:ring-black/50 transition-all placeholder:text-gray-400"
                                                />
                                            </div>
                                        )}

                                        <div className="flex flex-col w-full pb-2">
                                            {filterCategory.options.length > 0 ? filterCategory.options.map((option, idx) => {
                                                const isChecked = selectedFilters[filterCategory.id]?.includes(option);
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => handleFilterToggle(filterCategory.id, option)}
                                                        className={`w-full text-left px-3 md:px-5 py-2.5 transition-colors border-l-2 ${isChecked ? 'border-black bg-white' : 'border-transparent hover:bg-white hover:text-black'}`}
                                                    >
                                                        <span className={`text-[10px] md:text-[11px] font-semibold truncate block ${isChecked ? 'font-bold text-black' : 'text-black/60'}`}>
                                                            {option}
                                                        </span>
                                                    </button>
                                                );
                                            }) : (
                                                <p className="text-[10px] font-medium text-black/40 italic px-3 md:px-5 py-2">Empty</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel (Products Grid) */}
            <div
                className="flex-1 h-full overflow-y-auto px-3 md:px-8 pb-24 scroll-smooth relative"
                ref={scrollContainerRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Visual Pull to Refresh Indicator */}
                <div
                    className="absolute left-0 right-0 flex justify-center items-center overflow-hidden transition-all duration-300 z-0 pointer-events-none"
                    style={{ height: `${Math.max(isRefreshing ? 60 : pullDistance, 0)}px`, opacity: pullDistance > 10 ? 1 : 0 }}
                >
                    <div className={`w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center shadow-lg transition-transform ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }}>
                        <Loader2 size={16} className="text-black" />
                    </div>
                </div>

                <div
                    style={{ transform: `translateY(${Math.max(isRefreshing ? 60 : pullDistance, 0)}px)`, transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s ease-out' : 'none' }}
                    className="w-full relative z-10"
                >
                    {/* Header for Right Panel (Mobile Only View & Filters) */}
                    <div className={`flex items-center justify-between sticky top-0 z-10 bg-white/95 backdrop-blur-md py-3 md:py-6 border-b border-gray-100 -mx-3 md:-mx-8 px-3 md:px-8 ${isFilterMode ? 'mb-6' : 'mb-0 hidden md:flex'}`}>
                        {/* Dynamic Title based on State */}
                        {isFilterMode ? (
                            <>
                                <div className="flex items-center gap-3 md:gap-4 truncate">
                                    <button
                                        onClick={handleBackToRoot}
                                        className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-gray-50 border border-gray-200 text-gray-900 shadow-sm hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:text-black hover:border-black/50 transition-all group shrink-0"
                                    >
                                        <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                                    </button>
                                     <div className="flex flex-col truncate pr-2">
                                        <h2 className="text-[16px] md:text-[24px] font-bold text-gray-900 uppercase  leading-none mb-0.5 md:mb-1 truncate">
                                            {activeSubCategory}
                                        </h2>
                                        <span className="text-[9px] md:text-[11px] font-bold text-gray-400 uppercase  flex items-center gap-1.5 truncate">
                                            <span className="hidden md:inline">{activeCategory}</span>
                                            <div className="w-1 h-1 rounded-full bg-black hidden md:block" />
                                            {displayProducts.length} <span className="hidden md:inline">Items</span> Found
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                    {/* Sort Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsSortOpen(!isSortOpen)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 md:py-2 bg-white border border-black/10 rounded-full hover:border-black transition-colors group"
                                        >
                                            <ArrowDownAZ size={12} className="text-black/70 group-hover:text-black" />
                                            <span className="text-[9px] md:text-[10px] font-bold text-black uppercase  hidden md:inline">Sort By:</span>
                                            <span className="text-[10px] md:text-[11px] font-bold text-black truncate max-w-[80px] md:max-w-none">{sortBy}</span>
                                            <ChevronDown size={12} className={`text-black/40 ml-1 transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Sort Options Menu */}
                                        {isSortOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSortOpen(false)} />
                                                <div className="absolute top-full right-0 mt-2 w-48 bg-white/90 backdrop-blur-xl border border-black/5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] py-2 z-50 overflow-hidden animate-fade-in-up">
                                                    {['Recommended', 'Newest Arrivals', 'Price: Low to High', 'Price: High to Low', 'Discount'].map((option) => (
                                                        <button
                                                            key={option}
                                                            onClick={() => { setSortBy(option); setIsSortOpen(false); }}
                                                            className={`w-full text-left px-5 py-3 text-[11px] font-bold uppercase  transition-colors flex items-center justify-between group ${sortBy === option ? 'bg-[#FAFAFA] text-black' : 'font-semibold text-black/60 hover:bg-gray-100 hover:text-black'}`}
                                                        >
                                                            {option}
                                                            {sortBy === option && <Check size={14} className="text-black" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="hidden md:block w-px h-4 bg-black/10 mx-1" />
                                    <button
                                        onClick={clearAllFilters}
                                        className="text-[9px] md:text-[11px] font-bold text-black uppercase  hover:text-black transition-colors whitespace-nowrap"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>

                    {/* Product Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 mt-4 md:mt-6">
                            {Array.from({ length: 8 }).map((_, idx) => (
                                <ProductSkeleton key={idx} />
                            ))}
                        </div>
                    ) : displayProducts.length > 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 mt-4 md:mt-6">
                            {displayProducts.map(product => (
                                <ProductCard key={product.id || product._id} product={product} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-5 bg-gray-50 rounded-[32px] border border-gray-100 p-8 shadow-sm">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center shadow-inner">
                                <Compass size={32} className="text-white/20" />
                            </div>
                            <div>
                                <h3 className="text-[18px] font-bold text-gray-900 mb-2 ">No Discoveries Here</h3>
                                <p className="text-[12px] font-semibold text-gray-500 uppercase  max-w-[250px] mx-auto leading-relaxed">We are still sourcing the finest items for this collection.</p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="mt-4 px-8 py-3 bg-black text-white rounded-full text-[11px] font-bold uppercase  hover:bg-[#b0902d] hover:-translate-y-1 transition-all shadow-[0_10px_30px_rgba(212,175,55,0.2)]"
                            >
                                Explore Global
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShopPage;
