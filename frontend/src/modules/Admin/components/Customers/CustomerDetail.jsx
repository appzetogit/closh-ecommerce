import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiX, FiMail, FiPhone, FiMapPin, FiShoppingBag, FiDollarSign, FiClock, FiEdit, FiCreditCard } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerStore } from '../../../../shared/store/customerStore';
import Badge from '../../../../shared/components/Badge';
import { formatCurrency, formatDateTime } from '../../utils/adminHelpers';

const CustomerDetail = ({ customer, onClose, onUpdate, startEditing = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');
  const { updateCustomer, toggleCustomerStatus, addActivity } = useCustomerStore();
  const [isEditing, setIsEditing] = useState(startEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: customer.name,
    phone: customer.phone || '',
  });

  useEffect(() => {
    setIsEditing(Boolean(startEditing));
  }, [startEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateCustomer(customer.id, {
        name: formData.name,
        phone: formData.phone,
      });
      addActivity(customer.id, {
        type: 'update',
        description: 'Customer information updated',
      });
      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = async () => {
    if (isSubmitting) return;
    const newStatus = customer.status === 'active' ? 'blocked' : 'active';
    setIsSubmitting(true);
    try {
      await toggleCustomerStatus(customer.id);
      addActivity(customer.id, {
        type: 'status_change',
        description: `Customer status changed to ${newStatus}`,
      });
      onUpdate?.();
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[10000]"
        />
        
          {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex ${isAppRoute ? 'items-start pt-[10px]' : 'items-end'} sm:items-center justify-center p-4 pointer-events-none`}
          >
            <motion.div
              variants={{
                hidden: { 
                  y: isAppRoute ? '-100%' : '100%',
                  scale: 0.95,
                  opacity: 0
                },
                visible: { 
                  y: 0,
                  scale: 1,
                  opacity: 1,
                  transition: { 
                    type: 'spring',
                    damping: 22,
                    stiffness: 350,
                    mass: 0.7
                  }
                },
                exit: { 
                  y: isAppRoute ? '-100%' : '100%',
                  scale: 0.95,
                  opacity: 0,
                  transition: { 
                    type: 'spring',
                    damping: 30,
                    stiffness: 400
                  }
                }
              }}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className={`bg-white ${isAppRoute ? 'rounded-b-3xl' : 'rounded-t-3xl'} sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-admin pointer-events-auto`}
              style={{ willChange: 'transform' }}
            >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-800">Customer Details</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FiX className="text-xl text-gray-600" />
              </button>
            </div>

        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="text-2xl font-bold text-gray-800 mb-2 px-3 py-1 border border-gray-300 rounded-lg"
                  />
                ) : (
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">{customer.name}</h3>
                )}
                <Badge
                  variant={
                    customer.status === 'active'
                      ? 'success'
                      : customer.status === 'deleted'
                        ? 'pending'
                        : 'error'
                  }
                >
                  {customer.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setFormData({
                          name: customer.name,
                          phone: customer.phone || '',
                        });
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {customer.status !== 'deleted' && (
                      <button
                        onClick={handleStatusToggle}
                        disabled={isSubmitting}
                        className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                          customer.status === 'active'
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {customer.status === 'active' ? 'Block' : 'Unblock'}
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditing(true)}
                      disabled={customer.status === 'deleted'}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FiEdit />
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <FiMail className="text-gray-400" />
                <span className="text-gray-700">{customer.email}</span>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <FiPhone className="text-gray-400" />
                  {isEditing ? (
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="flex-1 px-3 py-1 border border-gray-300 rounded-lg"
                    />
                  ) : (
                    <span className="text-gray-700">{customer.phone}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <FiShoppingBag />
                <span className="text-sm font-semibold">Total Orders</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{customer.orders || 0}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <FiDollarSign />
                <span className="text-sm font-semibold">Total Spent</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {formatCurrency(customer.totalSpent || 0)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <FiClock />
                <span className="text-sm font-semibold">Last Order</span>
              </div>
              <p className="text-sm font-semibold text-gray-800">
                {customer.lastOrderDate
                  ? formatDateTime(customer.lastOrderDate)
                  : 'No orders yet'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => {
                navigate(`/admin/customers/${customer.id}?tab=orders`);
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold text-sm"
            >
              <FiShoppingBag />
              <span>View Orders</span>
            </button>
            <button
              onClick={() => {
                navigate(`/admin/customers/${customer.id}?tab=transactions`);
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
            >
              <FiCreditCard />
              <span>View Transactions</span>
            </button>
            <button
              onClick={() => {
                navigate(`/admin/customers/${customer.id}?tab=addresses`);
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm"
            >
              <FiMapPin />
              <span>View Addresses</span>
            </button>
          </div>

          {/* Activity History */}
          {customer.activityHistory && customer.activityHistory.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Activity History</h3>
              <div className="space-y-2">
                {customer.activityHistory.slice(0, 10).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 bg-white rounded-lg"
                  >
                    <div className="w-2 h-2 bg-primary-600 rounded-full mt-2"></div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(activity.date)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default CustomerDetail;

