import { create } from "zustand";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";
import { useAuthStore } from "../../../shared/store/authStore";

const getAuthUserId = (authState) =>
  String(authState?.user?._id || authState?.user?.id || "");

const normalizePayload = (response) => {
  const root = response?.data ?? response ?? {};
  if (Array.isArray(root)) {
    return {
      notifications: root,
      unreadCount: root.filter((n) => !n?.isRead).length,
      pages: 1,
    };
  }

  return {
    notifications: Array.isArray(root?.notifications) ? root.notifications : [],
    unreadCount: Number(root?.unreadCount || 0),
    pages: Number(root?.pages || 1),
  };
};

export const useUserNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  page: 1,
  hasMore: true,
  hasFetched: false,
  hydratedForUserId: "",

  fetchNotifications: async (page = 1) => {
    const authState = useAuthStore.getState();
    const authUserId = getAuthUserId(authState);
    if (!authState?.isAuthenticated) {
      set({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        page: 1,
        hasMore: false,
        hasFetched: false,
        hydratedForUserId: "",
      });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await api.get("/user/notifications", {
        params: { page, limit: 10 },
      });
      const payload = normalizePayload(response);
      set((state) => ({
        notifications:
          Number(page) === 1
            ? payload.notifications
            : [...state.notifications, ...payload.notifications],
        unreadCount: Number(payload.unreadCount || 0),
        page: Number(page),
        hasMore: Number(page) < Number(payload.pages || 1),
        hasFetched: true,
        hydratedForUserId: authUserId,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Failed to fetch user notifications:", error);
      set({ isLoading: false });
    }
  },

  ensureHydrated: async () => {
    const authState = useAuthStore.getState();
    if (!authState?.isAuthenticated) return;
    const authUserId = getAuthUserId(authState);
    const state = get();
    const isDifferentUser = state.hydratedForUserId !== authUserId;
    if ((!state.hasFetched || isDifferentUser) && !state.isLoading) {
      await get().fetchNotifications(1);
    }
  },

  // A notification pushed live over the socket (event `new_notification`).
  receiveNotification: (notif) => {
    if (!notif) return;
    set((state) => {
      const exists = notif?._id && state.notifications.some((n) => String(n?._id) === String(notif._id));
      if (exists) return {};
      return {
        notifications: state.hasFetched ? [notif, ...state.notifications] : state.notifications,
        unreadCount: Number(state.unreadCount || 0) + (notif?.isRead ? 0 : 1),
      };
    });
  },

  markAsRead: async (id) => {
    try {
      await api.put(`/user/notifications/${id}/read`);
      set((state) => {
        const changed = state.notifications.some(
          (n) => String(n?._id) === String(id) && !n?.isRead
        );
        return {
          notifications: state.notifications.map((n) =>
            String(n?._id) === String(id) ? { ...n, isRead: true } : n
          ),
          unreadCount: changed
            ? Math.max(0, Number(state.unreadCount || 0) - 1)
            : state.unreadCount,
        };
      });
    } catch (error) {
      console.error("Failed to mark user notification as read:", error);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.put("/user/notifications/read-all");
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all user notifications as read:", error);
      toast.error("Failed to mark all notifications as read");
    }
  },

  removeNotification: async (id) => {
    try {
      await api.delete(`/user/notifications/${id}`);
      set((state) => {
        const existing = state.notifications.find(
          (n) => String(n?._id) === String(id)
        );
        return {
          notifications: state.notifications.filter(
            (n) => String(n?._id) !== String(id)
          ),
          unreadCount:
            existing && !existing?.isRead
              ? Math.max(0, Number(state.unreadCount || 0) - 1)
              : state.unreadCount,
        };
      });
      toast.success("Notification deleted");
    } catch (error) {
      console.error("Failed to delete user notification:", error);
      toast.error("Failed to delete notification");
    }
  },

  reset: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      page: 1,
      hasMore: true,
      hasFetched: false,
      hydratedForUserId: "",
    });
  },
}));
