import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiClock, FiTrendingUp } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getCatalogProducts } from '../../modules/user/data/catalogData';
import { useCategoryStore } from '../store/categoryStore';
import api from '../utils/api';
import { getOptimizedImageUrl } from "../utils/helpers";

const RECENT_SEARCHES_KEY = 'recent-searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_SUGGESTIONS = 5;

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestedCategories, setSuggestedCategories] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're in the mobile app section
  const isMobileApp = location.pathname.startsWith('/app');
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);
  const { categories, initialize: initCategories } = useCategoryStore();

  useEffect(() => {
    initCategories();
  }, [initCategories]);

  // Popular searches (can be made dynamic later)
  const popularSearches = ['Diapers', 'Vegetables', 'Meat', 'Fruits', 'Baby Care'];



  // Get recent searches from localStorage
  const getRecentSearches = () => {
    try {
      const recent = localStorage.getItem(RECENT_SEARCHES_KEY);
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  };

  // Save search to recent searches
  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    const recent = getRecentSearches();
    const updated = [query.trim(), ...recent.filter((s) => s !== query.trim())].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Helper: look up parent category name from the category store
  const getCategoryLabel = (catId) => {
    const cat = categories.find(c => String(c.id || c._id) === String(catId));
    if (!cat) return null;
    if (cat.parentId) {
      const parentIdStr = typeof cat.parentId === 'object' ? (cat.parentId._id || cat.parentId.id || cat.parentId) : cat.parentId;
      const parent = categories.find(c => String(c.id || c._id) === String(parentIdStr));
      return { name: cat.name, parent: parent?.name || '', image: cat.image || parent?.image || '' };
    }
    return { name: cat.name, parent: '', image: cat.image || '' };
  };

  // Fetch limit for category discovery (larger to capture more categories)
  const CATEGORY_DISCOVERY_LIMIT = 30;

  // Update suggestions when query changes
  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      if (!searchQuery.trim()) {
        setSuggestions([]);
        setSelectedIndex(-1);
        return;
      }

      try {
        const response = await api.get('/products', {
          params: { q: searchQuery.trim(), page: 1, limit: CATEGORY_DISCOVERY_LIMIT, sort: 'newest' },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        const allProductSuggestions = products.map((product) => ({
          type: 'product',
          id: product?._id || product?.id,
          name: product?.name || '',
          image: product?.image || product?.images?.[0] || '',
          price: Number(product?.price) || 0,
          category: product?.categoryId?.name || product?.categoryName || '',
          categoryId: product?.categoryId?._id || product?.categoryId?.id || product?.categoryId || ''
        }));
        setSuggestions(allProductSuggestions.slice(0, MAX_SUGGESTIONS));

        // Build suggested categories: group products by categoryId
        // For each unique category, keep the first product as representative
        const categoryMap = new Map();
        for (const p of allProductSuggestions) {
          const catKey = String(p.categoryId || '');
          if (catKey && !categoryMap.has(catKey)) {
            const label = getCategoryLabel(catKey);
            categoryMap.set(catKey, {
              type: 'category',
              id: p.id,
              categoryId: catKey,
              // Show the category/subcategory name, not the product name
              name: label?.name || p.category || p.name,
              // Show parent category as the subtitle
              parentCategory: label?.parent || '',
              image: p.image || label?.image || '',
              category: label?.parent ? `${label.parent}` : (p.category || 'General'),
            });
          }
        }

        // Also include categories from the store whose name matches the search term
        // (they might not have products in the API results but are still relevant)
        const lowerQ = searchQuery.toLowerCase();
        for (const cat of categories) {
          if (cat.isActive === false) continue;
          const catIdStr = String(cat.id || cat._id);
          if (categoryMap.has(catIdStr)) continue;
          if (!cat.name.toLowerCase().includes(lowerQ)) continue;
          const label = getCategoryLabel(catIdStr);
          categoryMap.set(catIdStr, {
            type: 'category',
            id: catIdStr,
            categoryId: catIdStr,
            name: label?.name || cat.name,
            parentCategory: label?.parent || '',
            image: cat.image || label?.image || '',
            category: label?.parent || 'Category',
          });
        }

        setSuggestedCategories(Array.from(categoryMap.values()).slice(0, 10));

      } catch {
        if (cancelled) return;
        const lowerQuery = searchQuery.toLowerCase();
        const cleanQuery = lowerQuery.replace(/[-\s]+/g, '');
        const fallback = getCatalogProducts()
          .filter((product) => String(product?.name || '').toLowerCase().replace(/[-\s]+/g, '').includes(cleanQuery))
          .slice(0, MAX_SUGGESTIONS)
          .map((product) => ({
            type: 'product',
            id: product.id,
            name: product.name,
            image: product.image,
            price: Number(product.price) || 0,
            category: product.categoryName || '',
            categoryId: product.categoryId || ''
          }));
        setSuggestions(fallback);

        // Build suggested categories from fallback
        const fbCatMap = new Map();
        for (const p of fallback) {
          const catKey = String(p.categoryId || p.category || p.name);
          if (!fbCatMap.has(catKey)) {
            const label = getCategoryLabel(catKey);
            fbCatMap.set(catKey, {
              type: 'category',
              id: p.id,
              categoryId: catKey,
              name: label?.name || p.category || p.name,
              parentCategory: label?.parent || '',
              image: p.image || label?.image || '',
              category: label?.parent || (p.category || 'General'),
            });
          }
        }
        // Also include matching category names from store
        for (const cat of categories) {
          if (cat.isActive === false) continue;
          const catIdStr = String(cat.id || cat._id);
          if (fbCatMap.has(catIdStr)) continue;
          if (!cat.name.toLowerCase().includes(lowerQuery)) continue;
          const label = getCategoryLabel(catIdStr);
          fbCatMap.set(catIdStr, {
            type: 'category',
            id: catIdStr,
            categoryId: catIdStr,
            name: label?.name || cat.name,
            parentCategory: label?.parent || '',
            image: cat.image || label?.image || '',
            category: label?.parent || 'Category',
          });
        }
        setSuggestedCategories(Array.from(fbCatMap.values()).slice(0, 10));
      }
      setSelectedIndex(-1);
    };


    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setSuggestedCategories([]);
    }
  }, [searchQuery]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions && (suggestedCategories.length > 0 || getRecentSearches().length > 0)) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
      }
      return;
    }

    const recentSearches = getRecentSearches();
    const totalItems = suggestedCategories.length + (searchQuery.trim() ? 0 : recentSearches.length) + (searchQuery.trim() ? 0 : popularSearches.length);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSuggestionSelect(selectedIndex);
      } else {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      const searchRoute = `/products?search=${encodeURIComponent(searchQuery.trim())}`;
      navigate(searchRoute);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (index) => {
    const recentSearches = getRecentSearches();
    let selectedItem;

    if (searchQuery.trim()) {
      // Suggested categories
      if (index < suggestedCategories.length) {
        selectedItem = suggestedCategories[index];
        const catId = typeof selectedItem.categoryId === 'object' ? (selectedItem.categoryId._id || selectedItem.categoryId.id || selectedItem.categoryId) : selectedItem.categoryId;
        if (catId && /^[0-9a-fA-F]{24}$/.test(String(catId))) {
          navigate(`/products?cid=${catId}`);
        } else {
          navigate(`/products?search=${encodeURIComponent(selectedItem.category || selectedItem.name)}`);
        }
      }
    } else {
      // Recent searches or popular searches
      if (index < recentSearches.length) {
        const query = recentSearches[index];
        setSearchQuery(query);
        saveRecentSearch(query);
        navigate(`/products?search=${encodeURIComponent(query)}`);
      } else if (index < recentSearches.length + popularSearches.length) {
        const query = popularSearches[index - recentSearches.length];
        setSearchQuery(query);
        saveRecentSearch(query);
        navigate(`/products?search=${encodeURIComponent(query)}`);
      }
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    setShowSuggestions(true);
  };

  const handleInputBlur = (e) => {
    // Delay blur to allow clicking on suggestions
    setTimeout(() => {
      if (!searchRef.current?.contains(document.activeElement)) {
        setIsFocused(false);
      }
    }, 200);
  };

  // Rotate placeholders when not focused and input is empty


  const recentSearches = getRecentSearches();
  const hasSuggestions = suggestedCategories.length > 0 || recentSearches.length > 0 || popularSearches.length > 0;

  return (
    <div className="w-full relative" ref={searchRef}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative group">
          <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-300 group-focus-within:text-gray-400 transition-colors z-10 text-lg" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search for products, brands or more"
            className="w-full pl-12 pr-4 py-2.5 bg-white border border-gray-100 rounded-lg focus:outline-none focus:border-gray-300 transition-all duration-300 text-sm text-gray-700 placeholder:text-gray-400 placeholder:font-medium shadow-none"
          />
        </div>
      </form>

      {/* Autocomplete Dropdown */}
      {showSuggestions && hasSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-y-auto"
        >
          {/* Suggested Categories */}
          {searchQuery.trim() && suggestedCategories.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Suggested Categories</div>
              {suggestedCategories.map((item, index) => (
                <button
                  key={`${item.categoryId}-${index}`}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    {item.image ? (
                      <img src={getOptimizedImageUrl(item.image, 64)} loading="lazy" decoding="async" alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <FiSearch className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 uppercase font-medium truncate">
                      {item.parentCategory ? `${item.parentCategory} › ${item.name}` : (item.category || 'Category')}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {!searchQuery.trim() && recentSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiClock className="text-xs" />
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:text-black transition-colors text-left ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiClock className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular Searches */}
          {!searchQuery.trim() && popularSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiTrendingUp className="text-xs" />
                Popular Searches
              </div>
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(recentSearches.length + index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:text-black transition-colors text-left ${selectedIndex === recentSearches.length + index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiTrendingUp className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Show All Results */}
          {searchQuery.trim() && (
            <div className="border-t border-gray-100">
              <button
                onClick={() => {
                  saveRecentSearch(searchQuery);
                  navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
                  setShowSuggestions(false);
                }}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <FiSearch className="text-gray-500 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Show all results for</p>
                  <p className="text-sm font-bold text-gray-800">"{searchQuery}"</p>
                </div>
              </button>
            </div>
          )}

          {/* No Results */}
          {searchQuery.trim() && suggestedCategories.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No products found for "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
