import { useState, useRef, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../shared/store/categoryStore";

// Which root categories a product's Gender/Division should be allowed to
// pick from. "Footwear" is division-agnostic at the root (its own children
// carry the gender, e.g. "Mens Footwear"/"Womens Footwear"), so it's always
// offered regardless of division. Matched case-insensitively against the
// root category's name, since that's DB data, not a fixed enum.
const DIVISION_ROOT_NAMES = {
  Men: ["men"],
  Women: ["women"],
  Boys: ["kid"],
  Girls: ["kid"],
  Kids: ["kid"],
  Unisex: ["men", "women"],
};

const CategorySelector = ({
  value,
  subcategoryId,
  onChange,
  division,
  required = false,
  className = "",
}) => {
  const {
    categories,
    getRootCategories,
    getCategoriesByParent,
    getCategoryById,
  } = useCategoryStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const [hoveredSubcategoryId, setHoveredSubcategoryId] = useState(null);
  const [isTouch, setIsTouch] = useState(false);
  const containerRef = useRef(null);
  const parentDropdownRef = useRef(null);
  const subcategoryDropdownRef = useRef(null);
  const grandCategoryDropdownRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Detect touch device on actual touch interaction
  useEffect(() => {
    const handleTouchStart = () => {
      setIsTouch(true);
      window.removeEventListener("touchstart", handleTouchStart);
    };
    window.addEventListener("touchstart", handleTouchStart);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
    };
  }, []);

  // Get root categories (parent categories), narrowed to whatever the
  // selected division allows (e.g. Unisex -> Men + Women, both included -
  // previously this list ignored division entirely and always showed
  // every root, so a Unisex product could accidentally end up filed under
  // a Kid-only category).
  const rootCategories = useMemo(() => {
    const all = getRootCategories().filter((cat) => cat.isActive !== false);
    const allowedNames = DIVISION_ROOT_NAMES[division];
    if (!allowedNames) return all;
    return all.filter((cat) => {
      const name = String(cat.name || "").toLowerCase();
      return name === "footwear" || allowedNames.includes(name);
    });
  }, [categories, getRootCategories, division]);

  // Get selected category and subcategory info
  const selectedCategory = value ? getCategoryById(value) : null;
  const selectedSubcategory = subcategoryId
    ? getCategoryById(subcategoryId)
    : null;
  const parentCategory = selectedSubcategory
    ? getCategoryById(selectedSubcategory.parentId)
    : selectedCategory;

  // Get subcategories for hovered root category
  const hoveredSubcategories = useMemo(() => {
    if (!hoveredCategoryId) return [];
    return getCategoriesByParent(hoveredCategoryId).filter(
      (cat) => cat.isActive !== false
    );
  }, [hoveredCategoryId, categories, getCategoriesByParent]);

  // Get grand-subcategories for hovered subcategory
  const hoveredGrandSubcategories = useMemo(() => {
    if (!hoveredSubcategoryId) return [];
    return getCategoriesByParent(hoveredSubcategoryId).filter(
      (cat) => cat.isActive !== false
    );
  }, [hoveredSubcategoryId, categories, getCategoriesByParent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHoveredCategoryId(null);
        // Clear any pending timeout
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        // Cleanup timeout on unmount
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      };
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Position subcategory dropdowns
  useEffect(() => {
    if (
      hoveredCategoryId &&
      subcategoryDropdownRef.current &&
      parentDropdownRef.current &&
      containerRef.current
    ) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const parentDropdownRect = parentDropdownRef.current.getBoundingClientRect();
      const hoveredElement = parentDropdownRef.current.querySelector(
        `[data-category-id="${hoveredCategoryId}"]`
      );

      if (hoveredElement) {
        const elementRect = hoveredElement.getBoundingClientRect();
        const dropdown = subcategoryDropdownRef.current;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = 200; 

        let left = parentDropdownRect.right - containerRect.left;
        let top = elementRect.top - containerRect.top;

        if (parentDropdownRect.right + dropdownWidth > viewportWidth - 20) {
          left = parentDropdownRect.left - containerRect.left - dropdownWidth;
        }

        if (top < 0) top = 0;
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      }
    }

    // Position Grand Subcategory Dropdown
    if (
      hoveredSubcategoryId &&
      grandCategoryDropdownRef.current &&
      subcategoryDropdownRef.current &&
      containerRef.current
    ) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const subDropdownRect = subcategoryDropdownRef.current.getBoundingClientRect();
      const hoveredSubElement = subcategoryDropdownRef.current.querySelector(
        `[data-category-id="${hoveredSubcategoryId}"]`
      );

      if (hoveredSubElement) {
        const elementRect = hoveredSubElement.getBoundingClientRect();
        const dropdown = grandCategoryDropdownRef.current;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = 200;

        let left = subDropdownRect.right - containerRect.left;
        let top = elementRect.top - containerRect.top;

        if (subDropdownRect.right + dropdownWidth > viewportWidth - 20) {
          left = subDropdownRect.left - containerRect.left - dropdownWidth;
        }

        if (top < 0) top = 0;
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      }
    }
  }, [hoveredCategoryId, hoveredSubcategoryId, isOpen]);

  const handleCategorySelect = (categoryId) => {
    onChange({ target: { name: "categoryId", value: categoryId } });
    onChange({ target: { name: "subcategoryId", value: "" } });
    setIsOpen(false);
    setHoveredCategoryId(null);
    setHoveredSubcategoryId(null);
  };

  const handleSubcategorySelect = (selectedSubcategoryId, parentId) => {
    onChange({ target: { name: "categoryId", value: parentId } });
    onChange({ target: { name: "subcategoryId", value: selectedSubcategoryId } });
    setIsOpen(false);
    setHoveredCategoryId(null);
    setHoveredSubcategoryId(null);
  };

  const handleGrandSubSelect = (grandId, subId) => {
    // For 3 levels, we still store the immediate parent if product only supports 2 fields,
    // but usually categoryId in Product model is the actual leaf node.
    // However, if the app expects subcategoryId to be the mid-level, we set it.
    onChange({ target: { name: "categoryId", value: subId } });
    onChange({ target: { name: "subcategoryId", value: grandId } });
    setIsOpen(false);
    setHoveredCategoryId(null);
    setHoveredSubcategoryId(null);
  };

  // Display text
  const displayText = useMemo(() => {
    if (selectedSubcategory && parentCategory) {
      // Find parent of parent
      const root = parentCategory.parentId ? getCategoryById(parentCategory.parentId) : null;
      if (root) {
        return `${root.name} > ${parentCategory.name} (${selectedSubcategory.name})`;
      }
      return `${parentCategory.name} (${selectedSubcategory.name})`;
    }
    if (selectedCategory) {
      const root = selectedCategory.parentId ? getCategoryById(selectedCategory.parentId) : null;
      if (root) return `${root.name} (${selectedCategory.name})`;
      return selectedCategory.name;
    }
    return "Select Category";
  }, [selectedCategory, selectedSubcategory, parentCategory, getCategoryById]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected Value Display */}
      <button
        type="button"
        id="category-selector-button"
        onClick={() => {
          setIsOpen(!isOpen);
          // Clear any pending timeout when toggling
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
          }
          if (!isOpen) {
            setHoveredCategoryId(null);
            setHoveredSubcategoryId(null);
          }
        }}
        className={`w-full px-4 py-2.5 text-left border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white flex items-center justify-between transition-all duration-200 hover:border-primary-400 ${
          !value ? "text-gray-500" : "text-gray-900"
        }`}>
        <span className="truncate">{displayText}</span>
        <FiChevronDown
          className={`ml-2 text-gray-500 transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setIsOpen(false);
                setHoveredCategoryId(null);
                setHoveredSubcategoryId(null);
              }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden"
            />

            {/* Categories Dropdown (Level 0) */}
            <motion.div
              ref={parentDropdownRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
              <div className="py-1">
                {rootCategories.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-gray-500 text-center">
                    No categories available
                  </div>
                ) : (
                  rootCategories.map((category) => {
                    const children = getCategoriesByParent(category.id).filter(
                      (cat) => cat.isActive !== false
                    );
                    const hasChildren = children.length > 0;
                    const isSelected = value === category.id && !subcategoryId;

                    return (
                      <div key={category.id} data-category-id={category.id}>
                        <motion.div
                          whileHover={{
                            backgroundColor: "rgba(249, 250, 251, 1)",
                          }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors duration-150 ${
                            isSelected
                              ? "bg-primary-50 text-primary-600 font-bold"
                              : "text-gray-900"
                          }`}
                          onClick={(e) => {
                            const isRealTouch = e.nativeEvent.pointerType ? e.nativeEvent.pointerType === 'touch' : isTouch;
                            if (isRealTouch && hasChildren && hoveredCategoryId !== category.id) {
                              setHoveredCategoryId(category.id);
                              setHoveredSubcategoryId(null);
                            } else {
                              handleCategorySelect(category.id);
                            }
                          }}
                          onMouseEnter={() => {
                            if (closeTimeoutRef.current) {
                              clearTimeout(closeTimeoutRef.current);
                              closeTimeoutRef.current = null;
                            }
                            setHoveredCategoryId(category.id);
                            setHoveredSubcategoryId(null); // Reset Level 1 hover
                          }}
                          onMouseLeave={(e) => {
                            if (isTouch) return;
                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                            closeTimeoutRef.current = setTimeout(() => {
                              setHoveredCategoryId(null);
                              setHoveredSubcategoryId(null);
                            }, 300);
                          }}>
                          <span className="flex-1">{category.name}</span>
                          {hasChildren && <FiChevronRight className="ml-2 text-gray-400" />}
                        </motion.div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>

            {/* Subcategories Dropdown (Level 1) */}
            {hoveredCategoryId && hoveredSubcategories.length > 0 && (
              <motion.div
                ref={subcategoryDropdownRef}
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="absolute bg-white border border-gray-200 rounded-xl shadow-2xl min-w-[200px] z-[60]"
                onMouseEnter={() => {
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (isTouch) return;
                  if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = setTimeout(() => {
                    setHoveredCategoryId(null);
                    setHoveredSubcategoryId(null);
                  }, 300);
                }}>
                <div className="py-1 max-h-60 overflow-y-auto">
                  {hoveredSubcategories.map((subcategory) => {
                    const children = getCategoriesByParent(subcategory.id).filter(
                      (cat) => cat.isActive !== false
                    );
                    const hasChildren = children.length > 0;
                    const isSelected = subcategoryId === subcategory.id;

                    return (
                      <div key={subcategory.id} data-category-id={subcategory.id}>
                        <motion.div
                          onClick={(e) => {
                            const isRealTouch = e.nativeEvent.pointerType ? e.nativeEvent.pointerType === 'touch' : isTouch;
                            if (isRealTouch && hasChildren && hoveredSubcategoryId !== subcategory.id) {
                              setHoveredSubcategoryId(subcategory.id);
                            } else {
                              handleSubcategorySelect(subcategory.id, hoveredCategoryId);
                            }
                          }}
                          onMouseEnter={() => setHoveredSubcategoryId(subcategory.id)}
                          whileHover={{ backgroundColor: "rgba(249, 250, 251, 1)" }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors duration-150 ${
                            isSelected ? "bg-primary-50 text-primary-600 font-bold" : "text-gray-900"
                          }`}>
                          <span className="flex-1">{subcategory.name}</span>
                          {hasChildren && <FiChevronRight className="ml-2 text-gray-400" />}
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Grand-Subcategories Dropdown (Level 2) */}
            {hoveredSubcategoryId && hoveredGrandSubcategories.length > 0 && (
              <motion.div
                ref={grandCategoryDropdownRef}
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="absolute bg-white border border-gray-200 rounded-xl shadow-2xl min-w-[200px] z-[70]"
                onMouseEnter={() => {
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (isTouch) return;
                  if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = setTimeout(() => {
                    setHoveredCategoryId(null);
                    setHoveredSubcategoryId(null);
                  }, 300);
                }}>
                <div className="py-1 max-h-60 overflow-y-auto">
                  {hoveredGrandSubcategories.map((grand) => {
                    const isSelected = subcategoryId === grand.id;
                    return (
                      <div key={grand.id} data-category-id={grand.id}>
                        <motion.div
                          onClick={() => handleGrandSubSelect(grand.id, hoveredSubcategoryId)}
                          whileHover={{ backgroundColor: "rgba(249, 250, 251, 1)" }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors duration-150 ${
                            isSelected ? "bg-primary-50 text-primary-600 font-bold" : "text-gray-900"
                          }`}>
                          <span className="flex-1">{grand.name}</span>
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Hidden input for form validation */}
      {required && (
        <input type="hidden" value={value || ""} required={required} />
      )}
    </div>
  );
};

export default CategorySelector;
