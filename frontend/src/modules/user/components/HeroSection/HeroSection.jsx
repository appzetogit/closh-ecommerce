import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBannerStore } from '../../../../shared/store/bannerStore';
import { useCategory } from '../../context/CategoryContext';

const HeroSection = () => {
    const navigate = useNavigate();
    const { banners, initialize } = useBannerStore();
    const { activeCategory, activeSubCategory, isSubcategoryMode } = useCategory();
    const [currentSlide, setCurrentSlide] = useState(0);
    const scrollRef = useRef(null);
    const [mobileSlide, setMobileSlide] = useState(0);
    const totalMobileSlides = 4; // SS24 + Luxe + New Arrivals + Trending

    useEffect(() => {
        initialize();
    }, [initialize]);

    // Filter active hero/home_slider banners
    const activeBanners = banners.filter(b =>
        (b.isActive !== false) &&
        (['hero', 'home_slider', 'banner'].includes(b.type))
    );

    // Fallback Banners if DB is empty
    const fallbackBanners = [
        {
            id: 'fallback-1',
            title: "The SS24 Collection",
            subtitle: "Discover the new season's most coveted pieces, crafted with uncompromising attention to luxury and detail.",
            image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2070",
            cta: "Shop Now",
            link: "/products"
        },
        {
            id: 'fallback-2',
            title: "Modern Minimalist",
            subtitle: "Elevate your daily rotation with pieces designed for versatility and timeless aesthetic.",
            image: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=2070",
            cta: "Explore Now",
            link: "/products"
        }
    ];

    const slides = activeBanners.length > 0 ? activeBanners : fallbackBanners;

    useEffect(() => {
        if (slides.length > 1) {
            const timer = setInterval(() => {
                setCurrentSlide((prev) => (prev + 1) % slides.length);
            }, 6000);
            return () => clearInterval(timer);
        }
    }, [slides.length]);

    const getHeroTheme = (categoryName) => {
        const name = categoryName?.toLowerCase() || '';
        if (name === 'hello' || name === 'women') return 'from-[#FF4081]/10 to-[#FAFAFA]';
        if (name === 'men\'s fashion' || name === 'mens' || name === 'men') return 'from-[#4FC3F7]/10 to-[#FAFAFA]';
        return 'from-gray-50 to-[#FAFAFA]';
    };

    const currentHeroBg = isSubcategoryMode ? getHeroTheme(activeSubCategory) : getHeroTheme(activeCategory);

    return (
        <section className={`w-full bg-gradient-to-b ${currentHeroBg} transition-colors duration-700`}>
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-2 md:py-4">
                <div className="relative h-[200px] sm:h-[220px] md:h-[280px] lg:h-[320px] w-full overflow-hidden rounded-2xl md:rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] group">
                    
                    {/* Main Banner Slider */}
                    {slides.map((banner, index) => (
                        <div
                            key={banner.id || index}
                            className={`absolute inset-0 transition-opacity duration-[1s] ease-in-out ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                        >
                            {/* Background Image */}
                            <div
                                className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[10s] ease-linear overflow-hidden"
                                style={{ 
                                    backgroundImage: `url(${banner.image})`,
                                    transform: index === currentSlide ? 'scale(1.1)' : 'scale(1)'
                                }}
                            />
                            
                            {/* Pro Overlay for Readability */}
                            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />

                            {/* Content Layer */}
                            <div className="absolute inset-0 z-20 px-4 py-3 sm:px-5 sm:py-4 md:px-12 lg:px-16 flex flex-col justify-center">
                                <div className={`h-full flex flex-col transition-all duration-700 transform ${index === currentSlide ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                                    
                                    {/* Top Content: Title & Badge */}
                                    <div className="flex items-start justify-between w-full">
                                        <div className="flex flex-col">
                                            <div className="hidden md:flex items-center gap-2 mb-2">
                                                <div className="h-[1.5px] w-4 bg-white/40" />
                                                <span className="text-[8px] font-bold text-white tracking-[0.3em] uppercase opacity-60">Featured Collection</span>
                                            </div>
                                            <h2 className="text-lg sm:text-xl md:text-3xl lg:text-4xl font-black text-white leading-tight mb-1.5 sm:mb-2 md:mb-3 tracking-tighter drop-shadow-xl max-w-[140px] sm:max-w-[160px] md:max-w-xl">
                                                {banner.title}
                                            </h2>
                                        </div>

                                        {/* Mobile New Badge - Top Right */}
                                        <div className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[8px] font-black border border-white/20 uppercase tracking-widest mt-1">
                                            <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> New
                                        </div>
                                    </div>

                                    {/* Middle Section: Subtitle (Desktop Only) */}
                                    <div className="md:flex-1 flex flex-col justify-center">
                                        <p className="hidden md:block text-[11px] md:text-[12px] text-white/70 font-medium max-w-sm mb-5 leading-relaxed">
                                            {banner.subtitle || "The season's most-wanted essentials, exclusively curated for you."}
                                        </p>
                                    </div>

                                    {/* Bottom Section: CTA */}
                                    <div className="flex items-center justify-start mt-auto md:mt-0">
                                        <button
                                            onClick={() => {
                                                const targetLink = banner.link === '/product' ? '/products' : banner.link;
                                                navigate(targetLink);
                                            }}
                                            className="bg-white text-black py-2 px-5 sm:py-2.5 sm:px-6 rounded-lg font-black text-[9px] sm:text-[10px] md:text-[12px] uppercase hover:bg-black hover:text-white transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95"
                                        >
                                            {banner.cta || "Shop Now"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Minimal Dots (Bottom Right) */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5">
                        {slides.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentSlide(index)}
                                className={`h-1.5 rounded-full transition-all duration-500 ${index === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes bannerIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </section>
    );
};

export default HeroSection;


