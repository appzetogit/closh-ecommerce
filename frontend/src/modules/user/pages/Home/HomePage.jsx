import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useBrandStore } from '../../../../shared/store/brandStore';
import { useProductStore } from '../../../../shared/store/productStore';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import HeroSection from '../../components/HeroSection/HeroSection';
import { homeSectionRegistry, homeSectionDefaultOrder } from './homeSectionRegistry';

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
    const initializePublicSettings = useSettingsStore(state => state.initializePublic);
    const homepageSettings = useSettingsStore(state => state.settings?.homepage);

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

    useEffect(() => {
        // Drives which homepage sections render and in what order — set from
        // Admin > Content & Features > Home Page.
        initializePublicSettings();
    }, [initializePublicSettings]);

    // A key missing from settings (nothing saved yet, or a newly added
    // section the admin hasn't touched) defaults to enabled, at its
    // registry-order position — a config gap should never silently delete a
    // section that was actually shipped.
    const orderedSectionKeys = useMemo(() => {
        const configured = homepageSettings?.sections || {};
        return [...homeSectionDefaultOrder]
            .filter((key) => configured[key]?.enabled !== false)
            .sort((a, b) => {
                const orderA = configured[a]?.order ?? homeSectionDefaultOrder.indexOf(a);
                const orderB = configured[b]?.order ?? homeSectionDefaultOrder.indexOf(b);
                return orderA - orderB;
            });
    }, [homepageSettings]);

    const heroEnabled = homepageSettings?.heroBannerEnabled !== false;

    return (
        <div className="overflow-x-hidden pt-0 bg-white">
            {/* Media hero — rounded card, auto-advancing */}
            {heroEnabled && (
                <ScrollReveal>
                    <HeroSection />
                </ScrollReveal>
            )}

            {orderedSectionKeys.map((key) => (
                <ScrollReveal key={key}>
                    {homeSectionRegistry[key].render()}
                </ScrollReveal>
            ))}

            {/* Spacer below last section for easier touch scrolling */}
            <div className="w-full h-8 sm:h-12 bg-transparent" />
        </div>
    );
};

export default HomePage;
