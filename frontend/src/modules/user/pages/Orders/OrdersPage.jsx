import React, { useEffect, useState, useCallback } from 'react';
import AccountLayout from '../../components/Profile/AccountLayout';
import { ShoppingBag, Package, Clock, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../../../../shared/store/orderStore';
import toast from 'react-hot-toast';
import { getOptimizedImageUrl } from "../../../../shared/utils/helpers";

const OrdersPage = () => {
    const navigate = useNavigate();
    const { orders, fetchUserOrders, isLoading } = useOrderStore();
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);

    const handleRefreshOrders = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await fetchUserOrders(1, 20);
        } catch (err) {
            console.error("Failed to refresh orders:", err);
        } finally {
            setIsManualRefreshing(false);
        }
    }, [fetchUserOrders]);

    useEffect(() => {
        fetchUserOrders().catch(err => console.error("Failed to fetch orders:", err));
    }, [fetchUserOrders]);

    // Listen for refresh event from AccountLayout
    useEffect(() => {
        const onRefresh = () => handleRefreshOrders();
        window.addEventListener('user-panel-refresh', onRefresh);
        return () => window.removeEventListener('user-panel-refresh', onRefresh);
    }, [handleRefreshOrders]);

    if (isLoading && orders.length === 0) {
        return (
            <AccountLayout>
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin mb-4" />
                    <p className="text-[10px] font-bold uppercase  text-gray-400">Loading your collection...</p>
                </div>
            </AccountLayout>
        );
    }

    return (
        <AccountLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold uppercase ">My Orders</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefreshOrders}
                            disabled={isManualRefreshing || isLoading}
                            className="w-9 h-9 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center hover:bg-gray-200 hover:text-black active:scale-95 transition-all disabled:opacity-50 border border-gray-200"
                            title="Refresh orders"
                        >
                            <RefreshCw size={15} strokeWidth={2.5} className={isManualRefreshing ? 'animate-spin' : ''} />
                        </button>
                        <span className="text-[10px] font-bold bg-gray-100 px-3 py-1 rounded-full uppercase  text-gray-400">
                            {orders.length} Orders
                        </span>
                    </div>
                </div>

                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-center bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                            <ShoppingBag size={32} className="text-gray-200" />
                        </div>
                        <h3 className="text-xl font-bold mb-2 text-gray-900">No orders found</h3>
                        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-8 max-w-xs mx-auto">Looks like you haven't placed any orders yet.</p>
                        <button
                            onClick={() => navigate('/shop')}
                            className="w-full sm:w-auto px-10 py-4 bg-black text-white text-[12px] font-bold uppercase tracking-widest rounded-2xl hover:bg-gray-800 transition-all shadow-xl active:scale-95"
                        >
                            Start Shopping
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 md:space-y-6">
                        {orders.map((order) => (
                            <div 
                                key={order.id} 
                                onClick={() => navigate(`/orders/${order.orderId || order.id}`)}
                                className="bg-white rounded-[28px] border border-gray-100 p-4 md:p-6 shadow-sm hover:shadow-xl transition-all group cursor-pointer"
                            >
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 pb-4 border-b border-gray-50">
                                    <div className="w-full sm:w-auto">
                                        <div className="flex items-center flex-wrap gap-2 mb-2">
                                            <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-1 rounded-lg uppercase tracking-wider">
                                                {order.status?.toLowerCase() === 'assigned' ? 'Assigned to Pickup' : order.status?.toLowerCase() === 'ready_for_pickup' ? 'Ready for Pickup' : order.status?.toLowerCase() === 'picked_up' ? 'Picked Up' : order.status?.toLowerCase() === 'out_for_delivery' ? 'Out for Delivery' : (order.status || 'Pending')}
                                            </span>
                                            {order.deliveryType && order.deliveryType !== 'standard' && (
                                                <span className="text-[9px] font-black bg-amber-400 text-black px-2 py-1 rounded-lg uppercase tracking-wider">
                                                    {order.deliveryType.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            <span className="text-[11px] font-bold text-gray-300 ml-auto sm:ml-0">#{order.orderId || order.id}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                                            <Clock size={12} className="text-gray-300" /> {new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <div className="flex sm:flex-col justify-between items-center sm:items-end w-full sm:w-auto pt-2 sm:pt-0">
                                        <p className="text-lg font-black text-gray-900">₹{order.total}</p>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-widest group-hover:text-black transition-colors">
                                            Details <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {order.items.slice(0, 3).map((item, idx) => (
                                        <div key={idx} className="flex gap-4">
                                            <div className="w-16 h-20 bg-gray-50 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                                                <img
                                                    src={getOptimizedImageUrl(item.image, 80)} loading="lazy" decoding="async"
                                                    alt=""
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                    onError={(e) => e.target.src = 'https://placehold.co/400x600?text=Premium+Piece'}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0 py-1 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="text-[13px] font-bold text-gray-900 line-clamp-1 uppercase tracking-tight">{item.name}</h4>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                                        {item.brand} {item.variant?.size ? `• Size ${item.variant.size}` : ''} • Qty {item.quantity}
                                                    </p>
                                                </div>
                                                <p className="text-[12px] font-black text-gray-900">₹{item.price}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {order.items.length > 3 && (
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center py-1 bg-gray-50 rounded-lg">
                                            + {order.items.length - 3} more items
                                        </p>
                                    )}
                                </div>

                                <div className="mt-6 pt-4 border-t border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                                    <div className="flex items-center gap-2 text-[9px] font-bold text-emerald-600 uppercase tracking-widest w-full sm:flex-1 truncate">
                                        <Package size={14} className="shrink-0" />
                                        <span className="truncate">Instant Delivery (60 Mins)</span>
                                    </div>
                                    <div className="flex flex-wrap sm:flex-nowrap gap-2 relative z-10 w-full sm:w-auto">
                                        {['pending', 'accepted', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'ready_for_delivery', 'searching'].includes(order.status?.toLowerCase()) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/orders/${order.orderId || order.id}`);
                                                }}
                                                className="flex-1 sm:flex-none px-2 sm:px-5 py-2.5 bg-white border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-50 hover:border-red-400 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                            >
                                                <X size={12} strokeWidth={3} />
                                                Cancel
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/support?orderId=${order.orderId || order.id}`);
                                            }}
                                            className="flex-1 sm:flex-none px-3 sm:px-6 py-2.5 bg-white border border-gray-200 text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all active:scale-95"
                                        >
                                            Help
                                        </button>
                                        {!['cancelled', 'canceled', 'returned', 'returned_to_vendor', 'returning_unselected_items', 'return_requested'].includes(order.status?.toLowerCase()) && !order.returnRequest && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/track-order/${order.orderId || order.id}`);
                                                }}
                                                className="flex-[1.5] sm:flex-none px-4 sm:px-8 py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-black/10"
                                            >
                                                Track
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AccountLayout>
    );
};

export default OrdersPage;
