import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import { useCategory } from "../../user/context/CategoryContext";

// Robust ID normalization
const normalizeId = (value) => {
  if (!value) return null;
  if (typeof value === "object") return String(value?._id || value?.id || "").trim();
  return String(value).trim();
};

const MobileCategories = () => {
  const navigate = useNavigate();
  const { categoryId: paramCategoryId } = useParams();
  const { categories: allCategoriesInStore, initialize } = useCategoryStore();
  const { activeCategory, setActiveCategory } = useCategory();

  // State for 3-level navigation
  const [selectedRootId, setSelectedRootId] = useState(null);
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const gridRef = useRef(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // 1. Process all categories to ensure normalized structure
  const allCategories = useMemo(() => {
    return allCategoriesInStore.map(cat => ({
      ...cat,
      normId: normalizeId(cat.id || cat._id),
      normParentId: normalizeId(cat.parentId)
    }));
  }, [allCategoriesInStore]);

  // 2. Filter Root Categories (Level 0)
  const rootCategories = useMemo(() => {
    const roots = allCategories.filter(cat => !cat.normParentId && cat.isActive !== false);
    // Note: Fallback removed to ensure we only show DB categories in the explorer
    return roots;
  }, [allCategories]);

  // 3. Handle Initial Selection (from params or context)
  useEffect(() => {
    if (rootCategories.length > 0) {
      let targetId = null;
      if (paramCategoryId) {
        targetId = normalizeId(paramCategoryId);
      } else if (activeCategory && activeCategory !== 'For You' && activeCategory !== 'All') {
        const matched = rootCategories.find(c => c.name.toLowerCase() === activeCategory.toLowerCase());
        if (matched) targetId = matched.normId;
      }

      if (targetId && targetId !== selectedRootId) {
        setSelectedRootId(targetId);
        setSelectedSubId(null);
      } else if (!selectedRootId && !targetId) {
        setSelectedRootId(rootCategories[0].normId);
        if (activeCategory !== rootCategories[0].name) {
          setActiveCategory(rootCategories[0].name);
        }
      }
    }
  }, [rootCategories, paramCategoryId, activeCategory, selectedRootId, setActiveCategory]);

  // 4. Subcategories (Level 1) - Linked to selected Root
  const subcategories = useMemo(() => {
    if (!selectedRootId) return [];
    return allCategories.filter(cat => cat.normParentId === selectedRootId && cat.isActive !== false);
  }, [selectedRootId, allCategories]);

  // Auto-select first subcategory when root changes
  useEffect(() => {
    if (subcategories.length > 0 && !selectedSubId) {
      setSelectedSubId(subcategories[0].normId);
    }
  }, [subcategories, selectedSubId]);

  // 5. Grand-subcategories (Level 2) - Linked to selected Sub
  const grandSubcategories = useMemo(() => {
    if (!selectedSubId) return [];
    return allCategories.filter(cat => cat.normParentId === selectedSubId && cat.isActive !== false);
  }, [selectedSubId, allCategories]);

  // Handlers
  const handleRootSelect = (cat) => {
    setSelectedRootId(cat.normId);
    setSelectedSubId(null);
    setActiveCategory(cat.name);
  };

  const handleSubSelect = (id) => {
    setSelectedSubId(id);
    if (gridRef.current) gridRef.current.scrollTop = 0;

    // Check if subcategory has children; if not, we can navigate directly
    const children = allCategories.filter(cat => cat.normParentId === id && cat.isActive !== false);
    if (children.length === 0) {
      const sub = allCategories.find(c => c.normId === id);
      const root = allCategories.find(c => c.normId === selectedRootId);
      const url = `/products?division=${root?.name}&category=${sub?.name}&cid=${id}`;
      navigate(url.replace(/\s+/g, '+'));
    }
  };

  const handleGrandSubSelect = (id) => {
    const grand = allCategories.find(c => c.normId === id);
    const sub = allCategories.find(c => c.normId === selectedSubId);
    const root = allCategories.find(c => c.normId === selectedRootId);
    const url = `/products?division=${root?.name}&category=${sub?.name}&subcategory=${grand?.name}&cid=${id}`;
    navigate(url.replace(/\s+/g, '+'));
  };

  return (
    <PageTransition>
      <div className="flex flex-col w-full bg-white h-screen overflow-hidden">

        <div className="flex flex-1 overflow-hidden">

          {/* SIDEBAR: Vertical Subcategories (Level 1) */}
          <div className="w-22 bg-[#F8F9FA] overflow-y-auto scrollbar-hide flex flex-col border-r border-gray-100 pb-32 pt-1">
            {subcategories.map((sub) => {
              const isActive = sub.normId === selectedSubId;
              return (
                <button
                  key={sub.normId}
                  onClick={() => handleSubSelect(sub.normId)}
                  className={`w-full py-4 flex flex-col items-center gap-2 transition-all relative ${isActive ? 'bg-white' : 'bg-transparent'}`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-[#FF5722] rounded-r-full" />
                  )}
                  <div className={`w-12 h-12 rounded-2xl overflow-hidden transition-all duration-300 ${isActive ? 'scale-105' : 'opacity-80'}`}>
                    <img
                      src={sub.image || "https://via.placeholder.com/150"}
                      alt={sub.name}
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  </div>
                  <span className={`text-[9.5px] font-bold text-center leading-tight px-2 transition-colors ${isActive ? 'text-[#FF5722]' : 'text-gray-600'}`}>
                    {sub.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* MAIN AREA: Grid of Grand-subcategories (Level 2) */}
          <div
            ref={gridRef}
            className="flex-1 overflow-y-auto bg-white p-3 pb-40"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedSubId || 'empty'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[12px] font-black text-gray-900 uppercase tracking-wider">
                    Shop for {subcategories.find(s => s.normId === selectedSubId)?.name || allCategories.find(c => c.normId === selectedRootId)?.name}
                  </h2>
                  <button
                    onClick={() => {
                      const activeId = selectedSubId || selectedRootId;
                      const cat = allCategories.find(c => c.normId === activeId);
                      const root = allCategories.find(c => c.normId === selectedRootId);
                      const url = `/products?division=${root?.name || ''}&category=${cat?.name || ''}&cid=${activeId}`;
                      navigate(url.replace(/\s+/g, '+'));
                    }}
                    className="text-[10px] font-bold text-[#FF5722] uppercase tracking-tight px-3 py-1 bg-[#FFF3EF] rounded-full"
                  >
                    View All
                  </button>
                </div>

                {grandSubcategories.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-4 md:gap-x-8 gap-y-6 md:gap-y-10">
                    {grandSubcategories.map((grand) => (
                      <button
                        key={grand.normId}
                        onClick={() => handleGrandSubSelect(grand.normId)}
                        className="flex flex-col items-center gap-1.5 group transition-transform active:scale-95"
                      >
                        <div className="w-20 h-20 md:w-24 md:h-24 bg-[#F8F9FA] rounded-[24px] overflow-hidden p-0 flex items-center justify-center border border-transparent transition-all group-hover:border-[#FF5722] shadow-sm">
                          <img
                            src={grand.image || "https://via.placeholder.com/150"}
                            alt={grand.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        </div>
                        <span className="text-[10px] md:text-[12px] font-bold text-gray-700 text-center leading-tight max-w-[80px] md:max-w-[100px] group-hover:text-[#FF5722] transition-colors py-1">
                          {grand.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default MobileCategories;
