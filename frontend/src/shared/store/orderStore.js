import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));

const normalizeOrderItem = (item) => ({
  ...item,
  id: item?.id || item?.productId || item?._id,
  selectedSize: item?.selectedSize || item?.variant?.size || item?.variant?.Size || 'N/A',
  discountedPrice: item?.discountedPrice || item?.price || 0,
});

const normalizeVendorGroup = (group) => ({
  ...group,
  vendorId: String(group?.vendorId || ''),
  items: Array.isArray(group?.items) ? group.items.map(normalizeOrderItem) : [],
});

const normalizeOrder = (order) => {
  const id = order?.id || order?.orderId || order?._id;
  const shipping = order?.shippingAddress || {};
  return {
    ...order,
    id,
    date: order?.date || order?.createdAt || new Date().toISOString(),
    userId: order?.userId || null,
    items: Array.isArray(order?.items) ? order.items.map(normalizeOrderItem) : [],
    vendorItems: Array.isArray(order?.vendorItems)
      ? order.vendorItems.map(normalizeVendorGroup)
      : [],
    // Map backend shippingAddress to UI address object
    address: {
      ...shipping,
      address: shipping.address || '',
      locality: shipping.locality || '',
      city: shipping.city || '',
      state: shipping.state || '',
      pincode: shipping.zipCode || shipping.pincode || '',
      mobile: shipping.phone || shipping.mobile || '',
      name: shipping.name || order?.guestInfo?.name || 'Customer',
    }
  };
};

const normalizePublicTrackingOrder = (order) =>
  normalizeOrder({
    ...order,
    id: order?.orderId || order?._id,
    date: order?.createdAt || order?.date,
    items: [],
    vendorItems: [],
  });

const buildIdempotencyKey = (payload, userId = null) => {
  // Use a 10-second window for identical order key stabilization.
  // This prevents double-clicks/quick retries but allows subsequent purchases.
  const timeWindow = Math.floor(Date.now() / (10 * 1000));

  const base = JSON.stringify({
    userId: userId || null,
    items: (payload?.items || []).map(i => ({ productId: i.productId, quantity: i.quantity, variant: i.variant })),
    shippingAddress: payload?.shippingAddress || {},
    paymentMethod: payload?.paymentMethod || "",
    couponCode: payload?.couponCode || "",
    orderType: payload?.orderType || "check_and_buy",
    dropoffLocation: payload?.dropoffLocation || null,
    total: payload?.total || 0,
    timeWindow,
  });

  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }

  // Use a stable key per unique order intent for better duplicate detection
  return `ord-${Math.abs(hash)}-${payload?.items?.length || 0}`;
};

export const useOrderStore = create(
  persist(
    (set, get) => ({
      orders: [],
      isLoading: false,
      hasFetched: false,
      lastError: null,
      orderPagination: { total: 0, page: 1, pages: 1, limit: 20 },

      // Create a new order
      createOrder: async (orderData) => {
        const items = Array.isArray(orderData?.items) ? orderData.items : [];
        if (items.length === 0) {
          throw new Error('Your cart is empty.');
        }

        const hasInvalidProductIds = items.some((item) => {
          const id = String(item?.id || '');
          return !id.startsWith('upsell-') && !isMongoId(id);
        });
        if (hasInvalidProductIds) {
          throw new Error('Some cart items have invalid identifiers. Please refresh your cart.');
        }

        set({ isLoading: true, lastError: null });
        try {
          const payload = {
            items: orderData.items.map((item) => {
              // Extract original Mongo ID if it's an upsell item (format: upsell-ID-timestamp)
              const productId = String(item.id || item.productId || item._id).startsWith('upsell-')
                ? (item.id || item.productId || item._id).split('-')[1]
                : (item.id || item.productId || item._id);

              return {
                productId,
                quantity: Number(item.quantity || 1),
                price: Number(item.price || 0),
                variant: item.variant || undefined,
              };
            }),
            shippingAddress: orderData.shippingAddress,
            paymentMethod: orderData.paymentMethod,
            couponCode: orderData.couponCode || undefined,
            shippingOption: orderData.shippingOption || 'standard',
            orderType: orderData.orderType || 'check_and_buy',
            dropoffLocation: orderData.dropoffLocation || null,
            deviceToken: orderData.deviceToken || undefined,
            deliveryType: orderData.deliveryType || 'online',
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            shipping: orderData.shipping,
            platformFee: orderData.platformFee,
            total: orderData.total,
            // Spend CLOSH wallet balance; the server decides how much.
            useWallet: Boolean(orderData.useWallet),
          };
          const idempotencyKey = buildIdempotencyKey(payload, orderData.userId);

          const response = await api.post('/user/orders', payload, {
            headers: {
              "x-idempotency-key": idempotencyKey,
            },
          });
          const payloadData = response?.data || response;

          // Support both flattened and wrapped response structures
          const createdOrderId = payloadData?.orderId || response?.orderId || response?.data?.orderId;

          if (!createdOrderId) {
            throw new Error('Invalid order creation response from server.');
          }

          const createdOrder = await get().fetchOrderById(createdOrderId);
          if (!createdOrder) {
            throw new Error('Order created but could not be fetched. Please check your orders.');
          }

          // What the server actually charged: 'wallet' when the wallet covered everything.
          createdOrder.serverPaymentMethod = payloadData?.paymentMethod;
          createdOrder.walletApplied = Number(payloadData?.walletApplied || 0);
          createdOrder.payableTotal = Number(payloadData?.total ?? createdOrder.total);

          // Attach payment metadata if present in original POST response
          if (payloadData?.razorpayOrderId) {
            createdOrder.razorpayOrderId = payloadData.razorpayOrderId;
            createdOrder.razorpayKeyId = payloadData.razorpayKeyId;
            // Preserve exact server-computed amount (in paise) to avoid Razorpay 400 mismatch
            createdOrder.razorpayAmount = Math.round(Number(payloadData.total) * 100);
          }

          set({ isLoading: false, lastError: null });
          return createdOrder;
        } catch (error) {
          const errorMessage = error.response?.data?.errors?.[0]?.message || error.response?.data?.message || error.message;
          set({ isLoading: false, lastError: errorMessage || 'Failed to place order.' });
          
          const customError = new Error(errorMessage || 'Failed to place order.');
          if (error.response) {
              customError.response = error.response;
          }
          throw customError;
        }
      },

      fetchUserOrders: async (page = 1, limit = 20) => {
        set({ isLoading: true, lastError: null });
        try {
          const response = await api.get('/user/orders', { params: { page, limit } });
          const payload = response?.data || response;
          // Orders are in payload.orders if flattened, or payload.data.orders if wrapped
          const orderListData = Array.isArray(payload?.orders) ? payload.orders : (payload?.data?.orders || []);
          const list = orderListData.map(normalizeOrder);
          const pagination = {
            total: Number(payload?.total || 0),
            page: Number(payload?.page || page),
            pages: Number(payload?.pages || 1),
            limit: Number(limit),
          };

          set((state) => ({
            orders: page === 1 ? list : [...state.orders, ...list],
            hasFetched: true,
            isLoading: false,
            lastError: null,
            orderPagination: pagination,
          }));

          return { orders: list, pagination };
        } catch (error) {
          set({ isLoading: false, lastError: error?.message || 'Failed to fetch orders.' });
          throw error;
        }
      },

      fetchOrderById: async (orderId, bypassCache = false) => {
        if (!bypassCache) {
          const existing = get().orders.find((order) => String(order.id) === String(orderId));
          if (existing) return existing;
        }

        try {
          const response = await api.get(`/user/orders/${orderId}`);
          const payload = response?.data || response;
          // Extract order object from payload or payload.data
          const orderData = payload?.orderId ? payload : (payload?.data || payload);
          const normalized = normalizeOrder(orderData);

          set((state) => ({
            orders: [normalized, ...state.orders.filter((o) => String(o.id) !== String(normalized.id))],
            lastError: null,
          }));

          return normalized;
        } catch (error) {
          set({ lastError: error?.message || 'Failed to fetch order.' });
          return null;
        }
      },

      fetchPublicTrackingOrder: async (orderId) => {
        const existing = get().orders.find((order) => String(order.id) === String(orderId));
        if (existing) return existing;

        try {
          const response = await api.get(`/orders/track/${orderId}`);
          const payload = response?.data ?? response;
          const normalized = normalizePublicTrackingOrder(payload);

          set((state) => ({
            orders: [normalized, ...state.orders.filter((o) => String(o.id) !== String(normalized.id))],
            lastError: null,
          }));

          return normalized;
        } catch (error) {
          set({ lastError: error?.message || 'Failed to track order.' });
          return null;
        }
      },

      resendDeliveryOtp: async (orderId) => {
        const response = await api.post(`/user/orders/${orderId}/resend-delivery-otp`);
        const payload = response?.data ?? response;
        // Update order in store with new OTP debug value if returned
        if (payload?.deliveryOtpDebug) {
          set((state) => ({
            orders: state.orders.map((o) =>
              String(o.id) === String(orderId) || String(o.orderId) === String(orderId)
                ? { ...o, deliveryOtpDebug: payload.deliveryOtpDebug }
                : o
            ),
          }));
        }
        return payload;
      },

      ensureHydrated: () => {
        const state = get();
        if (!state.hasFetched && !state.isLoading) {
          state.fetchUserOrders(1, 30).catch(() => null);
        }
      },

      // Get a single order by ID
      getOrder: (orderId) => {
        get().ensureHydrated();
        const state = get();
        return state.orders.find((order) => String(order.id) === String(orderId));
      },

      // Get all orders for a user (or guest orders if userId is null)
      getAllOrders: (userId = null) => {
        get().ensureHydrated();
        const state = get();
        if (userId === null) {
          return state.orders.filter((order) => order.userId === null || order.userId === undefined);
        }
        return state.orders.filter((order) => String(order.userId) === String(userId));
      },

      // Get orders for a specific vendor
      getVendorOrders: (vendorId) => {
        const state = get();
        return state.orders.filter((order) => {
          if (!order.vendorItems) return false;
          return order.vendorItems.some(
            (vi) => String(vi.vendorId) === String(vendorId) || Number(vi.vendorId) === Number(vendorId)
          );
        });
      },

      // Get order items for a specific vendor from an order
      getVendorOrderItems: (orderId, vendorId) => {
        const order = get().getOrder(orderId);
        if (!order || !order.vendorItems) return null;

        const vendorItem = order.vendorItems.find(
          (vi) => String(vi.vendorId) === String(vendorId) || Number(vi.vendorId) === Number(vendorId)
        );
        return vendorItem || null;
      },

      // Update order status locally (used by non-user modules)
      updateOrderStatus: (orderId, newStatus) => {
        set((state) => ({
          orders: state.orders.map((order) =>
            String(order.id) === String(orderId) ? { ...order, status: newStatus } : order
          ),
        }));
      },

      // Cancel an order
      cancelOrder: async (orderId, reason = 'Cancelled by customer') => {
        const order = get().getOrder(orderId);
        if (!order) return false;

        try {
          await api.patch(`/user/orders/${orderId}/cancel`, { reason });
        } catch (error) {
          throw error;
        }

        set((state) => ({
          orders: state.orders.map((o) =>
            String(o.id) === String(orderId)
              ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() }
              : o
          ),
        }));

        return true;
      },

      requestReturn: async (orderId, payload = {}) => {
        const body = {
          reason: String(payload?.reason || '').trim(),
          ...(payload?.vendorId ? { vendorId: payload.vendorId } : {}),
          ...(Array.isArray(payload?.items) ? { items: payload.items } : {}),
          ...(Array.isArray(payload?.images) ? { images: payload.images } : {}),
        };

        const response = await api.post(`/user/orders/${orderId}/returns`, body);
        const data = response?.data ?? response;
        return data;
      },

      requestTryBuyReturn: async (orderId, payload = {}) => {
        const body = {
          reason: String(payload?.reason || '').trim(),
          ...(Array.isArray(payload?.items) ? { items: payload.items } : {}),
          ...(Array.isArray(payload?.images) ? { images: payload.images } : {}),
        };

        const response = await api.post(`/user/orders/${orderId}/try-buy-returns`, body);
        const data = response?.data ?? response;
        return data;
      },

      fetchUserReturns: async (page = 1, limit = 20, status = 'all') => {
        const response = await api.get('/user/returns', { params: { page, limit, status } });
        const payload = response?.data ?? response;
        return payload?.returnRequests || [];
      },

      submitReturnUPI: async (returnId, upiId) => {
        const response = await api.post(`/user/returns/${returnId}/upi`, { upiId });
        const data = response?.data ?? response;
        return data;
      },

      resetOrders: () => {
        set({
          orders: [],
          hasFetched: false,
          lastError: null,
          orderPagination: { total: 0, page: 1, pages: 1, limit: 20 },
        });
      },
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(() => localStorage),
      // Exclude high-volume 'orders' array from persistence to prevent QuotaExceededError (Storage Full)
      // Orders are re-fetched from the API on demand.
      partialize: (state) => ({
        hasFetched: state.hasFetched,
        orderPagination: state.orderPagination
      }),
    }
  )
);

