import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import api from '../utils/api';
import { normalizeReferralCode, getDeviceId, clearStoredReferralCode } from '../utils/referral';

export const useAuthStore = create(
  subscribeWithSelector(
    persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      pendingEmail: null,
      pendingPhone: null,

      checkPhone: async (phone) => {
        set({ isLoading: true });
        try {
          const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
          const response = await api.post('/user/auth/check-phone', { phone: normalizedPhone });
          set({ isLoading: false });
          return response?.data ?? response;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loginOtp: async (phone) => {
        set({ isLoading: true });
        try {
          const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
          const response = await api.post('/user/auth/login-otp', { phone: normalizedPhone });
          const payload = response?.data ?? response;
          set({ pendingPhone: normalizedPhone, isLoading: false, pendingEmail: payload?.email });
          return payload;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      registerOtp: async (name, email, phone, referralCode = '') => {
        set({ isLoading: true });
        try {
          const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
          const code = normalizeReferralCode(referralCode);
          const response = await api.post('/user/auth/register-otp', {
            name, email, phone: normalizedPhone,
            ...(code ? { referralCode: code } : {}),
            deviceId: getDeviceId(),
          });
          const payload = response?.data ?? response;
          set({ pendingPhone: normalizedPhone, pendingEmail: email, isLoading: false });
          return payload;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Login action
      login: async (email, password, rememberMe = false) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          const response = await api.post('/user/auth/login', { email: normalizedEmail, password });
          const payload = response?.data ?? response;
          const accessToken = payload?.accessToken;
          const refreshToken = payload?.refreshToken;
          const user = payload?.user;

          if (!accessToken || !refreshToken || !user) {
            throw new Error('Invalid login response from server.');
          }

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            pendingEmail: null,
            isLoading: false,
          });

          localStorage.setItem('token', accessToken);
          localStorage.setItem('refresh-token', refreshToken);

          // Load user-specific data from backend
          import('./useStore').then(m => m.useCartStore.getState().fetchCart());
          import('./wishlistStore').then(m => m.useWishlistStore.getState().fetchWishlist());
          import('./addressStore').then(m => m.useAddressStore.getState().fetchAddresses());

          return { success: true, user };
        } catch (error) {
          const backendMessage = String(
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            ''
          ).toLowerCase();
          if (
            backendMessage.includes('email not verified') ||
            backendMessage.includes('verify your email')
          ) {
            set({ pendingEmail: normalizedEmail, isLoading: false });
            throw error;
          }
          set({ isLoading: false });
          throw error;
        }
      },

      // Register action
      register: async (name, email, password, phone, addressData = null) => {
        set({ isLoading: true });
        try {
          const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
          const payload = {
            name,
            email,
            password,
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
            ...(addressData ? { address: addressData } : {}),
          };

          await api.post('/user/auth/register', payload);

          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            pendingEmail: email,
            isLoading: false,
          });

          localStorage.removeItem('token');
          localStorage.removeItem('refresh-token');

          return { success: true, email };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Verify OTP and complete login
      verifyOTP: async (email, otp) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          const response = await api.post('/user/auth/verify-otp', { email: normalizedEmail, otp });
          const payload = response?.data ?? response;
          const accessToken = payload?.accessToken;
          const refreshToken = payload?.refreshToken;
          const user = payload?.user;

          if (!accessToken || !refreshToken || !user) {
            throw new Error('Invalid OTP verification response from server.');
          }

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            pendingEmail: null,
            isLoading: false,
          });

          localStorage.setItem('token', accessToken);
          localStorage.setItem('refresh-token', refreshToken);

          // Load user-specific data from backend
          import('./useStore').then(m => m.useCartStore.getState().fetchCart());
          import('./wishlistStore').then(m => m.useWishlistStore.getState().fetchWishlist());
          import('./addressStore').then(m => m.useAddressStore.getState().fetchAddresses());

          // The sign-up referral code is used up once the server has looked at it.
          if (payload?.referral) clearStoredReferralCode();
          return { success: true, user, referral: payload?.referral || null };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Resend OTP
      resendOTP: async (email) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/resend-otp', { email: normalizedEmail });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      forgotPassword: async (email) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/forgot-password', { email: normalizedEmail });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      verifyResetOtp: async (email, otp) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/verify-reset-otp', { email: normalizedEmail, otp });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resetPassword: async (email, password, confirmPassword) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/reset-password', { email: normalizedEmail, password, confirmPassword });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      setUnauthenticated: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          pendingEmail: null,
          isLoading: false,
        });

        // Wipe user-specific data (cart is now in MongoDB — not cleared on logout)
        import('./useStore').then(m => m.useCartStore.getState().items && m.useCartStore.setState({ items: [] }));
        import('./wishlistStore').then(m => m.useWishlistStore.getState().resetWishlist());
        import('./addressStore').then(m => m.useAddressStore.getState().resetAddresses());

        localStorage.removeItem('token');
        localStorage.removeItem('refresh-token');
        localStorage.removeItem('wishlist-storage');
        localStorage.removeItem('address-storage');
      },

      // Logout action
      logout: () => {
        const refreshToken = localStorage.getItem('refresh-token');
        if (refreshToken) {
          api.post('/user/auth/logout', { refreshToken }).catch(() => { });
        }
        get().setUnauthenticated();
      },

      // Update user profile
      updateProfile: async (profileData) => {
        set({ isLoading: true });
        try {
          const response = await api.put('/user/auth/profile', {
            name: profileData?.name,
            firstName: profileData?.firstName,
            lastName: profileData?.lastName,
            email: profileData?.email,
            dob: profileData?.dob,
            gender: profileData?.gender,
            ageRange: profileData?.ageRange,
            stylePreference: profileData?.stylePreference,
            preferredFit: profileData?.preferredFit,
            phone: profileData?.phone,
          });
          const payload = response?.data ?? response;
          const updatedUser = payload?.user || payload;
          
          set({
            user: updatedUser,
            isLoading: false,
          });

          return { success: true, user: updatedUser };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Change password
      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true });
        try {
          await api.post('/user/auth/change-password', {
            currentPassword,
            newPassword,
          });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete account
      deleteAccount: async () => {
        set({ isLoading: true });
        try {
          await api.delete('/user/auth/profile');
          get().setUnauthenticated();
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Upload profile avatar
      uploadProfileAvatar: async (file) => {
        if (!file) {
          throw new Error('Avatar file is required.');
        }

        set({ isLoading: true });
        try {
          const formData = new FormData();
          formData.append('avatar', file);

          const response = await api.post('/user/auth/profile/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const payload = response?.data ?? response;
          const currentUser = get().user || {};
          const nextUser = {
            ...currentUser,
            ...(payload?.user || {}),
            avatar: payload?.avatar || payload?.user?.avatar || currentUser.avatar,
            email: currentUser.email || payload?.user?.email,
          };

          set({
            user: nextUser,
            isLoading: false,
          });

          return { success: true, user: nextUser };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Initialize auth state from localStorage
      initialize: () => {
        const token = localStorage.getItem('token');
        if (token) {
          const storedState = JSON.parse(localStorage.getItem('auth-storage') || '{}');
          const refreshToken = localStorage.getItem('refresh-token');
          if (storedState.state?.user) {
            set({
              user: storedState.state.user,
              token,
              refreshToken: refreshToken || null,
              isAuthenticated: true,
            });
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
);

// Listen for global auth failure (401 from interceptor)
if (typeof window !== 'undefined') {
  window.addEventListener('global-auth-failure', (e) => {
    if (e.detail?.scope === 'user') {
      useAuthStore.getState().setUnauthenticated();
    }
  });
}

