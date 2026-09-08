import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useProductStore } from '../../../../shared/store/productStore';
import LazyImage from '../../../../shared/components/LazyImage';
import { formatPrice } from '../../../../shared/utils/helpers';
import HomeSection from './HomeSection';

const norm = (v) => String(v || '').trim().toLowerCase();

/**
 * "For him" / "For her" grid, built from the products already in the store:
 * every product carries a `division` (Men / Women) and a leaf category name,
 * so grouping by that name yields real shelves ("Shirts", "Kurtas", …) each
 * with a real "FROM ₹x" — the cheapest listing in that group.
 *
 * `match` is a regex tested against product.division (and against root
 * category names to resolve the "View all" link). Renders nothing until at
 * least four groups exist rather than padding with placeholders.
 */
const PriceAnchoredGrid = ({ title, match, limit = 8 }) => {
    const navigate = useNavigate();
    const { categories, initialize } = useCategoryStore();
    const products = useProductStore((state) => state.products);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const root = useMemo(
        () => categories.find((c) => !c.parentId && c.isActive !== false && match.test(String(c.name || ''))),
        [categories, match]
    );

    const groups = useMemo(() => {
        const byCategory = new Map();
        for (const p of products) {
            if (!match.test(String(p.division || ''))) continue;
            const name = String(p.category || '').trim();
            if (!name || norm(name) === 'general') continue;
            const price = Number(p.discountedPrice ?? p.price);
            if (!Number.isFinite(price) || price <= 0) continue;

            const existing = byCategory.get(norm(name));
            if (!existing) {
                byCategory.set(norm(name), { key: norm(name), name, image: p.image, from: price, count: 1 });
            } else {
                existing.count += 1;
                if (price < existing.from) existing.from = price;
            }
        }
        // Busiest shelves first, so the grid leads with what the catalogue is deep in.
        return [...byCategory.values()].sort((a, b) => b.count - a.count).slice(0, limit);
    }, [products, match, limit]);

    if (groups.length < 4) return null;

    const divisionName = root?.name || '';
    const viewAllTo = root ? `/category/${root.id || root._id}` : '/products';

    return (
        <HomeSection title={title} viewAllTo={viewAllTo}>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-x-2 gap-y-4 md:gap-4">
                {groups.map((g) => (
                    <button
                        key={g.key}
                        onClick={() => {
                            const params = new URLSearchParams({ category: g.name });
                            if (divisionName) params.set('division', divisionName);
                            navigate(`/products?${params.toString()}`);
                        }}
                        className="group flex flex-col items-center text-center active:scale-[0.97] transition-transform"
                    >
                        <div className="relative w-full aspect-square">
                            <div className="absolute inset-0 rounded-full overflow-hidden bg-[#F3F4F6] ring-1 ring-black/5">
                                <LazyImage
                                    src={g.image}
                                    alt={g.name}
                                    width={200}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            </div>
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#FFC629] text-gray-900 text-[8px] md:text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                                FROM {formatPrice(g.from)}
                            </span>
                        </div>
                        <span className="mt-2 text-[10px] md:text-[12px] font-bold text-gray-800 leading-tight line-clamp-2 px-0.5">
                            {g.name}
                        </span>
                    </button>
                ))}
            </div>
        </HomeSection>
    );
};

export default PriceAnchoredGrid;
