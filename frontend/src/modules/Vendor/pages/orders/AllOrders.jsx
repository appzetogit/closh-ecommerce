import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FiSearch,
  FiEye,
  FiShoppingBag,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from "../../../Admin/components/DataTable";
import ExportButton from "../../../Admin/components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice, getItemStatusBadge } from '../../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../../shared/utils/variant';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getAllVendorOrders, updateVendorOrderStatus } from '../../services/vendorService';
import toast from 'react-hot-toast';
import socketService from '../../../../shared/utils/socket';

const AllOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendor } = useVendorAuthStore();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(location.state?.status || 'all');

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const data = await getAllVendorOrders({ limit: 100 });
        setOrders(data?.orders ?? []);
      } catch {
        // errors handled by api.js toast
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();

    // Socket real-time updates
    if (vendorId) {
      socketService.joinRoom(`vendor_${vendorId}`);
    }

    const handleRealTimeUpdate = () => {
      fetchOrders();
    };

    socketService.on('order_created', handleRealTimeUpdate);
    socketService.on('order_status_updated', handleRealTimeUpdate);
    socketService.on('order_picked_up', handleRealTimeUpdate);
    socketService.on('order_delivered', handleRealTimeUpdate);

    return () => {
      socketService.off('order_created');
      socketService.off('order_status_updated');
      socketService.off('order_picked_up');
      socketService.off('order_delivered');
    };
  }, [vendorId]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Debugging: Log counts when filters change
    console.log(`[AllOrders] Filtering ${orders.length} orders. Current Vendor ID: ${vendorId}`);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((order) =>
        order.orderId?.toLowerCase().includes(q) ||
        order._id?.toLowerCase().includes(q)
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter((order) => {
        const vendorItem = order.vendorItems?.find((vi) => {
          const vId = vi.vendorId?._id || vi.vendorId;
          return vId?.toString() === vendorId?.toString();
        });
        const globalStatus = (order.status || '').toLowerCase();
        let status = (vendorItem?.status || order.status || 'pending').toLowerCase();
        if (['returned', 'return requested', 'cancelled', 'canceled'].includes(globalStatus)) {
          status = globalStatus;
        }
        return status === selectedStatus.toLowerCase();
      });
    }

    return filtered;
  }, [orders, searchQuery, selectedStatus, vendorId]);

  // Get per-vendor subtotal from vendorItems
  const getVendorSubtotal = (order) => {
    const vendorItem = order.vendorItems?.find((vi) => {
      const vId = vi.vendorId?._id || vi.vendorId;
      return vId?.toString() === vendorId?.toString();
    });
    // Prioritize vendorPrice (cost price) over price (selling price)
    return vendorItem?.items?.reduce((sum, it) => sum + (it.vendorPrice ?? it.price ?? 0) * (it.quantity ?? 1), 0) ??
           vendorItem?.subtotal ?? 0;
  };

  const getOrderStatus = (order) => {
    const globalStatus = (order.status || '').toLowerCase();
    if (['returned', 'return requested', 'cancelled', 'canceled'].includes(globalStatus)) {
      return globalStatus;
    }
    const vendorItem = order.vendorItems?.find((vi) => {
      const vId = vi.vendorId?._id || vi.vendorId;
      return vId?.toString() === vendorId?.toString();
    });
    return vendorItem?.status ?? order.status ?? 'pending';
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateVendorOrderStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => {
          if ((o.orderId ?? o._id) !== orderId) return o;
          return {
            ...o,
            vendorItems: o.vendorItems?.map((vi) => {
              const vId = vi.vendorId?._id || vi.vendorId;
              return vId?.toString() === vendorId?.toString()
                ? { ...vi, status: newStatus }
                : vi;
            }),
            status: newStatus,
          };
        })
      );
      toast.success('Order status updated');
    } catch {
      // errors handled by api.js toast
    }
  };

  const columns = [
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value, row) => (
        <span className="font-semibold text-gray-800">
          {value ?? row._id}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (_, row) => {
        const vendorItem = row.vendorItems?.find((vi) => {
          const vId = vi.vendorId?._id || vi.vendorId;
          return vId?.toString() === vendorId?.toString();
        });
        const items = vendorItem?.items || [];
        if (items.length === 0) return <span className="text-sm text-gray-500">N/A</span>;
        
        return (
          <div className="flex flex-col gap-1 py-1 min-w-[140px]">
            {items.map((item, idx) => {
              const itemBadge = getItemStatusBadge(item.itemStatus, vendorItem?.status || row.status);
              return (
                <div key={idx} className="flex flex-col">
                  <span className="text-[13px] font-semibold text-gray-800 leading-tight">
                    {item.name} <span className="text-gray-400 text-[11px] font-normal">x{item.quantity}</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {formatVariantLabel(item.variant) && (
                      <span className="text-[10px] text-gray-500 font-medium leading-tight">
                        {formatVariantLabel(item.variant)}
                      </span>
                    )}
                    {itemBadge && (
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border leading-none ${itemBadge.className}`}>
                        {itemBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'totalAmount',
      label: 'Your Amount',
      sortable: true,
      render: (_, row) => (
        <span className="font-semibold text-gray-800">
          {formatPrice(getVendorSubtotal(row))}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      label: 'Payment',
      sortable: true,
      render: (value, row) => {
        // Check both value and row.paymentMethod, handle various formats
        const method = (value || row?.paymentMethod || '').toLowerCase();
        const isCod = method.includes('cod') || method.includes('cash');
        
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isCod 
              ? 'bg-amber-50 text-amber-700 border border-amber-200' 
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {isCod ? 'COD' : (value?.toUpperCase() || 'PREPAID')}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (_, row) => {
        const status = getOrderStatus(row);
        return (
          <Badge
            variant={
              status === 'delivered'
                ? 'success'
                : status === 'pending'
                  ? 'warning'
                  : status === 'cancelled' || status === 'canceled'
                    ? 'error'
                    : 'info'
            }>
            {status?.toUpperCase() || 'N/A'}
          </Badge>
        );
      },
    },
    {
      key: 'orderType',
      label: 'Type',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-0.5 ${value === 'try_and_buy' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-100 text-blue-700 border-blue-200'} text-[10px] font-bold rounded-lg border uppercase  shadow-sm animate-pulse`}>
          {value?.replace(/_/g, ' ') || 'STANDARD'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/vendor/orders/${row.orderId ?? row._id}`);
          }}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <FiEye />
        </button>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view orders</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            All Orders
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View and manage all your orders
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Filters */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'ready_for_delivery', label: 'Ready for Delivery' },
                { value: 'shipped', label: 'Shipped' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              className="w-full sm:w-auto min-w-[140px]"
            />

            <div className="w-full sm:w-auto">
              <ExportButton
                data={filteredOrders}
                headers={[
                  { label: 'Order ID', accessor: (row) => row.orderId ?? row._id },
                  { label: 'Date', accessor: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—' },
                  { label: 'Amount', accessor: (row) => formatPrice(getVendorSubtotal(row)) },
                  { label: 'Status', accessor: (row) => getOrderStatus(row) },
                ]}
                filename="vendor-orders"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center py-12 text-gray-400">Loading orders...</p>
        ) : filteredOrders.length > 0 ? (
          <DataTable
            data={filteredOrders}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
            onRowClick={(row) => navigate(`/vendor/orders/${row.orderId ?? row._id}`)}
          />
        ) : (
          <div className="text-center py-12">
            <FiShoppingBag className="text-4xl text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No orders found</p>
            <p className="text-sm text-gray-400">
              {searchQuery || selectedStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Orders containing your products will appear here'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AllOrders;
