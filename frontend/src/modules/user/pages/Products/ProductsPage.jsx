import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useProductStore } from '../../../../shared/store/productStore';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { Filter, X, ChevronDown, ChevronUp, Star, Eye, ShoppingCart, Search, ArrowLeft, Heart, Share2, Check, MapPin, Users, ArrowUpDown } from 'lucide-react';
import LocationModal from '../../components/Header/LocationModal';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../../components/Modals/LoginModal';
import { useUserLocation } from '../../context/LocationContext';
import ProductCard from '../../components/ProductCard/ProductCard';
import ProductSkeleton from '../../components/ProductCard/ProductSkeleton';
import { useCategoryStore } from '../../../../shared/store/categoryStore';

const ProductsPage = () => {
    const { products, isLoading, fetchPublicProducts } = useProductStore();
    const { categories: allCategoriesStore, initialize: initCategories } = useCategoryStore();
    const { toggleWishlist, isInWishlist, wishlistItems } = useWishlist();
    const { addToCart, getCartCount } = useCart();
    const { activeAddress } = useUserLocation();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isGenderOpen, setIsGenderOpen] = useState(false);
    const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    // Active Filters State
    const [activeFilterTab, setActiveFilterTab] = useState('Brand');
    const [searchValue, setSearchValue] = useState(''); // Brand search in drawer
    const [headerSearchValue, setHeaderSearchValue] = useState(searchParams.get('search') || ''); // Main grid search
    const [selectedGender, setSelectedGender] = useState(searchParams.get('division') || 'All');
    const [selectedBrands, setSelectedBrands] = useState(searchParams.getAll('brand') || []);
    const [selectedSubCategories, setSelectedSubCategories] = useState(searchParams.getAll('subCategory') || []);
    const [selectedSort, setSelectedSort] = useState(searchParams.get('sort') || 'newest');
    const [selectedFabrics, setSelectedFabrics] = useState([]);
    const [selectedPatterns, setSelectedPatterns] = useState([]);
    const [selectedFits, setSelectedFits] = useState([]);
    const [selectedSizes, setSelectedSizes] = useState([]);

    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        
        if (selectedGender && selectedGender !== 'All') params.set('division', selectedGender);
        else params.delete('division');

        params.delete('brand');
        selectedBrands.forEach(b => params.append('brand', b));

        params.delete('subCategory');
        selectedSubCategories.forEach(s => params.append('subCategory', s));

        if (selectedSort !== 'newest') params.set('sort', selectedSort);
        else params.delete('sort');

        const nextQuery = params.toString();
        const currentQuery = searchParams.toString();
        if (nextQuery !== currentQuery) {
            setSearchParams(params, { replace: true });
        }
    }, [selectedGender, selectedBrands, selectedSubCategories, selectedSort]);

    // Sync headerSearchValue to URL so backend fetch triggers
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setSearchParams(prevParams => {
                const newParams = new URLSearchParams(prevParams);
                if (headerSearchValue) {
                    if (newParams.get('search') !== headerSearchValue) {
                        newParams.set('search', headerSearchValue);
                        return newParams;
                    }
                } else {
                    if (newParams.has('search')) {
                        newParams.delete('search');
                        return newParams;
                    }
                }
                return prevParams;
            }, { replace: true });
        }, 600);
        return () => clearTimeout(timeoutId);
    }, [headerSearchValue, setSearchParams]);

    // Desktop Section states
    const [openSections, setOpenSections] = useState({
        brand: true,
        subCategory: true,
        productType: true,
        trend: false,
        size: false,
        fit: false,
        fabric: false,
        pattern: false,
        closureType: false,
        originCountry: false,
        gender: false,
        colorFamily: false,
        color: false
    });

    const division = searchParams.get('division');
    const category = searchParams.get('category');
    const subCategoryFromUrl = searchParams.get('subCategory') || searchParams.get('subcategory');
    const brandFromUrl = searchParams.get('brand');
    const cidFromUrl = searchParams.get('cid'); // Direct category ObjectId — most reliable filter

    useEffect(() => {
        const searchFromUrl = searchParams.get('search');
        if (searchFromUrl) {
            setHeaderSearchValue(searchFromUrl);
            setIsHeaderSearchOpen(true);
        }
        if (brandFromUrl) {
            setSelectedBrands([brandFromUrl]);
        }
    }, [searchParams, brandFromUrl]);

    // Dynamic Filter State — seeded with common sizes as defaults
    const [filterOptions, setFilterOptions] = useState({
        sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        fabrics: [],
        patterns: [],
        fits: []
    });

    // Re-derive filter options whenever products change (works without admin localStorage data)
    useEffect(() => {
        if (!products || products.length === 0) return;

        const sizesSet = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
        const fabricsSet = new Set();
        const patternsSet = new Set();
        const fitsSet = new Set();

        products.forEach(p => {
            // Sizes — stored in variants.sizes (per Product model schema)
            const variantSizes = p.variants?.sizes || p.sizes || [];
            variantSizes.forEach(s => s && sizesSet.add(String(s)));

            // Materials/Fabrics — stored in variants.materials (per Product model schema)
            const variantMaterials = p.variants?.materials || [];
            variantMaterials.forEach(m => m && fabricsSet.add(String(m)));

            // From variants.attributes[] — generic named attribute groups
            const attrs = p.variants?.attributes || p.attributes || [];
            attrs.forEach(attr => {
                const name = (attr.name || '').toLowerCase();
                const values = Array.isArray(attr.values) ? attr.values : [];
                if (name.includes('size')) values.forEach(v => v && sizesSet.add(String(v)));
                else if (name.includes('fabric') || name.includes('material')) values.forEach(v => v && fabricsSet.add(String(v)));
                else if (name.includes('pattern')) values.forEach(v => v && patternsSet.add(String(v)));
                else if (name.includes('fit')) values.forEach(v => v && fitsSet.add(String(v)));
            });
        });

        // Also merge admin attribute sets from localStorage if available
        try {
            const savedSets = localStorage.getItem('admin-attribute-sets');
            if (savedSets) {
                JSON.parse(savedSets).forEach(set => {
                    const name = (set.name || '').toLowerCase();
                    const attrs = Array.isArray(set.attributes) ? set.attributes : [];
                    if (name.includes('size')) attrs.forEach(v => v && sizesSet.add(v));
                    else if (name.includes('material') || name.includes('fabric')) attrs.forEach(v => v && fabricsSet.add(v));
                    else if (name.includes('pattern')) attrs.forEach(v => v && patternsSet.add(v));
                    else if (name.includes('fit')) attrs.forEach(v => v && fitsSet.add(v));
                });
            }
        } catch (_) {}

        setFilterOptions({
            sizes: [...sizesSet].filter(Boolean),
            fabrics: [...fabricsSet].filter(Boolean).sort(),
            patterns: [...patternsSet].filter(Boolean).sort(),
            fits: [...fitsSet].filter(Boolean).sort(),
        });
    }, [products]);

    // Load categories
    useEffect(() => {
        initCategories();
    }, [initCategories]);

    // Load products from backend based on active URL filters
    useEffect(() => {
        const hasCid = Boolean(cidFromUrl && /^[0-9a-fA-F]{24}$/.test(cidFromUrl));
        const divisionToFetch = hasCid ? undefined : (division || (selectedGender !== 'All' ? selectedGender : undefined));
        const categoryToFetch = hasCid ? undefined : (category || undefined);
        const subCategoryToFetch = hasCid ? undefined : (selectedSubCategories.length > 0 ? selectedSubCategories[0] : (subCategoryFromUrl || undefined));
        const searchFromUrlForFetch = searchParams.get('search') || searchParams.get('q') || undefined;

        fetchPublicProducts({
            limit: 1000,
            ...(hasCid ? { categoryId: cidFromUrl } : {}),
            division: divisionToFetch,
            category: categoryToFetch,
            subCategory: subCategoryToFetch,
            brand: (selectedBrands.length > 0 ? selectedBrands[0] : undefined),
            ...(searchFromUrlForFetch ? { q: searchFromUrlForFetch } : {}),
            sort: selectedSort === 'New Arrivals' ? 'newest' :
                  selectedSort === 'Price: Low to High' ? 'price-asc' :
                  selectedSort === 'Price: High to Low' ? 'price-desc' :
                  selectedSort === 'Discount' ? 'discount' : 'popular',
        });
    }, [category, subCategoryFromUrl, cidFromUrl, division, selectedGender, selectedBrands, selectedSubCategories, selectedSort, fetchPublicProducts, searchParams]);

    // Derived subcategories based on gender
    const subCategories = useMemo(() => {
        if (selectedGender === 'All') {
            return [...new Set((products || []).map(p => p.categoryId?.name || p.subCategory))].filter(Boolean);
        }

        // Find the root category matching the selected gender
        const rootCat = allCategoriesStore.find(cat => 
            !cat.parentId && (cat.name === selectedGender || cat.name?.toLowerCase() === selectedGender.toLowerCase())
        );

        if (rootCat) {
            const rootId = String(rootCat.id || rootCat._id);
            return allCategoriesStore
                .filter(cat => {
                    const pid = cat.parentId ? (typeof cat.parentId === 'object' ? (cat.parentId._id || cat.parentId.id) : cat.parentId) : null;
                    return String(pid) === rootId;
                })
                .map(cat => cat.name);
        }

        return [...new Set((products || []).map(p => p.categoryId?.name || p.subCategory))].filter(Boolean);
    }, [selectedGender, allCategoriesStore, products]);

    const brands = useMemo(() => {
        return [...new Set((products || []).map(p => p.brand))].filter(Boolean).sort();
    }, [products]);

    // Use dynamic sizes with strict uniqueness
    const sizes = [...new Set(filterOptions.sizes)].filter(Boolean);

    const toggleSection = (section) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const [searchQuery, setSearchQuery] = useState('');

    // Derived filtered products
    const filteredProducts = useMemo(() => {
        let result = [...(products || [])];

        // 1. Gender Filter (Manual override) - Skip if filtering by direct CID
        const hasCid = Boolean(cidFromUrl && /^[0-9a-fA-F]{24}$/.test(cidFromUrl));
        if (selectedGender !== 'All' && !hasCid) {
            const lowerGender = selectedGender.toLowerCase();
            let mappedGender = lowerGender;
            
            if (lowerGender.includes("women") || lowerGender === "womens") mappedGender = "women";
            else if (lowerGender.includes("men") || lowerGender === "mens") mappedGender = "men";
            else if (lowerGender.includes("kids") || lowerGender.includes("boys")) mappedGender = "boys";
            else if (lowerGender.includes("girls")) mappedGender = "girls";
            
            result = result.filter(p => (p.division || '').toLowerCase() === mappedGender);
        }

        // 4. Header Search Filter (Removed)
        // The backend handles search via the API call, so we don't need to filter locally.
        // Doing it locally with .includes() breaks multi-word smart searches like 'puma shoes'.

        // 5. Brand Filter
        if (selectedBrands.length > 0) {
            result = result.filter(p => selectedBrands.includes(p.brand));
        }

        // Sub Category Drawer Filter
        if (selectedSubCategories.length > 0) {
            result = result.filter(p => selectedSubCategories.includes(p.categoryId?.name) || selectedSubCategories.includes(p.subCategory));
        }

        // 6. Size Filter — variants.sizes is the correct field per Product model schema
        if (selectedSizes.length > 0) {
            result = result.filter(p => {
                const productSizes = p.variants?.sizes || p.sizes || [];
                return selectedSizes.some(s => productSizes.includes(s));
            });
        }

        // 7. Fabric/Material Filter — variants.materials is the correct field per Product model schema
        if (selectedFabrics.length > 0) {
            result = result.filter(p => {
                const variantMaterials = p.variants?.materials || [];
                if (selectedFabrics.some(f => variantMaterials.includes(f))) return true;
                const attrs = p.variants?.attributes || p.attributes || [];
                const fabricAttr = attrs.find(a => (a.name || '').toLowerCase().includes('fabric') || (a.name || '').toLowerCase().includes('material'));
                if (fabricAttr) {
                    return selectedFabrics.some(f => (fabricAttr.values || []).includes(f));
                }
                return false;
            });
        }

        // 8. Pattern Filter — from variants.attributes[]
        if (selectedPatterns.length > 0) {
            result = result.filter(p => {
                const attrs = p.variants?.attributes || p.attributes || [];
                const patternAttr = attrs.find(a => (a.name || '').toLowerCase().includes('pattern'));
                if (patternAttr) {
                    return selectedPatterns.some(pat => (patternAttr.values || []).includes(pat));
                }
                return false;
            });
        }

        // 9. Fit Filter — from variants.attributes[]
        if (selectedFits.length > 0) {
            result = result.filter(p => {
                const attrs = p.variants?.attributes || p.attributes || [];
                const fitAttr = attrs.find(a => (a.name || '').toLowerCase().includes('fit'));
                if (fitAttr) {
                    return selectedFits.some(fit => (fitAttr.values || []).includes(fit));
                }
                return false;
            });
        }

        // 10. Sorting Logic
        switch (selectedSort) {
            case 'Price: Low to High':
                result.sort((a, b) => Number(a.price) - Number(b.price));
                break;
            case 'Price: High to Low':
                result.sort((a, b) => Number(b.price) - Number(a.price));
                break;
            case 'Discount':
                result = result.filter(p => {
                    const getDisc = (s) => {
                        if (typeof s === 'number') return s;
                        return parseInt(String(s || '').split('%')[0]) || 0;
                    };
                    return getDisc(p.discount) > 0;
                });
                result.sort((a, b) => {
                    const getDisc = (s) => {
                        if (typeof s === 'number') return s;
                        return parseInt(String(s || '').split('%')[0]) || 0;
                    };
                    return getDisc(b.discount) - getDisc(a.discount);
                });
                break;
            default:
                result.sort((a, b) => b.id - a.id);
                break;
        }

        return result;
    }, [headerSearchValue, selectedGender, selectedSort, selectedBrands, selectedSubCategories, selectedSizes, selectedFabrics, selectedPatterns, selectedFits, products]);

    const handleSelectBrand = (brand) => {
        setSelectedBrands(prev =>
            prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
        );
    };

    const handleSelectSubCategory = (sub) => {
        setSelectedSubCategories(prev =>
            prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
        );
    };

    const handleSelectSize = (size) => {
        setSelectedSizes(prev =>
            prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
        );
    };

    const handleSelectFabric = (fabric) => {
        setSelectedFabrics(prev =>
            prev.includes(fabric) ? prev.filter(f => f !== fabric) : [...prev, fabric]
        );
    };

    const handleSelectPattern = (pattern) => {
        setSelectedPatterns(prev =>
            prev.includes(pattern) ? prev.filter(p => p !== pattern) : [...prev, pattern]
        );
    };

    const handleSelectFit = (fit) => {
        setSelectedFits(prev =>
            prev.includes(fit) ? prev.filter(f => f !== fit) : [...prev, fit]
        );
    };

    const clearFilters = () => {
        setSelectedBrands([]);
        setSelectedSubCategories([]);
        setSelectedSizes([]);
        setSelectedFabrics([]);
        setSelectedPatterns([]);
        setSelectedFits([]);
        setSelectedGender('All');
        setHeaderSearchValue('');
    };

    const FilterSection = ({ title, id, children }) => (
        <div className="border-b border-gray-100 py-1.5 md:py-3">
            <button
                onClick={() => toggleSection(id)}
                className="w-full flex items-center justify-between text-[11px] md:text-[13px] font-bold uppercase text-gray-900 group"
            >
                <div className="flex items-center gap-1.5 group-hover:text-black transition-colors">
                    <span className="text-base font-medium min-w-[12px]">{openSections[id] ? '-' : '+'}</span>
                    {title}
                </div>
                {selectedBrands.length > 0 && id === 'brand' && (
                    <div className="w-1 h-1 bg-black rounded-full" />
                )}
            </button>
            {openSections[id] && (
                <div className="mt-1 space-y-1.5 animate-fadeIn">
                    {children}
                </div>
            )}
        </div>
    );

    const getCategoryTheme = (catName) => {
        const cat = (catName || '').toLowerCase();
        if (cat === 'women' || cat === 'hello') return 'from-[#FF4081]/20 to-transparent';
        if (cat === 'men\'s fashion' || cat === 'men') return 'from-[#4FC3F7]/20 to-transparent';
        if (cat === 'beauty') return 'from-[#F06292]/20 to-transparent';
        if (cat === 'accessories') return 'from-[#FFB300]/20 to-transparent';
        if (cat === 'bottom wear') return 'from-[#9CCC65]/20 to-transparent';
        return 'from-gray-900/10 to-transparent';
    };
    const headerTheme = getCategoryTheme(category || subCategoryFromUrl);

    return (
        <div className="bg-white min-h-screen pb-20 md:pb-0 text-gray-900 font-sans">
            {/* Universal Header - Mobile Only (Synced with Global Header) */}
            <div className="sticky top-0 z-[60] border-b border-gray-100 shadow-[0_8px_32px_rgba(0,0,0,0.08)] md:hidden">
                <div className="absolute inset-0 bg-white/95 backdrop-blur-2xl z-0" />
                <div className={`absolute inset-0 bg-gradient-to-b ${headerTheme} z-0 opacity-10 pointer-events-none`} />

                <div className="container mx-auto px-4 pt-1.5 pb-1 relative z-10">
                    {/* Top Row: Back, Title, Actions */}
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                            <button className="w-7 h-7 rounded-full bg-white/20 border border-black/5 flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0" onClick={() => window.history.back()}>
                                <ArrowLeft size={14} className="text-gray-900" />
                            </button>
                            <div className="flex flex-col">
                                <h1 className="text-[14px] font-bold truncate uppercase text-gray-900 leading-none mb-0.5 tracking-tight">
                                    {selectedBrands[0] || subCategoryFromUrl || category || "Products"}
                                </h1>
                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {filteredProducts.length} Items
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => setIsLocationModalOpen(true)} className="relative transition-colors group p-2 hover:bg-gray-50 rounded-full">
                                <MapPin size={16} className="text-gray-900 group-hover:text-black transition-colors" />
                            </button>
                            <Link to="/wishlist" className="relative transition-colors group p-2 hover:bg-gray-50 rounded-full">
                                <Heart size={16} className="text-gray-900 group-hover:text-black transition-colors" />
                                {wishlistItems.length > 0 && (
                                    <span className="absolute top-1 right-1 bg-black text-white text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white">
                                        {wishlistItems.length}
                                    </span>
                                )}
                            </Link>
                            <Link to={user ? "/cart" : "/login"} className="relative transition-colors group p-2 hover:bg-gray-50 rounded-full">
                                <ShoppingCart size={16} className="text-gray-900 group-hover:text-black transition-colors" />
                                {getCartCount() > 0 && (
                                    <span className="absolute top-1 right-1 bg-black text-white text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white">
                                        {getCartCount()}
                                    </span>
                                )}
                            </Link>
                        </div>
                    </div>

                    {/* Toolbar Row: Search (Mobile Only) */}
                    <div className="flex items-center gap-2 pb-2">
                        {/* Search Bar */}
                        <div className="relative flex-1 group">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" />
                            <input
                                type="text"
                                placeholder={`Search in ${subCategoryFromUrl || category || 'products'}...`}
                                className="w-full bg-white/50 backdrop-blur-md border border-black/5 rounded-full py-1.5 pl-8 pr-4 text-[10px] font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black/20 transition-all"
                                value={headerSearchValue}
                                onChange={(e) => setHeaderSearchValue(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Address Details Block */}
                <div
                    onClick={() => setIsLocationModalOpen(true)}
                    className="border-t border-black/5 bg-gray-50/50 relative z-10"
                >
                    <div className="container mx-auto flex items-center justify-between px-4 py-1.5 cursor-pointer group hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight whitespace-nowrap">
                                Delivering to:
                            </span>
                            <span className="text-[10px] font-bold text-black truncate max-w-[180px]">
                                {activeAddress ? `${activeAddress.name}, ${activeAddress.city}` : 'Select Location'}
                            </span>
                            {activeAddress?.type && (
                                <span className="text-[7px] font-black bg-black text-white px-1 py-[0.5px] rounded-[3px] uppercase ml-1">
                                    {activeAddress.type}
                                </span>
                            )}
                        </div>
                        <ChevronDown size={12} className="text-gray-400 group-hover:text-black transition-colors" />
                    </div>
                </div>
            </div>

            <LocationModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />

            <div className="container mx-auto px-2 sm:px-3 md:px-4 py-4 sm:py-6 md:py-8 pb-32 md:pb-8">
                {/* Desktop Breadcrumbs & Tools - Hidden on Mobile */}
                <div className="hidden md:flex flex-col mb-8 border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase ">
                            <Link to="/" className="hover:text-black transition-colors cursor-pointer">Home</Link> 
                            <span className="scale-75 text-white/20">›</span> 
                            <Link 
                                to={`/products${selectedBrands[0] ? `?brand=${selectedBrands[0]}` : division ? `?division=${division}` : ''}`}
                                className="hover:text-black transition-colors cursor-pointer"
                                onClick={() => {
                                    const params = new URLSearchParams(searchParams);
                                    params.delete('category');
                                    params.delete('subCategory');
                                    setSearchParams(params);
                                }}
                            >
                                {selectedBrands[0] || division || 'Shop'}
                            </Link> 
                            <span className="scale-75 text-white/20">›</span> 
                            <span 
                                className="text-gray-900 hover:text-black transition-colors cursor-pointer"
                                onClick={() => {
                                    setSelectedSubCategories([]);
                                    setSelectedSizes([]);
                                    setSelectedFabrics([]);
                                    setSelectedPatterns([]);
                                    setSelectedFits([]);
                                    setHeaderSearchValue('');
                                    setSearchValue('');
                                    setSelectedSort('newest');

                                    const params = new URLSearchParams();
                                    if (selectedBrands[0]) params.set('brand', selectedBrands[0]);
                                    if (division) params.set('division', division);
                                    if (category) params.set('category', category);
                                    setSearchParams(params);

                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                            >
                                {category || subCategoryFromUrl || 'All'}
                            </span>
                            <span className="ml-4 text-white/20 font-normal">|</span>
                            <span className="ml-4 text-black font-bold ">{filteredProducts.length} ITEMS</span>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Search Local Grid */}
                            <div className="relative w-64 group">
                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" />
                                <input
                                    type="text"
                                    placeholder={`Search in ${subCategoryFromUrl || category || 'products'}...`}
                                    className="w-full bg-gray-50 shadow-inner border border-gray-100 rounded-full py-2.5 pl-9 pr-4 text-[11px] font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black/50 focus:ring-1 focus:ring-black/50 transition-all tracking-normal"
                                    value={headerSearchValue}
                                    onChange={(e) => setHeaderSearchValue(e.target.value)}
                                />
                            </div>

                            <div className="relative group/sort z-20">
                                <div className="flex items-center gap-2 border border-gray-300 bg-gray-50 px-6 py-2.5 rounded-full text-[11px] font-bold uppercase text-gray-700 cursor-pointer hover:border-black hover:bg-gray-100 transition-all">
                                    Sort By: <span className="text-black ml-1 max-w-[80px] truncate">{selectedSort}</span> <ChevronDown size={14} className="text-gray-600" />
                                </div>
                                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] py-2 w-56 opacity-0 invisible group-hover/sort:opacity-100 group-hover/sort:visible transition-all">
                                    {['Price: Low to High', 'Price: High to Low', 'Discount', 'Popularity', 'New Arrivals'].map(option => (
                                        <button
                                            key={option}
                                            onClick={() => setSelectedSort(option)}
                                            className={`w-full text-left px-6 py-3 text-[11px] font-bold uppercase hover:bg-gray-100 transition-colors ${selectedSort === option ? 'text-black bg-gray-50' : 'text-gray-600'}`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                             <button
                                onClick={() => setIsFilterOpen(true)}
                                className="flex items-center gap-2 border border-black bg-black px-6 py-2.5 rounded-full text-[11px] font-bold uppercase text-white cursor-pointer hover:bg-white hover:text-black hover:border-gray-300 transition-all shadow-md"
                            >
                                <Filter size={14} /> Filter
                            </button>

                            {(selectedBrands.length > 0 || headerSearchValue || selectedGender !== 'All' || selectedSizes.length > 0) && (
                                <button
                                    onClick={clearFilters}
                                    className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-[10px] font-bold uppercase  text-red-400 hover:text-red-300 hover:bg-gray-100 transition-colors shrink-0"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {selectedBrands.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-4 animate-fadeIn">
                            {selectedBrands.map(brand => (
                                <div key={brand} className="flex items-center gap-3 bg-black/10 border border-black/30 pl-4 pr-3 py-2 rounded-lg text-[11px] font-bold uppercase  text-black shadow-sm">
                                    {brand}
                                    <div
                                        onClick={() => handleSelectBrand(brand)}
                                        className="w-5 h-5 bg-black/50 border border-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                                    >
                                        <X size={12} className="text-gray-900" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedSubCategories.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-3 animate-fadeIn">
                            {selectedSubCategories.map(sub => (
                                <div key={sub} className="flex items-center gap-3 bg-gray-100 border border-gray-300 pl-4 pr-3 py-2 rounded-lg text-[11px] font-bold uppercase text-gray-800 shadow-sm">
                                    {sub}
                                    <div
                                        onClick={() => handleSelectSubCategory(sub)}
                                        className="w-5 h-5 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                                    >
                                        <X size={12} className="text-gray-900" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>



                {/* Main Content Grid - Full Width without Sidebar */}
                <div className="w-full">
                    <div className="premium-product-grid">
                        {isLoading ? (
                            Array.from({ length: 10 }).map((_, idx) => (
                                <div key={`skeleton-${idx}`}>
                                    <ProductSkeleton />
                                </div>
                            ))
                        ) : filteredProducts.length > 0 ? filteredProducts.map((product) => (
                            <div key={product.id}>
                                <ProductCard product={product} />
                            </div>
                        )) : (
                            <div className="col-span-full py-20 px-4 text-center flex flex-col items-center justify-center animate-fadeInUp">
                                <div className="relative w-28 h-28 mb-8 flex items-center justify-center group">
                                    <div className="absolute inset-0 bg-black/10 rounded-full animate-ping opacity-50 duration-1000" />
                                    <div className="absolute inset-2 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] z-10 transition-transform group-hover:scale-110 duration-500">
                                        <Search size={44} className="text-black drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 bg-white w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center z-20">
                                        <X size={18} className="text-red-400" />
                                    </div>
                                </div>
                                <h3 className="text-[20px] md:text-2xl font-bold uppercase  text-gray-900 leading-tight mb-3">No <span className="text-black">Matches</span> Found</h3>
                                <p className="text-[11px] font-semibold  text-gray-400 uppercase max-w-[280px] leading-relaxed">Adjust your filters or search query to discover more exclusive pieces.</p>
                                <button
                                    onClick={clearFilters}
                                    className="mt-8 px-10 py-3.5 bg-gradient-to-r from-gray-900 to-[#F3E5AB] text-black text-[11px] font-bold uppercase  rounded-full active:scale-95 transition-all shadow-[0_10px_30px_rgba(212,175,55,0.25)] hover:shadow-[0_10px_40px_rgba(212,175,55,0.4)]"
                                >
                                    Reset Filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Gender Modal */}
            {isGenderOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md animate-fadeIn flex items-end md:items-center justify-center">
                    <div className="absolute inset-0" onClick={() => setIsGenderOpen(false)} />
                    <div className="relative w-full md:w-[360px] bg-white rounded-t-[28px] md:rounded-[28px] overflow-hidden animate-slideUp border border-gray-100 md:shadow-[0_20px_50px_rgba(0,0,0,0.4)] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-10">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <h3 className="text-[11px] font-bold uppercase text-gray-900 tracking-wide">Select Gender</h3>
                            <button onClick={() => setIsGenderOpen(false)} className="p-1.5 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-colors">
                                <X size={14} className="text-gray-900" />
                            </button>
                        </div>
                        <div className="p-3 space-y-1">
                            {['All', 'Men', 'Women', 'Boys', 'Girls'].map(gender => (
                                <button
                                    key={gender}
                                    onClick={() => {
                                        setSelectedGender(gender);
                                        setIsGenderOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[12px] text-[10px] font-bold uppercase transition-all border ${selectedGender === gender ? 'bg-black border-black text-white' : 'border-gray-50 bg-gray-50/50 text-gray-500 hover:text-gray-900'}`}
                                >
                                    {gender}
                                    {selectedGender === gender && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sort Modal - Mobile (Desktop uses dropdown) */}
            {isSortOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md animate-fadeIn flex items-end justify-center md:hidden">
                    <div className="absolute inset-0" onClick={() => setIsSortOpen(false)} />
                    <div className="relative w-full bg-white rounded-t-[28px] overflow-hidden animate-slideUp border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-10">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <h3 className="text-[11px] font-bold uppercase text-gray-900 tracking-wide">Sort By</h3>
                            <button onClick={() => setIsSortOpen(false)} className="p-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors">
                                <X size={14} className="text-gray-900" />
                            </button>
                        </div>
                        <div className="p-3 space-y-1">
                            {['Price: Low to High', 'Price: High to Low', 'Discount', 'Popularity', 'New Arrivals'].map(option => (
                                <button
                                    key={option}
                                    onClick={() => {
                                        setSelectedSort(option);
                                        setIsSortOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[12px] text-[10px] font-bold uppercase transition-all border ${selectedSort === option ? 'bg-black border-black text-white' : 'border-gray-50 bg-gray-50/50 text-gray-500 hover:text-gray-900'}`}
                                >
                                    {option}
                                    {selectedSort === option && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Modal - Mobile & Desktop Drawer */}
            {isFilterOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setIsFilterOpen(false)} />
                    <div className="relative w-full md:w-[420px] h-full bg-white animate-slideLeft flex flex-col pt-safe border-l border-gray-200 shadow-[-20px_0_50px_rgba(0,0,0,0.8)]">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0 bg-white">
                            <h3 className="text-[11px] font-bold uppercase text-gray-900 flex items-center gap-2">
                                <Filter size={14} className="text-black" /> Filters
                            </h3>
                            <button onClick={() => setIsFilterOpen(false)} className="p-1.5 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-colors">
                                <X size={16} className="text-gray-900" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 pb-32">
                            <div className="space-y-4">
                                <FilterSection title="Brand" id="brand">
                                    <div className="space-y-3 pt-1">
                                        {brands.map(brand => (
                                            <label key={brand} className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedBrands.includes(brand)}
                                                    onChange={() => handleSelectBrand(brand)}
                                                />
                                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${selectedBrands.includes(brand) ? 'bg-black border-black shadow-sm scale-110' : 'border-gray-200 bg-white'
                                                    }`}>
                                                    {selectedBrands.includes(brand) && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                                <span className={`text-[12px] font-semibold uppercase transition-colors ${selectedBrands.includes(brand) ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'
                                                    }`}>{brand}</span>
                                            </label>
                                        ))}
                                    </div>
                                </FilterSection>

                                <FilterSection title="Sub Category" id="subCategory">
                                    <div className="space-y-3 pt-2 flex flex-col items-start gap-1">
                                        {subCategories.map(sub => (
                                            <div 
                                                key={sub} 
                                                onClick={() => handleSelectSubCategory(sub)}
                                                className={`text-[13px] font-semibold uppercase cursor-pointer transition-colors border-b pb-0.5 ${selectedSubCategories.includes(sub) ? 'text-black border-black/50' : 'text-gray-500 hover:text-black border-transparent hover:border-black/30'}`}
                                            >
                                                {sub}
                                            </div>
                                        ))}
                                    </div>
                                </FilterSection>

                                <FilterSection title="Size" id="size">
                                    <div className="grid grid-cols-4 gap-2 pt-2">
                                        {sizes.map(size => (
                                            <button 
                                                key={size} 
                                                onClick={() => handleSelectSize(size)}
                                                className={`border py-2.5 text-[11px] font-bold rounded-lg transition-all ${selectedSizes.includes(size) ? 'bg-black border-black text-white shadow-md' : 'border-gray-200 bg-white text-gray-500 hover:border-black hover:text-black'}`}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </FilterSection>

                                {filterOptions.fabrics.length > 0 && (
                                <FilterSection title="Fabric" id="fabric">
                                    <div className="space-y-3 pt-2">
                                        {filterOptions.fabrics.map(fabric => (
                                            <label key={fabric} className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedFabrics.includes(fabric)}
                                                    onChange={() => handleSelectFabric(fabric)}
                                                />
                                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${selectedFabrics.includes(fabric) ? 'bg-black border-black shadow-sm' : 'border-gray-200 bg-white'}`}>
                                                    {selectedFabrics.includes(fabric) && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                                <span className={`text-[12px] font-semibold uppercase transition-colors ${selectedFabrics.includes(fabric) ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'}`}>{fabric}</span>
                                            </label>
                                        ))}
                                    </div>
                                </FilterSection>
                                )}

                                {filterOptions.patterns.length > 0 && (
                                <FilterSection title="Pattern" id="pattern">
                                    <div className="space-y-3 pt-2">
                                        {filterOptions.patterns.map(pattern => (
                                            <label key={pattern} className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedPatterns.includes(pattern)}
                                                    onChange={() => handleSelectPattern(pattern)}
                                                />
                                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${selectedPatterns.includes(pattern) ? 'bg-black border-black shadow-sm' : 'border-gray-200 bg-white'}`}>
                                                    {selectedPatterns.includes(pattern) && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                                <span className={`text-[12px] font-semibold uppercase transition-colors ${selectedPatterns.includes(pattern) ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'}`}>{pattern}</span>
                                            </label>
                                        ))}
                                    </div>
                                </FilterSection>
                                )}

                                {filterOptions.fits.length > 0 && (
                                <FilterSection title="Fit" id="fit">
                                    <div className="space-y-3 pt-2">
                                        {filterOptions.fits.map(fit => (
                                            <label key={fit} className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedFits.includes(fit)}
                                                    onChange={() => handleSelectFit(fit)}
                                                />
                                                <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${selectedFits.includes(fit) ? 'bg-black border-black shadow-sm' : 'border-gray-200 bg-white'}`}>
                                                    {selectedFits.includes(fit) && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                                <span className={`text-[12px] font-semibold uppercase transition-colors ${selectedFits.includes(fit) ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'}`}>{fit}</span>
                                            </label>
                                        ))}
                                    </div>
                                </FilterSection>
                                )}

                                <FilterSection title="Deals & Offers" id="discount">
                                    <div className="space-y-3 pt-2">
                                        <button
                                            onClick={() => setSelectedSort('Discount')}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-[11px] font-bold uppercase transition-all ${selectedSort === 'Discount' ? 'bg-black border-black text-white shadow-lg' : 'bg-white border-gray-100 text-gray-500'}`}
                                        >
                                            Show Discounted Products
                                            {selectedSort === 'Discount' && <Check size={14} />}
                                        </button>
                                    </div>
                                </FilterSection>

                            </div>
                        </div>
                        <div className="border-t border-gray-100 p-3 pl-safe pr-safe pb-safe flex gap-3 bg-white/95 backdrop-blur-xl absolute bottom-0 left-0 w-full shadow-[0_-5px_30px_rgba(0,0,0,0.1)] z-10">
                            <button
                                onClick={clearFilters}
                                className="flex-1 py-3 bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors rounded-[12px] text-[10px] font-bold uppercase text-gray-900"
                            >
                                Reset
                            </button>
                            <button
                                onClick={() => setIsFilterOpen(false)}
                                className="flex-[2] py-3 bg-black shadow-md text-white rounded-[12px] text-[10px] font-bold uppercase hover:bg-gray-800 transition-colors"
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] bg-gray-50/85 backdrop-blur-xl border border-gray-200 rounded-full z-[50] flex items-center justify-between h-14 shadow-[0_15px_40px_rgba(0,0,0,0.8)] px-1 py-1">
                <button
                    onClick={() => setIsGenderOpen(true)}
                    className={`flex-1 flex flex-col items-center justify-center h-full rounded-full transition-all duration-300 ${isGenderOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <Users size={16} className={`mb-0.5 ${selectedGender !== 'All' ? 'text-black' : ''}`} />
                    <span className="text-[8px] font-bold uppercase ">Gender</span>
                </button>
                <div className="w-[1px] h-6 bg-gray-100" />
                <button
                    onClick={() => setIsSortOpen(true)}
                    className={`flex-1 flex flex-col items-center justify-center h-full rounded-full transition-all duration-300 ${isSortOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}
                >
                    <ArrowUpDown size={16} className={`mb-0.5 ${selectedSort !== 'New Arrivals' && selectedSort !== 'Recommended' ? 'text-black' : ''}`} />
                    <span className="text-[8px] font-bold uppercase ">Sort</span>
                </button>
                <div className="w-[1px] h-6 bg-gray-100" />
                <button
                    onClick={() => setIsFilterOpen(true)}
                    className={`flex-1 flex flex-col items-center justify-center h-full rounded-full transition-all duration-300 ${isFilterOpen ? 'bg-black/20 text-black' : 'text-black hover:bg-gray-50'}`}
                >
                    <Filter size={16} className="mb-0.5" />
                    <span className="text-[8px] font-bold uppercase ">Filter</span>
                </button>
            </div>

            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
            />
        </div>
    );
};

export default ProductsPage;
