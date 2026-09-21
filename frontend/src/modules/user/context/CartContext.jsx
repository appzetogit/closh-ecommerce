import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useCartStore } from '../../../shared/store/useStore';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    const { user } = useAuth();
    const items = useCartStore(state => state.items);
    const storeAddItem = useCartStore(state => state.addItem);
    const storeRemoveItem = useCartStore(state => state.removeItem);
    const storeUpdateQuantity = useCartStore(state => state.updateQuantity);
    const storeClearCart = useCartStore(state => state.clearCart);
    const storeGetTotal = useCartStore(state => state.getTotal);
    const storeGetItemCount = useCartStore(state => state.getItemCount);
    const storeUpdateVariant = useCartStore(state => state.updateItemVariant);
    const storeFetchCart = useCartStore(state => state.fetchCart);

    const [lastAddedItem, setLastAddedItem] = useState(null);

    // Initial cart load if authenticated
    useEffect(() => {
        if (user) {
            storeFetchCart();
        }
    }, [user, storeFetchCart]);

    const addToCart = useCallback(async (product) => {
        if (!user) {
            window.dispatchEvent(new Event('openLoginModal'));
            toast.error("Please login to add items to cart");
            return;
        }

        // The caller (e.g. ProductDetailsPage) resolves the correct variant price
        // and passes it as `product.price`. We must use that resolved price.
        const added = await storeAddItem({
            id: product._id || product.id,
            name: product.name,
            price: Number(product.price) || Number(product.discountedPrice) || 0,
            originalPrice: product.originalPrice || product.price || 0,
            image: Array.isArray(product.images) ? product.images[0] : (product.image || ''),
            images: product.images,
            brand: product.brand,
            vendorId: product.vendorId?._id || product.vendorId || 1,
            vendorName: product.vendorId?.storeName || product.vendorName || 'Store',
            stockQuantity: product.stockQuantity || product.stock,
            tryAndBuyEnabled: product.tryAndBuyEnabled !== false,
            variants: product.variants,
            variant: {
                ...(product.variant || {}),
                ...(product.selectedSize && { size: product.selectedSize }),
                ...(product.selectedColor && { color: product.selectedColor }),
            },
            quantity: product.quantity || 1,
        });
        if (added) {
            setLastAddedItem(product);
            setTimeout(() => setLastAddedItem(null), 3000);
        }
    }, [storeAddItem, user]);

    const removeFromCart = useCallback((cartItemId, _variant = null) => {
        storeRemoveItem(cartItemId);
    }, [storeRemoveItem]);

    const updateQuantity = useCallback((cartItemId, quantity, _variant = null) => {
        storeUpdateQuantity(cartItemId, quantity);
    }, [storeUpdateQuantity]);

    const clearCart = useCallback(() => {
        storeClearCart();
    }, [storeClearCart]);

    const getCartTotal = useCallback(() => {
        return storeGetTotal();
    }, [storeGetTotal]);

    const getCartCount = useCallback(() => {
        return items.reduce((count, item) => count + (item.quantity || 1), 0);
    }, [items]);

    const updateVariant = useCallback((cartItemId, newVariant) => {
        storeUpdateVariant(cartItemId, newVariant);
    }, [storeUpdateVariant]);

    const fetchCart = useCallback(() => {
        storeFetchCart();
    }, [storeFetchCart]);

    const value = useMemo(() => ({
        cart: items,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateVariant,
        clearCart,
        getCartTotal,
        getCartCount,
        fetchCart,
        lastAddedItem,
    }), [items, addToCart, removeFromCart, updateQuantity, updateVariant, clearCart, getCartTotal, getCartCount, fetchCart, lastAddedItem]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
};

