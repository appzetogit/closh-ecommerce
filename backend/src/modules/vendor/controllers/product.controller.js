import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitEvent } from '../../../services/socket.service.js';
import { slugify } from '../../../utils/slugify.js';
import { clearCachePattern, deleteCache } from '../../../utils/cache.js';

const deriveStockStatus = (stockQuantity = 0, lowStockThreshold = 10) => {
    if (stockQuantity <= 0) return 'out_of_stock';
    if (stockQuantity <= lowStockThreshold) return 'low_stock';
    return 'in_stock';
};

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

const createVariantKey = (size = '', color = '') =>
    `${normalizeVariantPart(size)}|${normalizeVariantPart(color)}`;
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

const normalizeVariantsPayload = (rawVariants = {}, fallbackPrice) => {
    if (!rawVariants || typeof rawVariants !== 'object') {
        return { sizes: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const sizes = uniqueAxisValues(rawVariants.sizes || []);
    const attributes = normalizeAttributes(rawVariants.attributes || []);
    const hasSizeAxis = sizes.length > 0;
    const hasDynamicAxes = attributes.length > 0;
    const hasAnyAxis = hasDynamicAxes || hasSizeAxis;

    if (!hasAnyAxis) {
        return { sizes: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const combinations = [];
    if (hasDynamicAxes) {
        buildCombinationsFromAttributes(attributes).forEach((selection) => combinations.push({ selection }));
    } else if (hasSizeAxis) {
        sizes.forEach((size) => combinations.push({ selection: { size } }));
    }

    const pricesSource = Object.fromEntries(toObjectEntries(rawVariants.prices));
    const stockSource = Object.fromEntries(toObjectEntries(rawVariants.stockMap));
    const imageSource = Object.fromEntries(toObjectEntries(rawVariants.imageMap));
    const prices = {};
    const stockMap = {};
    const imageMap = {};

    combinations.forEach(({ selection }) => {
        const size = String(selection?.size || '');
        const key = hasDynamicAxes
            ? createDynamicVariantKey(selection)
            : createVariantKey(size, '');
        const rawPrice = pricesSource[key];
        const parsedPrice = Number(rawPrice);
        if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
            prices[key] = parsedPrice;
        } else {
            const fallback = Number(fallbackPrice);
            if (Number.isFinite(fallback) && fallback >= 0) {
                prices[key] = fallback;
            }
        }

        const parsedStock = toNonNegativeNumber(stockSource[key]);
        if (parsedStock !== null) {
            stockMap[key] = parsedStock;
        }

        const image = String(imageSource[key] || '').trim();
        if (image) {
            imageMap[key] = image;
        }
    });

    const defaultSize = String(rawVariants?.defaultVariant?.size || '').trim();
    const normalizedDefaultSize = hasSizeAxis ? defaultSize : '';
    const hasValidDefaultSize = !normalizedDefaultSize || sizes.some((s) => normalizeVariantPart(s) === normalizeVariantPart(normalizedDefaultSize));

    if (!hasValidDefaultSize) {
        throw new ApiError(400, 'Default variant size must exist in provided sizes.');
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
        attributes: attributes.map((attr) => ({ name: attr.name, values: attr.values })),
        prices,
        stockMap,
        imageMap,
        defaultVariant: {
            size: normalizedDefaultSize,
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

// Storefront-facing fields that require admin review before going live on an
// already-approved product. Deliberately excludes stockQuantity/
// lowStockThreshold/stock/variants: those are operational inventory data,
// the dedicated /vendor/stock endpoints already let vendors change them live
// regardless of approval state, so updateProduct applies them the same way.
const VENDOR_CONTENT_FIELDS = [
    'name', 'unit', 'categoryId', 'brandId', 'division', 'description',
    'vendorPrice', 'originalPrice', 'discount', 'image', 'images',
    'flashSale', 'isNewArrival', 'isFeatured', 'isVisible', 'codAllowed',
    'returnable', 'cancelable', 'taxIncluded', 'hsnCode', 'warrantyPeriod',
    'guaranteePeriod', 'taxRate', 'seoTitle', 'seoDescription', 'tags', 'faqs',
];
const REFERENCE_ID_FIELDS = new Set(['categoryId', 'brandId']);

// True if any content field in `updates` actually differs from what's
// already live on `product`. The vendor edit form always re-submits the
// entire product on every save (not a diff), so without this check a pure
// stock correction would still open an admin approval request with nothing
// left in it to approve.
const hasStagedContentChanges = (updates, product) => {
    return VENDOR_CONTENT_FIELDS.some((key) => {
        if (!Object.prototype.hasOwnProperty.call(updates, key)) return false;
        const nextValue = updates[key];
        if (typeof nextValue === 'undefined') return false;

        const currentValue = product[key];
        if (REFERENCE_ID_FIELDS.has(key)) {
            return String(nextValue || '') !== String(currentValue || '');
        }
        return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
    });
};

// GET /api/vendor/products
export const getVendorProducts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, stock } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;
    const filter = { vendorId: req.user.id };
    if (search) filter.$text = { $search: search };
    if (stock) filter.stock = stock;

    const products = await Product.find(filter).populate('categoryId', 'name').populate('brandId', 'name').sort({ createdAt: -1 }).skip(skip).limit(numericLimit);
    const total = await Product.countDocuments(filter);
    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Products fetched.'));
});

// GET /api/vendor/products/:id
export const getVendorProductById = asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id })
        .populate('categoryId', 'name parentId')
        .populate('brandId', 'name');
    if (!product) throw new ApiError(404, 'Product not found or access denied.');
    res.status(200).json(new ApiResponse(200, product, 'Product fetched.'));
});

// POST /api/vendor/products
export const createProduct = asyncHandler(async (req, res) => {
    const { name, ...rest } = req.body;
    if (!name) throw new ApiError(400, 'Product name is required.');
    const slug = slugify(name) + '-' + Date.now();
    const stockQuantity = Number(rest.stockQuantity ?? 0);
    const lowStockThreshold = Number(rest.lowStockThreshold ?? 10);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
        throw new ApiError(400, 'Invalid stock quantity.');
    }
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
        throw new ApiError(400, 'Invalid low stock threshold.');
    }
    const vendorPrice = Number(rest.price);
    if (!Number.isFinite(vendorPrice) || vendorPrice < 0) {
        throw new ApiError(400, 'Invalid product price.');
    }
    const normalizedVariants = normalizeVariantsPayload(rest.variants, vendorPrice);
    const variantAggregateStock = calculateVariantAggregateStock(normalizedVariants);
    const finalStockQuantity = Number.isFinite(variantAggregateStock)
        ? variantAggregateStock
        : stockQuantity;
    const stock = deriveStockStatus(finalStockQuantity, lowStockThreshold);

    const product = await Product.create({
        name,
        slug,
        vendorId: req.user.id,
        ...rest,
        vendorPrice: vendorPrice,
        originalPrice: Number(rest.originalPrice ?? 0),
        price: 0,
        variants: normalizedVariants,
        faqs: sanitizeFaqs(rest.faqs),
        stockQuantity: finalStockQuantity,
        lowStockThreshold,
        stock,
        approvalStatus: 'pending',
        isActive: false,
        isVisible: false,
    });

    await clearCachePattern('products:list:*');

    // Notify all active admins about new product approval request
    try {
        const admins = await Admin.find({ isActive: true }).select('_id');
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'New Product for Approval',
                    message: `Vendor ${req.user.id} added a new product: "${name}". Please review and approve.`,
                    type: 'system',
                    data: {
                        productId: String(product._id),
                        productName: product.name,
                        vendorId: String(req.user.id),
                        type: 'product_approval'
                    },
                })
            )
        );
    } catch (err) {
        console.error('Failed to send product approval notifications to admins:', err);
    }

    // Real-time: notify admin panel about the new product
    emitEvent('admin_products', 'new_product_created', {
        productId: String(product._id),
        name: product.name,
        vendorId: String(req.user.id),
        approvalStatus: product.approvalStatus,
        createdAt: product.createdAt
    });

    res.status(201).json(new ApiResponse(201, product, 'Product created and sent for admin approval.'));
});

// PUT /api/vendor/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found or access denied.');

    if (product.approvalStatus === 'approved' && product.isActive) {
        // STAGED UPDATES: catalog/content changes wait for admin review, but
        // stock is operational data (see VENDOR_CONTENT_FIELDS above) — apply
        // it to the live product immediately, matching the dedicated
        // /vendor/stock endpoints, so the vendor's own Manage Stock table
        // reflects it right away instead of sitting in pendingUpdates.
        const updates = { ...req.body };

        if (typeof updates.price !== 'undefined') {
            const vendorRequestedPrice = Number(updates.price);
            if (!Number.isFinite(vendorRequestedPrice) || vendorRequestedPrice < 0) {
                throw new ApiError(400, 'Invalid product price.');
            }
            updates.vendorPrice = vendorRequestedPrice;
            // Admin will set the final price
            updates.price = undefined;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'faqs')) {
            updates.faqs = sanitizeFaqs(updates.faqs);
        }

        let liveStockChanged = false;
        if (typeof updates.stockQuantity !== 'undefined' || typeof updates.lowStockThreshold !== 'undefined') {
            const stockQuantity = Number(updates.stockQuantity ?? product.stockQuantity ?? 0);
            const lowStockThreshold = Number(updates.lowStockThreshold ?? product.lowStockThreshold ?? 10);
            if (!Number.isFinite(stockQuantity) || stockQuantity < 0) throw new ApiError(400, 'Invalid stock quantity.');
            if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) throw new ApiError(400, 'Invalid low stock threshold.');
            product.stockQuantity = stockQuantity;
            product.lowStockThreshold = lowStockThreshold;
            product.stock = deriveStockStatus(stockQuantity, lowStockThreshold);
            liveStockChanged = true;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'variants')) {
            const fallbackPrice = updates.vendorPrice ?? product.vendorPrice;
            product.variants = normalizeVariantsPayload(updates.variants, fallbackPrice);
            const variantAggregateStock = calculateVariantAggregateStock(product.variants);
            if (Number.isFinite(variantAggregateStock)) {
                product.stockQuantity = variantAggregateStock;
                product.stock = deriveStockStatus(
                    Number(product.stockQuantity ?? 0),
                    Number(product.lowStockThreshold ?? 10)
                );
            }
            liveStockChanged = true;
        }

        // Already applied live above — keep out of the staged snapshot so a
        // later admin approval of an unrelated content change can't
        // overwrite the live stock with a stale staged value.
        delete updates.stockQuantity;
        delete updates.lowStockThreshold;
        delete updates.stock;
        delete updates.variants;

        const needsApproval = hasStagedContentChanges(updates, product);
        if (needsApproval) {
            product.pendingUpdates = updates;
            product.hasPendingUpdates = true;
        }

        await product.save();

        if (liveStockChanged) {
            await clearCachePattern('products:list:*');
        }

        if (needsApproval) {
            emitEvent('admin_products', 'product_updated_by_vendor', {
                productId: String(product._id),
                name: product.name,
                vendorId: String(req.user.id),
                approvalStatus: 'approved',
                hasPendingUpdates: true
            });

            return res.status(200).json(new ApiResponse(200, product, 'Product updates saved and sent for admin approval. Existing product remains live.'));
        }

        return res.status(200).json(new ApiResponse(
            200,
            product,
            liveStockChanged ? 'Stock updated.' : 'Product updated.'
        ));
    }

    // Fallback for non-approved products: modify directly
    Object.assign(product, req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, 'faqs')) {
        product.faqs = sanitizeFaqs(req.body.faqs);
    }
    if (typeof req.body.stockQuantity !== 'undefined' || typeof req.body.lowStockThreshold !== 'undefined') {
        const stockQuantity = Number(product.stockQuantity ?? 0);
        const lowStockThreshold = Number(product.lowStockThreshold ?? 10);
        if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
            throw new ApiError(400, 'Invalid stock quantity.');
        }
        if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
            throw new ApiError(400, 'Invalid low stock threshold.');
        }
        product.stockQuantity = stockQuantity;
        product.lowStockThreshold = lowStockThreshold;
        product.stock = deriveStockStatus(stockQuantity, lowStockThreshold);
    }
    if (typeof req.body.price !== 'undefined') {
        const vendorRequestedPrice = Number(req.body.price);
        if (!Number.isFinite(vendorRequestedPrice) || vendorRequestedPrice < 0) {
            throw new ApiError(400, 'Invalid product price.');
        }
        product.vendorPrice = vendorRequestedPrice;
        product.price = 0; // Admin must set the final price
        product.approvalStatus = 'pending';
        product.isActive = false;
        product.isVisible = false;
    }
    if (typeof req.body.originalPrice !== 'undefined') {
        product.originalPrice = Number(req.body.originalPrice) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'variants')) {
        product.variants = normalizeVariantsPayload(req.body.variants, product.vendorPrice);
        const variantAggregateStock = calculateVariantAggregateStock(product.variants);
        if (Number.isFinite(variantAggregateStock)) {
            product.stockQuantity = variantAggregateStock;
        }
    }
    // Keep stock state deterministic from quantity + threshold.
    product.stock = deriveStockStatus(
        Number(product.stockQuantity ?? 0),
        Number(product.lowStockThreshold ?? 10)
    );
    await product.save();

    await clearCachePattern('products:list:*');

    // Real-time: notify admin panel about the product update
    emitEvent('admin_products', 'product_updated_by_vendor', {
        productId: String(product._id),
        name: product.name,
        vendorId: String(req.user.id),
        approvalStatus: product.approvalStatus
    });

    res.status(200).json(new ApiResponse(200, product, 'Product updated and sent for re-approval.'));
});

// DELETE /api/vendor/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOneAndDelete({ _id: req.params.id, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found or access denied.');
    await clearCachePattern('products:list:*');
    res.status(200).json(new ApiResponse(200, null, 'Product deleted.'));
});

// PATCH /api/vendor/stock/:productId
export const updateStock = asyncHandler(async (req, res) => {
    const { stockQuantity } = req.body;
    const product = await Product.findOne({ _id: req.params.productId, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found.');

    const numericStockQuantity = Number(stockQuantity);
    if (
        !Number.isFinite(numericStockQuantity) ||
        numericStockQuantity < 0 ||
        !Number.isInteger(numericStockQuantity)
    ) {
        throw new ApiError(400, 'Invalid stock quantity.');
    }

    product.stockQuantity = numericStockQuantity;
    product.stock = deriveStockStatus(numericStockQuantity, product.lowStockThreshold);
    await product.save();

    await clearCachePattern('products:list:*');

    res.status(200).json(new ApiResponse(200, product, 'Stock updated.'));
});
// PATCH /api/vendor/stock/:productId/variants
export const updateVariantStock = asyncHandler(async (req, res) => {
    const { stockMap } = req.body;
    const product = await Product.findOne({ _id: req.params.productId, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found.');

    if (!stockMap || typeof stockMap !== 'object') {
        throw new ApiError(400, 'Invalid stock map.');
    }

    // Ensure variants object exists
    if (!product.variants) {
        product.variants = {
            sizes: [],
            colors: [],
            attributes: [],
            prices: {},
            stockMap: {},
            imageMap: {},
            defaultVariant: {},
            defaultSelection: {}
        };
    }

    // Update variant stock map
    // Note: This replaces the entire stockMap for simplicity of dynamic management from frontend
    product.variants.stockMap = stockMap;

    // Recalculate total stock quantity from all variants
    const variantAggregateStock = calculateVariantAggregateStock(product.variants);
    if (Number.isFinite(variantAggregateStock)) {
        product.stockQuantity = variantAggregateStock;
    }

    // Update stock status based on the new total quantity
    product.stock = deriveStockStatus(
        Number(product.stockQuantity ?? 0),
        Number(product.lowStockThreshold ?? 10)
    );

    await product.save();

    // Clear relevant caches
    await clearCachePattern('products:list:*');

    res.status(200).json(new ApiResponse(200, product, 'Variant stock updated.'));
});

// POST /api/vendor/stock/:productId/offline-sale
export const recordOfflineSale = asyncHandler(async (req, res) => {
    const { quantity, variantKey } = req.body;
    const product = await Product.findOne({ _id: req.params.productId, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found.');

    const qty = parseInt(quantity) || 1;
    product.offlineSold = (product.offlineSold || 0) + qty;

    // Decrement stock
    if (variantKey && product.variants?.stockMap) {
        // Variants stock is a Map in Mongoose, use .get and .set
        const currentStock = product.variants.stockMap.get(variantKey) || 0;
        product.variants.stockMap.set(variantKey, Math.max(0, currentStock - qty));

        // Recalculate total stock quantity from all variants
        const variantAggregateStock = calculateVariantAggregateStock(product.variants);
        if (Number.isFinite(variantAggregateStock)) {
            product.stockQuantity = variantAggregateStock;
        }
    } else {
        // No variant specified, decrement total stock directly
        product.stockQuantity = Math.max(0, (product.stockQuantity || 0) - qty);
    }

    // Update stock status based on the new total quantity
    product.stock = deriveStockStatus(
        Number(product.stockQuantity ?? 0),
        Number(product.lowStockThreshold ?? 10)
    );

    await product.save();

    await clearCachePattern('products:list:*');

    res.status(200).json(new ApiResponse(200, product, 'Offline sale recorded successfully.'));
});
