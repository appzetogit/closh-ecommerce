import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CategoryContext = createContext();

import { categoryColors, categoryGradients } from '../data/categoryConstants';


export const CategoryProvider = ({ children }) => {
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeSubCategory, setActiveSubCategory] = useState('All');

    // Overriding the setter to reset subcategory to All when root category changes
    const setCategoryWithReset = useCallback((newCategory) => {
        setActiveCategory(newCategory);
        setActiveSubCategory('All');
    }, []);

    const getCategoryColor = useCallback((name) => {
        if (!name) return categoryColors['For You'];

        // Case-insensitive lookup
        const entry = Object.entries(categoryColors).find(
            ([key]) => key.toLowerCase() === name.toLowerCase() ||
                name.toLowerCase().includes(key.toLowerCase())
        );

        return entry ? entry[1] : categoryColors['For You'];
    }, []);

    const getCategoryGradient = useCallback((name) => {
        if (!name) return categoryGradients['For You'];
        const entry = Object.entries(categoryGradients).find(
            ([key]) => key.toLowerCase() === name.toLowerCase() ||
                name.toLowerCase().includes(key.toLowerCase())
        );
        
        if (entry) return entry[1];

        // Generate a deterministic soft pastel gradient for unmapped categories
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue1 = Math.abs(hash) % 360;
        const hue2 = (hue1 + 40) % 360; // Slightly shifted hue for a smooth gradient
        
        return `linear-gradient(135deg, hsl(${hue1}, 80%, 85%) 0%, hsl(${hue2}, 80%, 95%) 100%)`;
    }, []);

    const value = useMemo(() => ({
        activeCategory,
        setActiveCategory: setCategoryWithReset,
        activeSubCategory,
        setActiveSubCategory,
        getCategoryColor,
        getCategoryGradient,
        categoryColors,
        categoryGradients
    }), [activeCategory, setCategoryWithReset, activeSubCategory, getCategoryColor, getCategoryGradient]);

    return (
        <CategoryContext.Provider value={value}>
            {children}
        </CategoryContext.Provider>
    );
};

export const useCategory = () => {
    const context = useContext(CategoryContext);
    if (!context) {
        throw new Error('useCategory must be used within a CategoryProvider');
    }
    return context;
};
