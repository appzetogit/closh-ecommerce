import Category from '../models/Category.model.js';

// Categories rarely change their own tryAndBuyEnabled flag, and every order-
// placement request needs to walk the same tree, so a short in-memory cache
// avoids re-fetching the whole categories collection on every checkout.
let categoryCache = null;
let categoryCacheAt = 0;
const CACHE_TTL_MS = 60 * 1000;

const loadCategoryIndex = async () => {
    const now = Date.now();
    if (categoryCache && now - categoryCacheAt < CACHE_TTL_MS) return categoryCache;

    const rows = await Category.find({}, { parentId: 1, tryAndBuyEnabled: 1 }).lean();
    const byId = new Map(rows.map((c) => [String(c._id), c]));
    categoryCache = byId;
    categoryCacheAt = now;
    return byId;
};

// Call this after any admin/vendor edit to a category's tryAndBuyEnabled flag
// so the change takes effect immediately instead of waiting out the TTL.
export const invalidateCategoryFeatureCache = () => {
    categoryCache = null;
};

/**
 * Walks a category's ancestor chain (itself first, then parentId up to the
 * root) looking for the nearest explicit tryAndBuyEnabled value. Returns
 * `false` as soon as any node in the chain explicitly disables it, `true` if
 * any node explicitly enables it before an ancestor disables it, or `null` if
 * nothing in the chain ever sets the flag (caller should treat that as
 * "enabled" — the product-level default).
 *
 * A `false` found anywhere on the way up wins immediately: a category-wide
 * ban should not be overridable by a more specific child category setting
 * `true` underneath it.
 */
const resolveCategoryTryAndBuy = async (categoryId, depthGuard = 0) => {
    if (!categoryId || depthGuard > 20) return null; // depthGuard: guards against a corrupt parentId cycle
    const index = await loadCategoryIndex();
    const node = index.get(String(categoryId));
    if (!node) return null;

    if (node.tryAndBuyEnabled === false) return false;
    if (node.tryAndBuyEnabled === true) return true;

    return resolveCategoryTryAndBuy(node.parentId, depthGuard + 1);
};

/**
 * The single source of truth for "can this product be ordered as Try & Buy",
 * combining the product's own flag with its category tree. A category-level
 * `false` overrides everything (see the schema comment on Category.model.js);
 * short of that, the product's own flag (default true) decides.
 *
 * @param {{ tryAndBuyEnabled?: boolean, categoryId?: any }} product
 */
export const resolveTryAndBuyEligibility = async (product) => {
    const categoryVerdict = await resolveCategoryTryAndBuy(product?.categoryId);
    if (categoryVerdict === false) return false;
    return product?.tryAndBuyEnabled !== false;
};
