/**
 * Gender / division browsing rules for the storefront.
 *
 * This mirrors backend/src/utils/divisionFilter.js. The API already filters
 * correctly, but some screens re-filter the returned list client-side when the
 * shopper flips a gender chip, and an exact-match check there would silently
 * drop the unisex pieces the API deliberately included.
 *
 * The rule: "Unisex" is ADULT unisex and belongs under Men and Women only.
 * Kids get their own catch-all, "Kids", which covers Boys and Girls. An adult
 * unisex t-shirt must never surface under a kids filter.
 */

const MEN = ['men', 'unisex'];
const WOMEN = ['women', 'unisex'];
const BOYS = ['boys', 'kids'];
const GIRLS = ['girls', 'kids'];
const ALL_KIDS = ['boys', 'girls', 'kids'];

// Exact keys, not substring tests: "women's fashion" contains "men's fashion",
// so a .includes() check routes women's browsing into menswear.
const ALIASES = new Map([
    ['men', MEN], ['man', MEN], ['mens', MEN], ["men's", MEN], ['male', MEN],
    ['gents', MEN], ["men's fashion", MEN], ['mens fashion', MEN], ['menswear', MEN],

    ['women', WOMEN], ['woman', WOMEN], ['womens', WOMEN], ["women's", WOMEN],
    ['female', WOMEN], ['ladies', WOMEN], ["women's fashion", WOMEN],
    ['womens fashion', WOMEN], ['womenswear', WOMEN],

    ['boy', BOYS], ['boys', BOYS], ["boy's", BOYS],
    ['girl', GIRLS], ['girls', GIRLS], ["girl's", GIRLS],

    ['kid', ALL_KIDS], ['kids', ALL_KIDS], ["kid's", ALL_KIDS],
    ['child', ALL_KIDS], ['children', ALL_KIDS], ["children's", ALL_KIDS],
    ['kids fashion', ALL_KIDS], ['kidswear', ALL_KIDS],

    ['unisex', ['unisex']],
]);

const normalise = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * @returns {string[]|null} lower-cased division values that satisfy the term,
 *   or null when the term is not a gender at all (caller should not filter).
 */
export const resolveDivisionValues = (requested) => {
    const key = normalise(requested);
    if (!key || key === 'all') return null;
    return ALIASES.get(key) || null;
};

/**
 * True when `product` belongs on the shelf the shopper is browsing.
 * Unknown terms never filter anything out.
 */
export const productMatchesDivision = (product, requested) => {
    const values = resolveDivisionValues(requested);
    if (!values) return true;
    return values.includes(normalise(product?.division));
};

export default { resolveDivisionValues, productMatchesDivision };
