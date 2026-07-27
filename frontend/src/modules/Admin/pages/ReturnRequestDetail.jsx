import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiArrowLeft,
  FiCheck,
  FiX,
  FiPhone,
  FiMail,
  FiPackage,
  FiCalendar,
  FiRefreshCw,
  FiShoppingBag,
  FiDollarSign,
  FiAlertCircle,
  FiEdit
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import { useReturnStore } from '../../../shared/store/returnStore';
import { getAllDeliveryBoys } from '../services/adminService';

const ReturnRequestDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { fetchReturnRequestById, updateReturnStatus, assignReturnDeliveryBoy } = useReturnStore();
  const [returnRequest, setReturnRequest] = useState(null);
  const [onlineRiders, setOnlineRiders] = useState([]);
  const [selectedRider, setSelectedRider] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');
  const statusTransitions = {
    pending: ['approved', 'rejected'],
    approved: ['processing', 'completed'],
    processing: ['completed'],
    rejected: [],
    completed: [],
  };

  useEffect(() => {
    const loadDetail = async () => {
      const data = await fetchReturnRequestById(id);
      if (data) {
        setReturnRequest(data);
        setStatus(data.status);
      } else {
        navigate('/admin/return-requests');
      }
    };
    loadDetail();
  }, [id, navigate, fetchReturnRequestById]);

  useEffect(() => {
    const fetchOnlineRiders = async () => {
      try {
        const res = await getAllDeliveryBoys({ online: 'true' });
        if (res?.data?.deliveryBoys) {
          setOnlineRiders(res.data.deliveryBoys);
        }
      } catch (error) {
        console.error('Error fetching online riders:', error);
      }
    };
    if (returnRequest?.status === 'approved' || returnRequest?.status === 'pending' || returnRequest?.status === 'processing') {
      fetchOnlineRiders();
    }
  }, [returnRequest?.status]);

  const handleStatusUpdate = async (newStatus, action = '') => {
    const statusData = { status: newStatus };

    if (newStatus === 'approved' && action === 'approve') {
      statusData.refundStatus = 'pending';
    } else if (newStatus === 'completed' && action === 'process-refund') {
      statusData.refundStatus = 'processed';
    } else if (newStatus === 'completed' && !action) {
      statusData.refundStatus = 'processed';
    } else if (newStatus === 'approved' && !action) {
      if (returnRequest.refundStatus !== 'processed') {
        statusData.refundStatus = 'pending';
      }
    }

    const updatedReq = await updateReturnStatus(id, statusData);
    if (updatedReq) {
      setReturnRequest(updatedReq);
      setStatus(updatedReq.status);
      setIsEditing(false);
    }
  };

  const handleAssignRider = async () => {
    if (!selectedRider) {
      toast.error('Please select a delivery boy');
      return;
    }
    setIsAssigning(true);
    const updatedReq = await assignReturnDeliveryBoy(id, selectedRider);
    setIsAssigning(false);
    if (updatedReq) {
      setReturnRequest(updatedReq);
    }
  };

  const handleStatusSave = () => {
    if (status !== returnRequest.status) {
      handleStatusUpdate(status);
    } else {
      setIsEditing(false);
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
      processing: 'processing',
      completed: 'completed',
    };
    return statusMap[status] || 'pending';
  };

  if (!returnRequest) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const allowedNextStatuses = statusTransitions[returnRequest.status] || [];
  const editableStatusOptions = [returnRequest.status, ...allowedNextStatuses].map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{returnRequest.id}</h1>
            <p className="text-xs text-gray-500">Requested on {formatDateTime(returnRequest.requestDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <AnimatedSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={editableStatusOptions}
                className="min-w-[140px]"
              />
              <button
                onClick={handleStatusSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
              >
                <FiCheck className="text-sm" />
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStatus(returnRequest.status);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                <FiX className="text-sm" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <Badge variant={getStatusVariant(returnRequest.status)}>{returnRequest.status}</Badge>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold"
              >
                <FiEdit className="text-sm" />
                Edit Status
              </button>
              {returnRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to approve this return request?')) {
                        handleStatusUpdate('approved', 'approve');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
                  >
                    <FiCheck className="text-sm" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to reject this return request?')) {
                        handleStatusUpdate('rejected', 'reject');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
                  >
                    <FiX className="text-sm" />
                    Reject
                  </button>
                </>
              )}
              {(returnRequest.status === 'approved' || returnRequest.status === 'completed') && returnRequest.refundStatus === 'pending' && (
                <button
                  onClick={() => {
                    if (window.confirm('Process refund for this return request?')) {
                      handleStatusUpdate('completed', 'process-refund');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
                >
                  <FiRefreshCw className="text-sm" />
                  Process Refund
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Return Overview */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Return Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Refund Amount</p>
                <p className="font-bold text-gray-800 text-lg">{formatCurrency(returnRequest.refundAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Items</p>
                <p className="font-semibold text-gray-800">{returnRequest.items.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Refund Status</p>
                <Badge variant={returnRequest.refundStatus === 'processed' ? 'success' : returnRequest.refundStatus === 'failed' ? 'error' : 'pending'} className="text-xs">
                  {returnRequest.refundStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Original Order Link */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiShoppingBag className="text-primary-600 text-base" />
              Original Order
            </h2>
            <Link
              to={`/admin/orders/${returnRequest.orderId}`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold text-sm"
            >
              <span>View Order: {returnRequest.orderId}</span>
              <FiArrowLeft className="rotate-180 text-xs" />
            </Link>
          </div>

          {/* Return Items */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Items Being Returned ({returnRequest.items.length})
            </h2>
            <div className="space-y-2">
              {returnRequest.items.map((item, index) => (
                <div key={item.id || index} className="flex items-center gap-3 p-2.5 bg-white rounded-lg">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name || 'Product'}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/100x100?text=Product';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{item.name || 'Unknown Product'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-600">
                        {formatCurrency(item.price || 0)} × {item.quantity || 1}
                      </p>
                      {item.reason && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-sm text-gray-800">
                    {formatCurrency((item.price || 0) * (item.quantity || 1))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Return Reason */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiAlertCircle className="text-primary-600 text-base" />
              Return Reason
            </h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Reason</p>
                <p className="font-semibold text-sm text-gray-800">{returnRequest.reason}</p>
              </div>
              {returnRequest.description && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-700 bg-white p-3 rounded-lg">{returnRequest.description}</p>
                </div>
              )}
              {returnRequest.rejectionReason && (
                <div>
                  <p className="text-xs text-red-500 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{returnRequest.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Verification Photos */}
          {(returnRequest.pickupPhoto || returnRequest.deliveryPhoto) && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiPackage className="text-primary-600 text-base" />
                Delivery Verification Photos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {returnRequest.pickupPhoto && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                      Customer Pickup Photo
                    </p>
                    <div className="aspect-[4/3] rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shadow-sm flex items-center justify-center">
                      <img
                        src={returnRequest.pickupPhoto}
                        alt="Customer Pickup"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
                {returnRequest.deliveryPhoto && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                      Vendor Handover Photo
                    </p>
                    <div className="aspect-[4/3] rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shadow-sm flex items-center justify-center">
                      <img
                        src={returnRequest.deliveryPhoto}
                        alt="Vendor Handover"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customer Information */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiMail className="text-primary-600 text-base" />
              Customer Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Name</p>
                <p className="font-semibold text-sm text-gray-800">{returnRequest.customer.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <a
                  href={`mailto:${returnRequest.customer.email}`}
                  className="font-semibold text-xs text-blue-600 hover:text-blue-800 break-all"
                >
                  {returnRequest.customer.email}
                </a>
              </div>
              {returnRequest.customer.phone && (
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <FiPhone className="text-xs" />
                    Phone
                  </p>
                  <a
                    href={`tel:${returnRequest.customer.phone}`}
                    className="font-semibold text-sm text-gray-800 hover:text-blue-600"
                  >
                    {returnRequest.customer.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* OTP Verification Codes */}
          {(returnRequest.pickupOtpDebug || returnRequest.deliveryOtpDebug || (returnRequest.vendorDropoffs && returnRequest.vendorDropoffs.length > 0)) && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiAlertCircle className="text-amber-500 text-base" />
                OTP Verification Codes
              </h2>
              <div className="space-y-3">
                {returnRequest.pickupOtpDebug && (
                  <div className="flex justify-between items-center bg-blue-50 p-2 rounded-lg border border-blue-100">
                    <span className="text-xs font-semibold text-blue-800">Customer Pickup:</span>
                    <span className="text-sm font-black tracking-widest text-blue-900">{returnRequest.pickupOtpDebug}</span>
                  </div>
                )}
                {returnRequest.deliveryOtpDebug && !returnRequest.isMultiVendor && (
                  <div className="flex justify-between items-center bg-green-50 p-2 rounded-lg border border-green-100">
                    <span className="text-xs font-semibold text-green-800">Vendor Dropoff:</span>
                    <span className="text-sm font-black tracking-widest text-green-900">{returnRequest.deliveryOtpDebug}</span>
                  </div>
                )}
                {returnRequest.isMultiVendor && returnRequest.vendorDropoffs && returnRequest.vendorDropoffs.map((vd, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-amber-50 p-2 rounded-lg border border-amber-100">
                    <span className="text-xs font-semibold text-amber-800 line-clamp-1 max-w-[120px]">{vd.vendorName || `Vendor ${idx+1}`}:</span>
                    <span className="text-sm font-black tracking-widest text-amber-900">{vd.dropoffOtpDebug}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Assign Delivery Boy */}
          {(returnRequest.status === 'approved' || returnRequest.status === 'pending' || returnRequest.status === 'processing') && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiPackage className="text-primary-600 text-base" />
                {returnRequest.deliveryBoyId ? 'Assigned Delivery Boy' : 'Assign Delivery Boy'}
              </h2>
              
              {returnRequest.deliveryBoyId && (
                <div className="mb-4 bg-primary-50 p-3 rounded-lg border border-primary-100">
                  <p className="text-xs font-bold text-primary-800 flex items-center gap-1.5 mb-1">
                    <FiCheck className="text-sm" /> Currently Assigned:
                  </p>
                  <p className="text-sm font-black text-gray-800">
                    {typeof returnRequest.deliveryBoyId === 'object' 
                      ? returnRequest.deliveryBoyId.name 
                      : 'Rider Assigned'}
                  </p>
                  {typeof returnRequest.deliveryBoyId === 'object' && returnRequest.deliveryBoyId.phone && (
                    <p className="text-xs text-gray-600 mt-0.5">{returnRequest.deliveryBoyId.phone}</p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-semibold mb-1">
                  {returnRequest.deliveryBoyId ? 'Reassign to another Rider:' : 'Select Rider:'}
                </p>
                {onlineRiders.length > 0 ? (
                  <>
                    <select
                      value={selectedRider}
                      onChange={(e) => setSelectedRider(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="">Select Online Rider</option>
                      {onlineRiders.map((rider) => (
                        <option key={rider.id || rider._id} value={rider.id || rider._id}>
                          {rider.name} ({rider.phone}) - ₹{rider.stats?.cashInHand || 0} In Hand
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignRider}
                      disabled={isAssigning}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-primary-300 transition-colors text-xs font-semibold"
                    >
                      {isAssigning ? 'Assigning...' : returnRequest.deliveryBoyId ? 'Reassign Rider' : 'Assign Rider'}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">No online delivery boys available.</p>
                )}
              </div>
            </div>
          )}

          {/* Refund Summary */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiDollarSign className="text-primary-600 text-base" />
              Refund Summary
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items Total</span>
                <span className="font-semibold">
                  {formatCurrency(
                    returnRequest.items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
                  )}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Refund Amount</span>
                <span className="font-bold text-lg text-gray-800">{formatCurrency(returnRequest.refundAmount)}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Refund Status</p>
                <Badge variant={returnRequest.refundStatus === 'processed' ? 'success' : returnRequest.refundStatus === 'failed' ? 'error' : 'pending'}>
                  {returnRequest.refundStatus}
                </Badge>
              </div>
              {returnRequest.upiId && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Customer UPI ID</p>
                  <p className="font-bold text-sm text-gray-800 bg-green-50 p-2 rounded-lg border border-green-100 break-all">{returnRequest.upiId}</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiCalendar className="text-primary-600 text-base" />
              Status Timeline
            </h2>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Request Submitted</p>
                  <p className="text-xs text-gray-500">{formatDateTime(returnRequest.requestDate)}</p>
                </div>
              </div>
              {returnRequest.status === 'approved' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Approved</p>
                    <p className="text-xs text-gray-500">{formatDateTime(returnRequest.updatedAt)}</p>
                  </div>
                </div>
              )}
              {returnRequest.status === 'processing' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Processing</p>
                    <p className="text-xs text-gray-500">{formatDateTime(returnRequest.updatedAt)}</p>
                  </div>
                </div>
              )}
              {returnRequest.status === 'completed' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Completed</p>
                    <p className="text-xs text-gray-500">{formatDateTime(returnRequest.updatedAt)}</p>
                  </div>
                </div>
              )}
              {returnRequest.status === 'rejected' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Rejected</p>
                    <p className="text-xs text-gray-500">{formatDateTime(returnRequest.updatedAt)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              <Link
                to={`/admin/orders/${returnRequest.orderId}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold"
              >
                <FiShoppingBag className="text-sm" />
                View Original Order
              </Link>
              <button
                onClick={() => window.location.href = `mailto:${returnRequest.customer.email}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
              >
                <FiMail className="text-sm" />
                Email Customer
              </button>
              {returnRequest.customer.phone && (
                <button
                  onClick={() => window.location.href = `tel:${returnRequest.customer.phone}`}
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

export default ReturnRequestDetail;

