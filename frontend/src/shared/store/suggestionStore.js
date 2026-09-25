import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useSuggestionStore = create((set, get) => ({
    suggestions: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1,
    },

    fetchSuggestions: async (params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getAllSuggestions(params);
            set({
                suggestions: response.data.suggestions,
                pagination: response.data.pagination,
                isLoading: false,
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toast.error(error.message || 'Failed to fetch suggestions');
        }
    },

    updateSuggestionStatus: async (id, status) => {
        try {
            await adminService.updateSuggestionStatus(id, status);
            set((state) => ({
                suggestions: state.suggestions.map((s) => (s.id === id ? { ...s, status } : s)),
            }));
            toast.success(`Suggestion marked ${status}`);
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to update suggestion');
            return false;
        }
    },

    deleteSuggestion: async (id) => {
        if (!window.confirm('Are you sure you want to delete this suggestion?')) return false;

        try {
            await adminService.deleteSuggestion(id);
            set((state) => ({
                suggestions: state.suggestions.filter((s) => s.id !== id),
            }));
            toast.success('Suggestion deleted successfully');
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to delete suggestion');
            return false;
        }
    },
}));
