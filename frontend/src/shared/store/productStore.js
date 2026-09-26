import { create } from 'zustand';
import api from '../utils/api';
import toast from 'react-hot-toast';

export const normalizeProduct = (p) => {
    const originalPrice = p.originalPrice || p.mrp || null;
    const sellingPrice = p.price || 0;
    
    // Format discount string: use p.discount if provided, otherwise calculate from prices
    let discountDisplay = null;
    if (p.discount) {
        discountDisplay = String(p.discount).toUpperCase().includes('OFF') 
            ? p.discount 
            : `${p.discount}% OFF`;
    } else if (originalPrice && Number(originalPrice) > Number(sellingPrice)) {
        discountDisplay = `${Math.round(((Number(originalPrice) - Number(sellingPrice)) / Number(originalPrice)) * 100)}% OFF`;
    }

    return {
        ...p,
        id: p._id || p.id,
        stockQuantity: p.stockQuantity ?? 0,
        price: sellingPrice,
        discountedPrice: sellingPrice,
        originalPrice: originalPrice,
        discount: discountDisplay,
        image: p.image || p.images?.[0] || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop',
        images: Array.isArray(p.images) && p.images.length > 0 ? p.images : (p.image ? [p.image] : []),
        brand: (p.brandName && p.brandName !== 'AAPZETO' && p.brandName !== 'Appzeto') ? p.brandName : ((p.brandId?.name && p.brandId?.name !== 'AAPZETO' && p.brandId?.name !== 'Appzeto') ? p.brandId.name : ((p.brand && p.brand !== 'AAPZETO' && p.brand !== 'Appzeto') ? p.brand : 'CLOSH')),
        category: p.categoryName || p.categoryId?.name || p.category || 'General',
        vendor: p.vendorName || p.vendorId?.storeName || 'Clothify'
    };
};

let fetchRequestId = 0;

export const useProductStore = create((set, get) => ({
    products: [],
    isLoading: false,
    fetchError: false,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    // Every caller (Home feed, category browsing, shop page, ...) shares this
    // one `products` list, so a stale or failed request must never overwrite
    // what a newer request already put there - otherwise, e.g., a category
    // page's fetch failing silently leaves the Home page's 100-item feed on
    // screen looking like "every category shows the same 100 products".
    fetchPublicProducts: async (params = {}) => {
        const requestId = ++fetchRequestId;
        set({ isLoading: true, fetchError: false });
        try {
            // Backend maps /products to Public routes
            const response = await api.get('/products', { params });
            if (requestId !== fetchRequestId) return; // superseded by a newer request
            const payload = response?.data || response;

            // Handle both ApiResponse wrapped format and direct format
            const productsList = Array.isArray(payload?.data?.products)
                ? payload.data.products
                : (Array.isArray(payload?.products) ? payload.products : []);

            const normalized = productsList.map(normalizeProduct);

            const pagination = payload?.data?.pagination || payload?.pagination || {
                total: payload?.data?.total || payload?.total || 0,
                page: payload?.data?.page || payload?.page || 1,
                pages: payload?.data?.pages || payload?.pages || 1,
                limit: params.limit || 20
            };

            set({
                products: normalized,
                pagination,
                isLoading: false,
                fetchError: false
            });
        } catch (error) {
            if (requestId !== fetchRequestId) return; // superseded by a newer request
            // Don't leave a previous, unrelated fetch's products on screen -
            // that reads as "every filter shows the same wrong list" instead
            // of the network failure it actually is.
            set({ isLoading: false, fetchError: true, products: [] });
        }
    },

    fetchProductById: async (id) => {
        // Validation: skip if not a valid Mongo ObjectId to avoid 400 CastError
        if (!id || !/^[0-9a-fA-F]{24}$/.test(String(id))) {
            return null;
        }

        try {
            const response = await api.get(`/products/${id}`);
            const payload = response?.data || response;
            const productData = payload?.data || payload;
            return normalizeProduct(productData);
        } catch (error) {
            // Fallback to local cache if network fails
            const existing = get().products.find(p => String(p.id) === String(id));
            if (existing) return existing;
            return null;
        }
    }
}));
