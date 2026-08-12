import { IMAGE_BASE_URL } from './constants';

/**
 * Format price with currency symbol
 */
export const formatPrice = (price, currency = "₹") => {
  const numPrice = price ?? 0;
  return `${currency}${numPrice.toLocaleString("en-IN")}`;
};

/**
 * Truncate text to specified length
 */
export const truncateText = (text, length = 50) => {
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Calculate discount percentage
 */
export const calculateDiscount = (originalPrice, discountedPrice) => {
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

/**
 * Validate email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (Indian format)
 */
export const isValidPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\D/g, ""));
};

/**
 * Get image URL (with fallback)
 */
export const getImageUrl = (image, fallback = "/placeholder.jpg") => {
  if (!image) return fallback;
  if (image.startsWith("http")) return image;
  const cleanImage = image.startsWith('/') ? image : `/${image}`;
  return `${IMAGE_BASE_URL}${cleanImage}`;
};

/**
 * Ask the API for a resized copy of a locally-hosted upload.
 *
 * The backend serves /uploads/ through an optimiser that already converts to
 * WebP on its own (see backend/src/middlewares/imageOptimizer.js). Adding a
 * width tells it to resize too, which is the difference between a 168 KB
 * full-size WebP and a 24 KB card thumbnail.
 *
 * Non-upload sources — data URIs, blobs, placeholders and any leftover
 * Cloudinary URLs — are passed straight through untouched.
 *
 * @param {string} src - Original image URL
 * @param {number} [width] - Desired render width in CSS pixels
 * @returns {string} URL to load
 */
export const getOptimizedImageUrl = (src, width) => {
  if (!src || typeof src !== "string") return src;
  if (!width || !Number.isFinite(width)) return src;
  if (!src.includes("/uploads/")) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (/[?&]w=/.test(src)) return src;

  // Request 2x so the image still looks sharp on retina/high-DPI screens.
  const target = Math.ceil(width * 2);
  return `${src}${src.includes("?") ? "&" : "?"}w=${target}`;
};

/**
 * Generate a placeholder image as SVG data URI
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string} text - Text to display on placeholder
 * @param {string} bgColor - Background color (hex or color name)
 * @param {string} textColor - Text color (hex or color name)
 * @returns {string} SVG data URI
 */
export const getPlaceholderImage = (
  width = 200,
  height = 200,
  text = "Image",
  bgColor = "#e5e7eb",
  textColor = "#9ca3af"
) => {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="${Math.min(width, height) / 8}" 
        fill="${textColor}" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >${text}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

/**
 * Decode JWT token payload
 */
export const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = window.atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Format date in a readable format
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return date.toLocaleDateString('en-IN', defaultOptions);
};
