import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiSearch,
  FiMapPin,
  FiTruck,
  FiPackage,
  FiCheckCircle,
  FiPhone,
  FiClock,
} from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
import { getAllOrders } from "../../services/adminService";
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';

const libraries = ['places', 'geometry', 'drawing'];

// Order.model.js's status enum is far more granular (rider search,
// multi-vendor readiness, etc.) than is useful to show at a glance, so every
// real status collapses into one of these 5 stages instead of only
// recognizing "processing"/"shipped"/"delivered" and leaving everything
// else (picked_up, assigned, out_for_delivery, ...) stuck on step 1.
const STAGE_LABELS = ["Order Placed", "Processing", "Picked Up", "Shipped", "Delivered"];
const STAGE_ICONS = [FiCheckCircle, FiClock, FiPackage, FiTruck, FiMapPin];

const STATUS_STAGE_INDEX = {
  pending: 0,
  accepted: 1,
  processing: 1,
  ready_for_pickup: 1,
  all_vendors_ready: 1,
  ready_for_delivery: 1,
  searching: 1,
  assigned: 1,
  picked_up: 2,
  shipped: 3,
  out_for_delivery: 3,
  delivered: 4,
  // Try & Buy / return states all happen after the base delivery, so the
  // tracker should still read as fully delivered for them.
  try_active: 4,
  try_buy_completed: 4,
  'return requested': 4,
  returned: 4,
  returning_unselected_items: 4,
  returned_to_vendor: 4,
  // Cancellation can happen at any stage; without stage history to know how
  // far the order actually got, don't imply progress that may not have
  // happened.
  cancelled: 0,
};

// A rider is actively out with the order for all of these — this is when
// the live map + polling should be active, not just once status hits
// "shipped".
const RIDER_ACTIVE_STATUSES = ['assigned', 'picked_up', 'shipped', 'out_for_delivery', 'delivered'];

const OrderTracking = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeMarker, setActiveMarker] = useState(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const response = await getAllOrders({ limit: 100 });
        const normalizedOrders = response.data.orders.map(order => ({
          ...order,
          id: order.orderId || order._id,
          customer: {
            name: order.userId?.name || 'Unknown',
            email: order.userId?.email || ''
          },
          date: order.createdAt
        }));
        setOrders(normalizedOrders);
      } catch (error) {
        console.error("Tracking fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const filteredOrders = orders.filter(
    (order) =>
      (order.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customer?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (!orderId || orders.length === 0) return;
    const matched = orders.find((o) => o.id === orderId);
    if (matched) {
      setSelectedOrder(matched);
      setSearchQuery(orderId);
    }
  }, [orders, searchParams]);

  // Live polling: refresh order data every 10s when actively tracking a delivery
  useEffect(() => {
    if (!selectedOrder || !RIDER_ACTIVE_STATUSES.includes(selectedOrder.status)) return;

    const poll = setInterval(async () => {
      try {
        const response = await getAllOrders({ limit: 100 });
        const normalizedOrders = response.data.orders.map(order => ({
          ...order,
          id: order.orderId || order._id,
          customer: {
            name: order.userId?.name || order.shippingAddress?.name || 'Unknown',
            email: order.userId?.email || order.shippingAddress?.email || ''
          },
          date: order.createdAt
        }));
        setOrders(normalizedOrders);
        // Update selected order with freshed data
        const refreshed = normalizedOrders.find(o => o.id === selectedOrder.id);
        if (refreshed) setSelectedOrder(refreshed);
      } catch {
        // silently ignore polling errors
      }
    }, 10000);

    return () => clearInterval(poll);
  }, [selectedOrder?.id, selectedOrder?.status]);

  const getTrackingSteps = (status) => {
    const currentStage = STATUS_STAGE_INDEX[status] ?? 0;
    return STAGE_LABELS.map((label, index) => ({
      label,
      status: index <= currentStage ? "completed" : "pending",
      icon: STAGE_ICONS[index],
    }));
  };

  const columns = [
    {
      key: "id",
      label: "Order ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-xs sm:text-sm text-gray-800 break-all select-all">
          {value}
        </span>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (value) => (
        <div className="max-w-[120px] sm:max-w-none">
          <p className="font-semibold text-xs sm:text-sm text-gray-800 truncate">{value.name}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 truncate">{value.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <div className="scale-90 sm:scale-100 origin-left">
          <Badge variant={value}>{value}</Badge>
        </div>
      ),
    },
    {
      key: "date",
      label: "Order Date",
      sortable: true,
      render: (value) => {
        const d = new Date(value);
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return (
          <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
            <p className="font-medium text-gray-700">{dateStr}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{timeStr}</p>
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => setSelectedOrder(row)}
          className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs sm:text-sm font-semibold shadow-sm flex items-center justify-center gap-1">
          Track
        </button>
      ),
    },
  ];

  const riderCoords = selectedOrder?.deliveryBoyId?.currentLocation?.coordinates;
  const riderPos = Array.isArray(riderCoords) && riderCoords.length === 2 && riderCoords[0] !== 0 ? [riderCoords[1], riderCoords[0]] : null;
  const customerPos = (() => {
    const coords = selectedOrder?.dropoffLocation?.coordinates;
    if (Array.isArray(coords) && coords.length === 2 && coords[0] !== 0) {
      return [coords[1], coords[0]];
    }
    return null;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 lg:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Order Tracking
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Monitor real-time delivery progress and rider location
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order ID or customer name..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading orders...</div>
            ) : (
              <DataTable
                data={filteredOrders}
                columns={columns}
                pagination={true}
                itemsPerPage={10}
                minWidth="min-w-[600px]"
                className="[&_td]:px-2 sm:[&_td]:px-3 [&_th]:px-2 sm:[&_th]:px-3 [&_td]:py-2 sm:[&_td]:py-3 [&_th]:py-2 sm:[&_th]:py-3"
              />
            )}
          </div>
        </div>

        {selectedOrder && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex flex-col gap-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Tracking Progress</h3>
                <p className="text-xs font-semibold text-gray-400 uppercase  mt-1">Order #{selectedOrder.id}</p>
              </div>
              <Badge variant={selectedOrder.status}>{selectedOrder.status}</Badge>
            </div>

            {/* Live Map Section */}
            {RIDER_ACTIVE_STATUSES.includes(selectedOrder.status) && (
              <div className="h-64 sm:h-80 w-full rounded-2xl overflow-hidden shadow-inner border border-gray-100 relative bg-white">
                {riderPos ? (
                  <>
                    {isLoaded && (
                      <GoogleMap
                        center={riderPos ? { lat: riderPos[0], lng: riderPos[1] } : { lat: 0, lng: 0 }}
                        zoom={13}
                        mapContainerStyle={{ height: '100%', width: '100%' }}
                        options={{ disableDefaultUI: true }}
                      >
                        {/* Rider Marker */}
                        {riderPos && (
                          <MarkerF
                            position={{ lat: riderPos[0], lng: riderPos[1] }}
                            icon={{ url: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png', scaledSize: window.google ? new window.google.maps.Size(38, 38) : null }}
                            onClick={() => setActiveMarker('rider')}
                          >
                            {activeMarker === 'rider' && (
                              <InfoWindowF onCloseClick={() => setActiveMarker(null)}>
                                <div className="text-xs font-bold text-center text-black">
                                  <p>{selectedOrder.deliveryBoyId?.name || 'Rider'}</p>
                                  <p className="text-primary-600">Currently Active</p>
                                </div>
                              </InfoWindowF>
                            )}
                          </MarkerF>
                        )}

                        {/* Customer Marker */}
                        {customerPos && (
                          <MarkerF
                            position={{ lat: customerPos[0], lng: customerPos[1] }}
                            icon={{ url: 'https://cdn-icons-png.flaticon.com/512/1275/1275210.png', scaledSize: window.google ? new window.google.maps.Size(38, 38) : null }}
                            onClick={() => setActiveMarker('customer')}
                          >
                            {activeMarker === 'customer' && (
                              <InfoWindowF onCloseClick={() => setActiveMarker(null)}>
                                <div className="text-xs font-bold text-center text-black">
                                  <p>{selectedOrder.customer.name}</p>
                                  <p className="text-gray-500 uppercase er">Delivery Location</p>
                                </div>
                              </InfoWindowF>
                            )}
                          </MarkerF>
                        )}
                      </GoogleMap>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <FiTruck className="text-gray-400 text-xl" />
                    </div>
                    <p className="text-gray-500 font-bold text-sm italic">Waiting for rider live location...</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1  animate-pulse">Live Tracking Active</p>
                  </div>
                )}
                <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-100 shadow-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                  <span className="text-[10px] font-bold uppercase  text-emerald-600">Live Status</span>
                </div>
              </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold uppercase  text-gray-400 mb-2">Delivery Partner</p>
                {selectedOrder.deliveryBoyId ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 gradient-blue text-white rounded-lg flex items-center justify-center font-bold text-sm">
                      {selectedOrder.deliveryBoyId.name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{selectedOrder.deliveryBoyId.name}</p>
                      <p className="text-xs text-blue-600 font-semibold">{selectedOrder.deliveryBoyId.phone}</p>
                    </div>
                    <a href={`tel:${selectedOrder.deliveryBoyId.phone}`} className="p-2 bg-white text-blue-600 rounded-lg shadow-sm border border-blue-50">
                      <FiPhone className="text-sm" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No delivery partner assigned yet</p>
                )}
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold uppercase  text-gray-400 mb-2">Customer Details</p>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-bold text-gray-800">{selectedOrder.customer.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <FiMapPin className="text-[10px]" />
                    {selectedOrder.shippingAddress?.address || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              {getTrackingSteps(selectedOrder.status).map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${step.status === "completed"
                      ? "bg-emerald-100 text-emerald-600 border-2 border-emerald-200"
                      : "bg-gray-100 text-gray-400 border border-gray-200 opacity-50"
                      }`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className={`text-sm font-bold ${step.status === "completed" ? "text-gray-800" : "text-gray-400 opacity-60"}`}>
                        {step.label}
                      </p>
                      {step.status === "completed" && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <FiClock className="text-[10px]" />
                          <p className="text-[10px] text-gray-500 font-bold uppercase ">Updated Successfully</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => navigate(`/admin/orders/${selectedOrder.id}`)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-100 text-gray-400 rounded-2xl text-[10px] font-bold uppercase  hover:bg-white hover:text-black transition-all font-bold"
            >
              <FiPackage />
              Full Order Management
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default OrderTracking;
