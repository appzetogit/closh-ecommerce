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
