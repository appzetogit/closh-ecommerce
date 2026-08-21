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

/**
 * Styling for a single order line's outcome. A Try & Buy order can end with some
 * items kept and others sent back, so each line carries its own status (`itemStatus`
 * from the vendor orders API) rather than the order-level one.
 * Shown on every line so the vendor can always read a product's own state, even when
 * the whole order shares one outcome.
 */
export const getItemStatusBadge = (itemStatus, orderStatus) => {
  const status = String(itemStatus || orderStatus || "").toLowerCase().trim();
  if (!status) return null;

  const styles = {
    delivered: { label: "Delivered", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    try_buy_completed: { label: "Delivered", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    returned: { label: "Returned", className: "bg-rose-50 text-rose-700 border-rose-200" },
    returned_to_vendor: { label: "Returned", className: "bg-rose-50 text-rose-700 border-rose-200" },
    returning_unselected_items: { label: "Returning", className: "bg-amber-50 text-amber-700 border-amber-200" },
    "return requested": { label: "Return Requested", className: "bg-amber-50 text-amber-700 border-amber-200" },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200" },
    canceled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200" },
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  if (styles[status]) return styles[status];

  // Anything still in flight (accepted / processing / picked_up / out_for_delivery …)
  return {
    label: status.replace(/_/g, " "),
    className: "bg-blue-50 text-blue-700 border-blue-200",
  };
};

/**
 * Gross vs net for a vendor's lines on one order. A Try & Buy order can come back with
 * some items returned, and those must not be counted toward what the vendor actually
 * earned — the stored group subtotal still includes them.
 */
export const getVendorLineTotals = (items = []) => {
  const excluded = ["returned", "returned_to_vendor", "cancelled", "canceled"];
  let gross = 0;
  let net = 0;

  items.forEach((item) => {
    const amount = Number(item.vendorPrice ?? item.price ?? 0) * Number(item.quantity ?? 1);
    gross += amount;
    if (!excluded.includes(String(item.itemStatus || "").toLowerCase())) net += amount;
  });

  return { gross, net, hasDeduction: net !== gross };
};

/** Per-line amount for one order item. */
export const getLineAmount = (item) =>
  Number(item?.vendorPrice ?? item?.price ?? 0) * Number(item?.quantity ?? 1);

/**
 * Order-level badge derived from the individual lines. A Try & Buy order where the
 * customer keeps some items and sends others back is neither "Delivered" nor
 * "Returned" — labelling it with the raw order status hides half of what happened.
 */
export const getOrderOutcomeBadge = (items = [], fallbackStatus) => {
  const delivered = ["delivered", "try_buy_completed"];
  const returned = ["returned", "returned_to_vendor"];
  const cancelled = ["cancelled", "canceled"];

  const statuses = items
    .map((item) => String(item.itemStatus || "").toLowerCase())
    .filter(Boolean);

  if (statuses.length === 0) return getItemStatusBadge(fallbackStatus, null);

  const nDelivered = statuses.filter((s) => delivered.includes(s)).length;
  const nReturned = statuses.filter((s) => returned.includes(s)).length;
  const nCancelled = statuses.filter((s) => cancelled.includes(s)).length;

  if (nDelivered > 0 && nReturned > 0) {
    return {
      label: "Partially Delivered",
      detail: `${nDelivered} delivered · ${nReturned} returned`,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (nDelivered > 0 && nCancelled > 0) {
    return {
      label: "Partially Delivered",
      detail: `${nDelivered} delivered · ${nCancelled} cancelled`,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  // Every line shares one outcome — reuse the normal single-status styling.
  const uniform = statuses.every((s) => s === statuses[0]) ? statuses[0] : fallbackStatus;
  return getItemStatusBadge(uniform, null);
};
