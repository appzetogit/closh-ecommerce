import { useEffect } from "react";
import api from "../utils/api";
import { requestForToken, onMessageListener } from "../config/firebase";
import { useAuthStore } from "../store/authStore";
import { useAdminAuthStore } from "../../modules/Admin/store/adminStore";
import { useVendorAuthStore } from "../../modules/Vendor/store/vendorAuthStore";
import { useDeliveryAuthStore } from "../../modules/Delivery/store/deliveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { useBrandStore } from "../store/brandStore";
import toast from "react-hot-toast";

const PRODUCTS_CACHE_KEY = "user-catalog-products-cache";
const VENDORS_CACHE_KEY = "user-catalog-vendors-cache";
const BRANDS_CACHE_KEY = "user-catalog-brands-cache";

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendorId && typeof raw.vendorId === "object" ? raw.vendorId : null;
  const brandObj =
    raw?.brandId && typeof raw.brandId === "object" ? raw.brandId : null;
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    vendorId: vendorObj?._id || raw?.vendorId,
    brandId: brandObj?._id || raw?.brandId,
    categoryId: categoryObj?._id || raw?.categoryId,
    vendorName: raw?.vendorName || vendorObj?.storeName || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
  };
};

const normalizeVendor = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

const normalizeBrand = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

import socketService from "../utils/socket";

const AppBootstrap = () => {
  useEffect(() => {
    let cancelled = false;

    const syncCatalog = async () => {
      // Initialize Settings
      const isAdmin = useAdminAuthStore.getState().isAuthenticated;
      if (isAdmin) {
        useSettingsStore.getState().initialize();
      } else {
        useSettingsStore.getState().initializePublic();
      }

      // Prefetch Discover (Brands) store
      useBrandStore.getState().initialize();

      // Small optimization: Skip catalog sync for Delivery and Vendor modules
      const path = window.location.pathname;
      if (path.startsWith('/delivery') || path.startsWith('/vendor')) {
        console.log("⚡ Skipping catalog sync for partner module");
        return;
      }
      // Small delay to let initial mounting stabilize
      await new Promise(r => setTimeout(r, 100));
      if (cancelled) return;

      try {
        const [productsRes, vendorsRes, brandsRes] = await Promise.allSettled([
          api.get("/products", { params: { page: 1, limit: 500 } }),
          api.get("/vendors/all", { params: { status: "approved", page: 1, limit: 200 } }),
          api.get("/brands/all"),
        ]);

        let updated = false;

        if (productsRes.status === "fulfilled" && !cancelled) {
          const payload = productsRes.value?.data;
          const list = Array.isArray(payload?.products)
            ? payload.products.map(normalizeProduct)
            : [];
          if (list.length) {
            const current = localStorage.getItem(PRODUCTS_CACHE_KEY);
            const nextStr = JSON.stringify(list);
            if (current !== nextStr) {
              localStorage.setItem(PRODUCTS_CACHE_KEY, nextStr);
              updated = true;
            }
          }
        }

        if (vendorsRes.status === "fulfilled" && !cancelled) {
          const payload = vendorsRes.value?.data;
          const list = Array.isArray(payload?.vendors)
            ? payload.vendors.map(normalizeVendor)
            : [];
          if (list.length) {
            const current = localStorage.getItem(VENDORS_CACHE_KEY);
            const nextStr = JSON.stringify(list);
            if (current !== nextStr) {
              localStorage.setItem(VENDORS_CACHE_KEY, nextStr);
              updated = true;
            }
          }
        }

        if (brandsRes.status === "fulfilled" && !cancelled) {
          const payload = brandsRes.value?.data;
          const list = Array.isArray(payload) ? payload.map(normalizeBrand) : [];
          if (list.length) {
            const current = localStorage.getItem(BRANDS_CACHE_KEY);
            const nextStr = JSON.stringify(list);
            if (current !== nextStr) {
              localStorage.setItem(BRANDS_CACHE_KEY, nextStr);
              updated = true;
            }
          }
        }

        if (updated && !cancelled) {
          console.log("🔥 AppBootstrap: dispatching catalog-cache-updated! updated=", updated);
          window.dispatchEvent(new Event("catalog-cache-updated"));
        }
      } catch {
        // Keep static fallback silently.
      }
    };

    syncCatalog();

    // FCM Registration logic - React to auth changes for all roles
    const registerNotifications = async () => {
      // Check which store is currently authenticated
      const userAuth = useAuthStore.getState();
      const adminAuth = useAdminAuthStore.getState();
      const vendorAuth = useVendorAuthStore.getState();
      const deliveryAuth = useDeliveryAuthStore.getState();

      let activeUser = null;
      let scopeUrl = '';

      if (userAuth.isAuthenticated) {
        activeUser = userAuth.user;
        scopeUrl = '/user';
      } else if (adminAuth.isAuthenticated) {
        activeUser = adminAuth.admin;
        scopeUrl = '/admin';
      } else if (vendorAuth.isAuthenticated) {
        activeUser = vendorAuth.vendor;
        scopeUrl = '/vendor';
      } else if (deliveryAuth.isAuthenticated) {
        activeUser = deliveryAuth.deliveryBoy;
        scopeUrl = '/delivery';
      }

      if (!activeUser || !scopeUrl) return;

      // Register with Socket Service for real-time updates based on role
      const userId = activeUser._id || activeUser.id;
      if (userAuth.isAuthenticated) {
        socketService.userRegister(userId);
      } else if (adminAuth.isAuthenticated) {
        // Admin socket registration if needed
      } else if (vendorAuth.isAuthenticated) {
        socketService.vendorRegister(userId);
      } else if (deliveryAuth.isAuthenticated) {
        socketService.deliveryRegister(userId);
      }

      try {
        const token = await requestForToken();
        if (token) {
          const registeredTokens = JSON.parse(localStorage.getItem('registered_fcm_tokens') || '[]');
          const userId = activeUser._id || activeUser.id;
          
          // Detect platform
          const isApp = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          const platform = isApp ? 'app' : 'web'; 
          
          const tokenKey = `${userId}_${token}_${platform}`;
          
          if (!registeredTokens.includes(tokenKey)) {
            const endpoint = `/notifications/fcm-token`;
            await api.post(`${scopeUrl}${endpoint}`, { token, platform }, { silent: true });
            
            // Clean up old tokens for this user from localStorage (keep only current)
            const otherTokens = registeredTokens.filter(k => !k.startsWith(`${userId}_`));
            otherTokens.push(tokenKey);
            localStorage.setItem('registered_fcm_tokens', JSON.stringify(otherTokens));
            console.log(`FCM token registered with backend for ${scopeUrl} (${platform}):`, userId);
          }
        }
      } catch (err) {
        console.warn('FCM registration skipped:', err.message);
      }
    };

    // Foreground notification listener
    const setupForegroundListener = () => {
      onMessageListener().then((payload) => {
        console.log("Foreground notification received:", payload);
        const { title, body } = payload.notification;
        
        // Show native notification
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title || "Clouse Notification", {
              body: body || "",
              icon: "/logo-removebg.png",
              vibrate: [200, 100, 200],
              data: payload.data
            });
          });
        }
        
        // Also show regular UI toast and play a sound if it is for a delivery boy or vendor
        toast.success(`${title}: ${body}`, { duration: 5000 });
        
        const deliveryBoy = useDeliveryAuthStore.getState().deliveryBoy;
        const vendor = useVendorAuthStore.getState().vendor;

        const isNewOrder = (payload.data?.type === 'order_created' || 
                           payload.data?.type === 'new_order' || 
                           (payload.data?.type === 'order' && (payload.data?.status === 'pending' || payload.data?.status === 'ready_for_pickup' || !payload.data?.status)));

        if ((deliveryBoy && (payload.data?.type === 'new_assignment_broadcast' || payload.data?.type === 'return_pickup_broadcast' || (payload.data?.type === 'order' && payload.data?.status === 'pending'))) ||
            (vendor && isNewOrder)) {
          const audio = new Audio('/sounds/buzzer.mp3');
          audio.play().catch(e => console.warn('Buzzer playback failed (user interaction required):', e.message));
        }

        // Listen for the next message
        setupForegroundListener();
      }).catch(err => console.log('failed: ', err));
    };

    // Subscriptions for all roles
    const unsubs = [
      useAuthStore.subscribe(s => s.isAuthenticated, (ok) => ok && registerNotifications()),
      useAdminAuthStore.subscribe(s => s.isAuthenticated, (ok) => ok && registerNotifications()),
      useVendorAuthStore.subscribe(s => s.isAuthenticated, (ok) => ok && registerNotifications()),
      useDeliveryAuthStore.subscribe(s => s.isAuthenticated, (ok) => {
        if (ok) {
          registerNotifications();
        }
      }),
    ];

    // Check immediate state on mount
    registerNotifications();
    setupForegroundListener();

    return () => {
      cancelled = true;
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  return null;
};

export default AppBootstrap;
