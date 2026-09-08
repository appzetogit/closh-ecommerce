import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBannerStore } from '../../../../shared/store/bannerStore';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import LazyImage from '../../../../shared/components/LazyImage';

const COLLAGE_BANNER_TYPES = ['festival_offer', 'promotional', 'side_banner'];

const resolveLink = (link) => (link === '/product' ? '/products' : link || '/products');

const parentIdOf = (cat) => {
    const p = cat?.parentId;
    if (!p) return null;
    return String(typeof p === 'object' ? (p._id ?? p.id ?? '') : p);
};

/**
 * Round-robin across parents so two tiles from the same root never sit next
 * to each other (Men, Women, Footwear, Men, Women, …).
 */
const interleaveByParent = (items) => {
    const buckets = new Map();
    for (const item of items) {
        if (!buckets.has(item.parentKey)) buckets.set(item.parentKey, []);
        buckets.get(item.parentKey).push(item);
    }
    const out = [];
    const queues = [...buckets.values()];
    while (out.length < items.length) {
        for (const q of queues) {
            if (q.length) out.push(q.shift());
        }
    }
    return out;
};

/**
 * Editorial collage: one tall tile on the left, a 2×2 grid on the right.
 *
 * Source priority:
 *   1. festival / promotional banners set by the admin
 *   2. sub-categories (Women · Top Wear, Men · Bottom Wear, …) — fresh imagery
 *      that isn't already on the page, unlike the root categories which the
 *      offer tiles directly above already show
 *   3. root categories, only if fewer than three sub-categories carry an image
 *
 * With fewer than five tiles the right side collapses to two stacked tiles so
 * the grid never shows an empty cell.
 */
const CuratedCollage = () => {
    const navigate = useNavigate();
    const { banners, initialize: initBanners } = useBannerStore();
    const { categories, initialize: initCategories } = useCategoryStore();

    useEffect(() => {
        initBanners();
        initCategories();
    }, [initBanners, initCategories]);

    const { heading, subheading, tiles } = useMemo(() => {
        const promo = banners
            .filter((b) => b.isActive !== false && COLLAGE_BANNER_TYPES.includes(b.type) && b.image)
            .slice(0, 5)
            .map((b) => ({
                key: b.id || b._id,
                image: b.image,
                eyebrow: '',
                label: b.title || '',
                to: resolveLink(b.link),
            }));

        if (promo.length >= 3) {
            return {
                heading: promo[0].label || 'Festive picks',
                subheading: 'Everything you need, in one place',
                tiles: promo,
            };
        }

        const active = categories.filter((c) => c.isActive !== false);
        const rootsById = new Map(
            active.filter((c) => !parentIdOf(c)).map((c) => [String(c.id || c._id), c])
        );

        const subs = active
            .filter((c) => c.image && rootsById.has(parentIdOf(c)))
            .map((c) => {
                const parent = rootsById.get(parentIdOf(c));
                return {
                    key: c.id || c._id,
                    image: c.image,
                    eyebrow: parent?.name || '',
                    label: c.name,
                    parentKey: parentIdOf(c),
                    to: `/category/${c.id || c._id}`,
                };
            });

        if (subs.length >= 3) {
            return {
                heading: 'Shop the edit',
                subheading: 'Fresh picks across every wardrobe',
                tiles: interleaveByParent(subs).slice(0, 5),
            };
        }

        const roots = [...rootsById.values()]
            .filter((c) => c.image)
            .slice(0, 5)
            .map((c) => ({
                key: c.id || c._id,
                image: c.image,
                eyebrow: '',
                label: c.name,
                to: `/category/${c.id || c._id}`,
            }));

        return {
            heading: 'Curated for you',
            subheading: 'Hand-picked edits across every category',
            tiles: roots,
        };
    }, [banners, categories]);

    if (tiles.length < 3) return null;

    const [lead, ...rest] = tiles;
    const isFull = rest.length >= 4;
    const sideTiles = rest.slice(0, isFull ? 4 : 2);

    const Tile = ({ tile, tall = false }) => (
        <button
            onClick={() => navigate(tile.to)}
            className={`group relative w-full overflow-hidden rounded-xl md:rounded-2xl bg-gray-100 text-left active:scale-[0.98] transition-transform ${tall ? 'h-full' : 'aspect-square'}`}
        >
            <LazyImage
                src={tile.image}
                alt={tile.label}
                width={tall ? 600 : 400}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {/* Bottom-anchored label on a soft gradient, so the type stays legible on any photo. */}
            <div className="absolute inset-x-0 bottom-0 pt-10 pb-2.5 px-2.5 md:pb-3 md:px-3 bg-gradient-to-t from-black/70 via-black/25 to-transparent">
                {tile.eyebrow && (
                    <p className="text-white/75 text-[8px] md:text-[10px] font-bold uppercase tracking-[0.18em] leading-none mb-1">
                        {tile.eyebrow}
                    </p>
                )}
                <p className={`text-white font-black leading-tight drop-shadow ${tall ? 'text-[16px] md:text-[22px]' : 'text-[12px] md:text-[15px]'}`}>
                    {tile.label}
                </p>
            </div>
        </button>
    );

    const gridCols = isFull
        ? 'grid-cols-[1.25fr_1fr_1fr] md:grid-cols-4'
        : 'grid-cols-2 md:grid-cols-3';

    return (
        <section className="w-full bg-white py-4 md:py-6">
            <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                <div className="text-center mb-3 md:mb-5">
                    <h2 className="text-[22px] md:text-[32px] font-black text-[#7A1E1E] tracking-tight leading-none">
                        <span className="text-[#C9A24D] mr-2">✦</span>
                        {heading}
                        <span className="text-[#C9A24D] ml-2">✦</span>
                    </h2>
                    <p className="text-[11px] md:text-[13px] text-gray-500 font-medium mt-1">{subheading}</p>
                </div>

                <div className={`grid ${gridCols} grid-rows-2 gap-2.5 md:gap-4`}>
                    <div className="row-span-2 md:col-span-2 min-h-[260px] md:min-h-[420px]">
                        <Tile tile={lead} tall />
                    </div>
                    {sideTiles.map((tile) => (
                        <Tile key={tile.key} tile={tile} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default CuratedCollage;
