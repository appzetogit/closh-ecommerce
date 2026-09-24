import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Category from '../../../models/Category.model.js';
import Brand from '../../../models/Brand.model.js';
import Settings from '../../../models/Settings.model.js';
import { emitEvent } from '../../../services/socket.service.js';
import { slugify } from '../../../utils/slugify.js';
import { clearCachePattern, deleteCache } from '../../../utils/cache.js';
import { invalidateCategoryFeatureCache } from '../../../utils/categoryFeatures.js';

const sanitizeFaqs = (faqs) => {
    if (!Array.isArray(faqs)) return [];
    return faqs
        .map((faq) => ({
            question: String(faq?.question || '').trim(),
            answer: String(faq?.answer || '').trim(),
        }))
        .filter((faq) => faq.question && faq.answer);
};

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

const uniqueAxisValues = (values = []) => {
    const seen = new Set();
    const out = [];
    for (const raw of values) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const key = normalizeVariantPart(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

const toObjectEntries = (value) => {
    if (!value) return [];
    if (value instanceof Map) return Array.from(value.entries());
    if (typeof value === 'object') return Object.entries(value);
    return [];
};

const toNonNegativeNumber = (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeAttributes = (rawAttributes = []) => {
    const seen = new Set();
    const attributes = [];
    for (const raw of rawAttributes || []) {
        const name = String(raw?.name || '').trim();
        const axisKey = normalizeAxisName(name);
        if (!name || !axisKey || seen.has(axisKey)) continue;
        seen.add(axisKey);
        const values = uniqueAxisValues(raw?.values || []);
        if (!values.length) continue;
        attributes.push({ name, axisKey, values });
    }
    return attributes;
};

const buildCombinationsFromAttributes = (attributes = []) => {
    if (!attributes.length) return [];
    let combos = [{}];
    attributes.forEach((attr) => {
        const next = [];
        combos.forEach((selection) => {
            attr.values.forEach((value) => next.push({ ...selection, [attr.axisKey]: value }));
        });
        combos = next;
    });
    return combos;
};

/**
 * Canonicalise a variant map key so that vendor-format keys (e.g. "s|", "s|red")
 * can be matched against admin-format keys (e.g. "size=s", "color=red|size=s").
 * Strips axis prefixes ("size="), splits on "|", lowercases, sorts, and joins.
 */
const getCanonicalMapKey = (rawKey) => {
    if (!rawKey) return '';
    return String(rawKey)
        .trim()
        .toLowerCase()
        .split('|')
        .map(part => {
            if (part.includes('=')) return part.split('=')[1].trim();
            return part.trim();
        })
        .filter(Boolean)
        .sort()
        .join('|');
};

/**
 * Given a source map (from the incoming payload — which may use vendor-style
 * keys like "s|"), build a lookup that maps canonical keys → values so that
 * the combination-key lookup always succeeds regardless of key format.
 */
const buildCanonicalLookup = (sourceMap) => {
    const lookup = {};
    Object.entries(sourceMap).forEach(([rawKey, value]) => {
        // Store both the original key and the canonical form
        lookup[rawKey] = value;
        const canonical = getCanonicalMapKey(rawKey);
        if (canonical && canonical !== rawKey) {
            lookup[canonical] = value;
        }
    });
    return lookup;
};

const normalizeVariantsPayload = (rawVariants = {}, fallbackPrice) => {
    if (!rawVariants || typeof rawVariants !== 'object') {
        return { sizes: [], colors: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {} };
    }

    const sizes = uniqueAxisValues(rawVariants.sizes || []);
    const colors = uniqueAxisValues(rawVariants.colors || []);
    const attributes = normalizeAttributes(rawVariants.attributes || []);
    const hasSizeAxis = sizes.length > 0;
    const hasColorAxis = colors.length > 0;
    const hasDynamicAxes = attributes.length > 0;
    const hasAnyAxis = hasDynamicAxes || hasSizeAxis || hasColorAxis;

    if (!hasAnyAxis) {
        return { sizes: [], colors: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const combinations = [];
    if (hasDynamicAxes) {
        buildCombinationsFromAttributes(attributes).forEach((selection) => combinations.push({ selection }));
    } else if (hasSizeAxis && hasColorAxis) {
        sizes.forEach((size) => colors.forEach((color) => combinations.push({ selection: { size, color } })));
    } else if (hasSizeAxis) {
        sizes.forEach((size) => combinations.push({ selection: { size } }));
    } else {
        colors.forEach((color) => combinations.push({ selection: { color } }));
    }

    const pricesSource = Object.fromEntries(toObjectEntries(rawVariants.prices));
    const stockSource = Object.fromEntries(toObjectEntries(rawVariants.stockMap));
    const imageSource = Object.fromEntries(toObjectEntries(rawVariants.imageMap));

    // Build canonical lookups so vendor-format keys ("s|") match admin keys ("size=s")
    const pricesLookup = buildCanonicalLookup(pricesSource);
    const stockLookup = buildCanonicalLookup(stockSource);
    const imageLookup = buildCanonicalLookup(imageSource);

    const prices = {};
    const stockMap = {};
    const imageMap = {};

    combinations.forEach(({ selection }) => {
        const size = String(selection?.size || '');
        const color = String(selection?.color || '');
        const key = createDynamicVariantKey(selection);
        const canonicalKey = getCanonicalMapKey(key);

        // Try exact key first, then canonical key
        const parsedPrice = toNonNegativeNumber(pricesLookup[key] ?? pricesLookup[canonicalKey]);
        if (parsedPrice !== null) {
            prices[key] = parsedPrice;
        } else {
            const fallback = toNonNegativeNumber(fallbackPrice);
            if (fallback !== null) prices[key] = fallback;
        }

        const parsedStock = toNonNegativeNumber(stockLookup[key] ?? stockLookup[canonicalKey]);
        if (parsedStock !== null) stockMap[key] = parsedStock;

        const image = String(imageLookup[key] ?? imageLookup[canonicalKey] ?? '').trim();
        if (image) imageMap[key] = image;
    });

    const defaultSize = String(rawVariants?.defaultVariant?.size || '').trim();
    const defaultColor = String(rawVariants?.defaultVariant?.color || '').trim();
    const normalizedDefaultSize = hasSizeAxis ? defaultSize : '';
    const normalizedDefaultColor = hasColorAxis ? defaultColor : '';
    const hasValidDefaultSize = !normalizedDefaultSize || sizes.some((s) => normalizeVariantPart(s) === normalizeVariantPart(normalizedDefaultSize));
    const hasValidDefaultColor = !normalizedDefaultColor || colors.some((c) => normalizeVariantPart(c) === normalizeVariantPart(normalizedDefaultColor));
    if (!hasValidDefaultSize || !hasValidDefaultColor) {
        throw new ApiError(400, 'Default variant must exist in provided sizes/colors.');
    }

    const defaultSelection = {};
    if (rawVariants?.defaultSelection && typeof rawVariants.defaultSelection === 'object') {
        Object.entries(rawVariants.defaultSelection).forEach(([axis, value]) => {
            const axisKey = normalizeAxisName(axis);
            const selectedValue = String(value || '').trim();
            if (!axisKey || !selectedValue) return;
            const axisMeta = attributes.find((attr) => attr.axisKey === axisKey);
            if (!axisMeta) return;
            const matched = axisMeta.values.find(
                (candidate) => normalizeVariantPart(candidate) === normalizeVariantPart(selectedValue)
            );
            if (matched) defaultSelection[axisKey] = matched;
        });
    }

    return {
        sizes,
        colors,
        attributes: attributes.map((attr) => ({ name: attr.name, values: attr.values })),
        prices,
        stockMap,
        imageMap,
        defaultVariant: {
            size: normalizedDefaultSize,
            color: normalizedDefaultColor,
        },
        defaultSelection,
    };
};

const calculateVariantAggregateStock = (variants = {}) => {
    const entries = toObjectEntries(variants.stockMap);
    if (!entries.length) return null;
    return entries.reduce((sum, [, value]) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? sum + parsed : sum;
    }, 0);
};

const sanitizeCategoryPayload = (payload = {}) => {
    const allowed = ['name', 'description', 'image', 'icon', 'parentId', 'order', 'isActive', 'tryAndBuyEnabled'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'parentId')) {
        sanitized.parentId = sanitized.parentId || null;
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'tryAndBuyEnabled')) {
        // '' / null from the "Inherit" option in the admin form means "unset the override".
        sanitized.tryAndBuyEnabled = sanitized.tryAndBuyEnabled === '' ? null : sanitized.tryAndBuyEnabled;
    }
    return sanitized;
};

const assertValidCategoryParent = async ({ categoryId = null, parentId }) => {
    if (!parentId) return;

    if (categoryId && String(categoryId) === String(parentId)) {
        throw new ApiError(400, 'Category cannot be parent of itself.');
    }

    const parent = await Category.findById(parentId).select('_id parentId');
    if (!parent) {
        throw new ApiError(400, 'Selected parent category does not exist.');
    }

    // Prevent cycles when changing parent during edit.
    if (categoryId) {
        let cursor = parent;
        while (cursor?.parentId) {
            if (String(cursor.parentId) === String(categoryId)) {
                throw new ApiError(400, 'Invalid parent category hierarchy.');
            }
            cursor = await Category.findById(cursor.parentId).select('_id parentId');
        }
    }
};

const sanitizeBrandPayload = (payload = {}) => {
    const allowed = ['name', 'logo', 'description', 'website', 'isActive'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    return sanitized;
};

// GET /api/admin/products
export const getAllProducts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, vendorId, categoryId, status, approvalStatus, hasPendingUpdates, includeInactive = 'false' } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};
    if (search) filter.$text = { $search: search };
    if (vendorId) filter.vendorId = vendorId;
    if (categoryId) filter.categoryId = categoryId;
    if (status) filter.stock = status;
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (hasPendingUpdates !== undefined) filter.hasPendingUpdates = hasPendingUpdates === 'true';
    if (String(includeInactive) !== 'true' && !approvalStatus) {
        filter.isActive = { $ne: false };
    }

    const products = await Product.find(filter)
        .populate('vendorId', 'storeName')
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit);
    const total = await Product.countDocuments(filter);
    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Products fetched.'));
});

// GET /api/admin/products/:id
export const getProductById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('vendorId', 'storeName')
        .populate('categoryId', 'name')
        .populate('brandId', 'name');

    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product fetched.'));
});

// POST /api/admin/products
export const createProduct = asyncHandler(async (req, res) => {
    const { name, stockQuantity = 0, stock, ...rest } = req.body;
    const slug = slugify(name) + '-' + Date.now();
    const normalizedVariants = normalizeVariantsPayload(rest.variants, rest.price);

    const numericStockQuantity = Number(stockQuantity) || 0;
    const variantAggregateStock = calculateVariantAggregateStock(normalizedVariants);
    const finalStockQuantity = Number.isFinite(variantAggregateStock)
        ? variantAggregateStock
        : numericStockQuantity;
    const normalizedStock = stock || (finalStockQuantity <= 0
        ? 'out_of_stock'
        : finalStockQuantity <= 10
            ? 'low_stock'
            : 'in_stock');

    const product = await Product.create({
        name,
        slug,
        stock: normalizedStock,
        stockQuantity: finalStockQuantity,
        ...rest,
        variants: normalizedVariants,
        faqs: sanitizeFaqs(rest.faqs),
    });

    await clearCachePattern('products:list:*');

    res.status(201).json(new ApiResponse(201, product, 'Product created.'));
});



// PUT /api/admin/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (payload.name) {
        payload.slug = slugify(payload.name) + '-' + Date.now();
    }

    // Centralized Stock: Admin cannot edit stock for vendor products
    const existingProduct = await Product.findById(req.params.id).select('vendorId stockQuantity variants.stockMap stock').lean();
    const isVendorProduct = existingProduct && existingProduct.vendorId;

    if (isVendorProduct) {
        // Remove stock fields from payload to prevent admin overrides
        delete payload.stockQuantity;
        delete payload.stock;
        if (payload.variants) {
            // Keep prices/images but remove stockMap from variant updates
            delete payload.variants.stockMap;
        }
    } else {
        // For non-vendor (platform) products, admin can still edit stock
        if (payload.stockQuantity !== undefined) {
            const numericStockQuantity = Number(payload.stockQuantity) || 0;
            payload.stockQuantity = numericStockQuantity;
            if (!payload.stock) {
                payload.stock = numericStockQuantity <= 0
                    ? 'out_of_stock'
                    : numericStockQuantity <= 10
                        ? 'low_stock'
                        : 'in_stock';
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'faqs')) {
        payload.faqs = sanitizeFaqs(payload.faqs);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'variants')) {
        const fallbackPrice =
            Object.prototype.hasOwnProperty.call(payload, 'price')
                ? payload.price
                : (await Product.findById(req.params.id).select('price').lean())?.price;
        
        // Merge with existing stockMap if it's a vendor product
        if (isVendorProduct && existingProduct.variants?.stockMap) {
            if (!payload.variants.stockMap) {
                payload.variants.stockMap = existingProduct.variants.stockMap;
            }
        }

        payload.variants = normalizeVariantsPayload(payload.variants, fallbackPrice);

        // Only derive total stock if not restricted
        if (!isVendorProduct) {
            const variantAggregateStock = calculateVariantAggregateStock(payload.variants);
            if (Number.isFinite(variantAggregateStock)) {
                payload.stockQuantity = variantAggregateStock;
                if (!payload.stock) {
                    payload.stock = variantAggregateStock <= 0
                        ? 'out_of_stock'
                        : variantAggregateStock <= 10
                            ? 'low_stock'
                            : 'in_stock';
                }
            }
        } else {
            // Ensure vendor product keeps its stock info
            payload.stockQuantity = existingProduct.stockQuantity;
            payload.stock = existingProduct.stock;
        }
    }

    payload.pendingUpdates = undefined;
    payload.hasPendingUpdates = false;
    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!product) throw new ApiError(404, 'Product not found.');

    await clearCachePattern('products:list:*');

    res.status(200).json(new ApiResponse(200, product, 'Product updated.'));
});

// PATCH /api/admin/products/:id/approval-status
export const updateProductStatus = asyncHandler(async (req, res) => {
    const { approvalStatus } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(approvalStatus)) {
        throw new ApiError(400, 'Invalid approval status.');
    }

    const payload = { approvalStatus };
    const existingProduct = await Product.findById(req.params.id).lean();

    if (approvalStatus === 'approved') {
        payload.isActive = true;
        payload.isVisible = true;
        
        // Merge pending updates if any exist
        if (existingProduct) {
            if (existingProduct.hasPendingUpdates && existingProduct.pendingUpdates) {
                Object.assign(payload, existingProduct.pendingUpdates);
                // Admin must set the final price, so if the vendor requested a new price, it was stored in `price` of pendingUpdates but we need to ensure admin price logic is respected.
                // Normally the admin sets it manually via ProductFormModal.
                payload.pendingUpdates = undefined;
                payload.hasPendingUpdates = false;
            }
            if (!existingProduct.price || existingProduct.price === 0) {
                if (payload.price === undefined) {
                    payload.price = existingProduct.vendorPrice || 0;
                }
            }
        }
    } else if (approvalStatus === 'rejected') {
        if (existingProduct && existingProduct.approvalStatus === 'approved' && existingProduct.hasPendingUpdates) {
            // Rejecting staged updates on an already approved product
            payload.approvalStatus = 'approved'; // Keep it approved
            payload.pendingUpdates = undefined;
            payload.hasPendingUpdates = false;
        } else {
            payload.isActive = false;
            payload.isVisible = false;
        }
    } else {
        payload.isActive = false;
        payload.isVisible = false;
    }

    const product = await Product.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
    );

    if (!product) throw new ApiError(404, 'Product not found.');

    await clearCachePattern('products:list:*');

    // Real-time: notify the vendor about approval status change
    emitEvent(`vendor_${product.vendorId}`, 'product_approved', {
        productId: String(product._id),
        name: product.name,
        approvalStatus: product.approvalStatus,
        isActive: product.isActive
    });

    // Also notify admin panel to refresh product list
    emitEvent('admin_products', 'product_status_changed', {
        productId: String(product._id),
        approvalStatus: product.approvalStatus
    });

    // Invalidate public products cache
    await clearCachePattern('products:*');

    res.status(200).json(new ApiResponse(200, product, `Product ${approvalStatus} successfully.`));
});

// DELETE /api/admin/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true, runValidators: true }
    );
    if (!product) throw new ApiError(404, 'Product not found.');
    await clearCachePattern('products:list:*');
    res.status(200).json(new ApiResponse(200, null, 'Product disabled.'));
});

// GET /api/admin/products/tax-pricing-rules
export const getTaxPricingRules = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'product_tax_pricing_rules' }).lean();
    const value = settings?.value || {};
    const taxRules = Array.isArray(value.taxRules) ? value.taxRules : [];
    const pricingRules = Array.isArray(value.pricingRules) ? value.pricingRules : [];

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules fetched.')
    );
});

// PUT /api/admin/products/tax-pricing-rules
export const updateTaxPricingRules = asyncHandler(async (req, res) => {
    const { taxRules = [], pricingRules = [] } = req.body;

    await Settings.findOneAndUpdate(
        { key: 'product_tax_pricing_rules' },
        { key: 'product_tax_pricing_rules', value: { taxRules, pricingRules } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules updated.')
    );
});

const generateUniqueCategorySlug = async (name, excludeId = null) => {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let isUnique = false;
    let counter = 1;

    while (!isUnique) {
        const query = { slug };
        if (excludeId) {
            query._id = { $ne: excludeId };
        }
        const existing = await Category.findOne(query);
        if (!existing) {
            isUnique = true;
        } else {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }
    }

    return slug;
};

// GET /api/admin/categories
export const getAllCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, categories, 'Categories fetched.'));
});

// POST /api/admin/categories
export const createCategory = asyncHandler(async (req, res) => {
    const payload = sanitizeCategoryPayload(req.body);
    const { name, ...rest } = payload;
    await assertValidCategoryParent({ parentId: rest.parentId });
    const slug = await generateUniqueCategorySlug(name);
    const category = await Category.create({ name, slug, ...rest });

    await deleteCache('categories:all');
    invalidateCategoryFeatureCache();

    res.status(201).json(new ApiResponse(201, category, 'Category created.'));
});

// PUT /api/admin/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) throw new ApiError(404, 'Category not found.');

    const payload = sanitizeCategoryPayload(req.body);
    await assertValidCategoryParent({
        categoryId: existingCategory._id,
        parentId: payload.parentId,
    });

    if (payload.name) {
        payload.slug = await generateUniqueCategorySlug(payload.name, existingCategory._id);
    }

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
    });
    if (!category) throw new ApiError(404, 'Category not found.');

    await deleteCache('categories:all');
    invalidateCategoryFeatureCache();

    res.status(200).json(new ApiResponse(200, category, 'Category updated.'));
});

// DELETE /api/admin/categories/:id
export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id).select('_id');
    if (!category) {
        throw new ApiError(404, 'Category not found.');
    }

    const [subcategoriesCount, productsCount] = await Promise.all([
        Category.countDocuments({ parentId: req.params.id }),
        Product.countDocuments({ categoryId: req.params.id }),
    ]);

    if (subcategoriesCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing subcategories.');
    }
    if (productsCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing products.');
    }

    await Category.findByIdAndDelete(req.params.id);
    await deleteCache('categories:all');
    res.status(200).json(new ApiResponse(200, null, 'Category deleted.'));
});

// PATCH /api/admin/categories/reorder
export const reorderCategories = asyncHandler(async (req, res) => {
    const { categoryIds } = req.body;
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
        throw new ApiError(400, 'categoryIds array is required.');
    }

    const uniqueIds = Array.from(new Set(categoryIds.map((id) => String(id))));

    // Fetch categories to verify existence and check if they share the same parent
    const foundCategories = await Category.find({
        _id: { $in: uniqueIds },
    }).select('_id parentId');

    if (foundCategories.length !== uniqueIds.length) {
        throw new ApiError(400, 'One or more category IDs are invalid or do not exist.');
    }

    // Verify all categories belong to the same parent level to prevent hierarchy mess-up
    const parentIds = new Set(foundCategories.map(c => String(c.parentId || 'null')));
    if (parentIds.size > 1) {
        throw new ApiError(400, 'Only categories within the same level/parent can be reordered at once.');
    }

    const bulkUpdates = uniqueIds.map((id, index) => ({
        updateOne: {
            filter: { _id: id },
            update: { $set: { order: index + 1 } },
        },
    }));

    if (bulkUpdates.length > 0) {
        await Category.bulkWrite(bulkUpdates);
    }

    // Clear public cache
    await deleteCache('categories:all');

    // Return updated list for admin
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, categories, 'Category order updated.'));
});

// GET /api/admin/brands
export const getAllBrands = asyncHandler(async (req, res) => {
    const brands = await Brand.find().sort({ name: 1 });
    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
});

// POST /api/admin/brands
export const createBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    const { name, ...rest } = payload;
    const slug = slugify(name);
    const brand = await Brand.create({ name, slug, ...rest });

    await deleteCache('brands:all');

    res.status(201).json(new ApiResponse(201, brand, 'Brand created.'));
});

// PUT /api/admin/brands/:id
export const updateBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    if (payload.name) {
        payload.slug = slugify(payload.name);
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!brand) throw new ApiError(404, 'Brand not found.');

    await deleteCache('brands:all');

    res.status(200).json(new ApiResponse(200, brand, 'Brand updated.'));
});

// DELETE /api/admin/brands/:id
export const deleteBrand = asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id).select('_id');
    if (!brand) throw new ApiError(404, 'Brand not found.');

    const linkedProductsCount = await Product.countDocuments({ brandId: req.params.id });
    if (linkedProductsCount > 0) {
        throw new ApiError(409, 'Cannot delete brand with existing products.');
    }

    await Brand.findByIdAndDelete(req.params.id);
    await deleteCache('brands:all');
    res.status(200).json(new ApiResponse(200, null, 'Brand deleted.'));
});
