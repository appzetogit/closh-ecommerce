import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useReturnStore = create((set, get) => ({
    returnRequests: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchReturnRequests: async (params = {}) => {
        set({ isLoading: true });
        try {
            const { fetchAll = true, ...queryParams } = params || {};
            const pageSize = Math.max(Number.parseInt(queryParams.limit, 10) || 100, 1);
            let currentPage = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
            let totalPages = 1;
            let latestPagination = {
                total: 0,
                page: currentPage,
                limit: pageSize,
                pages: 1,
            };
            const allRequests = [];

            do {
                const response = await adminService.getAllReturnRequests({
                    ...queryParams,
                    page: currentPage,
                    limit: pageSize,
                });

                const pageRequests = Array.isArray(response?.data?.returnRequests)
                    ? response.data.returnRequests
                    : [];
                allRequests.push(...pageRequests);

                const pagination = response?.data?.pagination || {};
                latestPagination = {
                    total: Number.isFinite(Number(pagination.total))
                        ? Number(pagination.total)
                        : allRequests.length,
                    page: Number.isFinite(Number(pagination.page))
                        ? Number(pagination.page)
                        : currentPage,
                    limit: Number.isFinite(Number(pagination.limit))
                        ? Number(pagination.limit)
                        : pageSize,
                    pages: Math.max(Number.parseInt(pagination.pages, 10) || 1, 1),
                };

                totalPages = fetchAll ? latestPagination.pages : currentPage;
                currentPage += 1;
            } while (fetchAll && currentPage <= totalPages);

            set({
                returnRequests: allRequests,
                pagination: fetchAll
                    ? {
                        total: latestPagination.total,
                        page: 1,
                        limit: latestPagination.limit,
                        pages: latestPagination.pages,
                    }
                    : latestPagination,
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toast.error(error.message || 'Failed to fetch return requests');
        }
    },

    fetchReturnRequestById: async (id) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getReturnRequestById(id);
            set({ isLoading: false });
            return response.data;
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to fetch return request details');
            return null;
        }
    },

    updateReturnStatus: async (id, statusData) => {
        set({ isLoading: true });
        try {
            const response = await adminService.updateReturnRequestStatus(id, statusData);
            const updatedReq = response.data;
            set((state) => ({
                returnRequests: state.returnRequests.map((req) =>
                    req.id === id ? { ...req, ...updatedReq } : req
                ),
                isLoading: false
            }));
            toast.success('Return status updated successfully');
            return updatedReq;
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to update return status');
            return false;
        }
    },

    assignReturnDeliveryBoy: async (id, deliveryBoyId) => {
        set({ isLoading: true });
        try {
            const response = await adminService.assignReturnDeliveryBoy(id, deliveryBoyId);
            const updatedReq = response.data;
            set((state) => ({
                returnRequests: state.returnRequests.map((req) =>
                    req.id === id ? { ...req, ...updatedReq } : req
                ),
                isLoading: false
            }));
            toast.success('Delivery boy assigned successfully');
            return updatedReq;
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to assign delivery boy');
            return false;
        }
    }
}));
