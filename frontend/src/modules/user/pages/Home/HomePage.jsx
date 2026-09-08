import React, { useEffect, useRef, useState } from 'react';
import { useBrandStore } from '../../../../shared/store/brandStore';
import { useProductStore } from '../../../../shared/store/productStore';
import HeroSection from '../../components/HeroSection/HeroSection';
import TrustBadges from '../../components/TrustBadges/TrustBadges';
import HomeSection from '../../components/Home/HomeSection';
import OfferTiles from '../../components/Home/OfferTiles';
import CuratedCollage from '../../components/Home/CuratedCollage';
import DealsStrip from '../../components/Home/DealsStrip';
import CategoryScroller from '../../components/Home/CategoryScroller';
import BrandBestsellers from '../../components/Home/BrandBestsellers';
import PriceAnchoredGrid from '../../components/Home/PriceAnchoredGrid';
import UspStrip from '../../components/Home/UspStrip';
import TryAndBuyExplainer from '../../components/Home/TryAndBuyExplainer';
import BrandMarquee from '../../components/Home/BrandMarquee';
import ServiceAreasStrip from '../../components/Home/ServiceAreasStrip';

// Premium Scroll Reveal Animated Wrapper
const ScrollReveal = ({ children, className = "" }) => {
    const [isVisible, setIsVisible] = useState(false);
    const domRef = useRef();

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0, rootMargin: '50px' });

        const currentRef = domRef.current;
        if (currentRef) observer.observe(currentRef);

        return () => {
            if (currentRef) observer.unobserve(currentRef);
        };
    }, []);

    return (
        <div
            ref={domRef}
            className={`transition-all duration-700 ease-out transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${className}`}
        >
            {children}
        </div>
    );
};

const HomePage = () => {
    const initializeBrands = useBrandStore(state => state.initialize);
    const fetchPublicProducts = useProductStore(state => state.fetchPublicProducts);

    useEffect(() => {
        // Prefetch Discovery (Brands) data so it's ready when the modal opens
        initializeBrands();
    }, [initializeBrands]);

    useEffect(() => {
        // No product grid on the home page any more, but the "For him / For her"
        // shelves derive their FROM-price anchors from the product store, so keep
        // the same catalogue prefetch the grid used to trigger.
        //
        // Always refetch on mount rather than only when the store is empty: the
        // /products page replaces `products` with whatever it last filtered on
        // (e.g. just "Sports Shoes"), and a non-empty-but-filtered store would
        // otherwise leave these shelves with too few groups to render.
        fetchPublicProducts({ limit: 100, sort: 'newest', diversify: true });
    }, [fetchPublicProducts]);

    return (
        <div className="overflow-x-hidden pt-0 bg-white">
            {/* Media hero — rounded card, auto-advancing */}
            <ScrollReveal>
                <HeroSection />
            </ScrollReveal>

            {/* What the platform actually promises — all four are real features */}
            <ScrollReveal>
                <UspStrip />
            </ScrollReveal>

            {/* 3-up category tiles with colour bars */}
            <ScrollReveal>
                <HomeSection>
                    <OfferTiles />
                </HomeSection>
            </ScrollReveal>

            {/* Festive / promotional collage */}
            <ScrollReveal>
                <CuratedCollage />
            </ScrollReveal>

            {/* Wide deal strip (only when a campaign is live) */}
            <ScrollReveal>
                <DealsStrip />
            </ScrollReveal>

            {/* The differentiator, explained in three steps */}
            <ScrollReveal>
                <TryAndBuyExplainer />
            </ScrollReveal>

            {/* Portrait category scroller */}
            <ScrollReveal>
                <CategoryScroller />
            </ScrollReveal>

            {/* Brand cards */}
            <ScrollReveal>
                <BrandBestsellers />
            </ScrollReveal>

            {/* Sub-category grids with real "FROM ₹" anchors */}
            <ScrollReveal>
                <PriceAnchoredGrid title="For him" match={/\bmen\b|\bmens\b|\bmen's\b/i} />
            </ScrollReveal>
            <ScrollReveal>
                <PriceAnchoredGrid title="For her" match={/\bwomen\b|\bwomens\b|\bwomen's\b|\bladies\b/i} />
            </ScrollReveal>

            {/* Closing trust signals: the brand roster, where we deliver, then the badges */}
            <ScrollReveal>
                <BrandMarquee />
            </ScrollReveal>
            <ScrollReveal>
                <ServiceAreasStrip />
            </ScrollReveal>
            <ScrollReveal>
                <TrustBadges />
            </ScrollReveal>

            {/* Spacer below last section for easier touch scrolling */}
            <div className="w-full h-8 sm:h-12 bg-transparent" />
        </div>
    );
};

export default HomePage;
