import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDealsStore } from '../../../../shared/store/dealsStore';
import LazyImage from '../../../../shared/components/LazyImage';

const resolveLink = (link) => (link === '/product' ? '/products' : link || '/products');

/**
 * Wide "STEAL DEALS"-style banner. Uses the first active campaign; renders
 * nothing when there is no deal rather than inventing one.
 *
 * The store hands back two shapes: API campaigns ({ title, subtitle, badge,
 * link }) and its built-in defaults ({ name, promo }). Both are normalised here.
 */
const DealsStrip = () => {
    const navigate = useNavigate();
    const deals = useDealsStore((state) => state.deals);
    const initialize = useDealsStore((state) => state.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const raw = deals.find((d) => d.status === 'active');
    if (!raw) return null;

    const deal = {
        title: raw.title || raw.name || 'Steal deals',
        subtitle: raw.subtitle || raw.description || 'Grab your favourite picks before they go',
        badge: raw.badge || raw.promo || '',
        image: raw.image,
        link: resolveLink(raw.link),
    };

    const hasRealImage = deal.image && !String(deal.image).includes('placeholder');

    return (
        <section className="w-full bg-white py-3 md:py-5">
            <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                <button
                    onClick={() => navigate(deal.link)}
                    className="group relative w-full overflow-hidden rounded-xl md:rounded-2xl text-left active:scale-[0.99] transition-transform"
                    style={{ background: 'linear-gradient(90deg, #5B3FD9 0%, #7C5CFF 55%, #A78BFA 100%)' }}
                >
                    <div className="flex items-center justify-between gap-3 h-[92px] md:h-[140px] px-4 md:px-8">
                        <div className="min-w-0">
                            <p className="text-white text-[18px] md:text-[30px] font-black uppercase tracking-tight leading-none drop-shadow">
                                {deal.title}
                            </p>
                            <p className="text-white/85 text-[10px] md:text-[13px] font-semibold mt-1 truncate">
                                {deal.subtitle}
                            </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                            {hasRealImage && (
                                <div className="hidden xs:block w-16 h-16 md:w-28 md:h-28 rounded-lg overflow-hidden ring-2 ring-white/30 bg-white/10">
                                    <LazyImage
                                        src={deal.image}
                                        alt={deal.title}
                                        width={200}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            )}
                            {deal.badge && (
                                <div className="bg-white text-[#5B3FD9] text-[10px] md:text-[13px] font-black px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg shadow-md whitespace-nowrap">
                                    {deal.badge}
                                </div>
                            )}
                        </div>
                    </div>
                </button>
            </div>
        </section>
    );
};

export default DealsStrip;
