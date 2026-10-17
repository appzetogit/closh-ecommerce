import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./authStore";
import { setPostLoginAction, setPostLoginRedirect } from "../utils/postLoginAction";
import api from "../utils/api";


// Cart Store — API-backed (MongoDB via backend)
export const useCartStore = create((set, get) => ({
  items: [],
  isLoading: false,
  maxCartVendorDistanceKm: 10,

  fetchDeliveryConfig: async () => {
    try {
      const res = await api.get('/config/delivery');
      if (res?.success && res?.data?.maxCartVendorDistanceKm) {
        set({ maxCartVendorDistanceKm: res.data.maxCartVendorDistanceKm });
      }
    } catch (e) {
      console.error('Failed to fetch delivery config', e);
    }
  },

  fetchCart: async () => {
    const authState = useAuthStore.getState();
    if (!authState?.isAuthenticated) return;
    try {
      set({ isLoading: true });
      const res = await api.get('/user/cart');
      if (res?.success) {
        set({ items: res.data?.items || [], isLoading: false });
      }
    } catch (e) {
      set({ isLoading: false });
      console.error('Failed to fetch cart', e);
    }
  },

  addItem: async (item) => {
    const authState = useAuthStore.getState();
    if (!authState?.isAuthenticated) {
      setPostLoginAction({
        type: 'cart:add',
        payload: { ...item, quantity: Number(item?.quantity) > 0 ? Number(item.quantity) : 1 },
      });
      toast.error('Please login to add products to cart');
      // SPA-friendly redirect to login
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        const fromPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        setPostLoginRedirect(fromPath || '/home');
        const nextState = { from: { pathname: fromPath || '/home' } };
        window.history.pushState(nextState, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
      }
      return false;
    }

    try {
      const payload = {
        productId: item.id || item._id,
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        variant: {
          size: item.variant?.size || item.selectedSize || '',
          color: item.variant?.color || item.selectedColor || '',
        },
      };

      // silent: the message is shown once below (the API client would toast it too).
      const res = await api.post('/user/cart', payload, { silent: true });
      if (res?.success) {
        set({ items: res.data?.items || [] });
        // Trigger cart animation
        const { triggerCartAnimation } = useUIStore.getState();
        triggerCartAnimation();
        return true;
      }
      return false;
    } catch (e) {
      const msg = e?.response?.data?.message || 'Failed to add to cart';
      toast.error(msg, { id: 'cart-stock' });
      return false;
    }
  },

  removeItem: async (cartItemId) => {
    try {
      const res = await api.delete(`/user/cart/${cartItemId}`);
      if (res?.success) {
        set({ items: res.data?.items || [] });
      }
    } catch (e) {
      toast.error('Failed to remove item from cart');
    }
  },

  updateQuantity: async (cartItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    try {
      const res = await api.put(`/user/cart/${cartItemId}`, { quantity }, { silent: true });
      if (res?.success) {
        set({ items: res.data?.items || [] });
      }
    } catch (e) {
      // e.g. "Only 1 unit of ... available" when the stock limit is reached.
      toast.error(e?.response?.data?.message || 'Failed to update quantity', { id: 'cart-stock' });
    }
  },

  updateItemVariant: async (cartItemId, newVariant) => {
    try {
      const res = await api.put(`/user/cart/${cartItemId}`, { variant: newVariant }, { silent: true });
      if (res?.success) {
        set({ items: res.data?.items || [] });
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update variant', { id: 'cart-stock' });
    }
  },

  clearCart: async () => {
    try {
      await api.delete('/user/cart/clear');
      set({ items: [] });
    } catch (e) {
      // Silently clear local state even if API fails (e.g. after order placed)
      set({ items: [] });
    }
  },

  getTotal: () => {
    const state = get();
    return state.items.reduce((total, item) => total + (item.price || 0) * item.quantity, 0);
  },

  getItemCount: () => {
    const authState = useAuthStore.getState();
    if (!authState?.isAuthenticated) return 0;
    return get().items.reduce((count, item) => count + item.quantity, 0);
  },

  getItemsByVendor: () => {
    const authState = useAuthStore.getState();
    if (!authState?.isAuthenticated) return [];
    const state = get();
    const vendorGroups = {};

    state.items.forEach((item) => {
      const vendorId = String(item.vendorId?._id || item.vendorId || 1);
      const vendorName = item.vendorId?.storeName || item.vendorName || 'Unknown Vendor';

      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = { vendorId, vendorName, items: [], subtotal: 0 };
      }
      vendorGroups[vendorId].items.push(item);
      vendorGroups[vendorId].subtotal += (item.price || 0) * item.quantity;
    });

    return Object.values(vendorGroups);
  },
}));

// UI Store (for modals, loading states, etc.)
export const useUIStore = create((set) => ({
  isMenuOpen: false,
  isCartOpen: false,
  isLoading: false,
  cartAnimationTrigger: 0,
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
  setLoading: (loading) => set({ isLoading: loading }),
  triggerCartAnimation: () =>
    set((state) => ({ cartAnimationTrigger: state.cartAnimationTrigger + 1 })),
}));

// Initialize delivery config once on load
if (typeof window !== 'undefined') {
  useCartStore.getState().fetchDeliveryConfig();
}
