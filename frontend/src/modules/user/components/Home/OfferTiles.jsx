import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useCategory } from '../../context/CategoryContext';
import LazyImage from '../../../../shared/components/LazyImage';

/**
 * 3-up grid of category tiles, each with a solid colour bar across the bottom.
 * Colour comes from the existing per-category palette so it stays in step with
 * the header chips. The list is trimmed to whole rows of three so the grid
 * never ends on an orphan tile.
 */
const OfferTiles = ({ limit = 6 }) => {
    const navigate = useNavigate();
    const { categories, initialize } = useCategoryStore();
    const { getCategoryColor } = useCategory();

    useEffect(() => {
        initialize();
    }, [initialize]);

    const tiles = useMemo(() => {
        const withImages = categories
            .filter((c) => !c.parentId && c.isActive !== false && c.image)
            .slice(0, limit);
        const wholeRows = Math.floor(withImages.length / 3) * 3;
        return withImages.slice(0, wholeRows);
    }, [categories, limit]);

    if (tiles.length < 3) return null;

    // On wide screens a single row of three reads better than three tiles
    // marooned in a six-column track.
    const desktopCols = tiles.length >= 6 ? 'md:grid-cols-6' : 'md:grid-cols-3';

    return (
        <div className={`grid grid-cols-3 ${desktopCols} gap-2.5 md:gap-4`}>
            {tiles.map((cat) => {
                const color = getCategoryColor(cat.name) || '#111827';
                return (
                    <button
                        key={cat.id || cat._id}
                        onClick={() => navigate(`/category/${cat.id || cat._id}`)}
                        className="group relative flex flex-col overflow-hidden rounded-xl md:rounded-2xl bg-gray-100 text-left active:scale-[0.98] transition-transform"
                    >
                        <div className="relative w-full aspect-[4/5] overflow-hidden">
                            <LazyImage
                                src={cat.image}
                                alt={cat.name}
                                width={300}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                        </div>
                        <div
                            className="w-full px-1.5 py-1.5 md:py-2 text-center text-white text-[9px] md:text-[11px] font-black uppercase tracking-wide truncate"
                            style={{ backgroundColor: color }}
                        >
                            {cat.name}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default OfferTiles;
