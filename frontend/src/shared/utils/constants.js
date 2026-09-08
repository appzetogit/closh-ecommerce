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


// Product Sizes
export const PRODUCT_SIZES = [
  "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL",
  "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50",
  "Free Size",
  "UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12",
  "US 4", "US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12",
  "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45"
];
