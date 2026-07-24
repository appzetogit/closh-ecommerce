import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiEdit,
  FiCheck,
  FiX,
  FiPhone,
  FiMapPin,
  FiCreditCard,
  FiTruck,
  FiCalendar,
  FiTag,
  FiPackage,
  FiClock,
  FiMail,
  FiCamera,
  FiPrinter,
  FiShoppingBag
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import { getOrderById, updateOrderStatus, getAllDeliveryBoys, assignDeliveryBoy, getNearbyRiders } from '../services/adminService';
import socketService from '../../../shared/utils/socket';

const CountdownTimer = ({ assignedAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const startTime = assignedAt ? new Date(assignedAt).getTime() : Date.now();
    const endTime = startTime + 120000;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        if (onExpire) onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [assignedAt, onExpire]);

  if (timeLeft === 0) return <span className="text-red-500 font-bold ml-2 text-xs">(Expired - Switching...)</span>;

  return (
    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded ml-2 font-mono text-xs font-bold animate-pulse">
      <FiClock className="text-[10px]" /> 
      {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
    </span>
  );
};
import { formatVariantLabel } from '../../../shared/utils/variant';
import toast from 'react-hot-toast';
import { IMAGE_BASE_URL } from '../../../shared/utils/constants';

const getFullImageUrl = (image) => {
    if (!image) return null;
    if (image.startsWith('http') || image.startsWith('data:')) return image;
    const cleanImage = image.startsWith('/') ? image : `/${image}`;
    return `${IMAGE_BASE_URL}${cleanImage}`;
};

const OrderDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');

  const [isLoading, setIsLoading] = useState(true);

  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [isAssigningRider, setIsAssigningRider] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  
  const [urgentAlert, setUrgentAlert] = useState(null);



  const handleAssignRider = async () => {
    if (!selectedRiderId) {
      toast.error("Please select a delivery partner");
      return;
    }
    setIsAssigningRider(true);
    try {
      await assignDeliveryBoy(order.id, selectedRiderId);
      toast.success("Delivery partner assigned successfully!");
      // Reload order data to reflect assignment
      const response = await getOrderById(id);
      const o = response.data;
      const normalizedOrder = {
        ...o,
        id: o.orderId || o._id,
        customer: {
          name: o.userId?.name || 'Unknown',
          email: o.userId?.email || '',
          phone: o.userId?.phone || ''
        },
        date: o.createdAt
      };
      setOrder(normalizedOrder);
      setIsReassigning(false);
    } catch (err) {
      console.error("Rider assignment error:", err);
      toast.error("Failed to assign delivery partner");
    } finally {
      setIsAssigningRider(false);
    }
  };

  useEffect(() => {
    const fetchOrderData = async () => {
      setIsLoading(true);
      try {
        const response = await getOrderById(id);
        const o = response.data;

        // Normalize data to match UI structure
        const normalizedOrder = {
          ...o,
          id: o.orderId || o._id,
          customer: {
            name: o.userId?.name || 'Unknown',
            email: o.userId?.email || '',
            phone: o.userId?.phone || ''
          },
          date: o.createdAt
        };

        setOrder(normalizedOrder);
        setStatus(o.status);

        // Fetch nearby riders for manual assignment dropdown
        try {
            const ridersRes = await getNearbyRiders(o._id || o.orderId);
            if (ridersRes?.data?.riders) {
                setDeliveryBoys(ridersRes.data.riders);
            }
        } catch (err) {
            console.error("Error fetching nearby riders:", err);
        }

      } catch (error) {
        console.error("Fetch order detail error:", error);
        toast.error('Order not found');
        navigate('/admin/orders/all-orders');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchOrderData();
    }
  }, [id, navigate]);

  useEffect(() => {
    // Connect to admin room to receive live assignment updates
    socketService.connect();
    socketService.joinRoom('admin');

    const handleAutoAssign = (data) => {
      if (order && (data.orderId === order.orderId || data.orderId === order.id)) {
        // Silently refresh the order details when a new rider is auto-assigned
        getOrderById(id).then(res => {
          setOrder(res.data);
          setStatus(res.data.status);
          setSelectedRiderId(res.data.deliveryBoyId?._id || res.data.deliveryBoyId?.id || '');
          setUrgentAlert(null); // Clear alert on assign
        }).catch(err => console.error(err));
      }
    };

    const handleUrgentAlert = (data) => {
      if (order && (data.orderId === order.orderId || data.orderId === order.id)) {
        setUrgentAlert(data);
        if (data.nearbyRiders) {
          setDeliveryBoys(data.nearbyRiders);
        }
      }
    };

    socketService.on('admin_order_assigned', handleAutoAssign);
    socketService.on('admin_no_rider_alert', handleUrgentAlert);

    return () => {
      socketService.off('admin_order_assigned', handleAutoAssign);
      socketService.off('admin_no_rider_alert', handleUrgentAlert);
    };
  }, [id, order]);

  const handleStatusUpdate = async () => {
    try {
      await updateOrderStatus(id, status);
      setOrder({ ...order, status });
      setIsEditing(false);
      toast.success('Order status updated successfully');
    } catch (error) {
      console.error("Status update error:", error);
    }
  };

  if (isLoading || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const statusOptions = ['pending', 'processing', 'ready_for_delivery', 'assigned', 'shipped', 'delivered', 'cancelled', 'returned'];

  // Handle items - could be a number or an array
  const itemsCount = Array.isArray(order.items) ? order.items.length : (typeof order.items === 'number' ? order.items : 0);
  const itemsArray = Array.isArray(order.items) ? order.items : [];

  // Calculate order breakdown
  const subtotal = order.subtotal ?? (order.total * 0.95);
  const shipping = order.shipping ?? (order.total * 0.05);
  const tax = order.tax ?? 0;
  const discount = order.discount ?? 0;
  const platformFee = order.platformFee ?? 0;

  // Get payment method display name
  const getPaymentMethodName = (method) => {
    if (!method) return 'N/A';
    const methods = {
      card: 'Credit/Debit Card',
      cash: 'Cash on Delivery',
      upi: 'UPI',
      wallet: 'Digital Wallet',
      bank: 'Bank Transfer'
    };
    return methods[method.toLowerCase()] || method;
  };

  // Resolve product image safely from the order payload
  const getProductImage = (item) => {
    if (item.image) {
      return getFullImageUrl(item.image);
    }
    if (item.productId?.images?.[0]) {
      return getFullImageUrl(item.productId.images[0]);
    }

    return 'https://via.placeholder.com/100x100?text=Product';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2 lg:hidden">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{order.id}</h1>
              {order.orderType && order.orderType !== 'standard' && (
                <span className={`px-2 py-0.5 ${order.orderType === 'try_and_buy' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-blue-50 text-blue-700 border-blue-100'} text-[10px] font-bold rounded-lg border uppercase er shadow-sm animate-pulse`}>
                  {order.orderType.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{formatDateTime(order.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleStatusUpdate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <FiCheck className="text-sm" />
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStatus(order.status);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                <FiX className="text-sm" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate(`/admin/orders/${id}/invoice`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-bold"
              >
                <FiPrinter className="text-sm" />
                View Invoice
              </button>
              <Badge variant={order.status}>{order.status}</Badge>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
              >
                <FiEdit className="text-sm" />
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Main Content */}
        <div className="flex-1 space-y-4">
          
          {/* Urgent Banner if No Rider Found */}
          {urgentAlert && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-pulse">
              <div className="text-3xl">🚨</div>
              <div className="flex-1">
                <h3 className="text-red-800 font-bold">Urgent: No Delivery Partner Found!</h3>
                <p className="text-red-600 text-sm mt-1">This order has been searching for {urgentAlert.searchingFor}. Please assign a rider manually from the list below.</p>
              </div>
            </div>
          )}

          {/* Customer & Order Info Card */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            {isEditing ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Order Status
                </label>
                <AnimatedSelect
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={statusOptions.map((option) => ({
                    value: option,
                    label: (option.charAt(0).toUpperCase() + option.slice(1)).replace(/_/g, ' '),
                  }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Total</p>
                  <p className="font-bold text-gray-800 text-lg">{formatCurrency(order.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Items</p>
                  <p className="font-semibold text-gray-800">{itemsCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Payment</p>
                  <p className="text-xs font-semibold text-gray-800 capitalize">
                    {getPaymentMethodName(order.paymentMethod)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Payment Status</p>
                  <Badge variant={order.paymentStatus === 'paid' ? 'delivered' : order.paymentStatus === 'pending' ? 'pending' : 'cancelled'} className="text-xs">
                    {order.paymentStatus || (order.paymentMethod === 'cash' ? 'Pending' : 'Paid')}
                  </Badge>
                </div>
                {(order.paymentMethod === 'cod' || order.paymentMethod === 'cash') && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Cash Settlement</p>
                    <Badge variant={order.isCashSettled ? 'delivered' : 'pending'} className="text-[10px] font-bold uppercase">
                      {order.isCashSettled ? 'Settled to Office' : 'Pending Settlement'}
                    </Badge>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Vendor Settlement</p>
                  {(() => {
                    const commissions = order.commissions || [];
                    if (commissions.length === 0) return <span className="text-[10px] font-bold text-gray-400">N/A</span>;
                    const allPaid = commissions.every(c => c.status === 'paid');
                    const somePaid = commissions.some(c => c.status === 'paid');
                    const anyCancelled = commissions.some(c => c.status === 'cancelled');
                    
                    if (allPaid) return <Badge variant="delivered" className="text-[10px] font-bold uppercase">Settled</Badge>;
                    if (anyCancelled) return <Badge variant="cancelled" className="text-[10px] font-bold uppercase">Cancelled</Badge>;
                    if (somePaid) return <Badge variant="pending" className="text-[10px] font-bold uppercase">Partially Settled</Badge>;
                    return <Badge variant="pending" className="text-[10px] font-bold uppercase">Pending Settlement</Badge>;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Return Requests Section */}
          {order.returnRequests && order.returnRequests.length > 0 && (
            <div className="bg-rose-50 rounded-lg p-4 shadow-sm border border-rose-100 mb-6">
              <h2 className="text-sm font-bold text-rose-800 mb-3 flex items-center gap-1.5">
                <FiPackage className="text-rose-600 text-base" />
                Return Requests
              </h2>
              <div className="space-y-3">
                {order.returnRequests.map((req) => (
                  <div key={req._id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-rose-100">
                    <div>
                      <p className="text-xs font-bold text-gray-800">
                        Request #{String(req._id).slice(-6).toUpperCase()} - {req.reason}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Requested on {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={req.status === 'completed' ? 'delivered' : req.status === 'rejected' ? 'cancelled' : 'pending'} className="text-[10px] font-bold uppercase">
                        {req.status}
                      </Badge>
                      <button
                        onClick={() => navigate(`/admin/return-requests/${req._id}`)}
                        className="text-xs font-bold text-rose-600 hover:underline"
                      >
                        View Detail
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Items */}
          {itemsArray.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiPackage className="text-primary-600 text-base" />
                Order Items ({itemsCount})
              </h2>
              <div className="space-y-2">
                {itemsArray.map((item) => (
                  <div key={item.id || item.name} className="flex items-center gap-3 p-2.5 bg-white rounded-lg">
                    <img
                      src={getProductImage(item)}
                      alt={item.name || 'Product'}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/100x100?text=Product';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{item.name || 'Unknown Product'}</p>
                      <p className="text-[10px] text-primary-600 font-bold uppercase tracking-wider mt-0.5 mb-1 flex items-center gap-1">
                        <FiShoppingBag className="text-[10px]" />
                        <span>Store: {item.vendorId?.storeName || item.vendorName || 
                         order.vendorItems?.find(vi => (vi.vendorId?._id || vi.vendorId) === (item.vendorId?._id || item.vendorId))?.vendorName || 
                         order.vendorItems?.[0]?.vendorId?.storeName || 
                         order.vendorItems?.[0]?.vendorName || 'Closh Partner'}</span>
                      </p>
                      <p className="text-xs text-gray-600">
                        {formatCurrency(item.price || 0)} x {item.quantity || 1}
                      </p>
                      {formatVariantLabel(item.variant) && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatVariantLabel(item.variant)}
                        </p>
                      )}
                    </div>
                    <p className="font-bold text-sm text-gray-800">
                      {formatCurrency((item.price || 0) * (item.quantity || 1))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor Information Card */}
          {order.vendorItems && order.vendorItems.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <FiShoppingBag className="text-primary-600 text-base" />
                Vendor Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {order.vendorItems.map((vi, idx) => (
                  <div key={idx} className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">Store Name</p>
                      <p className="font-semibold text-sm text-gray-800">
                        {vi.vendorId?.storeName || vi.vendorName || 'N/A'}
                      </p>
                    </div>
                    {vi.vendorId?.phone && (
                      <div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FiPhone className="text-xs" />
                          Phone
                        </p>
                        <p className="font-semibold text-xs text-gray-800">{vi.vendorId.phone}</p>
                      </div>
                    )}
                    {vi.vendorId?.shopAddress && (
                      <div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FiMapPin className="text-xs" />
                          Address
                        </p>
                        <p className="font-semibold text-xs text-gray-800 truncate">{vi.vendorId.shopAddress}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Order Status</p>
                      <div className="mt-0.5">
                        <Badge variant={vi.status}>{vi.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer & Shipping Combined Card */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Info */}
              <div>
                <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                  <FiMail className="text-primary-600 text-base" />
                  Customer
                </h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Name</p>
                    <p className="font-semibold text-sm text-gray-800">
                      {(() => {
                        const customerName = order.customer?.name || order.userId?.name || order.guestInfo?.name || 'N/A';
                        const shippingNameRaw = order.shippingAddress?.name || '';
                        return ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-semibold text-xs text-gray-800 break-all">{order.customer?.email || order.shippingAddress?.email || 'N/A'}</p>
                  </div>
                  {(order.customer?.phone || order.shippingAddress?.phone) && (
                    <div>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <FiPhone className="text-xs" />
                        Phone
                      </p>
                      <p className="font-semibold text-sm text-gray-800">{order.customer?.phone || order.shippingAddress?.phone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Address */}
              {order.shippingAddress && (
                <div>
                  <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                    <FiMapPin className="text-primary-600 text-base" />
                    Shipping Address
                  </h2>
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-800">
                      {(() => {
                        const customerName = order.customer?.name || order.userId?.name || order.guestInfo?.name || 'N/A';
                        const shippingNameRaw = order.shippingAddress?.name || '';
                        return ['home', 'work', 'other'].includes(shippingNameRaw.toLowerCase()) ? customerName : (shippingNameRaw || customerName);
                      })()}
                    </p>
                    {order.shippingAddress.address && (
                      <p className="text-gray-700">{order.shippingAddress.address}</p>
                    )}
                    {(order.shippingAddress.city || order.shippingAddress.state || order.shippingAddress.zipCode) && (
                      <p className="text-gray-700">
                        {[
                          order.shippingAddress.city,
                          order.shippingAddress.state,
                          order.shippingAddress.zipCode
                        ].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {order.shippingAddress.country && (
                      <p className="text-gray-700">{order.shippingAddress.country}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Special Instructions (Try & Buy / Check & Buy) */}
            {order.deliveryType && order.deliveryType !== 'standard' && (
              <div className={`mt-4 p-3 rounded-lg border-l-4 ${order.deliveryType === 'try_and_buy' ? 'bg-orange-50 border-orange-500' : 'bg-blue-50 border-blue-500'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FiClock className={order.deliveryType === 'try_and_buy' ? 'text-orange-600' : 'text-blue-600'} />
                  <h2 className="text-sm font-bold uppercase text-gray-800">
                    {order.deliveryType.replace(/_/g, ' ')} Instruction
                  </h2>
                </div>
                <p className="text-xs text-gray-600 font-medium">
                  {order.deliveryType === 'try_and_buy'
                    ? "Rider will wait for the customer to try the clothes. Returns may be handled on the spot."
                    : "Rider will allow the customer to inspect the package before finalizing the delivery."}
                </p>
              </div>
            )}
          </div>

          {/* Tracking & Delivery Compact */}
          {(order.trackingNumber || order.deliveredDate || order.deliveredAt) && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <FiTruck className="text-primary-600 text-base" />
                Tracking & Delivery
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {order.trackingNumber && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Tracking Number</p>
                    <p className="font-semibold text-xs text-gray-800 font-mono">{order.trackingNumber}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                    <FiClock className="text-xs" />
                    Delivery Type
                  </p>
                  <p className="font-semibold text-xs text-primary-600 uppercase">Instant (60 Mins)</p>
                </div>
                {(order.deliveredDate || order.deliveredAt) && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                      <FiPackage className="text-xs" />
                      Delivered
                    </p>
                    <p className="font-semibold text-xs text-gray-800">
                      {formatDateTime(order.deliveredDate || order.deliveredAt)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Proof & Verification Gallery */}
          {(order.readyPhoto || order.pickupPhoto || order.deliveryPhoto || order.openBoxPhoto || 
            order.deliveryFlow?.pickupPhoto || order.deliveryFlow?.deliveryProofPhoto || order.deliveryFlow?.openBoxPhoto) && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <FiCamera className="text-primary-600 text-base" />
                Proof & Verification Photos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {order.readyPhoto && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Package Ready</p>
                    <div className="relative aspect-video bg-gray-50 rounded-lg overflow-hidden border border-gray-200 group">
                      <img
                        src={getFullImageUrl(order.readyPhoto)}
                        alt="Ready Proof"
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => window.open(getFullImageUrl(order.readyPhoto), '_blank')}
                      />
                    </div>
                  </div>
                )}
                {(order.pickupPhoto || order.deliveryFlow?.pickupPhoto) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pickup Proof</p>
                    <div className="relative aspect-video bg-gray-50 rounded-lg overflow-hidden border border-gray-200 group">
                      <img
                        src={getFullImageUrl(order.pickupPhoto || order.deliveryFlow?.pickupPhoto)}
                        alt="Pickup Proof"
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => window.open(getFullImageUrl(order.pickupPhoto || order.deliveryFlow?.pickupPhoto), '_blank')}
                      />
                    </div>
                  </div>
                )}
                {(order.deliveryPhoto || order.deliveryFlow?.deliveryProofPhoto) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Delivery Proof</p>
                    <div className="relative aspect-video bg-gray-50 rounded-lg overflow-hidden border border-gray-200 group">
                      <img
                        src={getFullImageUrl(order.deliveryPhoto || order.deliveryFlow?.deliveryProofPhoto)}
                        alt="Delivery Proof"
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => window.open(getFullImageUrl(order.deliveryPhoto || order.deliveryFlow?.deliveryProofPhoto), '_blank')}
                      />
                    </div>
                  </div>
                )}
                {(order.openBoxPhoto || order.deliveryFlow?.openBoxPhoto) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Open Box Proof</p>
                    <div className="relative aspect-video bg-gray-50 rounded-lg overflow-hidden border border-gray-200 group">
                      <img
                        src={getFullImageUrl(order.openBoxPhoto || order.deliveryFlow?.openBoxPhoto)}
                        alt="Open Box Proof"
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => window.open(getFullImageUrl(order.openBoxPhoto || order.deliveryFlow?.openBoxPhoto), '_blank')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Delivery Partner Assignment Card */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:border-primary-200 transition-all duration-300 relative overflow-hidden group">
            {/* Top gradient highlight for premium aesthetic */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary-400 to-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
            
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiTruck className="text-primary-600 text-lg animate-bounce-slow" />
              Delivery Partner
            </h2>

            {order.deliveryBoyId && !isReassigning ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2 bg-gradient-to-br from-primary-50/50 to-indigo-50/30 rounded-xl border border-primary-50">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 text-base shadow-sm uppercase">
                    {order.deliveryBoyId.name?.slice(0, 2) || "R"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{order.deliveryBoyId.name}</p>
                    <p className="text-xs text-gray-500 font-medium">Active Partner</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-gray-600 px-1">
                  {order.deliveryBoyId.phone && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-400 flex items-center gap-1"><FiPhone className="text-gray-400" /> Phone</span>
                      <a href={`tel:${order.deliveryBoyId.phone}`} className="font-semibold text-primary-600 hover:underline">{order.deliveryBoyId.phone}</a>
                    </div>
                  )}
                  {order.deliveryBoyId.vehicleNumber && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-400 flex items-center gap-1"><FiPackage className="text-gray-400" /> Vehicle</span>
                      <span className="font-semibold text-gray-800 uppercase bg-gray-100 px-1.5 py-0.5 rounded text-[10px] tracking-wide">{order.deliveryBoyId.vehicleNumber} ({order.deliveryBoyId.vehicleType || "Bike"})</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-400">Order Status</span>
                    <div className="flex items-center">
                      <Badge variant={order.status}>{order.status}</Badge>
                      {order.status === 'assigned' && (
                        <CountdownTimer 
                           assignedAt={order.assignedAt || order.updatedAt} 
                           onExpire={() => {
                             // Just optimistically change status to Searching if it expired
                             // Real update will come via socket 'admin_order_assigned' shortly after
                           }} 
                        />
                      )}
                    </div>
                  </div>
                </div>

                {['pending', 'processing', 'ready_for_pickup', 'all_vendors_ready', 'assigned'].includes(order.status) && (
                  <button
                    onClick={() => {
                      setSelectedRiderId(order.deliveryBoyId._id || order.deliveryBoyId.id || '');
                      setIsReassigning(true);
                    }}
                    className="w-full mt-2 py-2 px-3 text-xs font-semibold rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-all duration-200 text-center flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <FiEdit className="text-xs text-gray-500" />
                    Reassign Partner
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  {isReassigning 
                    ? "Select a new delivery partner to reassign this order." 
                    : "No delivery partner is assigned yet. Select an active rider to dispatch this order."}
                </p>

                <div className="relative">
                  <select
                    value={selectedRiderId}
                    onChange={(e) => setSelectedRiderId(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg p-2.5 outline-none text-gray-700 font-medium transition-all"
                  >
                    <option value="">Select Delivery Partner</option>
                    {deliveryBoys.map((boy) => (
                      <option key={boy._id} value={boy._id}>
                        {boy.name} ({boy.phone || "No Phone"}) {boy.distance !== undefined ? `- ${boy.distance}km away` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  {isReassigning && (
                    <button
                      onClick={() => setIsReassigning(false)}
                      disabled={isAssigningRider}
                      className="flex-1 py-2 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleAssignRider}
                    disabled={isAssigningRider || !selectedRiderId}
                    className="flex-[2] py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:from-primary-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed text-center"
                  >
                    {isAssigningRider ? "Assigning..." : (isReassigning ? "Confirm Reassign" : "Assign Rider")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Order Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span className="flex items-center gap-1">
                    <FiTag className="text-xs" />
                    Discount
                    {order.couponCode && (
                      <span className="text-xs bg-green-100 px-1.5 py-0.5 rounded">({order.couponCode})</span>
                    )}
                  </span>
                  <span className="font-semibold">-{formatCurrency(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 text-xs mt-0.5">Tax (Included)</span>
                  <span className="font-semibold text-gray-500 text-xs mt-0.5">{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-semibold">{formatCurrency(shipping)}</span>
              </div>
              {platformFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Platform Fee</span>
                  <span className="font-semibold">{formatCurrency(platformFee)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Total</span>
                <span className="font-bold text-lg text-gray-800">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Order Timeline */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
              <FiCalendar className="text-primary-600 text-base" />
              Timeline
            </h2>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Order Placed</p>
                  <p className="text-xs text-gray-500">{formatDateTime(order.date)}</p>
                </div>
              </div>
              {order.status === 'processing' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Processing</p>
                    <p className="text-xs text-gray-500">Being prepared</p>
                  </div>
                </div>
              )}
              {order.status === 'shipped' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Shipped</p>
                    {order.shippedDate && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.shippedDate)}</p>
                    )}
                  </div>
                </div>
              )}
              {order.status === 'delivered' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Delivered</p>
                    {(order.deliveredDate || order.deliveredAt) && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.deliveredDate || order.deliveredAt)}</p>
                    )}
                  </div>
                </div>
              )}
              {order.status === 'cancelled' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Cancelled</p>
                    {(order.cancelledDate || order.cancelledAt) && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.cancelledDate || order.cancelledAt)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              {order.trackingNumber && (
                <button
                  onClick={() => navigate(`/admin/orders/order-tracking?orderId=${order.id}`)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold"
                >
                  <FiTruck className="text-sm" />
                  Track Order
                </button>
              )}
              {order.customer?.email && (
                <button
                  onClick={() => window.location.href = `mailto:${order.customer.email}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
                >
                  <FiMail className="text-sm" />
                  Email Customer
                </button>
              )}
              {(order.customer?.phone || order.shippingAddress?.phone) && (
                <button
                  onClick={() => window.location.href = `tel:${order.customer?.phone || order.shippingAddress?.phone}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
                >
                  <FiPhone className="text-sm" />
                  Call Customer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OrderDetail;

