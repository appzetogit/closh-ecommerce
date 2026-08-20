import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch,
  FiEye,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiCheckCircle,
  FiPackage,
  FiTruck,
  FiXCircle,
  FiRotateCw,
  FiShoppingBag,
  FiFileText,
  FiTrash2,
  FiMoreVertical,
  FiCalendar,
  FiX,
  FiRefreshCw,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import { formatCurrency, formatDateTime } from "../../utils/adminHelpers";
import { getAllOrders, deleteOrder, getAllVendors } from "../../services/adminService";
import toast from "react-hot-toast";

// OrderItemsDropdown component
const OrderItemsDropdown = ({ items, orderTotal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Normalize items - handle both array and number formats
  const normalizedItems = useMemo(() => {
    if (Array.isArray(items)) {
      return items;
    }
    // If items is a number, generate mock items
    if (typeof items === "number" && items > 0) {
      const itemCount = items;
      const avgPrice = orderTotal / itemCount;
      return Array.from({ length: itemCount }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        quantity: 1,
        price: avgPrice,
      }));
    }
    return [];
  }, [items, orderTotal]);

  // Check available space and determine dropdown direction
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const dropdownHeight = 400; // max-h-[400px]

      // Open upward if not enough space below but enough space above
      setOpenUpward(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    }
  }, [isOpen]);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isOpen &&
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  if (normalizedItems.length === 0) {
    return <span className="text-gray-500">No items</span>;
  }

  const itemCount = normalizedItems.length;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors">
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        {isOpen ? (
          <FiChevronUp className="text-xs" />
        ) : (
          <FiChevronDown className="text-xs" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{
              opacity: 0,
              y: openUpward ? 10 : -10,
              scale: 0.95,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: openUpward ? 10 : -10,
              scale: 0.95,
            }}
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1],
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className={`absolute left-0 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-[85vw] sm:w-[500px] max-w-[600px] max-h-[400px] overflow-hidden ${openUpward ? "bottom-full mb-2" : "top-full mt-2"
              }`}
            style={{
              transformOrigin: openUpward ? "bottom left" : "top left",
            }}>
            <div className="p-4 border-b border-gray-200 bg-white">
              <h3 className="font-semibold text-gray-800 text-sm">
                Order Items
              </h3>
            </div>
            <div className="overflow-y-auto overflow-x-auto max-h-[320px] scrollbar-admin">
              <table className="w-full min-w-[600px] sm:min-w-0">
                <thead className="bg-white sticky top-0">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Item ID
                    </th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Item Name
                    </th>
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Quantity
                    </th>
                    <th className="px-2 sm:px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Unit Price
                    </th>
                    <th className="px-2 sm:px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {normalizedItems.map((item, index) => {
                    const itemTotal = (item.price || 0) * (item.quantity || 1);
                    const itemId =
                      item.id || item.itemId || `ITEM-${index + 1}`;
                    return (
                      <tr key={item.id || index} className="hover:bg-white hover:text-black">
                        <td className="px-2 sm:px-4 py-2 text-sm text-gray-800 font-medium whitespace-nowrap">
                          {itemId}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-sm text-gray-800 whitespace-nowrap">
                          {item.name || `Item ${index + 1}`}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-sm text-gray-700 text-center whitespace-nowrap">
                          {item.quantity || 1}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-sm text-gray-700 text-right whitespace-nowrap">
                          {formatPrice(item.price || 0)}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-sm font-semibold text-gray-800 text-right whitespace-nowrap">
                          {formatPrice(itemTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// OrderActionsDropdown component
const OrderActionsDropdown = ({
  order,
  onOrderDetails,
  onGenerateInvoice,
  onOrderTracking,
  onDeleteOrder,
  isOpen,
  onToggle,
  onClose,
}) => {
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Check available space and determine dropdown direction
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const dropdownHeight = 200; // Estimated dropdown height

      // Open upward if not enough space below but enough space above
      setOpenUpward(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    }
  }, [isOpen]);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isOpen &&
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const menuItems = [
    {
      label: "Order Details",
      icon: FiEye,
      onClick: () => {
        onOrderDetails(order.id);
        onClose();
      },
      color: "text-blue-600",
      hoverBg: "hover:bg-blue-50",
    },
    {
      label: "Generate Invoice",
      icon: FiFileText,
      onClick: () => {
        onGenerateInvoice(order);
        onClose();
      },
      color: "text-green-600",
      hoverBg: "hover:bg-green-50",
    },
    {
      label: "Order Tracking",
      icon: FiTruck,
      onClick: () => {
        onOrderTracking(order.id);
        onClose();
      },
      color: "text-indigo-600",
      hoverBg: "hover:bg-indigo-50",
    },
    {
      label: "Delete Order",
      icon: FiTrash2,
      onClick: () => {
        onDeleteOrder(order.id);
        onClose();
      },
      color: "text-red-600",
      hoverBg: "hover:bg-red-50",
    },
  ];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="View Details">
        <FiMoreVertical />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{
              opacity: 0,
              y: openUpward ? 10 : -10,
              scale: 0.95,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: openUpward ? 10 : -10,
              scale: 0.95,
            }}
            transition={{ duration: 0.2 }}
            className={`absolute right-0 z-50 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[180px] overflow-hidden ${openUpward ? "bottom-full mb-2" : "top-full mt-2"
              }`}
            style={{
              transformOrigin: openUpward ? "bottom right" : "top right",
            }}>
            <div className="py-1">
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={index}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      item.onClick();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      item.onClick();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${item.color} ${item.hoverBg}`}>
                    <Icon className="text-base" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AllOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    orderId: null,
  });

  const [vendors, setVendors] = useState([]);
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedVendor, setSelectedVendor] = useState("all");

  const [isLoading, setIsLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        status: selectedStatus === "all" ? undefined : selectedStatus,
        search: searchQuery,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        vendorCity: selectedCity === "all" ? undefined : selectedCity,
        vendorId: selectedVendor === "all" ? undefined : selectedVendor,
        limit: 100 // Fetch a larger set for the DataTable's internal pagination
      };

      const response = await getAllOrders(params);

      // Normalize data to match existing UI structure
      const normalizedOrders = response.data.orders.map(order => ({
        ...order,
        id: order.orderId || order._id,
        customer: {
          name: order.userId?.name || 'Unknown',
          email: order.userId?.email || ''
        },
        date: order.createdAt,
        finalTotal: order.total
      }));

      setOrders(normalizedOrders);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      // adminService interceptor already handles error toasts
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, searchQuery, dateRange, selectedCity, selectedVendor]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const fetchVendorsData = async () => {
      try {
        const response = await getAllVendors({ limit: 500 });
        const fetchedVendors = response?.data?.vendors || response?.vendors || [];
        console.log("AllOrders fetched vendors:", fetchedVendors.length);
        setVendors(fetchedVendors);
      } catch (error) {
        console.error("Failed to fetch vendors:", error);
      }
    };
    fetchVendorsData();
  }, []);

  const cities = useMemo(() => {
    const allCities = vendors.map((v) => {
      if (v.address?.city) return v.address.city;
      if (v.shopAddress && typeof v.shopAddress === 'string') {
        const parts = v.shopAddress.split(',');
        return parts.length > 1 ? parts[parts.length - 2]?.trim() : null;
      }
      return null;
    }).filter(Boolean);
    return [...new Set(allCities)].sort();
  }, [vendors]);

  const filteredVendors = useMemo(() => {
    if (selectedCity === "all") return vendors;
    return vendors.filter((v) => {
      const city = v.address?.city || (v.shopAddress && v.shopAddress.includes(selectedCity) ? selectedCity : null);
      return city === selectedCity;
    });
  }, [vendors, selectedCity]);

  // Calculate order status counts
  const orderStats = useMemo(() => {
    const stats = {
      awaiting: 0,
      received: 0,
      processed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
      total: orders.length,
    };

    orders.forEach((order) => {
      const status = order.status?.toLowerCase() || "";

      // Map statuses to our categories
      if (status === "pending" || status === "awaiting") {
        stats.awaiting++;
      } else if (status === "received") {
        stats.received++;
      } else if (status === "processing" || status === "processed") {
        stats.processed++;
      } else if (status === "shipped") {
        stats.shipped++;
      } else if (status === "delivered") {
        stats.delivered++;
      } else if (status === "cancelled" || status === "canceled") {
        stats.cancelled++;
      } else if (status === "returned") {
        stats.returned++;
      }
    });

    return stats;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          (order.id || "").toLowerCase().includes(q) ||
          (order.customer?.name || "").toLowerCase().includes(q) ||
          (order.customer?.email || "").toLowerCase().includes(q)
      );
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter(
        (order) => (order.status || "").toLowerCase() === selectedStatus
      );
    }

    // Filter by date range
    if (dateRange.startDate || dateRange.endDate) {
      filtered = filtered.filter((order) => {
        const orderDate = new Date(order.date);
        orderDate.setHours(0, 0, 0, 0);

        if (dateRange.startDate && dateRange.endDate) {
          const startDate = new Date(dateRange.startDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          return orderDate >= startDate && orderDate <= endDate;
        } else if (dateRange.startDate) {
          const startDate = new Date(dateRange.startDate);
          startDate.setHours(0, 0, 0, 0);
          return orderDate >= startDate;
        } else if (dateRange.endDate) {
          const endDate = new Date(dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          return orderDate <= endDate;
        }
        return true;
      });
    }

    return filtered;
  }, [orders, searchQuery, selectedStatus, dateRange]);

  // Helper function to format payment method
  const formatPaymentMethod = (method) => {
    if (!method) return "N/A";
    const methodMap = {
      card: "Credit Card",
      cod: "Cash on Delivery",
      wallet: "Wallet",
      creditCard: "Credit Card",
      cash: "Cash on Delivery",
      prepaid: "Prepaid",
      upi: "Online (UPI)",
      bank: "Net Banking",
      digital_at_door: "Online (Paid at Door)",
    };
    return (
      methodMap[method.toLowerCase()] ||
      method.charAt(0).toUpperCase() + method.slice(1)
    );
  };

  // Helper function to calculate final total
  const calculateFinalTotal = (order) => {
    if (order.finalTotal !== undefined) {
      return order.finalTotal;
    }
    const total = order.total || 0;
    const tax = order.tax || 0;
    const discount = order.discount || 0;
    return total + tax - discount;
  };

  // Handler functions for order actions
  const handleOrderDetails = (orderId) => {
    navigate(`/admin/orders/${orderId}`);
  };

  const handleGenerateInvoice = (order) => {
    navigate(`/admin/orders/${order.id}/invoice`);
  };

  const handleOrderTracking = (orderId) => {
    navigate(`/admin/orders/order-tracking?orderId=${orderId}`);
  };

  const handleDeleteOrder = (orderId) => {
    setDeleteModal({ isOpen: true, orderId });
  };

  const confirmDeleteOrder = async () => {
    try {
      await deleteOrder(deleteModal.orderId);
      const updatedOrders = orders.filter((o) => o.id !== deleteModal.orderId);
      setOrders(updatedOrders);
      setDeleteModal({ isOpen: false, orderId: null });
      toast.success("Order deleted successfully");
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleDropdownToggle = (orderId) => {
    setOpenDropdownId(openDropdownId === orderId ? null : orderId);
  };

  const handleDropdownClose = () => {
    setOpenDropdownId(null);
  };

  const columns = [
    {
      key: "id",
      label: "Order ID",
      sortable: true,
      render: (value) => (
        <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
          #{String(value || "").replace(/^ORD-/, "").replace(/^#/, "").slice(-6).toUpperCase()}
        </span>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-medium text-gray-800">{value.name}</p>
          <p className="text-xs text-gray-500">{value.email}</p>
        </div>
      ),
    },
    {
      key: "items",
      label: "Items",
      sortable: false,
      render: (value, row) => (
        <OrderItemsDropdown items={value} orderTotal={row.total || 0} />
      ),
    },
    {
      key: "finalTotal",
      label: "Amount",
      sortable: true,
      render: (value, row) => {
        const finalTotal = calculateFinalTotal(row);
        const originalTotal = row.total || 0;
        const isAdjusted = finalTotal !== originalTotal && row.orderType === 'try_and_buy';
        return (
          <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-sm">
              {formatCurrency(finalTotal)}
            </span>
            {isAdjusted && (
              <span className="text-[9px] text-orange-600 font-bold uppercase">Adjusted</span>
            )}
          </div>
        );
      },
    },
    {
      key: "paymentMethod",
      label: "Payment & Type",
      sortable: true,
      render: (value, row) => (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-700 capitalize">
            {formatPaymentMethod(value)}
          </span>
          <span className={`px-1.5 py-0.5 inline-block w-fit whitespace-nowrap ${row.orderType === 'try_and_buy' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-blue-50 text-blue-700 border-blue-100'} text-[9px] font-bold rounded border uppercase tracking-tight`}>
            {row.orderType?.replace(/_/g, ' ') || 'STANDARD'}
          </span>
        </div>
      ),
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => (
        <div className="text-xs whitespace-nowrap">
          <p className="font-medium text-gray-800">{new Date(value).toLocaleDateString()}</p>
          <p className="text-[10px] text-gray-500">{new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => {
        const getStatusColor = (status) => {
          switch (status?.toLowerCase()) {
            case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'processing': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'assigned': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
            case 'shipped': return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'out_for_delivery': return 'bg-cyan-50 text-cyan-700 border-cyan-100';
            case 'delivered': return 'bg-green-50 text-green-700 border-green-100';
            case 'cancelled': return 'bg-red-50 text-red-700 border-red-100';
            case 'returned': return 'bg-orange-50 text-orange-700 border-orange-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
          }
        };
        return (
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${getStatusColor(value)}`}>
            {value?.replace(/_/g, ' ') || 'UNKNOWN'}
          </span>
        );
      },
    },
    {
      key: "deliveryBoy",
      label: "Delivery Partner",
      sortable: false,
      render: (_, row) => {
        if (!row.deliveryBoyId) return <span className="text-[10px] text-gray-400 font-medium">Unassigned</span>;
        return (
          <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-xs">
              {row.deliveryBoyId?.name || "Unknown"}
            </span>
            {row.deliveryBoyId?.phone && (
              <span className="text-[10px] text-gray-500">{row.deliveryBoyId.phone}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <OrderActionsDropdown
          order={row}
          onOrderDetails={handleOrderDetails}
          onGenerateInvoice={handleGenerateInvoice}
          onOrderTracking={handleOrderTracking}
          onDeleteOrder={handleDeleteOrder}
          isOpen={openDropdownId === row.id}
          onToggle={() => handleDropdownToggle(row.id)}
          onClose={handleDropdownClose}
        />
      ),
    },
  ];

  // Order status cards configuration
  const statusCards = [
    {
      title: "Awaiting",
      value: orderStats.awaiting,
      icon: FiClock,
      bgColor: "bg-gradient-to-br from-yellow-500 to-amber-600",
      cardBg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    },
    {
      title: "Received",
      value: orderStats.received,
      icon: FiCheckCircle,
      bgColor: "bg-gradient-to-br from-blue-500 to-cyan-600",
      cardBg: "bg-gradient-to-br from-blue-50 to-cyan-50",
    },
    {
      title: "Processed",
      value: orderStats.processed,
      icon: FiPackage,
      bgColor: "bg-gradient-to-br from-indigo-500 to-purple-600",
      cardBg: "bg-gradient-to-br from-indigo-50 to-purple-50",
    },
    {
      title: "Shipped",
      value: orderStats.shipped,
      icon: FiTruck,
      bgColor: "bg-gradient-to-br from-blue-500 to-indigo-600",
      cardBg: "bg-gradient-to-br from-blue-50 to-indigo-50",
    },
    {
      title: "Delivered",
      value: orderStats.delivered,
      icon: FiCheckCircle,
      bgColor: "bg-gradient-to-br from-green-500 to-emerald-600",
      cardBg: "bg-gradient-to-br from-green-50 to-emerald-50",
    },
    {
      title: "Cancelled",
      value: orderStats.cancelled,
      icon: FiXCircle,
      bgColor: "bg-gradient-to-br from-red-500 to-rose-600",
      cardBg: "bg-gradient-to-br from-red-50 to-rose-50",
    },
    {
      title: "Returned",
      value: orderStats.returned,
      icon: FiRotateCw,
      bgColor: "bg-gradient-to-br from-orange-500 to-amber-600",
      cardBg: "bg-gradient-to-br from-orange-50 to-amber-50",
    },
    {
      title: "Total Orders",
      value: orderStats.total,
      icon: FiShoppingBag,
      bgColor: "bg-gradient-to-br from-gray-600 to-gray-800",
      cardBg: "bg-gradient-to-br from-gray-50 to-gray-100",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            All Orders
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View and manage all customer orders
          </p>
        </div>
      </div>

      {/* Order Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        {statusCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`${card.cardBg} rounded-xl p-3 sm:p-4 shadow-md border-2 border-transparent hover:shadow-lg transition-all duration-300 relative overflow-hidden`}>
              {/* Decorative gradient overlay */}
              <div
                className={`absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 ${card.bgColor} opacity-10 rounded-full -mr-12 -mt-12 sm:-mr-16 sm:-mt-16`}></div>

              <div className="flex items-center justify-between mb-2 sm:mb-3 relative z-10">
                <div
                  className={`${card.bgColor} bg-white/20 p-2 sm:p-2.5 rounded-lg shadow-md`}>
                  <Icon className="text-white text-base sm:text-lg" />
                </div>
              </div>
              <div className="relative z-10">
                <h3 className="text-gray-600 text-xs sm:text-sm font-medium mb-1">
                  {card.title}
                </h3>
                <p className="text-gray-800 text-lg sm:text-xl font-bold">
                  {card.value.toLocaleString()}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, name, or email..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "pending", label: "Pending" },
              { value: "all_vendors_ready", label: "🏪 Combined Orders (All Vendors Ready)" },
              { value: "processing", label: "Processing" },
              { value: "assigned", label: "Assigned" },
              { value: "shipped", label: "Shipped" },
              { value: "delivered", label: "Delivered" },
              { value: "cancelled", label: "Cancelled" },
              { value: "returned", label: "Returned" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <AnimatedSelect
            value={selectedCity}
            onChange={(e) => {
              setSelectedCity(e.target.value);
              setSelectedVendor("all"); // Reset vendor when city changes
            }}
            options={[
              { value: "all", label: "All Cities" },
              ...cities.map((city) => ({ value: city, label: city })),
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <AnimatedSelect
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            options={[
              { value: "all", label: "All Vendors" },
              ...filteredVendors.map((v) => ({
                value: v.id || v._id,
                label: v.storeName || v.name || "Unknown Vendor",
              })),
            ]}
            className="w-full sm:w-auto min-w-[160px]"
          />

          {/* Date Range Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
              <div className="relative flex-1 sm:flex-initial">
                <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                  max={dateRange.endDate || undefined}
                  className="w-full sm:w-auto pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base min-w-[140px]"
                  placeholder="Start Date"
                />
              </div>
              <span className="text-gray-500 hidden sm:inline">to</span>
              <div className="relative flex-1 sm:flex-initial">
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                  min={dateRange.startDate || undefined}
                  className="w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base min-w-[140px]"
                  placeholder="End Date"
                />
              </div>
              {(dateRange.startDate || dateRange.endDate) && (
                <button
                  onClick={() => setDateRange({ startDate: "", endDate: "" })}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Clear Date Range">
                  <FiX className="text-lg" />
                </button>
              )}
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <ExportButton
              data={filteredOrders}
              headers={[
                { label: "Order ID", accessor: (row) => row.id },
                { label: "Customer", accessor: (row) => row.customer.name },
                { label: "Email", accessor: (row) => row.customer.email },
                {
                  label: "Items",
                  accessor: (row) => {
                    if (Array.isArray(row.items)) {
                      return row.items
                        .map((item) => `${item.name} (Qty: ${item.quantity})`)
                        .join(", ");
                    }
                    return `${row.items} items`;
                  },
                },
                {
                  label: "Total ($)",
                  accessor: (row) => formatCurrency(row.total || 0),
                },
                {
                  label: "Final Total ($)",
                  accessor: (row) => formatCurrency(calculateFinalTotal(row)),
                },
                {
                  label: "Payment",
                  accessor: (row) => formatPaymentMethod(row.paymentMethod),
                },
                {
                  label: "Order Date",
                  accessor: (row) => formatDateTime(row.date),
                },
                { label: "Status", accessor: (row) => row.status },
              ]}
              filename="all-orders"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center text-gray-500">
          Loading orders...
        </div>
      ) : (
        <DataTable
          data={filteredOrders}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, orderId: null })}
        onConfirm={confirmDeleteOrder}
        title="Delete Order?"
        message="Are you sure you want to delete this order? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default AllOrders;
