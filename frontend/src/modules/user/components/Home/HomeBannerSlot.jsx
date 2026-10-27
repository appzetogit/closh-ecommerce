import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../shared/utils/api';

// Both slots share one request per page view.
let pending = null;
const loadHomeBanners = () => {
    if (!pending) {
        pending = api.get('/home-banners')
            .then((res) => res?.data || {})
            .catch(() => ({}))
            .finally(() => { setTimeout(() => { pending = null; }, 5000); });
    }
    return pending;
};

/**
 * Admin-managed hero-style banner (Admin > Banners > Home Page Banner), same
 * look as the main hero: image, title, badge and a CTA button. `slot` is "top"
 * or "bottom"; renders nothing when the slot is empty or inactive.
 */
const HomeBannerSlot = ({ slot }) => {
    const navigate = useNavigate();
    const [banner, setBanner] = useState(null);

    useEffect(() => {
        let cancelled = false;
        loadHomeBanners().then((d) => { if (!cancelled) setBanner(d?.[slot] || null); });
        return () => { cancelled = true; };
    }, [slot]);

    if (!banner?.image) return null;

    const { link, title, subtitle, badge, ctaText } = banner;
    const isExternal = /^https?:\/\//i.test(link || '');
    const hasText = !!(title || subtitle || badge || (ctaText && link));

    const go = () => {
        if (!link) return;
        if (isExternal) window.open(link, '_blank', 'noopener,noreferrer');
        else navigate(link);
    };

    return (
        <section className="w-full bg-white py-2 md:py-4">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8">
                <div
                    className={`relative h-[200px] sm:h-[220px] md:h-[280px] lg:h-[320px] w-full overflow-hidden rounded-2xl md:rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${link ? 'cursor-pointer' : ''}`}
                    onClick={go}
                >
                    <picture>
                        {banner.mobileImage && <source media="(max-width: 767px)" srcSet={banner.mobileImage} />}
                        <img src={banner.image} alt={title || 'Banner'} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    </picture>

                    {hasText && (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
                            <div className="absolute inset-0 z-20 px-4 py-3 sm:px-5 sm:py-4 md:px-12 lg:px-16 flex flex-col">
                                <div className="flex items-start justify-between w-full">
                                    <div className="flex flex-col">
                                        {title && (
                                            <h2 className="text-lg sm:text-xl md:text-3xl lg:text-4xl font-black text-white leading-tight mb-1.5 sm:mb-2 md:mb-3 tracking-tighter drop-shadow-xl max-w-[140px] sm:max-w-[160px] md:max-w-xl">
                                                {title}
                                            </h2>
                                        )}
                                        {subtitle && (
                                            <p className="hidden md:block text-[12px] text-white/70 font-medium max-w-sm leading-relaxed">
                                                {subtitle}
                                            </p>
                                        )}
                                    </div>
                                    {badge && (
                                        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[8px] md:text-[10px] font-black border border-white/20 uppercase tracking-widest mt-1">
                                            <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> {badge}
                                        </div>
                                    )}
                                </div>
                                {ctaText && link && (
                                    <div className="flex items-center justify-start mt-auto">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); go(); }}
                                            className="bg-white text-black py-2 px-5 sm:py-2.5 sm:px-6 rounded-lg font-black text-[9px] sm:text-[10px] md:text-[12px] uppercase hover:bg-black hover:text-white transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95"
                                        >
                                            {ctaText}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default HomeBannerSlot;
