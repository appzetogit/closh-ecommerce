// Shared with modules/user/controllers/order.controller.js (which used to
// define these locally) and utils/stockRestore.js. Resolves the same
// composite stockMap/prices key (e.g. "size=m|color=red") from either an
// explicit orderItem.variantKey or a raw {size, color, ...} variant object,
// so decrement-at-order and restore-at-return always agree on which bucket
// they're touching.

export const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

export const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

export const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

export const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

export const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (stockMap instanceof Map) return Array.from(stockMap.entries());
    if (typeof stockMap === 'object') return Object.entries(stockMap);
    return [];
};

export const resolveVariantKeyFromKeys = (keys = [], variant = {}) => {
    if (!keys || !keys.length) return null;

    const size = normalizeVariantPart(variant?.size || variant?.Size || '');
    const color = normalizeVariantPart(variant?.color || variant?.Color || '');
    if (!size && !color) return null;

    const candidates = [
        [size && `size=${size}`, color && `color=${color}`].filter(Boolean).sort().join('|'),
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
        const exact = keys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = keys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};

/**
 * The price a customer pays for `product` in the selected variant: the variant's own price
 * from variants.prices when one is set, otherwise the product's base price. This is what
 * placing an order charges, so anything that shows a price before checkout (cart, checkout
 * totals) must use it too. The cart used to show the base price only, so a product whose
 * size had its own price (e.g. base 999, size UK 8 at 799) was quoted at 999 and then
 * charged 799 when the order was placed.
 */
export const resolveVariantPrice = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    const variantKey = resolveOrderItemVariantKey(product, { variant: selectedVariant });
    if (variantKey) {
        const priceMatch = toVariantPriceEntries(product?.variants?.prices).find(([k]) => String(k).trim() === variantKey);
        const price = priceMatch ? Number(priceMatch[1]) : basePrice;
        if (Number.isFinite(price) && price >= 0) return { price, variantKey };
    }
    return { price: basePrice, variantKey: variantKey || null };
};

/**
 * Keep per-variant prices in line with the product's base price.
 *
 * - force: every variant gets `basePrice`. Used for vendor saves - the vendor screens show
 *   the size price as "Same as base price" (read-only), so whatever variant prices they post
 *   back are just the old stored values.
 * - otherwise: only variants still on one of `previousPrices` (the old base) move to the new
 *   base; a size the admin priced differently on purpose keeps its own price.
 *
 * Without this a base price change left the old figure on every size: the vendor raised a
 * product from 799 to 999, every screen showed 999, and checkout charged the size's stale 799.
 */
export const alignVariantPrices = (prices, basePrice, { force = false, previousPrices = [] } = {}) => {
    const base = Number(basePrice);
    if (!Number.isFinite(base) || base <= 0) return prices;
    const entries = toVariantPriceEntries(prices);
    if (!entries.length) return prices;
    const previous = previousPrices.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const next = {};
    for (const [key, value] of entries) {
        const current = Number(value);
        const followsBase = force || !Number.isFinite(current) || previous.includes(current);
        next[key] = followsBase ? base : current;
    }
    return next;
};

export const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    return resolveVariantKeyFromKeys(existingKeys, orderItem?.variant);
};
