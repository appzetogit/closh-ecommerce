import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrandStore } from '../../../../shared/store/brandStore';
import LazyImage from '../../../../shared/components/LazyImage';

/**
 * Continuously scrolling strip of brand logos. The list is rendered twice and
 * translated by exactly half its width, so the loop is seamless. Pauses on
 * hover so a logo can actually be clicked.
 */
const BrandMarquee = () => {
    const navigate = useNavigate();
    const { brands, initialize } = useBrandStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

    const logos = useMemo(
        () => brands.filter((b) => b.isActive !== false && b.logo && b.name),
        [brands]
    );

    if (logos.length < 6) return null;

    // Slower for longer lists so the pace stays readable.
    const durationSec = Math.max(28, logos.length * 2.4);
    const track = [...logos, ...logos];

    return (
        <section className="w-full bg-white py-4 md:py-6">
            <div className="max-w-[1600px] mx-auto">
                <div className="px-4 md:px-8 flex items-baseline justify-between mb-3">
                    <p className="text-[12px] md:text-[14px] font-black text-gray-900 tracking-tight">
                        {logos.length}+ brands on CLOSH
                    </p>
                    <p className="text-[10px] md:text-[12px] text-gray-500 font-semibold">100% genuine</p>
                </div>

                <div
                    className="group relative overflow-hidden"
                    style={{
                        maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
                        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
                    }}
                >
                    <div
                        className="flex w-max items-center gap-3 md:gap-5 pl-4 md:pl-8 closh-marquee-track group-hover:[animation-play-state:paused]"
                        style={{ animationDuration: `${durationSec}s` }}
                    >
                        {track.map((brand, i) => (
                            <button
                                key={`${brand.id || brand._id}-${i}`}
                                onClick={() => navigate(`/products?brand=${encodeURIComponent(brand.name)}`)}
                                aria-label={brand.name}
                                className="shrink-0 w-[92px] h-[52px] md:w-[128px] md:h-[68px] rounded-xl bg-[#F6F6F8] border border-black/[0.04] flex items-center justify-center px-3 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 hover:bg-white hover:shadow-md transition-all"
                            >
                                <LazyImage
                                    src={brand.logo}
                                    alt={brand.name}
                                    width={160}
                                    className="max-w-full max-h-[70%] object-contain"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes closh-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
                .closh-marquee-track { animation: closh-marquee linear infinite; will-change: transform; }
                @media (prefers-reduced-motion: reduce) { .closh-marquee-track { animation: none; } }
            `}} />
        </section>
    );
};

export default BrandMarquee;
