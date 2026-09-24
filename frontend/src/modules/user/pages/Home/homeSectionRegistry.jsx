// Maps the section keys the admin panel's Content & Features > Home Page tab
// toggles/orders (see settingsStore.js's defaultSettings.homepage.sections and
// ContentFeaturesSettings.jsx) to the actual component that renders them.
//
// Adding a new homepage section: build the component, add one entry here with
// a stable key, then add the same key to settingsStore.js's default sections
// map so admin sees a toggle for it. That's the whole wiring — HomePage.jsx
// itself never needs to change again.
import React from 'react';
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
import TrustBadges from '../../components/TrustBadges/TrustBadges';
import HomeSection from '../../components/Home/HomeSection';

export const homeSectionRegistry = {
    uspStrip: { render: () => <UspStrip /> },
    offerTiles: { render: () => <HomeSection><OfferTiles /></HomeSection> },
    curatedCollage: { render: () => <CuratedCollage /> },
    dealsStrip: { render: () => <DealsStrip /> },
    tryAndBuyExplainer: { render: () => <TryAndBuyExplainer /> },
    categoryScroller: { render: () => <CategoryScroller /> },
    brandBestsellers: { render: () => <BrandBestsellers /> },
    forHim: { render: () => <PriceAnchoredGrid title="For him" match={/\bmen\b|\bmens\b|\bmen's\b/i} /> },
    forHer: { render: () => <PriceAnchoredGrid title="For her" match={/\bwomen\b|\bwomens\b|\bwomen's\b|\bladies\b/i} /> },
    brandMarquee: { render: () => <BrandMarquee /> },
    serviceAreasStrip: { render: () => <ServiceAreasStrip /> },
    trustBadges: { render: () => <TrustBadges /> },
};

// The order the sections would appear in if the admin never configured
// anything for a given key — keeps the original, tested layout as the
// fallback rather than an arbitrary object-key order.
export const homeSectionDefaultOrder = Object.keys(homeSectionRegistry);
