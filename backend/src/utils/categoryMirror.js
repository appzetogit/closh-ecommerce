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
// Walks `names` downward from `startNode`, matching each level by name
// (case-insensitive) among active children. Returns the final node's id, or
// null if any level has no match.
const resolveNamePathFrom = async (startNode, names) => {
    let node = startNode;
    for (const name of names) {
        const child = await Category.findOne({
            parentId: node._id,
            name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
            isActive: true,
        }).lean();
        if (!child) return null;
        node = child;
    }
    return String(node._id);
};

export const findMirrorCategoryId = async (categoryId) => {
    if (!categoryId) return null;

    const path = [];
    let current = await Category.findById(categoryId).lean();
    if (!current) return null;
    const leaf = current;
    path.unshift(current);
    while (current.parentId) {
        current = await Category.findById(current.parentId).lean();
        if (!current) return null;
        path.unshift(current);
    }

    // 1. An admin-linked Unisex category (isUnisex + linkedCategoryId, kept in
    //    sync by admin/catalog.controller.js syncUnisexTwin) is the explicit
    //    answer - e.g. "Mens Footwear > Crocs" <-> "Womens Footwear > Crocs",
    //    which sit under a shared "Footwear" root the Men/Women walk below
    //    can't see.
    if (leaf.linkedCategoryId) {
        const linked = await Category.findOne({ _id: leaf.linkedCategoryId, isActive: true }).select('_id').lean();
        if (linked) return String(linked._id);
    }

    // 2. Same-named path under the opposite Men/Women root.
    const rootName = String(path[0].name || '').trim().toLowerCase();
    const mirrorRootName = MIRROR_ROOT_NAMES[rootName];
    if (mirrorRootName) {
        const mirrorRoot = await Category.findOne({
            parentId: null,
            name: { $regex: new RegExp(`^${escapeRegex(mirrorRootName)}$`, 'i') },
            isActive: true,
        }).lean();
        if (!mirrorRoot) return null;
        return resolveNamePathFrom(mirrorRoot, path.slice(1).map((c) => c.name));
    }

    // 3. A gender word further down the path (e.g. "Footwear > Mens Footwear >
    //    Clogs"): swap it to find the opposite sibling, then re-resolve the
    //    rest of the path beneath it.
    for (let i = 0; i < path.length; i++) {
        const swappedName = swapGenderWordInName(path[i].name);
        if (!swappedName) continue;
        const sibling = await Category.findOne({
            parentId: path[i].parentId || null,
            _id: { $ne: path[i]._id },
            name: { $regex: new RegExp(`^${escapeRegex(swappedName)}$`, 'i') },
            isActive: true,
        }).lean();
        if (!sibling) return null;
        return resolveNamePathFrom(sibling, path.slice(i + 1).map((c) => c.name));
    }

    return null;
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
