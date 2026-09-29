import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useCustomerStore = create(
  persist(
    (set, get) => ({
      customers: [],
      selectedCustomer: null,
      pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 0
      },
      isLoading: false,

      // Initialize/Fetch customers
      initialize: async (params = {}) => {
        set({ isLoading: true });
        try {
          const response = await adminService.getAllCustomers(params);
          const { customers, pagination } = response.data;

          // Map backend data to frontend expectations
          const normalizedCustomers = customers.map(c => ({
            ...c,
            id: c._id,
            status: c.isDeleted ? 'deleted' : (c.isActive ? 'active' : 'blocked')
          }));

          set({
            customers: normalizedCustomers,
            pagination,
            isLoading: false
          });
        } catch (error) {
          set({ isLoading: false });
          // Error handled by api interceptor
        }
      },

      // Get customer by ID from API
      fetchCustomerById: async (id) => {
        set({ isLoading: true });
        try {
          const response = await adminService.getCustomerById(id);
          const customer = response.data;

          const normalizedCustomer = {
            ...customer,
            id: customer._id,
            status: customer.isDeleted ? 'deleted' : (customer.isActive ? 'active' : 'blocked')
          };

          set({ selectedCustomer: normalizedCustomer, isLoading: false });
          return normalizedCustomer;
        } catch (error) {
          set({ isLoading: false });
          return null;
        }
      },

      // Update customer details via API
      updateCustomer: async (id, customerData) => {
        set({ isLoading: true });
        try {
          const response = await adminService.updateCustomer(id, customerData);
          const updatedCustomer = response.data;

          set((state) => ({
            customers: state.customers.map(c =>
              String(c.id) === String(id)
                ? { ...c, ...updatedCustomer, id: updatedCustomer._id, status: updatedCustomer.isDeleted ? 'deleted' : (updatedCustomer.isActive ? 'active' : 'blocked') }
                : c
            ),
            isLoading: false
          }));

          toast.success('Customer updated successfully');
          return {
            ...updatedCustomer,
            id: updatedCustomer._id,
            status: updatedCustomer.isDeleted ? 'deleted' : (updatedCustomer.isActive ? 'active' : 'blocked')
          };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Placeholder for activity history (frontend depends on it)
      addActivity: (customerId, activity) => {
        console.log(`Activity for ${customerId}:`, activity);
      },

      // Update customer status via API
      toggleCustomerStatus: async (id) => {
        const customer = get().customers.find(c => String(c.id) === String(id));
        if (!customer) return;

        const newIsActive = !(customer.status === 'active');

        set({ isLoading: true });
        try {
          const response = await adminService.updateCustomerStatus(id, newIsActive);
          const updatedCustomer = response.data;

          // Update local state
          set((state) => ({
            customers: state.customers.map(c =>
              String(c.id) === String(id)
                ? { ...c, isActive: updatedCustomer.isActive, status: updatedCustomer.isDeleted ? 'deleted' : (updatedCustomer.isActive ? 'active' : 'blocked') }
                : c
            ),
            isLoading: false
          }));

          toast.success(`Customer ${updatedCustomer.isActive ? 'activated' : 'blocked'} successfully`);
          return {
            ...updatedCustomer,
            id: updatedCustomer._id,
            status: updatedCustomer.isDeleted ? 'deleted' : (updatedCustomer.isActive ? 'active' : 'blocked')
          };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Select a customer (local)
      setSelectedCustomer: (customer) => {
        set({ selectedCustomer: customer });
      },
    }),
    {
      name: 'admin-customer-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

