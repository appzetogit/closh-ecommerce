// API Configuration
// Intelligent URL detection for Production vs Development
const getApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('closh.in') || hostname.includes('vercel.app');
    
    if (isProduction) return 'https://api.closh.in/api';
    return envUrl || 'http://localhost:5000/api';
};

const getImageUrlBase = () => {
    const envUrl = import.meta.env.VITE_IMAGE_BASE_URL;
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('closh.in') || hostname.includes('vercel.app');
    
    if (isProduction) return 'https://api.closh.in';
    return envUrl || 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();
export const IMAGE_BASE_URL = getImageUrlBase();

// App Constants
export const APP_NAME = 'Appzeto multi vendor E-commerce';
export const APP_DESCRIPTION = 'Multi Vendor E-commerce Platform';

// Animation Durations
export const ANIMATION_DURATION = {
  FAST: 0.3,
  NORMAL: 0.5,
  SLOW: 0.8,
};

// Breakpoints (matching Tailwind)
export const BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};


// Kids clothing is sized by age, not by the adult S/M/L chart.
export const KIDS_SIZES = [
  "0-3 M", "3-6 M", "6-9 M", "9-12 M", "12-18 M", "18-24 M",
  "2-3 Y", "3-4 Y", "4-5 Y", "5-6 Y", "6-7 Y", "7-8 Y", "8-9 Y", "9-10 Y",
  "10-11 Y", "11-12 Y", "12-13 Y", "13-14 Y", "14-15 Y", "15-16 Y",
];

// Kids footwear runs on its own small UK scale.
export const KIDS_SHOE_SIZES = [
  "UK 2 (Kids)", "UK 3 (Kids)", "UK 4 (Kids)", "UK 5 (Kids)", "UK 6 (Kids)",
  "UK 7 (Kids)", "UK 8 (Kids)", "UK 9 (Kids)", "UK 10 (Kids)", "UK 11 (Kids)",
  "UK 12 (Kids)", "UK 13 (Kids)",
];

// Product Sizes
export const PRODUCT_SIZES = [
  "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL",
  "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50",
  "Free Size",
  "UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12",
  "US 4", "US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12",
  "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45",
  ...KIDS_SIZES,
  ...KIDS_SHOE_SIZES,
];
