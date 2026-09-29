import Category from '../models/Category.model.js';

const MIRROR_ROOT_NAMES = { men: 'women', women: 'men' };
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * For a Unisex product's category, find the same-named category under the
 * opposite Men/Women root - e.g. "Men > Topwear > Shirt" -> the "Shirt"
 * under "Women > Topwear", if that path exists there too. Walks the given
 * category's ancestor chain to build its name path, then re-resolves that
 * same path starting from the sibling root. Returns null when the category
 * isn't under a Men/Women root, or when the mirror root has no matching
 * category at some level of the path.
 */
export const findMirrorCategoryId = async (categoryId) => {
    if (!categoryId) return null;

    const path = [];
    let current = await Category.findById(categoryId).lean();
    if (!current) return null;
    path.unshift(current);
    while (current.parentId) {
        current = await Category.findById(current.parentId).lean();
        if (!current) return null;
        path.unshift(current);
    }

    const rootName = String(path[0].name || '').trim().toLowerCase();
    const mirrorRootName = MIRROR_ROOT_NAMES[rootName];
    if (!mirrorRootName) return null;

    let node = await Category.findOne({
        parentId: null,
        name: { $regex: new RegExp(`^${escapeRegex(mirrorRootName)}$`, 'i') },
        isActive: true,
    }).lean();
    if (!node) return null;

    for (let i = 1; i < path.length; i++) {
        const child = await Category.findOne({
            parentId: node._id,
            name: { $regex: new RegExp(`^${escapeRegex(path[i].name)}$`, 'i') },
            isActive: true,
        }).lean();
        if (!child) return null;
        node = child;
    }

    return String(node._id);
};

/**
 * Convenience wrapper for controllers: given the categoryId/division a
 * product is being saved with, returns the mirror category id to store as
 * secondaryCategoryId, or null when not applicable (not Unisex, or no
 * matching category on the other side).
 */
export const resolveSecondaryCategoryId = async ({ categoryId, division }) => {
    if (division !== 'Unisex' || !categoryId) return null;
    return findMirrorCategoryId(categoryId);
};

// Word-level gender swaps for category NAMES themselves (not the Men/Women
// root walk above) - e.g. "Mens Footwear" <-> "Womens Footwear", or root-level
// "Men" <-> "Women", "Boys" <-> "Girls". Longer forms first so "Mens" matches
// before the "Men" it also contains would.
const GENDER_WORD_PAIRS = [
    ['mens', 'womens'],
    ['boys', 'girls'],
    ['men', 'women'],
    ['boy', 'girl'],
];

const capitalizeLike = (sourceWord, targetWord) => {
    if (sourceWord[0] === sourceWord[0].toUpperCase()) {
        return targetWord[0].toUpperCase() + targetWord.slice(1);
    }
    return targetWord;
};

/**
 * For an Admin-created Unisex category, swaps the gender word in a category
 * NAME to find its opposite - e.g. "Mens Footwear" -> "Womens Footwear".
 * Returns null when the name has no recognizable gender word (nothing to
 * mirror against).
 */
export const swapGenderWordInName = (name) => {
    const raw = String(name || '');
    for (const [a, b] of GENDER_WORD_PAIRS) {
        const reA = new RegExp(`\\b${a}\\b`, 'i');
        const matchA = raw.match(reA);
        if (matchA) return raw.replace(reA, capitalizeLike(matchA[0], b));

        const reB = new RegExp(`\\b${b}\\b`, 'i');
        const matchB = raw.match(reB);
        if (matchB) return raw.replace(reB, capitalizeLike(matchB[0], a));
    }
    return null;
};

/**
 * Given a category id (e.g. "Mens Footwear"), finds its gender-opposite
 * SIBLING under the same parent (e.g. "Womens Footwear" under "Footwear"),
 * by swapping the gender word in its name and matching a sibling by that
 * name. Works at any depth - root-level "Men"/"Women" included, since a root
 * category's parentId is null on both sides. Returns null when the name has
 * no gender word, or no matching sibling exists.
 */
export const findMirrorSiblingId = async (categoryId) => {
    if (!categoryId) return null;
    const category = await Category.findById(categoryId).lean();
    if (!category) return null;

    const targetName = swapGenderWordInName(category.name);
    if (!targetName) return null;

    const sibling = await Category.findOne({
        parentId: category.parentId || null,
        _id: { $ne: category._id },
        name: { $regex: new RegExp(`^${escapeRegex(targetName)}$`, 'i') },
    }).lean();

    return sibling ? String(sibling._id) : null;
};
