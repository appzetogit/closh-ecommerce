const normalizeVariantPart = (value) => String(value || "").trim().toLowerCase();
const normalizeAxisName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const getVariantSignature = (variant = {}) =>
  Object.entries(variant || {})
    .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
    .filter(([axis, value]) => axis && value)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");

const toPriceEntries = (prices) => {
  if (!prices) return [];
  if (prices instanceof Map) return Array.from(prices.entries());
  if (typeof prices === "object") return Object.entries(prices);
  return [];
};

/**
 * Price of `product` in the selected variant - the variant's own price when one is set,
 * otherwise `basePrice` (defaults to product.price). Mirrors resolveVariantPrice /
 * resolveVariantKeyFromKeys in backend/src/utils/variantKey.js, which is what placing the
 * order charges. Keys are stored in several formats ("size=m|color=red", "uk 8|", "m");
 * the product page used to miss the "size|" form, so a size priced at 799 on a 999 product
 * showed 999 and the order then came out cheaper than the checkout total.
 */
export const resolveVariantPrice = (product, selectedVariant, basePrice = product?.price) => {
  const base = Number(basePrice) || 0;
  const entries = toPriceEntries(product?.variants?.prices).map(([k, v]) => [String(k).trim(), v]);
  if (!entries.length || !selectedVariant) return base;

  const priceFor = (key) => {
    const exact = entries.find(([k]) => k === key);
    const hit = exact || entries.find(([k]) => normalizeVariantPart(k) === normalizeVariantPart(key));
    if (!hit) return null;
    const parsed = Number(hit[1]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const dynamicKey = getVariantSignature(selectedVariant);
  if (dynamicKey) {
    const p = priceFor(dynamicKey);
    if (p !== null) return p;
  }

  const size = normalizeVariantPart(selectedVariant.size || selectedVariant.Size);
  const color = normalizeVariantPart(selectedVariant.color || selectedVariant.Color);
  if (!size && !color) return base;
  const candidates = [
    [size && `size=${size}`, color && `color=${color}`].filter(Boolean).sort().join("|"),
    `${size}|${color}`,
    `${size}|`,
    `|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const p = priceFor(candidate);
    if (p !== null) return p;
  }
  return base;
};

export const formatVariantLabel = (variant = {}) => {
  const entries = Object.entries(variant || {})
    .map(([axis, value]) => [String(axis || "").trim(), String(value || "").trim()])
    .filter(([axis, value]) => axis && value);
  if (!entries.length) return "";
  return entries
    .map(([axis, value]) => {
      const axisLabel = axis
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `${axisLabel.charAt(0).toUpperCase()}${axisLabel.slice(1)}: ${value}`;
    })
    .join(" | ");
};
