import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCartStore } from '../../../shared/store/useStore';
import { useWishlistStore } from '../../../shared/store/wishlistStore';
import { useAuthStore } from '../../../shared/store/authStore';
import { useCategoryStore } from '../../../shared/store/categoryStore';
import api from '../../../shared/utils/api';
import {
    Filter, X, ChevronDown, Star, Search, ArrowLeft, Heart, ShoppingCart, Check, SlidersHorizontal, ChevronRight
} from 'lucide-react';
import { useMemo } from 'react';
import { getOptimizedImageUrl } from "../../../shared/utils/helpers";

const ProductsPage = () => {
    const { addItem: addToCart } = useCartStore();
    const { addItem: addToWishlist, removeItem: removeFromWishlist, isInWishlist } = useWishlistStore();
    const { isAuthenticated } = useAuthStore();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);

    // Filters
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isGenderOpen, setIsGenderOpen] = useState(false);
    const [selectedSort, setSelectedSort] = useState('newest');
    const [searchValue, setSearchValue] = useState(searchParams.get('search') || searchParams.get('q') || '');
    const [selectedCategory, setSelectedCategory] = useState(searchParams.get('cid') || searchParams.get('category') || '');
    const [selectedBrand, setSelectedBrand] = useState(searchParams.get('brand') || '');

    const { categories: allCategories, initialize: initCategories } = useCategoryStore();

    // Fetch categories & brands
    useEffect(() => {
        initCategories();
        api.get('/brands/all').then(res => {
            const list = res?.data || res || [];
            setBrands(list || []);
        }).catch(() => {});
    }, [initCategories]);

    // Sync state with URL params on change
    useEffect(() => {
        const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
        if (urlSearch !== searchValue) {
            setSearchValue(urlSearch);
            setPage(1);
        }
    }, [searchParams]);


    // Resolve Names to IDs if cid is missing
    useEffect(() => {
        if (allCategories.length > 0 && !searchParams.get('cid')) {
            const subName = searchParams.get('subcategory');
            const catName = searchParams.get('category');
            const divName = searchParams.get('division');
            
            const targetName = subName || catName || divName;
            if (targetName) {
                const matched = allCategories.find(c => 
                    c.name.toLowerCase().replace(/\s+/g, '+') === targetName.toLowerCase() ||
                    c.name.toLowerCase() === targetName.toLowerCase()
                );
                if (matched) setSelectedCategory(matched.id || matched._id);
            }
        }
    }, [allCategories, searchParams]);

    // Calculate category hierarchy for breadcrumbs
    const categoryPath = useMemo(() => {
        if (!selectedCategory || allCategories.length === 0) return [];
        const path = [];
        let current = allCategories.find(c => String(c.id || c._id) === String(selectedCategory));
        
        while (current) {
            path.unshift(current);
            const parentId = typeof current.parentId === 'object' 
                ? (current.parentId?._id || current.parentId?.id) 
                : current.parentId;
                
            current = parentId ? allCategories.find(c => String(c.id || c._id) === String(parentId)) : null;
        }
        return path;
    }, [selectedCategory, allCategories]);

    // Fetch products
    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoading(true);
            try {
                const params = { page, limit: 20, sort: selectedSort };
                if (searchValue) params.search = searchValue;
                if (selectedCategory) params.category = selectedCategory;
                if (selectedBrand) params.brand = selectedBrand;

                console.log("Fetching products with params:", params);

                const res = await api.get('/products', { params });
                console.log("Products response:", res?.data || res);
                
                // Extremely robust data extraction
                const apiData = res?.data || res || {};
                const productsList = Array.isArray(apiData.products) ? apiData.products : (Array.isArray(res) ? res : []);
                const itemsCount = apiData.total !== undefined ? apiData.total : productsList.length;
                
                setProducts(productsList);
                setTotal(itemsCount);
                setPages(apiData.pages || 1);
            } catch (err) {
                console.error("Fetch products failed:", err);
                setProducts([]);
                setTotal(0);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
    }, [page, selectedSort, searchValue, selectedCategory, selectedBrand]);

    const sortOptions = [
        { value: 'newest', label: 'Newest First' },
        { value: 'price-asc', label: 'Price: Low to High' },
        { value: 'price-desc', label: 'Price: High to Low' },
        { value: 'popular', label: 'Popularity' },
        { value: 'rating', label: 'Top Rated' },
    ];

    const handleToggleWishlist = (product) => {
        const id = product._id || product.id;
        if (isInWishlist(id)) {
            removeFromWishlist(id);
        } else {
            addToWishlist({ ...product, id });
        }
    };

    const handleAddToCart = (product) => {
        addToCart({
            id: product._id || product.id,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice || product.price,
            image: Array.isArray(product.images) ? product.images[0] : product.image,
            images: product.images,
            vendorId: product.vendorId?._id || product.vendorId,
            vendorName: product.vendorId?.storeName || 'Store',
            stockQuantity: product.stockQuantity,
            quantity: 1,
        });
    };

    const clearFilters = () => {
        setSelectedCategory('');
        setSelectedBrand('');
        setSearchValue('');
        setSelectedSort('newest');
        setPage(1);
    };

    return (
        <div className="bg-white min-h-screen pb-20">
            {/* Header */}
            <div className="sticky top-0 bg-white/80 backdrop-blur-md z-[60] border-b border-gray-100/50">
                <div className="container mx-auto flex items-center gap-3 px-4 py-3">
                    <button className="p-2 -ml-2 rounded-full active:scale-90 transition-transform shrink-0" onClick={() => navigate(-1)}>
                        <ArrowLeft size={22} className="text-black" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col">
                            <h1 className="text-[14px] font-black uppercase tracking-tight line-clamp-1 text-gray-900">
                                {selectedCategory 
                                    ? (allCategories.find(c => String(c.id || c._id) === String(selectedCategory))?.name || 'Category') 
                                    : 'Discover'}
                            </h1>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{total} Items</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button className="p-2 bg-gray-50 rounded-full text-gray-500 active:scale-90 transition-transform" onClick={() => navigate('/categories')}>
                            <SlidersHorizontal size={18} />
                        </button>
                        <button className="p-2.5 bg-black text-white rounded-full shadow-lg shadow-black/10 active:scale-95 transition-transform" onClick={() => setIsFilterOpen(true)}>
                            <Search size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6">
                {/* Hierarchical Breadcrumbs */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
                    <button 
                        onClick={() => { setSelectedCategory(''); setSearchValue(''); setPage(1); }}
                        className={`shrink-0 text-[11px] font-bold uppercase transition-all px-3 py-1.5 rounded-full border ${!selectedCategory ? 'bg-black text-white border-black' : 'text-gray-400 border-gray-100 hover:border-gray-200'}`}
                    >
                        All
                    </button>
                    
                    {categoryPath.map((cat, idx) => (
                        <React.Fragment key={cat.id || cat._id}>
                            <ChevronRight size={12} className="text-gray-300 shrink-0" />
                            <button 
                                onClick={() => { setSelectedCategory(cat.id || cat._id); setSearchValue(''); setPage(1); }}
                                className={`shrink-0 text-[11px] font-bold uppercase transition-all px-3 py-1.5 rounded-full border ${idx === categoryPath.length - 1 ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'text-gray-600 border-gray-100 hover:border-gray-200'}`}
                            >
                                {cat.name}
                            </button>
                        </React.Fragment>
                    ))}

                    {selectedBrand && (
                         <>
                            <div className="w-px h-3 bg-gray-200 mx-1 shrink-0" />
                            <button 
                                onClick={() => { setSelectedBrand(''); setPage(1); }}
                                className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold uppercase bg-gray-50 text-gray-900 px-3 py-1.5 rounded-full border border-gray-100"
                            >
                                Brand: {brands.find(b => b._id === selectedBrand)?.name} <X size={10} />
                            </button>
                         </>
                    )}

                    {searchValue && (
                        <>
                            <div className="w-px h-3 bg-gray-200 mx-1 shrink-0" />
                            <button 
                                onClick={() => { setSearchValue(''); setPage(1); }}
                                className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold uppercase bg-gray-50 text-gray-900 px-3 py-1.5 rounded-full border border-gray-100"
                            >
                                Search: {searchValue} <X size={10} />
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between mb-4">
                    <p className="text-[12px] font-bold text-gray-400 uppercase">
                        {total} Products Found
                    </p>
                    {(selectedCategory || selectedBrand || searchValue) && (
                        <button onClick={clearFilters} className="text-[11px] font-bold text-red-500 uppercase hover:underline">
                            Clear All
                        </button>
                    )}
                </div>

                <div className="flex gap-8">
                    {/* Desktop Sidebar Filters */}
                    <aside className="hidden lg:block w-[240px] shrink-0">
                        <div className="sticky top-20 space-y-6">
                            <h3 className="text-sm font-bold uppercase flex items-center gap-2">
                                <Filter size={16} /> Filters
                            </h3>

                            {/* Categories */}
                            <div>
                                <h4 className="text-[12px] font-bold uppercase text-gray-500 mb-3">Category</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    <button
                                        onClick={() => { setSelectedCategory(''); setPage(1); }}
                                        className={`block w-full text-left text-[13px] px-3 py-2 rounded-lg font-bold transition-colors ${!selectedCategory ? 'bg-black text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                                    >
                                        All Categories
                                    </button>
                                    {allCategories.filter(c => !c.parentId).map(cat => (
                                        <button
                                            key={cat._id || cat.id}
                                            onClick={() => { setSelectedCategory(cat._id || cat.id); setPage(1); }}
                                            className={`block w-full text-left text-[13px] px-3 py-2 rounded-lg font-bold transition-colors ${selectedCategory === cat._id || selectedCategory === cat.id ? 'bg-black text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                                        >
                                            {cat.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Brands */}
                            <div>
                                <h4 className="text-[12px] font-bold uppercase text-gray-500 mb-3">Brand</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    <button
                                        onClick={() => { setSelectedBrand(''); setPage(1); }}
                                        className={`block w-full text-left text-[13px] px-3 py-2 rounded-lg font-bold transition-colors ${!selectedBrand ? 'bg-black text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                                    >
                                        All Brands
                                    </button>
                                    {brands.map(brand => (
                                        <button
                                            key={brand._id}
                                            onClick={() => { setSelectedBrand(brand._id); setPage(1); }}
                                            className={`block w-full text-left text-[13px] px-3 py-2 rounded-lg font-bold transition-colors ${selectedBrand === brand._id ? 'bg-black text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                                        >
                                            {brand.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sort */}
                            <div>
                                <h4 className="text-[12px] font-bold uppercase text-gray-500 mb-3">Sort By</h4>
                                <div className="space-y-1">
                                    {sortOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { setSelectedSort(opt.value); setPage(1); }}
                                            className={`block w-full text-left text-[13px] px-3 py-2 rounded-lg font-bold transition-colors ${selectedSort === opt.value ? 'bg-black text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Product Grid */}
                    <div className="flex-1">
                        {isLoading ? (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="aspect-[3/4] bg-gray-100 rounded-2xl mb-3" />
                                        <div className="h-3 bg-gray-100 rounded w-2/3 mb-2" />
                                        <div className="h-4 bg-gray-100 rounded w-1/2" />
                                    </div>
                                ))}
                            </div>
                        ) : products.length > 0 ? (
                            <>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8">
                                    {products.map((product) => {
                                        const id = product._id || product.id;
                                        const imageUrl = Array.isArray(product.images) ? product.images[0] : (product.image || '');
                                        const sellingPrice = product.price || 0;
                                        const originalPrice = product.originalPrice || product.price || 0;
                                        const hasDiscount = originalPrice > sellingPrice;
                                        const discountPercent = hasDiscount ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;

                                        return (
                                            <div
                                                key={id}
                                                className="group cursor-pointer flex flex-col"
                                                onClick={() => navigate(`/product/${id}`)}
                                            >
                                                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden mb-3 bg-white border border-gray-100 group-hover:shadow-lg transition-all duration-300">
                                                    <img
                                                        src={getOptimizedImageUrl(imageUrl, 300)} loading="lazy" decoding="async"
                                                        alt={product.name}
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                        onError={(e) => { e.target.src = 'https://placehold.co/300x400/f3f4f6/9ca3af?text=No+Image'; }}
                                                    />

                                                    {/* Quick actions */}
                                                    <div className="absolute top-2 left-2 flex gap-2 z-10">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                                                            className="w-9 h-9 bg-black/80 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all hover:bg-black"
                                                        >
                                                            <ShoppingCart size={15} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleWishlist(product); }}
                                                            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${isInWishlist(id) ? 'bg-red-500 text-white' : 'bg-white text-black'}`}
                                                        >
                                                            <Heart size={15} className={isInWishlist(id) ? 'fill-white' : ''} />
                                                        </button>
                                                    </div>

                                                    {hasDiscount && (
                                                        <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
                                                            {discountPercent}% OFF
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="px-1">
                                                    {product.vendorId?.storeName && (
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{product.vendorId.storeName}</p>
                                                    )}
                                                    <h3 className="text-[13px] font-bold text-gray-800 leading-tight line-clamp-1 mb-1">{product.name}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[14px] font-bold text-black">₹{sellingPrice}</span>
                                                        {hasDiscount && (
                                                            <span className="text-[11px] font-bold text-gray-400 line-through">₹{originalPrice}</span>
                                                        )}
                                                    </div>
                                                    {product.rating > 0 && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <Star size={12} className="fill-amber-400 text-amber-400" />
                                                            <span className="text-[11px] font-bold text-gray-500">{product.rating.toFixed(1)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination */}
                                {pages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-10">
                                        {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 10).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => setPage(p)}
                                                className={`w-10 h-10 rounded-xl text-[13px] font-bold transition-all ${page === p ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-center animate-fadeIn">
                                <div className="relative mb-8">
                                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center">
                                        <Search size={40} className="text-gray-200" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-red-500">
                                        <X size={16} strokeWidth={3} />
                                    </div>
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tighter mb-2 text-gray-900">No Matches Found</h3>
                                <p className="text-gray-400 text-[13px] font-bold uppercase max-w-[280px] leading-relaxed mb-10">
                                    Adjust your filters or search query to discover more exclusive pieces.
                                </p>
                                <button
                                    onClick={clearFilters}
                                    className="px-10 py-4 bg-gradient-to-br from-gray-900 to-gray-700 text-white text-[12px] font-black uppercase rounded-full active:scale-95 transition-all shadow-xl shadow-gray-200 tracking-widest"
                                >
                                    Reset Filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Slikk-style Floating Bottom Pill Bar */}
            <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[85%] max-w-[360px] bg-black/90 backdrop-blur-lg rounded-full z-[100] flex h-14 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 p-1 gap-1 animate-slideUp">
                <button
                    onClick={() => setIsGenderOpen(true)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full transition-all active:bg-white/10 text-white"
                >
                    <SlidersHorizontal size={14} className="opacity-80" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Division</span>
                </button>
                <div className="w-[1px] h-6 bg-white/20 self-center" />
                <button
                    onClick={() => setIsSortOpen(true)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full transition-all active:bg-white/10 text-white"
                >
                    <Check size={14} className="opacity-80" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Sort</span>
                </button>
                <div className="w-[1px] h-6 bg-white/20 self-center" />
                <button
                    onClick={() => setIsFilterOpen(true)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-full transition-all active:bg-white/10 text-white"
                >
                    <Filter size={14} className="opacity-80" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Filter</span>
                </button>
            </div>

            {/* Mobile Sort Modal */}
            {isSortOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setIsSortOpen(false)}>
                    <div className="absolute bottom-0 left-0 w-full bg-white rounded-t-[24px] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <h3 className="text-lg font-bold uppercase ">Sort By</h3>
                            <button onClick={() => setIsSortOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-2 pb-8">
                            {sortOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => { setSelectedSort(opt.value); setPage(1); setIsSortOpen(false); }}
                                    className={`w-full text-left p-4 rounded-xl font-bold transition-colors ${selectedSort === opt.value ? 'bg-black text-white' : 'bg-white text-gray-600'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Filter Modal */}
            {isFilterOpen && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h3 className="text-lg font-bold uppercase  flex items-center gap-2">
                            <Filter size={20} /> Filters
                        </h3>
                        <button onClick={() => setIsFilterOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 pb-24 space-y-6">
                        <div>
                            <h4 className="text-[11px] font-bold uppercase text-gray-400 mb-3 ml-1 tracking-wider">Category</h4>
                            <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[35vh] pr-1">
                                <button 
                                    onClick={() => setSelectedCategory('')} 
                                    className={`text-center py-2.5 px-2 rounded-xl font-bold text-[11px] transition-all border ${!selectedCategory ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 text-gray-600 border-gray-100'}`}
                                >
                                    All Categories
                                </button>
                                {allCategories.filter(c => !c.parentId).map(cat => (
                                    <button 
                                        key={cat._id || cat.id} 
                                        onClick={() => setSelectedCategory(cat._id || cat.id)} 
                                        className={`text-center py-2.5 px-2 rounded-xl font-bold text-[11px] transition-all border ${selectedCategory === cat._id || selectedCategory === cat.id ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 text-gray-600 border-gray-100'}`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[11px] font-bold uppercase text-gray-400 mb-3 ml-1 tracking-wider">Brand</h4>
                            <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[35vh] pr-1">
                                <button 
                                    onClick={() => setSelectedBrand('')} 
                                    className={`text-center py-2.5 px-2 rounded-xl font-bold text-[11px] transition-all border ${!selectedBrand ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 text-gray-600 border-gray-100'}`}
                                >
                                    All Brands
                                </button>
                                {brands.map(brand => (
                                    <button 
                                        key={brand._id} 
                                        onClick={() => setSelectedBrand(brand._id)} 
                                        className={`text-center py-2.5 px-2 rounded-xl font-bold text-[11px] transition-all border ${selectedBrand === brand._id ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 text-gray-600 border-gray-100'}`}
                                    >
                                        {brand.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 p-4 flex gap-4 bg-white sticky bottom-0">
                        <button onClick={clearFilters} className="flex-1 py-3.5 border border-gray-200 rounded-xl text-[12px] font-bold uppercase  text-gray-600">Reset</button>
                        <button onClick={() => { setPage(1); setIsFilterOpen(false); }} className="flex-1 py-3.5 bg-black text-white rounded-xl text-[12px] font-bold uppercase ">Apply</button>
                    </div>
                </div>
            )}

            {/* Mobile Gender Modal */}
             {isGenderOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setIsGenderOpen(false)}>
                    <div className="absolute bottom-0 left-0 w-full bg-white rounded-t-[24px] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <h3 className="text-lg font-black uppercase tracking-tight">Select Division</h3>
                            <button onClick={() => setIsGenderOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-3 pb-8">
                            {allCategories.filter(c => !c.parentId).map(cat => (
                                <button
                                    key={cat.id || cat._id}
                                    onClick={() => { setSelectedCategory(cat.id || cat._id); setPage(1); setIsGenderOpen(false); }}
                                    className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all border ${selectedCategory === (cat.id || cat._id) ? 'bg-black text-white border-black shadow-lg scale-[1.02]' : 'bg-white text-gray-600 border-gray-100'}`}
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-gray-100">
                                        <img src={getOptimizedImageUrl(cat.image, 80)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-[12px] uppercase">{cat.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductsPage;
