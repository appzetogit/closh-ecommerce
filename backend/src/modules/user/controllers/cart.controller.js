import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Cart from '../../../models/Cart.model.js';
import Product from '../../../models/Product.model.js';
import mongoose from 'mongoose';
import { resolveVariantPrice, getAvailableStock } from '../../../utils/variantKey.js';

// Fields to pull live from Product via populate
const PRODUCT_SELECT = 'name price originalPrice discount image images stock stockQuantity isActive isVisible variants categoryId brandId vendorId';

// Helper: populate cart with live product data
const populateCart = (query) =>
    query.populate({
        path: 'items.productId',
        select: PRODUCT_SELECT,
        populate: [
            { path: 'categoryId', select: 'name' },
            { path: 'brandId', select: 'name' },
            { path: 'vendorId', select: 'storeName isOnline shopLocation' },
        ],
    });

// The cart is checked against stock when items are added or changed, with the same rule
// placeOrder uses (getAvailableStock), so the customer is told at once instead of at
// "Place order".
const STOCK_FIELDS = '_id name stockQuantity stock variants';
const stockLimitError = (name, available, inCart = 0) => {
    const units = `${available} unit${available === 1 ? '' : 's'}`;
    const message = available <= 0
        ? `"${name}" is out of stock in this size.`
        : inCart >= available
            ? `Only ${units} of "${name}" available, and ${inCart === 1 ? 'it is' : 'they are'} already in your cart.`
            : `Only ${units} of "${name}" available.`;
    return new ApiError(400, message, [{ code: 'STOCK_LIMIT', available }]);
};

// Helper: format cart items for frontend consumption
const formatItems = (cart) => {
    if (!cart) return [];
    return (cart.items || [])
        .filter((item) => item.productId && item.productId.isActive !== false)
        .map((item) => {
            const p = item.productId;
            // The selected size/colour can have its own price; quote what checkout will charge.
            const { price } = resolveVariantPrice(p, item.variant);
            return {
                cartItemId: item._id,
                id: p._id,
                name: p.name,
                price,
                basePrice: p.price,
                originalPrice: p.originalPrice || p.price,
                discount: p.discount || 0,
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : p.image,
                images: p.images,
                stock: p.stock,
                stockQuantity: p.stockQuantity,
                isActive: p.isActive,
                variants: p.variants,
                categoryId: p.categoryId,
                brandId: p.brandId,
                vendorId: p.vendorId,
                quantity: item.quantity,
                variant: item.variant,
                // Units that can be bought in this size/colour; the cart caps the quantity here.
                availableStock: getAvailableStock(p, item.variant),
            };
        });
};

// GET /api/user/cart
export const getCart = asyncHandler(async (req, res) => {
    const cart = await populateCart(Cart.findOne({ userId: req.user.id }));
    const items = formatItems(cart);
    res.status(200).json(new ApiResponse(200, { items }, 'Cart fetched.'));
});

// POST /api/user/cart
export const addToCart = asyncHandler(async (req, res) => {
    const { productId, quantity = 1, variant = {} } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(productId || ''))) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const product = await Product.findOne({ _id: productId, isActive: true, approvalStatus: 'approved', price: { $gt: 0 } }).select(STOCK_FIELDS);
    if (!product) {
        throw new ApiError(404, 'Product not found or not available.');
    }
    const addQty = Math.max(1, Math.floor(Number(quantity) || 1));

    let cart = await Cart.findOne({ userId: req.user.id });

    // Same product + variant already in the cart counts towards the stock limit.
    const sameLine = (i) => String(i.productId) === String(productId)
        && (i.variant?.size || '') === (variant?.size || '')
        && (i.variant?.color || '') === (variant?.color || '');
    const inCart = cart ? (cart.items.find(sameLine)?.quantity || 0) : 0;
    const available = getAvailableStock(product, variant);
    if (inCart + addQty > available) throw stockLimitError(product.name, available, inCart);

    if (!cart) {
        cart = await Cart.create({
            userId: req.user.id,
            items: [{ productId, quantity: addQty, variant }],
        });
    } else {
        // Check if same product + variant already in cart
        const existingIdx = cart.items.findIndex(sameLine);

        if (existingIdx >= 0) {
            cart.items[existingIdx].quantity = cart.items[existingIdx].quantity + addQty;
        } else {
            cart.items.push({ productId, quantity: addQty, variant });
        }
        await cart.save();
    }

    const refreshed = await populateCart(Cart.findOne({ userId: req.user.id }));
    const items = formatItems(refreshed);
    res.status(201).json(new ApiResponse(201, { items }, 'Item added to cart.'));
});

// PUT /api/user/cart/:itemId
export const updateCartItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { quantity, variant } = req.body;

    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) throw new ApiError(404, 'Cart not found.');

    const item = cart.items.id(itemId);
    if (!item) throw new ApiError(404, 'Cart item not found.');

    // A higher quantity or a different size must still be in stock.
    const nextQty = quantity !== undefined ? Math.floor(Number(quantity) || 0) : item.quantity;
    const nextVariant = variant !== undefined ? variant : item.variant;
    const growing = quantity !== undefined && nextQty > item.quantity;
    if (nextQty > 0 && (growing || variant !== undefined)) {
        const product = await Product.findById(item.productId).select(STOCK_FIELDS);
        if (!product) throw new ApiError(404, 'Product not found or not available.');
        const available = getAvailableStock(product, nextVariant);
        if (nextQty > available) throw stockLimitError(product.name, available, growing ? item.quantity : 0);
    }

    if (quantity !== undefined) {
        if (Number(quantity) <= 0) {
            cart.items.pull(itemId);
        } else {
            item.quantity = nextQty;
        }
    }
    if (variant !== undefined) {
        item.variant = variant;
    }

    await cart.save();
    const refreshed = await populateCart(Cart.findOne({ userId: req.user.id }));
    const items = formatItems(refreshed);
    res.status(200).json(new ApiResponse(200, { items }, 'Cart updated.'));
});

// DELETE /api/user/cart/:itemId
export const removeCartItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
        return res.status(200).json(new ApiResponse(200, { items: [] }, 'Cart is empty.'));
    }

    cart.items.pull(itemId);
    await cart.save();

    const refreshed = await populateCart(Cart.findOne({ userId: req.user.id }));
    const items = formatItems(refreshed);
    res.status(200).json(new ApiResponse(200, { items }, 'Item removed from cart.'));
});

// DELETE /api/user/cart
export const clearCart = asyncHandler(async (req, res) => {
    await Cart.findOneAndUpdate({ userId: req.user.id }, { items: [] });
    res.status(200).json(new ApiResponse(200, { items: [] }, 'Cart cleared.'));
});
