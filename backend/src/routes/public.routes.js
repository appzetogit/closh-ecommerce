import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
import Coupon from '../models/Coupon.model.js';
import Banner from '../models/Banner.model.js';
import Campaign from '../models/Campaign.model.js';
import { applyActiveCampaigns } from '../utils/productUtils.js';
import { calculateVendorShippingForGroups } from '../services/vendorShipping.service.js';
import { getCache, setCache } from '../utils/cache.js';
import { optionalAuth } from '../middlewares/authenticate.js';
import { Order } from '../models/Order.model.js';
import Settings from '../models/Settings.model.js';
import { validateCoupon } from '../services/coupon.service.js';
import { handleRazorpayWebhook } from '../modules/payment/webhook.controller.js';

const router = Router();

// GET /api/public/config/delivery
router.get('/config/delivery', asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'delivery_fees' }).lean();
    const maxCartVendorDistanceKm = settings?.value?.maxCartVendorDistanceKm || 10;
    res.status(200).json(new ApiResponse(200, { maxCartVendorDistanceKm }, 'Delivery config fetched'));
}));

const toPublicVendor = (vendorDoc) => {
    const vendor = typeof vendorDoc?.toObject === 'function'
        ? vendorDoc.toObject()
        : (vendorDoc || {});

    return {
        ...vendor,
        password: undefined,
        otp: undefined,
        otpExpiry: undefined,
        bankDetails: undefined,
        commissionRate: undefined,
    };
};

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeVariantKey = (key) => String(key || '').trim().toLowerCase();

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const resolveVariantPrice = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) return 0;

    const selectionEntries = Object.entries(selectedVariant || {})
        .map(([axis, value]) => [String(axis || '').trim(), String(value || '').trim()])
        .filter(([axis, value]) => axis && value);

    const dynamicKey = selectionEntries.length
        ? selectionEntries
            .map(([axis, value]) => `${normalizeVariantPart(axis)}=${normalizeVariantPart(value)}`)
            .sort()
            .join('|')
        : '';

    const size = normalizeVariantPart(selectedVariant?.size);
    const entries = toVariantPriceEntries(product?.variants?.prices);
    if (!entries.length || (!dynamicKey && !size)) return basePrice;

    const candidateKeys = [
        dynamicKey || null,
        `${size}|`,
        size || null,
    ].filter(Boolean);

    for (const candidate of candidateKeys) {
        if (!candidate) continue;
        const exact = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) return price;
        }

        const normalized = entries.find(
            ([rawKey]) => normalizeVariantKey(rawKey) === normalizeVariantKey(candidate)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) return price;
        }
    }

    return basePrice;
};

// GET /api/products — list with filters
const listProducts = asyncHandler(async (req, res) => {
    let {
        page = 1,
        limit = 12,
        category,
        brand,
        vendor,
        search,
        q,
        sort = 'newest',
        flashSale,
        isNewArrival,
        minPrice,
        maxPrice,
        minRating,
        subCategory,
        subcategory,
        division,
        categoryId,
        ids
    } = req.query;

    // --- CACHE START ---
    // Create a unique cache key based on all query parameters
    const cacheKey = `products:list:${JSON.stringify(req.query)}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, cachedData, 'Products fetched (from cache).'));
    }
    // --- CACHE END ---

    const skip = (page - 1) * limit;
    
    // Get all approved vendor IDs to ensure we only show products from active sellers
    const approvedVendors = await Vendor.find({ status: 'approved' }).select('_id').lean();
    const approvedVendorIds = approvedVendors.map(v => v._id);

    const filter = { 
        isActive: true, 
        isVisible: true,
        approvalStatus: 'approved', 
        price: { $gt: 0 },
        vendorId: { $in: approvedVendorIds }
    };

    if (ids) {
        const idArray = ids.split(',').filter(id => /^[0-9a-fA-F]{24}$/.test(id.trim()));
        if (idArray.length > 0) {
            filter._id = { $in: idArray };
        }
    }

    if (division && division !== 'All') {
        // Map common aliases to match Product model enum: ['Men', 'Women', 'Boys', 'Girls', 'Unisex']
        let mappedDivision = division;
        const lowerDiv = division.toLowerCase();
        
        if (lowerDiv.includes("men's fashion") || lowerDiv === "mens") {
            mappedDivision = "Men";
        } else if (lowerDiv.includes("women's fashion") || lowerDiv === "womens") {
            mappedDivision = "Women";
        } else if (lowerDiv.includes("boys") || lowerDiv.includes("kids")) {
            mappedDivision = "Boys";
        } else if (lowerDiv.includes("girls")) {
            mappedDivision = "Girls";
        }

        // Only apply division filter if it matches the enum (case-insensitive)
        const enumValues = ['Men', 'Women', 'Boys', 'Girls', 'Unisex'];
        if (enumValues.some(v => v.toLowerCase() === mappedDivision.toLowerCase())) {
            filter.division = { $regex: new RegExp(`^${mappedDivision}$`, 'i') };
        } else {
            // If not an enum, treat as category if no other category is provided
            if (!category && !subCategory && !subcategory) {
                category = division;
            }
        }
    }

    let finalCategoryId = categoryId || null;
    let shouldFilterByCat = Boolean(categoryId);

    if (!finalCategoryId) {
        // Smart Category Resolution
        // Try subcategory first, then fallback to category
        const categoryToResolve = subcategory || subCategory;
        const parentCategoryToResolve = category;

    const resolveCategory = async (catName) => {
        if (!catName || catName === 'All') return null;
        if (/^[0-9a-fA-F]{24}$/.test(String(catName))) return String(catName);
        
        const catDoc = await Category.findOne({ 
            name: { $regex: new RegExp(`^${catName}$`, 'i') }, 
            isActive: true 
        });
        return catDoc ? String(catDoc._id) : null;
    };

    // Attempt resolution: subCategory -> category
    let resolvedId = await resolveCategory(categoryToResolve);
    if (!resolvedId && categoryToResolve) {
        // If subcategory name not found, try the parent category name
        resolvedId = await resolveCategory(parentCategoryToResolve);
    } else if (!categoryToResolve) {
        // No subcategory, resolve the main category
        resolvedId = await resolveCategory(parentCategoryToResolve);
    }

        if (resolvedId) {
            finalCategoryId = resolvedId;
            shouldFilterByCat = true;
        } else if (categoryToResolve || parentCategoryToResolve) {
            // If names were provided but none found, we don't want to return 0 results
            // unless it's a specific search. For now, let's just not filter by category
            // if the requested one doesn't exist, to avoid empty pages.
            shouldFilterByCat = false;
        }
    }

    if (shouldFilterByCat) {
        const allDescendants = await Category.find({ isActive: true }).lean();
        const getDescendantIds = (parentId) => {
            let ids = [String(parentId)];
            const children = allDescendants.filter(c => String(c.parentId) === String(parentId));
            children.forEach(child => {
                ids = [...ids, ...getDescendantIds(child._id)];
            });
            return ids;
        };

        const categoryIds = Array.from(new Set(getDescendantIds(finalCategoryId)));
        filter.categoryId = { $in: categoryIds };
    }

    // Smart Brand Resolution: Resolve name to ID if needed
    if (brand) {
        if (/^[0-9a-fA-F]{24}$/.test(brand)) {
            filter.brandId = brand;
        } else {
            const brandDoc = await Brand.findOne({ name: { $regex: new RegExp(`^${brand}$`, 'i') } });
            if (brandDoc) filter.brandId = brandDoc._id;
            else filter.brandId = null; // No match found
        }
    }

    if (vendor) filter.vendorId = vendor;
    if (flashSale === 'true') filter.flashSale = true;
    if (isNewArrival === 'true') filter.isNewArrival = true;
    if (minPrice || maxPrice) filter.price = { ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) };
    if (minRating) filter.rating = { $gte: Number(minRating) };    
    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'by']);
        const words = searchQuery.split(/[\s\W]+/).filter(w => w && !stopWords.has(w.toLowerCase()));
        
        if (words.length > 0) {
            const conditions = await Promise.all(words.map(async (word) => {
                let safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Handle common plurals for better matching
                const lower = safeWord.toLowerCase();
                if (lower === 'mens') safeWord = 'men';
                else if (lower === 'womens') safeWord = 'women';
                else if (lower === 'boys') safeWord = 'boy';
                else if (lower === 'girls') safeWord = 'girl';
                else if (lower === 'shoes') safeWord = 'shoe';
                else if (lower === 'shirts') safeWord = 'shirt';
                else if (lower === 'pants') safeWord = 'pant';
                else if (lower === 'jeans') safeWord = 'jean';
                else if (lower === 'dresses') safeWord = 'dress';
                
                const regex = new RegExp(safeWord + '(s|es)?', 'i');
                
                const [matchedBrands, matchedVendors, matchedCategories] = await Promise.all([
                    Brand.find({ name: regex }).select('_id').lean(),
                    Vendor.find({ 
                        $or: [{ storeName: regex }, { companyName: regex }, { name: regex }] 
                    }).select('_id').lean(),
                    Category.find({ name: regex }).select('_id').lean()
                ]);
                
                const wordOr = [
                    { name: regex },
                    { tags: regex },
                    { description: regex },
                    { division: regex }
                ];
                
                if (matchedBrands.length > 0) {
                    wordOr.push({ brandId: { $in: matchedBrands.map(b => b._id) } });
                }
                if (matchedVendors.length > 0) {
                    wordOr.push({ vendorId: { $in: matchedVendors.map(v => v._id) } });
                }
                if (matchedCategories.length > 0) {
                    wordOr.push({ categoryId: { $in: matchedCategories.map(c => c._id) } });
                }
                
                return { $or: wordOr };
            }));
            
            if (conditions.length > 0) {
                filter.$and = filter.$and ? [...filter.$and, ...conditions] : conditions;
            }
        }
    }

    const sortMap = { 
        newest: { createdAt: -1 }, 
        oldest: { createdAt: 1 }, 
        'price-asc': { price: 1 }, 
        'price-desc': { price: -1 }, 
        popular: { reviewCount: -1 }, 
        rating: { rating: -1 },
        discount: { discount: -1 }
    };

    if (sort === 'discount') {
        const now = new Date();
        const activeCampaigns = await Campaign.find({
            isActive: true,
            $and: [
                { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
            ]
        }).select('productIds').lean();

        const campaignProductIds = activeCampaigns.reduce((acc, c) => {
            if (!c.productIds) return acc;
            return [...acc, ...c.productIds.map(id => String(id))];
        }, []);

        // Use $or to find products that either have a manual discount OR are in a campaign
        filter.$or = [
            { discount: { $gt: 0 } },
            { _id: { $in: campaignProductIds } }
        ];
    }

    let fetchLimit = Number(limit);
    if (req.query.diversify === 'true') {
        fetchLimit = Math.max(fetchLimit, 500); // Fetch a larger pool for mixing
    }

    let products = await Product.find(filter)
        .select('name slug price originalPrice image images categoryId brandId vendorId stock stockQuantity rating reviewCount isActive isVisible flashSale isNewArrival discount variants division')
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName isOnline shopLocation')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(fetchLimit);

    if (req.query.diversify === 'true' && products.length > 0) {
        const groups = {};
        products.forEach(p => {
            const cat = p.categoryId ? p.categoryId.name : 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });

        const mixed = [];
        let keepGoing = true;
        const finalLimit = Number(limit);
        while (keepGoing && mixed.length < finalLimit) {
            keepGoing = false;
            Object.keys(groups).forEach(k => {
                if (groups[k].length > 0 && mixed.length < finalLimit) {
                    mixed.push(groups[k].shift());
                    keepGoing = true;
                }
            });
        }
        products = mixed;
    } else if (products.length > 0 && (!sort || sort === 'newest')) {
        // Randomize the order for all other categories (excluding CLOSH/diversify which is limit based)
        products = products.sort(() => Math.random() - 0.5);
    }

    const total = await Product.countDocuments(filter);

    const activeProducts = await applyActiveCampaigns(products);
    const responseData = { products: activeProducts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };

    // --- CACHE STORE START ---
    // Cache the result for 5 seconds to avoid stale data during development/testing
    await setCache(cacheKey, responseData, 5);
    // --- CACHE STORE END ---

    res.status(200).json(new ApiResponse(200, responseData, 'Products fetched.'));
});

router.get('/', listProducts);
router.get('/products', listProducts);

// GET /api/products/flash-sale
router.get('/flash-sale', asyncHandler(async (req, res) => {
    const products = await Product.find({ 
        isActive: true, 
        isVisible: true,
        flashSale: true,
        approvalStatus: 'approved',
        price: { $gt: 0 }
    })
        .populate('vendorId', 'storeName isOnline')
        .limit(20);
    const activeProducts = await applyActiveCampaigns(products);
    res.status(200).json(new ApiResponse(200, activeProducts, 'Flash sale products.'));
}));

// GET /api/products/new-arrivals
router.get('/new-arrivals', asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        sort = 'newest',
        search,
        q,
        minPrice,
        maxPrice,
        minRating,
    } = req.query;

    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.max(Number(limit) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { 
        isActive: true, 
        isVisible: true,
        isNewArrival: true,
        approvalStatus: 'approved',
        price: { $gt: 0 }
    };
    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'by']);
        const words = searchQuery.split(/[\s\W]+/).filter(w => w && !stopWords.has(w.toLowerCase()));
        
        if (words.length > 0) {
            const conditions = await Promise.all(words.map(async (word) => {
                let safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Handle common plurals for better matching
                const lower = safeWord.toLowerCase();
                if (lower === 'mens') safeWord = 'men';
                else if (lower === 'womens') safeWord = 'women';
                else if (lower === 'boys') safeWord = 'boy';
                else if (lower === 'girls') safeWord = 'girl';
                else if (lower === 'shoes') safeWord = 'shoe';
                else if (lower === 'shirts') safeWord = 'shirt';
                else if (lower === 'pants') safeWord = 'pant';
                else if (lower === 'jeans') safeWord = 'jean';
                else if (lower === 'dresses') safeWord = 'dress';
                
                const regex = new RegExp(safeWord + '(s|es)?', 'i');
                
                const [matchedBrands, matchedVendors, matchedCategories] = await Promise.all([
                    Brand.find({ name: regex }).select('_id').lean(),
                    Vendor.find({ 
                        $or: [{ storeName: regex }, { companyName: regex }, { name: regex }] 
                    }).select('_id').lean(),
                    Category.find({ name: regex }).select('_id').lean()
                ]);
                
                const wordOr = [
                    { name: regex },
                    { tags: regex },
                    { description: regex },
                    { division: regex }
                ];
                
                if (matchedBrands.length > 0) {
                    wordOr.push({ brandId: { $in: matchedBrands.map(b => b._id) } });
                }
                if (matchedVendors.length > 0) {
                    wordOr.push({ vendorId: { $in: matchedVendors.map(v => v._id) } });
                }
                if (matchedCategories.length > 0) {
                    wordOr.push({ categoryId: { $in: matchedCategories.map(c => c._id) } });
                }
                
                return { $or: wordOr };
            }));
            
            if (conditions.length > 0) {
                filter.$and = filter.$and ? [...filter.$and, ...conditions] : conditions;
            }
        }
    }
    if (minPrice || maxPrice) {
        filter.price = {
            ...(minPrice ? { $gte: Number(minPrice) } : {}),
            ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
        };
    }
    if (minRating) {
        filter.rating = { $gte: Number(minRating) };
    }

    const sortMap = {   
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName isOnline')
            .sort(sortMap[sort] || sortMap.newest)
            .skip(skip)
            .limit(numericLimit),
        Product.countDocuments(filter),
    ]);

    const activeProducts = await applyActiveCampaigns(products);
    res.status(200).json(new ApiResponse(200, {
        products: activeProducts,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'New arrivals fetched.'));
}));

// GET /api/products/popular
router.get('/popular', asyncHandler(async (req, res) => {
    const products = await Product.find({ 
        isActive: true,
        isVisible: true,
        approvalStatus: 'approved',
        price: { $gt: 0 }
    })
        .populate('vendorId', 'storeName isOnline shopLocation')
        .sort({ reviewCount: -1, rating: -1 })
        .limit(10);
    const activeProducts = await applyActiveCampaigns(products);
    res.status(200).json(new ApiResponse(200, activeProducts, 'Popular products.'));
}));

// GET /api/products/similar/:id
router.get('/similar/:id', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, 'Product not found.');
    const similar = await Product.find({ 
        isActive: true, 
        isVisible: true,
        approvalStatus: 'approved',
        price: { $gt: 0 },
        _id: { $ne: product._id }, 
        categoryId: product.categoryId 
    })
        .populate('vendorId', 'storeName isOnline shopLocation')
        .limit(6);
    const activeSimilar = await applyActiveCampaigns(similar);
    res.status(200).json(new ApiResponse(200, activeSimilar, 'Similar products.'));
}));

const getProductDetail = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName storeLogo rating address shopLocation freeShippingThreshold isOnline');
    if (!product) throw new ApiError(404, 'Product not found.');
    const activeProduct = await applyActiveCampaigns(product);
    res.status(200).json(new ApiResponse(200, activeProduct, 'Product detail.'));
});

// GET /api/products/:id
router.get('/products/:id', getProductDetail);

// GET /api/categories (public)
router.get('/categories/all', asyncHandler(async (req, res) => {
    const cacheKey = 'categories:all';
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, cachedData, 'Categories fetched (from cache).'));
    }

    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
    await setCache(cacheKey, categories, 3600); // 1 hour

    res.status(200).json(new ApiResponse(200, categories, 'Categories fetched.'));
}));

// GET /api/brands (public)
router.get('/brands/all', asyncHandler(async (req, res) => {
    const cacheKey = 'brands:all';
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, cachedData, 'Brands fetched (from cache).'));
    }

    const brands = await Brand.find({ isActive: true }).sort({ name: 1 });
    await setCache(cacheKey, brands, 3600); // 1 hour

    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
}));

// GET /api/vendors/all (public)
router.get('/vendors/all', asyncHandler(async (req, res) => {
    const { status = 'approved', page = 1, limit = 50, search } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};

    if (status && status !== 'all') {
        filter.status = status;
    }

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: safeRegex }, { email: safeRegex }, { storeName: safeRegex }];
    }

    const vendors = await Vendor.find(filter)
        .select('-password -otp -otpExpiry')
        .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(numericLimit);
    const total = await Vendor.countDocuments(filter);

    res.status(200).json(new ApiResponse(200, {
        vendors: vendors.map(toPublicVendor),
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendors fetched.'));
}));

// GET /api/vendors/:id (public)
router.get('/vendors/:id', asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('-password -otp -otpExpiry');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, toPublicVendor(vendor), 'Vendor detail fetched.'));
}));

// GET /api/vendors/:id/products (public)
router.get('/vendors/:id/products', asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, sort = 'newest' } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };

    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('_id');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const filter = { 
        isActive: true, 
        isVisible: true,
        approvalStatus: 'approved',
        price: { $gt: 0 },
        vendorId: req.params.id 
    };
    const products = await Product.find(filter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName isOnline')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(numericLimit);
    const total = await Product.countDocuments(filter);

    res.status(200).json(new ApiResponse(200, {
        products,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendor products fetched.'));
}));

// POST /api/coupons/validate
router.post('/coupons/validate', optionalAuth, asyncHandler(async (req, res) => {
    const rawCode = String(req.body?.code || '').trim();
    const cartTotal = Number(req.body?.cartTotal);
    const userId = req.user?.id || req.user?._id;

    if (!rawCode) {
        throw new ApiError(400, 'Coupon code is required.');
    }
    if (!Number.isFinite(cartTotal) || cartTotal < 0) {
        throw new ApiError(400, 'Cart total must be a valid non-negative number.');
    }

    const { coupon, discount } = await validateCoupon(rawCode, cartTotal, userId);

    res.status(200).json(new ApiResponse(200, { 
        coupon: { 
            code: coupon.code, 
            type: coupon.type, 
            value: coupon.value,
            isFirstOrderOnly: coupon.isFirstOrderOnly 
        }, 
        discount 
    }, 'Coupon is valid.'));
}));

// GET /api/coupons/available
router.get('/coupons/available', optionalAuth, asyncHandler(async (req, res) => {
    const now = new Date();
    const userId = req.user?.id || req.user?._id;

    // Fetch all active coupons within date range
    const coupons = await Coupon.find({
        isActive: true,
        $and: [
            { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] }
        ]
    })
        .select('code name type value minOrderValue maxDiscount expiresAt usageLimit usedCount isFirstOrderOnly')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

    let filteredCoupons = coupons;

    // If user is logged in, hide first-order-only coupons if they have past orders
    if (userId) {
        const hasPastOrders = await Order.exists({
            userId,
            status: { $nin: ['cancelled', 'failed'] }
        });

        if (hasPastOrders) {
            filteredCoupons = coupons.filter(c => !c.isFirstOrderOnly);
        }
    }

    res.status(200).json(new ApiResponse(200, filteredCoupons, 'Available coupons fetched.'));
}));

// POST /api/shipping/estimate
router.post('/shipping/estimate', asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const shippingAddress = req.body?.shippingAddress || {};
    const shippingOption = String(req.body?.shippingOption || 'standard');
    const couponType = req.body?.couponType || null;

    if (!items.length) {
        return res.status(200).json(
            new ApiResponse(200, { shipping: 0, byVendor: {} }, 'Shipping estimate calculated.')
        );
    }

    const productIds = items
        .map((item) => String(item?.productId || '').trim())
        .filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
    if (!productIds.length) {
        return res.status(200).json(
            new ApiResponse(200, { shipping: 0, byVendor: {} }, 'Shipping estimate calculated.')
        );
    }

    const products = await Product.find({ _id: { $in: productIds }, isActive: true })
        .populate('vendorId', 'shippingEnabled defaultShippingRate freeShippingThreshold shopLocation')
        .select('_id vendorId price variants.prices')
        .lean();

    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const vendorMap = {};

    items.forEach((item) => {
        const product = productMap.get(String(item?.productId || ''));
        if (!product || !product.vendorId) return;

        const vendorId = String(product.vendorId._id || product.vendorId);
        const quantity = Math.max(1, Number(item?.quantity || 1));
        const price = Math.max(0, Number(resolveVariantPrice(product, item?.variant) || 0));
        const subtotal = price * quantity;

        if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = {
                vendorId,
                subtotal: 0,
                shippingEnabled: product.vendorId.shippingEnabled !== false,
                defaultShippingRate: product.vendorId.defaultShippingRate,
                freeShippingThreshold: product.vendorId.freeShippingThreshold,
                shopLocation: product.vendorId.shopLocation,
            };
        }
        vendorMap[vendorId].subtotal += subtotal;
    });

    const { totalShipping, shippingByVendor, distanceByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: Object.values(vendorMap),
        shippingAddress,
        shippingOption,
        couponType,
    });

    res.status(200).json(
        new ApiResponse(200, {
            shipping: totalShipping,
            byVendor: shippingByVendor,
            distances: distanceByVendor
        }, 'Shipping estimate calculated.')
    );
}));

// GET /api/banners
router.get('/banners', asyncHandler(async (req, res) => {
    const { type } = req.query;
    const cacheKey = `banners:${type || 'all'}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, cachedData, 'Banners fetched (from cache).'));
    }

    const now = new Date();
    const filter = {
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
    };
    if (type) filter.type = type;
    const banners = await Banner.find(filter).sort({ order: 1 });
    await setCache(cacheKey, banners, 1800); // 30 minutes

    res.status(200).json(new ApiResponse(200, banners, 'Banners fetched.'));
}));

// GET /api/campaigns
router.get('/campaigns', asyncHandler(async (req, res) => {
    const { type, limit = 20, withProducts } = req.query;
    const includeProducts = withProducts === 'true';
    const cacheKey = `campaigns:${type || 'all'}:${limit}:${includeProducts}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, cachedData, 'Campaigns fetched (from cache).'));
    }

    const parsedLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const now = new Date();

    const query = {
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
    };
    if (type) query.type = type;

    const campaigns = await Campaign.find(query)
        .select('name slug type route discountType discountValue startDate endDate bannerConfig productIds description')
        .sort({ createdAt: -1 })
        .limit(parsedLimit);

    let result = campaigns;

    // If withProducts=true, populate product details for each campaign
    if (includeProducts) {
        const campaignObjects = campaigns.map(c => c.toObject());
        for (const camp of campaignObjects) {
            const productIds = Array.isArray(camp.productIds)
                ? camp.productIds
                    .map(v => String(v || '').trim())
                    .filter(v => v && /^[a-fA-F0-9]{24}$/.test(v))
                : [];
            if (productIds.length > 0) {
                camp.products = await Product.find({
                    _id: { $in: productIds },
                    isActive: true
                })
                    .populate('categoryId', 'name')
                    .populate('brandId', 'name')
                    .populate('vendorId', 'storeName isOnline')
                    .select('name price originalPrice images image categoryId brandId vendorId')
                    .limit(20)
                    .lean();
            } else {
                camp.products = [];
            }
        }
        result = campaignObjects;
    }

    await setCache(cacheKey, result, 1800); // 30 minutes

    res.status(200).json(new ApiResponse(200, result, 'Campaigns fetched.'));
}));

// DIAGNOSTIC ALIAS: GET /api/deals (Redirects to daily_deal campaigns)
router.get('/deals', asyncHandler(async (req, res) => {
    const now = new Date();
    const campaigns = await Campaign.find({
        type: 'daily_deal',
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
    }).limit(10);
    res.status(200).json(new ApiResponse(200, campaigns, 'Deals fetched via alias.'));
}));

// GET /api/campaigns/:slug
router.get('/campaigns/:slug', asyncHandler(async (req, res) => {
    const slugParam = String(req.params.slug || '').trim().toLowerCase();
    if (!slugParam) throw new ApiError(400, 'Campaign slug is required.');

    // Try finding by slug (case-insensitive), then by _id as fallback
    let campaign = await Campaign.findOne({ slug: { $regex: new RegExp(`^${slugParam}$`, 'i') }, isActive: true });
    
    // Fallback: try finding by _id if slug didn't match
    if (!campaign && /^[a-fA-F0-9]{24}$/.test(slugParam)) {
        campaign = await Campaign.findOne({ _id: slugParam, isActive: true });
    }
    
    if (!campaign) {
        console.log(`[Campaign] Not found for slug/id: "${slugParam}". Active campaigns:`, 
            (await Campaign.find({ isActive: true }).select('slug name').lean()).map(c => c.slug));
        throw new ApiError(404, 'Campaign not found.');
    }

    const now = new Date();
    if (campaign.startDate && campaign.startDate > now) {
        throw new ApiError(404, 'Campaign is not active yet.');
    }
    if (campaign.endDate && campaign.endDate < now) {
        // Campaign has ended — still return it but mark as expired
        // (don't throw 404 so users can still see historical offers)
    }

    const productIds = Array.isArray(campaign.productIds)
        ? campaign.productIds
            .map((value) => String(value || '').trim())
            .filter((value) => value && /^[a-fA-F0-9]{24}$/.test(value))
        : [];

    const products = await Product.find({
        _id: { $in: productIds },
        isActive: true
    })
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName')
        .sort({ createdAt: -1 });

    const payload = {
        ...campaign.toObject(),
        id: String(campaign._id),
        products,
    };

    res.status(200).json(new ApiResponse(200, payload, 'Campaign fetched.'));
}));

// GET /api/geocode (Proxy for OpenStreetMap Nominatim)
router.get('/geocode', asyncHandler(async (req, res) => {
    const { lat, lon, q } = req.query;

    let url;
    if (q) {
        url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}`;
    } else {
        if (!lat || !lon) throw new ApiError(400, 'Latitude and Longitude are required if no query is provided.');
        url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`;
    }

    try {
        const axios = (await import('axios')).default;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'ClouseApp/1.0 (contact@clouse.com)',
                'Accept': 'application/json'
            },
            timeout: 5000
        });

        const data = response.data;
        const result = Array.isArray(data) ? data[0] : data;
        res.status(200).json(new ApiResponse(200, result, 'Geocoding success.'));
    } catch (error) {
        console.error("Proxy Geocoding error:", error.message || error);
        throw new ApiError(500, 'Failed to fetch address from geocoding service.');
    }
}));

// GET /api/orders/track/:id (public order tracking)
router.get('/orders/track/:id', asyncHandler(async (req, res) => {
    const { default: Order } = await import('../models/Order.model.js');
    const order = await Order.findOne({ orderId: req.params.id })
        .select('orderId status trackingNumber estimatedDelivery deliveredAt createdAt updatedAt cancelledAt deliveryBoyId riderAcceptedAt isMultiVendor vendorPickups vendorItems orderType paymentMethod')
        .populate('deliveryBoyId', 'currentLocation name phone');

    if (!order) throw new ApiError(404, 'Order not found.');

    const trackingInfo = order.toObject();

    // Only share delivery boy location if order is out for delivery (shipped)
    if (order.status !== 'shipped' && order.status !== 'out_for_delivery') {
        if (trackingInfo.deliveryBoyId) {
            trackingInfo.deliveryBoyId.currentLocation = undefined;
        }
    }

    res.status(200).json(new ApiResponse(200, trackingInfo, 'Order tracking info.'));
}));

// GET /api/settings
import * as settingsController from '../modules/admin/controllers/settings.controller.js';
router.get('/settings', settingsController.getPublicSettings);
router.get('/settings/:key', settingsController.getSetting);

// ─── Service Area / Serviceability Check ──────────────────────────────────────
import * as serviceAreaService from '../services/serviceArea.service.js';

// POST /api/check-serviceability - Check if delivery is available
router.post('/check-serviceability', asyncHandler(async (req, res) => {
    const { pincode, latitude, longitude, city } = req.body;
    
    const coordinates = latitude && longitude ? [parseFloat(longitude), parseFloat(latitude)] : null;
    
    const result = await serviceAreaService.checkServiceAvailability({ 
        pincode, 
        coordinates, 
        city 
    });
    
    res.json(new ApiResponse(200, result, result.isServiceable ? 'Service available' : 'Service not available'));
}));

// GET /api/service-areas - Get all active service areas for user selection
router.get('/service-areas', asyncHandler(async (req, res) => {
    const areas = await serviceAreaService.getAllActiveServiceAreas();
    res.json(new ApiResponse(200, areas, 'Service areas fetched'));
}));

// Legacy support: GET /api/:id (only ObjectId-like values to avoid swallowing unknown routes)
router.get('/:id([a-fA-F0-9]{24})', getProductDetail);

// Razorpay Webhook
router.post('/payment/webhook', handleRazorpayWebhook);

export default router;
