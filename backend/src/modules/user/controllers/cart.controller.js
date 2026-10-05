import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Cart from '../../../models/Cart.model.js';
import Product from '../../../models/Product.model.js';
import mongoose from 'mongoose';
import { resolveVariantPrice } from '../../../utils/variantKey.js';

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

    const product = await Product.findOne({ _id: productId, isActive: true, approvalStatus: 'approved', price: { $gt: 0 } }).select('_id stockQuantity stock');
    if (!product) {
        throw new ApiError(404, 'Product not found or not available.');
    }

    let cart = await Cart.findOne({ userId: req.user.id });

    if (!cart) {
        cart = await Cart.create({
            userId: req.user.id,
            items: [{ productId, quantity: Number(quantity), variant }],
        });
    } else {
        // Check if same product + variant already in cart
        const existingIdx = cart.items.findIndex((i) => {
            if (String(i.productId) !== String(productId)) return false;
            const sameSize = (i.variant?.size || '') === (variant?.size || '');
            const sameColor = (i.variant?.color || '') === (variant?.color || '');
            return sameSize && sameColor;
        });

        if (existingIdx >= 0) {
            cart.items[existingIdx].quantity = cart.items[existingIdx].quantity + Number(quantity);
        } else {
            cart.items.push({ productId, quantity: Number(quantity), variant });
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

    if (quantity !== undefined) {
        if (Number(quantity) <= 0) {
            cart.items.pull(itemId);
        } else {
            item.quantity = Number(quantity);
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
