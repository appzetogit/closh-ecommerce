import React, { useEffect, useState, useRef } from 'react';
import { useDealsStore } from '../../../../shared/store/dealsStore';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const PromoBanners = () => {
    const navigate = useNavigate();
    const deals = useDealsStore(state => state.deals);
    const initialize = useDealsStore(state => state.initialize);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const dbDeals = deals.filter(d => d.status === 'active');

    // Fallback Deals matching Image 2 exactly
    const fallbackDeals = [
        {
            id: 'd1',
            brand: 'TECHNOSPORT',
            title: 'NEW Drop',
            subtitle: 'Power Your Performance',
            badge: 'STARTS ₹399',
            image: 'https://images.unsplash.com/photo-1518310352947-a230552b0b8c?auto=format&fit=crop&q=70&w=1280',
            bg: 'bg-[#E0DAF5]'
        },
        {
            id: 'd2',
            brand: 'HIGH STAR',
            title: 'NEW Drop',
            subtitle: 'Style That Speaks You',
            badge: 'BEST SELLER',
            image: 'https://images.unsplash.com/photo-1539109132314-347596adf3f3?auto=format&fit=crop&q=70&w=1280',
            bg: 'bg-[#524432]'
        },
        {
            id: 'd3',
            brand: 'peach mode',
            title: 'NEW Drop',
            subtitle: 'Grace in Its Purest Form',
            badge: 'NEW SEASON',
            image: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=70&w=1280',
            bg: 'bg-[#D18697]'
        }
    ];

    const activeDeals = dbDeals.length > 0 ? dbDeals : fallbackDeals;

    // Handle visible cards based on screen size
    const [visibleCards, setVisibleCards] = useState(3);
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) setVisibleCards(1);
            else if (window.innerWidth < 1024) setVisibleCards(2);
            else setVisibleCards(3);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const maxIndex = Math.max(0, activeDeals.length - visibleCards);

    // Auto-play
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
        }, 4000);
        return () => clearInterval(timer);
    }, [maxIndex]);

    const nextSlide = () => setCurrentIndex(prev => Math.min(prev + 1, maxIndex));
    const prevSlide = () => setCurrentIndex(prev => Math.max(prev - 1, 0));

    return (
        <div className="w-full bg-[#FAFAFA] py-8 md:py-12 overflow-hidden">
            <div className="max-w-[1600px] mx-auto px-0 md:px-8 relative">
                <div className="relative overflow-hidden px-4 md:px-0">
                    {/* Navigation Arrows */}
                    <button
                        onClick={prevSlide}
                        className={`absolute left-6 md:left-4 top-1/2 -translate-y-1/2 z-30 w-7 h-7 md:w-10 md:h-10 rounded-full bg-white/80 backdrop-blur-md shadow-lg flex items-center justify-center transition-all hover:bg-black hover:text-white ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                        <FiChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button
                        onClick={nextSlide}
                        className={`absolute right-6 md:right-4 top-1/2 -translate-y-1/2 z-30 w-7 h-7 md:w-10 md:h-10 rounded-full bg-white/80 backdrop-blur-md shadow-lg flex items-center justify-center transition-all hover:bg-black hover:text-white ${currentIndex === maxIndex ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                        <FiChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <div
                        className="flex transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
                        style={{
                            gap: '20px',
                            transform: `translateX(calc(-${currentIndex} * (${100 / visibleCards}% + ${20 / visibleCards}px)))`
                        }}
                    >
                        {activeDeals.map((deal, i) => (
                            <div
                                key={deal.id || i}
                                onClick={() => {
                                    const targetLink = deal.link === '/product' ? '/products' : (deal.link || '/products');
                                    navigate(targetLink);
                                }}
                                className={`flex-shrink-0 h-[200px] sm:h-[240px] md:h-[280px] rounded-2xl md:rounded-[32px] overflow-hidden relative cursor-pointer shadow-md group/card ${deal.bg || 'bg-gray-100'}`}
                                style={{ width: `calc(${100 / visibleCards}% - ${20 * (visibleCards - 1) / visibleCards}px)` }}
                            >
                                {/* Background Image with Overlay */}
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-[2s] group-hover/card:scale-110"
                                    style={{ backgroundImage: `url(${deal.image})` }}
                                />
                                <div className="absolute inset-0 bg-black/20 group-hover/card:bg-black/30 transition-colors" />

                                {/* Content Layer */}
                                <div className="absolute inset-0 p-4 sm:p-6 md:p-10 flex flex-col items-start justify-center">
                                    {/* Brand / Logo Area */}
                                    <div className="mb-2 sm:mb-3 md:mb-5 bg-white/10 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-white/20">
                                        <span className="text-white text-[8px] sm:text-[10px] md:text-[12px] font-black tracking-[0.2em] uppercase">
                                            {deal.brand || 'Boutique'}
                                        </span>
                                    </div>

                                    {/* Title - Serif style */}
                                    <h3 className="text-white text-2xl sm:text-3xl md:text-5xl font-serif italic font-bold leading-none mb-1 drop-shadow-xl">
                                        {deal.title}
                                    </h3>
                                    <p className="text-white text-[11px] sm:text-[13px] md:text-[16px] font-medium opacity-90 mb-4 sm:mb-6 drop-shadow-md">
                                        {deal.subtitle}
                                    </p>

                                    {/* Action Button */}
                                    <div className="flex flex-col items-center">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const targetLink = deal.link === '/product' ? '/products' : (deal.link || '/products');
                                                navigate(targetLink);
                                            }}
                                            className="bg-white text-black font-black text-[9px] md:text-[13px] px-5 py-2 md:px-8 md:py-3 rounded-lg md:rounded-xl shadow-xl hover:bg-black hover:text-white transition-all transform hover:-translate-y-1"
                                        >
                                            SHOP NOW
                                        </button>
                                        {deal.badge && (
                                            <div className="mt-2 bg-black/90 text-white text-[9px] md:text-[11px] font-black px-4 py-1.5 rounded-lg border border-white/10 tracking-wider">
                                                {deal.badge}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Navigation Dots */}
                <div className="flex justify-center items-center gap-2 mt-8 md:mt-10">
                    {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={`h-1.5 transition-all duration-500 rounded-full ${currentIndex === i ? 'w-10 bg-gray-900 shadow-sm' : 'w-2 bg-gray-300'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PromoBanners;
