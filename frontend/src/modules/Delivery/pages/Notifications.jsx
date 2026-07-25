import { useEffect } from "react";
import { motion } from "framer-motion";
import { FiBell, FiCheck, FiTrash2, FiInbox, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import PageTransition from "../../../shared/components/PageTransition";
import { useDeliveryNotificationStore } from "../store/deliveryNotificationStore";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const DeliveryNotifications = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    page,
    hasMore,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useDeliveryNotificationStore();

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const handleNotificationClick = (notification) => {
    const data = notification?.data || {};
    const returnId = String(data?.returnId || "").trim();
    const orderId = String(data?.orderId || "").trim();
    const isReturn = notification?.type === 'return' || String(data?.type || '').includes('return') || Boolean(returnId);

    if (isReturn && (returnId || orderId)) {
      navigate(`/delivery/returns/${returnId || orderId}`);
      return;
    }
    if (orderId) {
      navigate(`/delivery/orders/${orderId}`);
      return;
    }
  };

  return (
    <PageTransition>
      <div className="px-4 pt-4 pb-6 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Notifications</h1>
            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
              {unreadCount} UNREAD
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => fetchNotifications(1)}
              className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              title="Refresh"
              type="button"
            >
              <FiRefreshCw className={`sm:mr-1 ${isLoading ? 'animate-spin' : ''}`} size={16} />
              <span className="hidden sm:inline text-xs font-bold uppercase tracking-tighter">Refresh</span>
            </button>
            <button
              onClick={markAllAsRead}
              disabled={!notifications.length || unreadCount === 0}
              className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
              type="button"
            >
              Mark All Read
            </button>
          </div>
        </motion.div>

        {isLoading && notifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-200 text-gray-600">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-200">
            <FiInbox className="mx-auto mb-3 text-4xl text-gray-400" />
            <p className="text-gray-700 font-semibold">No notifications yet</p>
            <p className="text-sm text-gray-500 mt-1">
              New delivery updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification, idx) => (
              <motion.div
                key={notification?._id || `${idx}-${notification?.createdAt || ""}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => handleNotificationClick(notification)}
                className={`rounded-2xl p-4 shadow-sm border ${
                  notification?.isRead
                    ? "bg-white border-gray-200"
                    : "bg-blue-50 border-blue-200"
                } ${
                  notification?.data?.orderId ? "cursor-pointer hover:shadow-md transition-shadow" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FiBell className={notification?.isRead ? "text-gray-400" : "text-primary-600"} />
                      <h3 className="font-semibold text-gray-800 truncate">
                        {notification?.title || "Notification"}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 break-words">
                      {notification?.message || "-"}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDateTime(notification?.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!notification?.isRead && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markAsRead(notification?._id); }}
                        className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-white hover:text-black"
                        title="Mark as read"
                        type="button"
                      >
                        <FiCheck />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNotification(notification?._id); }}
                      className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      title="Delete notification"
                      type="button"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {hasMore && notifications.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => fetchNotifications(Number(page || 1) + 1)}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isLoading ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DeliveryNotifications;
