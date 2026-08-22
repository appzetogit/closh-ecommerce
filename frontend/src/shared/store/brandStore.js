import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getAllBrands, getPublicBrands, createBrand, updateBrand, deleteBrand } from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

let hasFetchedBrands = false;
let isFetchingBrands = false;

export const useBrandStore = create(
  persist(
    (set, get) => ({
      brands: [],
      isLoading: false,

      // Initialize brands
      initialize: async (force = false) => {
        // Guard: Don't initialize if a fetch is already in flight *this* page load.
        // hasFetchedBrands is module-level, so it cannot be poisoned by a stale
        // persisted flag the way state.isLoading could be.
        const state = get();
        if (isFetchingBrands) return;

        // If already fetched in this session/page load, rely on the cache unless forced
        if (!force && hasFetchedBrands && state.brands.length > 0) return;

        isFetchingBrands = true;
        set({ isLoading: true });
        try {
          const isAdminArea =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/admin');
          const response = isAdminArea
            ? await getAllBrands()
            : await getPublicBrands();
          const normalizedBrands = (response?.data || []).map(brand => ({
            ...brand,
            id: brand._id // Ensure UI compatibility by aliasing _id to id
          }));
          set({ brands: normalizedBrands, isLoading: false });
          hasFetchedBrands = true;
        } catch (error) {
          set({ isLoading: false });
          // Error toast is handled in api.js interceptor
        } finally {
          isFetchingBrands = false;
        }
      },

      // Get all brands
      getBrands: () => {
        const state = get();
        if (state.brands.length === 0 && !state.isLoading) {
          state.initialize();
        }
        return get().brands;
      },

      // Get brand by ID
      getBrandById: (id) => {
        return get().brands.find((brand) => String(brand.id) === String(id) || String(brand._id) === String(id));
      },

      // Create brand
      createBrand: async (brandData) => {
        set({ isLoading: true });
        try {
          const response = await createBrand(brandData);
          const newBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: [...state.brands, newBrand],
            isLoading: false
          }));
          toast.success('Brand created successfully');
          return newBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update brand
      updateBrand: async (id, brandData) => {
        set({ isLoading: true });
        try {
          const response = await updateBrand(id, brandData);
          const updatedBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: state.brands.map((brand) =>
              String(brand.id) === String(id) ? updatedBrand : brand
            ),
            isLoading: false
          }));
          toast.success('Brand updated successfully');
          return updatedBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete brand
      deleteBrand: async (id) => {
        set({ isLoading: true });
        try {
          await deleteBrand(id);
          set((state) => ({
            brands: state.brands.filter((brand) => String(brand.id) !== String(id)),
            isLoading: false
          }));
          toast.success('Brand deleted successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Bulk delete brands
      bulkDeleteBrands: async (ids) => {
        set({ isLoading: true });
        try {
          await Promise.all(ids.map(id => deleteBrand(id)));
          set((state) => ({
            brands: state.brands.filter(
              (brand) => !ids.map(String).includes(String(brand.id))
            ),
            isLoading: false
          }));
          toast.success(`${ids.length} brands deleted successfully`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Toggle brand status
      toggleBrandStatus: (id) => {
        const brand = get().getBrandById(id);
        if (brand) {
          get().updateBrand(id, { isActive: !brand.isActive });
        }
      },
    }),
    {
      name: 'brand-storage',
      storage: createJSONStorage(() => localStorage),
      // Persist the cached brands only. isLoading is transient: if a fetch was cut off
      // mid-flight (tab closed, reload, navigation) a persisted `isLoading: true` is
      // restored on the next visit and the `if (state.isLoading) return` guard above
      // then blocks every future fetch, permanently freezing an outdated brand list.
      partialize: (state) => ({ brands: state.brands }),
    }
  )
);

