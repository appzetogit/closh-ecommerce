/**
 * Gender / division resolution for catalogue browsing.
 *
 * The stored `division` on a product is a single value, but a shopper browsing
 * "Men" expects to see menswear *and* adult unisex pieces. This maps a browsing
 * term to the full set of stored values that should answer it.
 *
 * The important rule: "Unisex" means ADULT unisex. It belongs under Men and
 * Women, and must never surface under Boys / Girls / Kids — an adult unisex
 * t-shirt is not a kids product. Kids therefore get their own catch-all value,
 * "Kids", which covers both boys and girls.
 */

export const PRODUCT_DIVISIONS = ['Men', 'Women', 'Boys', 'Girls', 'Kids', 'Unisex'];

// Adult unisex — shown to men and women, never to kids.
const ADULT_UNISEX = 'Unisex';
// Kids unisex — shown to boys and girls, never to adults.
const KIDS_UNISEX = 'Kids';

const MEN = ['Men', ADULT_UNISEX];
const WOMEN = ['Women', ADULT_UNISEX];
const BOYS = ['Boys', KIDS_UNISEX];
const GIRLS = ['Girls', KIDS_UNISEX];
const ALL_KIDS = ['Boys', 'Girls', KIDS_UNISEX];

/**
 * Browsing term (as typed by a shopper, or sent as a `division` query param)
 * mapped to the stored division values that satisfy it.
 *
 * Matching is exact on the normalised term rather than substring-based:
 * "women's fashion" literally contains "men's fashion" as a substring, so a
 * `.includes()` check silently routes women's browsing to menswear.
 */
const DIVISION_ALIASES = new Map([
    ['men', MEN],
    ['man', MEN],
    ['mens', MEN],
    ["men's", MEN],
    ['male', MEN],
    ['gents', MEN],
    ["men's fashion", MEN],
    ['mens fashion', MEN],
    ['menswear', MEN],

    ['women', WOMEN],
    ['woman', WOMEN],
    ['womens', WOMEN],
    ["women's", WOMEN],
    ['female', WOMEN],
    ['ladies', WOMEN],
    ["women's fashion", WOMEN],
    ['womens fashion', WOMEN],
    ['womenswear', WOMEN],

    ['boy', BOYS],
    ['boys', BOYS],
    ["boy's", BOYS],

    ['girl', GIRLS],
    ['girls', GIRLS],
    ["girl's", GIRLS],

    ['kid', ALL_KIDS],
    ['kids', ALL_KIDS],
    ["kid's", ALL_KIDS],
    ['child', ALL_KIDS],
    ['children', ALL_KIDS],
    ["children's", ALL_KIDS],
    ['kids fashion', ALL_KIDS],
    ['kidswear', ALL_KIDS],

    // Asking for unisex explicitly means the adult unisex shelf only.
    ['unisex', [ADULT_UNISEX]],
]);

const normalise = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * @param {string} requested - a browsing term, e.g. "Men", "WOMEN", "kids"
 * @returns {string[]|null} stored division values to match, or null when the
 *   term is not a gender at all (the caller should then treat it as a category)
 */
export const resolveDivisionValues = (requested) => {
    const key = normalise(requested);
    if (!key || key === 'all') return null;
    return DIVISION_ALIASES.get(key) || null;
};

/**
 * Convenience wrapper returning a Mongo condition, or null when not a gender.
 */
export const buildDivisionFilter = (requested) => {
    const values = resolveDivisionValues(requested);
    return values ? { $in: values } : null;
};

export default { PRODUCT_DIVISIONS, resolveDivisionValues, buildDivisionFilter };
