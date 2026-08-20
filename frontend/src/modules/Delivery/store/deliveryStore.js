import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '@shared/utils/api';

const normalizeDeliveryBoy = (input) => {
  if (!input) return null;
  // Handle ApiResponse wrapper
  const raw = input.data && input.statusCode ? input.data : input;

  const id = raw.id || raw._id;
  // Prioritize status, if missing use isAvailable to decide
  const status = raw.status || (raw.isAvailable === true ? 'available' : 'offline');
  return {
    ...raw,
    id,
    _id: id,
    status,
    bankDetails: raw.bankDetails || {},
    upiId: raw.upiId || '',
    kycStatus: raw.kycStatus || 'none',
    totalCashCollected: raw.totalCashCollected || raw.cashCollected || 0
  };
};

const mapBackendStatusToUI = (status) => {
  const map = {
    ready_for_pickup: 'pending',
    assigned: 'accepted',
    picked_up: 'picked-up',
    out_for_delivery: 'out-for-delivery',
    delivered: 'delivered'
  };
  return map[status] || status || 'pending';
};

const toAddressLine = (shippingAddress = {}) => {
  const parts = [
    shippingAddress.address,
    shippingAddress.locality,
    shippingAddress.city,
    shippingAddress.state,
    shippingAddress.zipCode || shippingAddress.pincode
  ].filter(Boolean);
  return parts.join(', ');
};

const normalizeOrder = (raw) => {
  if (!raw) return null;
  const shippingAddress = raw?.shippingAddress || {};
  const guestInfo = raw?.guestInfo || {};
  const backendStatus = raw?.status || 'pending';
  const uiStatus = mapBackendStatusToUI(backendStatus);
  const itemCount = Array.isArray(raw?.items)
    ? raw.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    : (typeof raw?.items === 'number' ? raw.items : 0);
  const vendorFirst = Array.isArray(raw?.vendorItems) && raw.vendorItems.length > 0 ? raw.vendorItems[0] : null;
  const vendorData = vendorFirst?.vendorId || {};

  // Resolve vendor address from multiple sources: vendor profile > order snapshot > vendorPickups
  const pickupStop = Array.isArray(raw?.vendorPickups) && raw.vendorPickups.length > 0 ? raw.vendorPickups[0] : null;
  let vendorAddress = vendorData.shopAddress
    || raw?.vendorAddress
    || pickupStop?.shopAddress
    || (vendorData.address?.street ? `${vendorData.address.street}, ${vendorData.address.city || ''}` : null)
    || 'Address unavailable';

  const dropoffCoords = raw?.dropoffLocation?.coordinates;
  const derivedLat = Array.isArray(dropoffCoords) && dropoffCoords.length === 2 && dropoffCoords[1] !== 0 ? dropoffCoords[1] : raw?.latitude || null;
  const derivedLng = Array.isArray(dropoffCoords) && dropoffCoords.length === 2 && dropoffCoords[0] !== 0 ? dropoffCoords[0] : raw?.longitude || null;

  const pickupCoords = raw?.pickupLocation?.coordinates;
  const vendorDataCoords = vendorData?.shopLocation?.coordinates;

  // Priority: Latest Shop Profile > Order Snapshot
  const vendorLat = Array.isArray(vendorDataCoords) && vendorDataCoords.length === 2 && vendorDataCoords[1] !== 0
    ? vendorDataCoords[1]
    : (Array.isArray(pickupCoords) && pickupCoords.length === 2 && pickupCoords[1] !== 0 ? pickupCoords[1] : null);

  const vendorLng = Array.isArray(vendorDataCoords) && vendorDataCoords.length === 2 && vendorDataCoords[0] !== 0
    ? vendorDataCoords[0]
    : (Array.isArray(pickupCoords) && pickupCoords.length === 2 && pickupCoords[0] !== 0 ? pickupCoords[0] : null);

  return {
    ...raw,
    id: raw?.orderId || raw?._id || raw?.id,
    orderId: raw?.orderId || raw?._id || raw?.id,
    customer: shippingAddress?.name || guestInfo?.name || 'Customer',
    phone: shippingAddress?.phone || shippingAddress?.mobile || guestInfo?.phone || raw?.customerPhone || raw?.phone || '',
    address: toAddressLine(shippingAddress) || 'Address unavailable',
    vendorName: vendorData.storeName || vendorFirst?.vendorName || 'Vendor',
    vendorAddress,
    vendorPhone: vendorData.phone || pickupStop?.vendorPhone || raw?.vendorPhone || '',
    total: Number(raw?.total ?? 0),
    deliveryEarnings: Number(raw?.deliveryEarnings ?? 0),
    deliveryDistance: Number(raw?.deliveryDistance ?? 0),
    status: uiStatus,
    rawStatus: backendStatus,
    items: Array.isArray(raw?.items) ? raw.items : [],
    itemCount,
    latitude: derivedLat,
    longitude: derivedLng,
    vendorLatitude: vendorLat,
    vendorLongitude: vendorLng,
    paymentMethod: raw?.paymentMethod || 'standard',
    paymentStatus: raw?.paymentStatus || 'pending',
    orderType: raw?.orderType || 'standard',
    isTryAndBuy: raw?.orderType === 'try_and_buy' || raw?.orderType === 'check_and_buy',
    isCheckAndBuy: raw?.orderType === 'check_and_buy',
    tryAndBuyCompleted: !!raw?.deliveryFlow?.tryAndBuyCompletedAt,
  };
};

const normalizeReturn = (raw) => {
  if (!raw) return null;
  const id = raw._id || raw.id;
  const status = raw.status || 'approved';
  const customerAddress = raw.orderId?.shippingAddress || {};
  const vendorData = raw.vendorId || {};
  return {
    ...raw,
    id,
    type: 'return',
    customer: customerAddress.name || 'Customer',
    phone: customerAddress.phone || customerAddress.mobile || '',
    address: toAddressLine(customerAddress) || 'Customer Address',
    vendorName: vendorData.storeName || 'Vendor',
    vendorAddress: vendorData.shopAddress || vendorData.address?.street || 'Vendor Address',
    vendorPhone: vendorData.phone || '',
    total: Number(raw.refundAmount || 0),
    status: status === 'approved' ? 'pending' : (status === 'processing' ? 'accepted' : status),
    rawStatus: status,
    items: Array.isArray(raw.items) ? raw.items : [],
    vendorDropoffs: (raw.vendorDropoffs || []).map(dropoff => ({
      ...dropoff,
      shopLocation: dropoff.shopLocation || dropoff.vendorId?.shopLocation,
      shopAddress: dropoff.shopAddress || dropoff.vendorId?.shopAddress || dropoff.vendorId?.address?.street || 'Vendor Address',
      vendorName: dropoff.vendorName || dropoff.vendorId?.storeName || 'Vendor',
      vendorPhone: dropoff.vendorPhone || dropoff.vendorId?.phone || '',
    }))
  };
};

export const useDeliveryAuthStore = create(
  persist(
    (set, get) => ({
      deliveryBoy: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      orders: [],
      returns: [],
      selectedOrder: null,
      isLoadingOrders: false,
      isLoadingOrder: false,
      isUpdatingOrderStatus: false,
      isUpdatingStatus: false,
      isExplicitlyOffline: false, // Track if user manually went offline

      // --- AUTH ACTIONS ---
      sendOtp: async (phone) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/send-otp', { phone }, { silent: true });
          set({ isLoading: false }); return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      verifyOtpAndLogin: async (phone, otp) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/verify-otp', { phone, otp });
          const payload = res.data || res;
          const user = normalizeDeliveryBoy(payload.deliveryBoy);
          localStorage.setItem('delivery-token', payload.accessToken);
          localStorage.setItem('delivery-refresh-token', payload.refreshToken);
          set({ deliveryBoy: user, token: payload.accessToken, refreshToken: payload.refreshToken, isAuthenticated: true, isLoading: false });
          return { success: true, deliveryBoy: user };
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/login', { email, password });
          const payload = res.data || res;
          const user = normalizeDeliveryBoy(payload.deliveryBoy);
          localStorage.setItem('delivery-token', payload.accessToken);
          localStorage.setItem('delivery-refresh-token', payload.refreshToken);
          set({ deliveryBoy: user, token: payload.accessToken, refreshToken: payload.refreshToken, isAuthenticated: true, isLoading: false });
          return { success: true, deliveryBoy: user };
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      checkAvailability: async (vehicleNumber) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/check-availability', { vehicleNumber });
          set({ isLoading: false });
          return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      sendRegistrationOtp: async (phone, email) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/send-registration-otp', { phone, email });
          set({ isLoading: false });
          return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      verifyRegistrationOtp: async (phone, otp) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/auth/verify-registration-otp', { phone, otp });
          set({ isLoading: false });
          return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      register: async (data) => {
        set({ isLoading: true });
        try {
          const fd = new FormData();
          Object.keys(data).forEach(key => {
            const val = data[key];
            if (val !== null && val !== undefined) {
              // File objects go as-is; strings/primitives go as strings
              fd.append(key, val instanceof File ? val : String(val));
            }
          });
          // ⚠️ Do NOT set Content-Type manually — Axios must auto-generate
          // the multipart boundary, otherwise multer cannot parse the files
          const res = await api.post('/delivery/auth/register', fd);
          set({ isLoading: false });
          return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      logout: async () => {
        try {
          const current = get().deliveryBoy;
          if (current?.id) {
            // Attempt to notify backend to go offline
            await api.put('/delivery/auth/profile', { status: 'offline', isAvailable: false }, { silent: true }).catch(() => { });
          }
          const rt = localStorage.getItem('delivery-refresh-token');
          if (rt) await api.post('/delivery/auth/logout', { refreshToken: rt }, { silent: true }).catch(() => { });
        } catch (err) {
          console.error('[DeliveryStore] Logout cleanup error:', err);
        } finally {
          set({
            deliveryBoy: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            orders: [],
            returns: [],
            isExplicitlyOffline: false
          });
          localStorage.removeItem('delivery-token');
          localStorage.removeItem('delivery-refresh-token');
          localStorage.removeItem('delivery-auth-storage');
          window.location.href = '/delivery/login';
        }
      },
      deleteAccount: async () => {
        set({ isLoading: true });
        try {
          await api.delete('/delivery/auth/profile');
          set({ isLoading: false });
          // Reset local state manually before redirecting
          set({
            deliveryBoy: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            orders: [],
            returns: [],
            isExplicitlyOffline: false
          });
          localStorage.removeItem('delivery-token');
          localStorage.removeItem('delivery-refresh-token');
          localStorage.removeItem('delivery-auth-storage');
          window.location.href = '/delivery/login';
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      // --- PROFILE ACTIONS ---
      fetchProfile: async () => {
        set({ isLoading: true });
        try {
          const res = await api.get('/delivery/auth/profile');
          const user = normalizeDeliveryBoy(res.data || res);

          // 🛡️ STATUS LOCK: If user manually went offline, ignore 'available' from server
          const currentExplicitlyOffline = get().isExplicitlyOffline;
          if (currentExplicitlyOffline && user.status === 'available') {
            console.warn('🛡️ [DeliveryStore] Server returned "available" but user is "Explicitly Offline". Re-syncing status...');
            get().updateStatus('offline');
            return get().deliveryBoy;
          }

          set({ deliveryBoy: user, isLoading: false });
          return user;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      fetchProfileSummary: async () => {
        try {
          const res = await api.get('/delivery/orders/profile-summary');
          const data = res.data || res;
          if (data) {
            const current = get().deliveryBoy || {};
            const merged = normalizeDeliveryBoy({ ...current, ...data });

            // 🛡️ STATUS LOCK: Maintain local offline preference
            const currentExplicitlyOffline = get().isExplicitlyOffline;
            if (currentExplicitlyOffline) {
              merged.status = 'offline';
              merged.isAvailable = false;
            }

            set({ deliveryBoy: merged });
            return merged;
          }
        } catch (e) {
          console.error('[DeliveryStore] fetchProfileSummary failed:', e);
          throw e;
        }
      },
      // --- SETTLEMENT ACTIONS ---
      createSettlementOrder: async (amount) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/settlements', { amount });
          set({ isLoading: false });
          return res.data || res;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      verifySettlement: async (data) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/delivery/settlements/verify', data);
          const payload = res.data || res;
          if (payload.rider) set({ deliveryBoy: normalizeDeliveryBoy({ ...get().deliveryBoy, ...payload.rider }) });
          set({ isLoading: false });
          return payload;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      fetchSettlementHistory: async () => {
        try {
          const res = await api.get('/delivery/settlements');
          return res.data || res;
        } catch (e) { throw e; }
      },
      updateProfile: async (data) => {
        set({ isLoading: true });
        try {
          const res = await api.put('/delivery/auth/profile', data);
          const user = normalizeDeliveryBoy(res.data || res);
          set({ deliveryBoy: user, isLoading: false }); return user;
        } catch (e) { set({ isLoading: false }); throw e; }
      },
      updateStatus: async (status) => {
        const current = get().deliveryBoy;
        if (!current) return false;

        const previousStatus = current.status;
        const isGoingOffline = status === 'offline';

        // 🚀 Optimistic Update
        set({
          isUpdatingStatus: true,
          isExplicitlyOffline: isGoingOffline,
          deliveryBoy: normalizeDeliveryBoy({ ...current, status })
        });

        try {
          const res = await api.put('/delivery/auth/profile', {
            isAvailable: status === 'available',
            status
          });
          const payload = res.data || res;
          set({
            deliveryBoy: normalizeDeliveryBoy({ ...current, ...payload, status }),
            isUpdatingStatus: false
          });
          return true;
        } catch (e) {
          // ⚠️ Rollback on failure
          set({
            deliveryBoy: normalizeDeliveryBoy({ ...current, status: previousStatus }),
            isExplicitlyOffline: previousStatus === 'offline',
            isUpdatingStatus: false
          });
          throw e;
        }
      },
      _lastLocationUpdate: 0,
      updateLocation: async (latitude, longitude) => {
        const current = get().deliveryBoy;
        if (!current || current.status === 'offline') return;
        // Throttle: max once per 10 seconds
        const now = Date.now();
        if (now - get()._lastLocationUpdate < 10000) return;
        set({ _lastLocationUpdate: now });
        try {
          const res = await api.put('/delivery/auth/profile', { currentLocation: { type: 'Point', coordinates: [longitude, latitude] } });
          set({ deliveryBoy: normalizeDeliveryBoy({ ...current, ...(res.data || res) }) });
        } catch (e) { console.error("Location Update Failed", e); }
      },

      // --- ORDER ACTIONS ---
      fetchDashboardSummary: async () => {
        try {
          const res = await api.get('/delivery/orders/dashboard-summary');
          const p = res.data || res || {};
          const recent = (p.recentOrders || []).map(normalizeOrder);
          const activeReturns = (p.activeReturns || []).map(normalizeReturn);
          // Sync with global store for consistent tracking across pages
          set({ orders: recent, returns: activeReturns });
          return { ...p, recentOrders: recent, activeReturns };
        } catch (e) { throw e; }
      },
      fetchAvailableOrders: async (opt = {}) => {
        set({ isLoadingOrders: true });
        try {
          const res = await api.get('/delivery/orders/available', { params: opt });
          const list = ((res.data || res)?.orders || []).map(normalizeOrder);
          set({ orders: list, isLoadingOrders: false }); return list;
        } catch (e) { set({ isLoadingOrders: false }); throw e; }
      },
      fetchOrders: async (opt = {}) => {
        set({ orders: [], isLoadingOrders: true });
        try {
          const res = await api.get('/delivery/orders', { params: opt });
          const p = res.data || res;
          // Sort by latest update to ensure status changes are seen first
          const orders = (p?.orders || (Array.isArray(p) ? p : []))
            .map(normalizeOrder)
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
          set({ orders, isLoadingOrders: false }); return orders;
        } catch (e) { set({ isLoadingOrders: false }); throw e; }
      },
      fetchOrderById: async (id) => {
        set({ isLoadingOrder: true });
        try {
          const res = await api.get(`/delivery/orders/${id}`);
          const order = normalizeOrder(res.data || res);
          set({ selectedOrder: order, isLoadingOrder: false }); return order;
        } catch (e) {
          try {
            const res = await api.get(`/delivery/returns/${id}`);
            const ret = normalizeReturn(res.data?.data || res.data || res);
            set({ selectedOrder: ret, isLoadingOrder: false }); return ret;
          } catch (retError) {
            set({ isLoadingOrder: false });
            throw e;
          }
        }
      },
      acceptOrder: async (id) => {
        const currentOrders = get().orders || [];
        const targetedOrder = currentOrders.find(o => o.id === id);

        // 🚀 Optimistic Update: Move order to active state immediately if possible
        if (targetedOrder) {
          set({
            orders: currentOrders.map(o => o.id === id ? { ...o, status: 'accepted' } : o)
          });
        }

        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/orders/${id}/accept`);
          const order = normalizeOrder(res.data || res);

          set({
            orders: [order, ...get().orders.filter(o => o.id !== id)],
            isUpdatingOrderStatus: false
          });
          return order;
        } catch (e) {
          // ⚠️ Rollback: Fetch orders again or revert if we have local copy
          set({ isUpdatingOrderStatus: false });
          get().fetchAvailableOrders();
          throw e;
        }
      },
      // `auto` marks a reject fired by the expiring accept-countdown rather than by the
      // rider tapping Decline — the backend ignores those on an already-accepted order.
      rejectOrder: async (id, { auto = false } = {}) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/orders/${id}/reject`, { auto });
          set({
            orders: get().orders.filter(o => o.id !== id),
            isUpdatingOrderStatus: false
          });
          return res.data || res;
        } catch (e) {
          set({ isUpdatingOrderStatus: false });
          throw e;
        }
      },
      cancelOrder: async (id, reasonData) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/orders/${id}/cancel`, reasonData);
          const order = normalizeOrder(res.data || res);
          set({
            orders: get().orders.map(o => o.id === id ? order : o),
            isUpdatingOrderStatus: false
          });
          return order;
        } catch (e) {
          set({ isUpdatingOrderStatus: false });
          throw e;
        }
      },
      updateOrderStatus: async (id, status, opt = {}) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/status`, { status, ...opt });
          const payload = res.data || res;
          const order = normalizeOrder(payload.order || payload);
          if (payload.rider) set({ deliveryBoy: normalizeDeliveryBoy({ ...get().deliveryBoy, ...payload.rider }) });
          if (get().selectedOrder?.id === id) set({ selectedOrder: order });
          set({ isUpdatingOrderStatus: false }); return order;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      completeOrder: async (id, otp, opt = {}) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/status`, { status: 'delivered', otp, ...opt });
          const payload = res.data || res;
          const order = normalizeOrder(payload.order || payload);
          if (payload.rider) set({ deliveryBoy: normalizeDeliveryBoy({ ...get().deliveryBoy, ...payload.rider }) });
          set({ isUpdatingOrderStatus: false }); return order;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      startDelivery: async (id, opt = {}) => {
        try {
          const res = await api.patch(`/delivery/orders/${id}/start`, opt);
          const order = normalizeOrder(res.data?.data || res.data || res);
          if (get().selectedOrder?.id === id) set({ selectedOrder: order });
          return order;
        } catch (e) {
          // Non-fatal: pickup already succeeded, so don't block the rider on this.
          console.error('Failed to mark order out for delivery:', e?.response?.data?.message || e.message);
          return null;
        }
      },
      markArrivedAtCustomer: async (id, opt = {}) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/arrived`, opt);
          const order = normalizeOrder(res.data?.data || res.data || res);
          set({ isUpdatingOrderStatus: false, selectedOrder: order }); return order;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      submitTryAndBuy: async (id, items) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/try-buy`, { items });
          const order = normalizeOrder(res.data?.data || res.data || res);
          set({ isUpdatingOrderStatus: false, selectedOrder: order }); return order;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      markArrivedAtVendor: async (id) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/arrived-vendor`);
          const order = normalizeOrder(res.data?.data || res.data || res);
          set({ isUpdatingOrderStatus: false, selectedOrder: order }); return order;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      setPaymentMethod: async (id, method) => {
        set({ isUpdatingOrderStatus: true });
        try {
            const res = await api.patch(`/delivery/orders/${id}/payment`, { method });
            const data = res.data?.data || res.data || res;
            const order = normalizeOrder(data.order || data);
            set({ isUpdatingOrderStatus: false, selectedOrder: order }); return data;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      verifyQrPayment: async (id) => {
        set({ isUpdatingOrderStatus: true });
        try {
            const res = await api.post(`/delivery/orders/${id}/verify-qr-payment`);
            const data = res.data?.data || res.data || res;
            const order = normalizeOrder(data.order || data);
            set({ isUpdatingOrderStatus: false, selectedOrder: order }); return data;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      completeDeliveryFlow: async (id, { otp, openBoxPhoto, deliveryProofPhoto }) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/orders/${id}/complete`, { otp, openBoxPhoto, deliveryProofPhoto });
          const data = res.data?.data || res.data || res;
          const order = normalizeOrder(data.order || data);
          if (data.rider) set({ deliveryBoy: normalizeDeliveryBoy({ ...get().deliveryBoy, ...data.rider }) });
          set({ isUpdatingOrderStatus: false, selectedOrder: order }); return { order, returnTask: data.returnTask };
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      resendDeliveryOtp: async (id) => {
        const res = await api.post(`/delivery/orders/${id}/resend-delivery-otp`);
        return res.data || res;
      },
      getCompanyQR: async (id) => {
        const res = await api.get(`/delivery/orders/${id}/company-qr`);
        return res.data || res;
      },
      setBalance: (data) => {
        const c = get().deliveryBoy;
        if (c) set({ deliveryBoy: normalizeDeliveryBoy({ ...c, ...data }) });
      },

      // --- RETURN ACTIONS ---
      fetchAvailableReturns: async () => {
        set({ isLoadingOrders: true });
        try {
          const res = await api.get('/delivery/returns/available');
          const list = ((res.data || res)?.returns || []).map(normalizeReturn);
          set({ returns: list, isLoadingOrders: false }); return list;
        } catch (e) { set({ isLoadingOrders: false }); throw e; }
      },
      fetchReturnById: async (id) => {
        set({ isLoadingOrder: true });
        try {
          const res = await api.get(`/delivery/returns/${id}`);
          const ret = normalizeReturn(res.data?.data || res.data || res);
          set({ selectedOrder: ret, isLoadingOrder: false });
          return ret;
        } catch (e) {
          set({ isLoadingOrder: false });
          throw e;
        }
      },
      acceptReturn: async (id) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/returns/${id}/accept`);
          const ret = normalizeReturn(res.data || res);
          set((s) => ({ returns: s.returns.filter(r => String(r.id) !== String(id)), isUpdatingOrderStatus: false }));
          return ret;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },
      updateReturnStatus: async (id, status, opt = {}) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.patch(`/delivery/returns/${id}/status`, { status, ...opt });
          const ret = normalizeReturn(res.data || res);
          set({ isUpdatingOrderStatus: false }); return ret;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },

      pickupReturnFromCustomer: async (id, { otp, pickupPhoto }) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/returns/${id}/pickup-from-customer`, { otp, pickupPhoto });
          const ret = normalizeReturn(res.data?.data || res.data || res);
          set({ isUpdatingOrderStatus: false });
          return ret;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },

      dropoffReturnAtVendor: async (id, { vendorId, otp, deliveryPhoto }) => {
        set({ isUpdatingOrderStatus: true });
        try {
          const res = await api.post(`/delivery/returns/${id}/dropoff-at-vendor`, { vendorId, otp, deliveryPhoto });
          const ret = normalizeReturn(res.data?.data || res.data || res);
          set({ isUpdatingOrderStatus: false });
          return ret;
        } catch (e) { set({ isUpdatingOrderStatus: false }); throw e; }
      },

      resendReturnVendorOtp: async (id, vendorId) => {
        try {
          const res = await api.post(`/delivery/returns/${id}/resend-vendor-otp`, { vendorId });
          return res.data || res;
        } catch (e) { throw e; }
      },

      // --- REVIEW ACTIONS ---
      submitCustomerRating: async (orderId, userId, rating, comment) => {
        try {
          const res = await api.post('/delivery/reviews/customer', { orderId, userId, rating, comment });
          return res.data || res;
        } catch (e) { throw e; }
      },
      getMyReviewForOrder: async (orderId) => {
        try {
          const res = await api.get(`/delivery/reviews/order/${orderId}`);
          return res.data || res;
        } catch { return { review: null }; }
      },

      initialize: () => {
        const token = localStorage.getItem('delivery-token');
        if (token) {
          const stored = JSON.parse(localStorage.getItem('delivery-auth-storage') || '{}');
          if (stored.state?.deliveryBoy) {
            set({ deliveryBoy: normalizeDeliveryBoy(stored.state.deliveryBoy), token, refreshToken: localStorage.getItem('delivery-refresh-token'), isAuthenticated: true });
          }
        }
      },
    }),
    {
      name: 'delivery-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        token: s.token,
        refreshToken: s.refreshToken,
        deliveryBoy: s.deliveryBoy,
        isAuthenticated: s.isAuthenticated,
        isExplicitlyOffline: s.isExplicitlyOffline
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  window.addEventListener('global-auth-failure', (e) => {
    if (e.detail?.scope === 'delivery') useDeliveryAuthStore.getState().logout();
  });
}
