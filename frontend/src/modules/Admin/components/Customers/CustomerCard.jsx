import { FiMail, FiPhone, FiShoppingBag, FiDollarSign, FiEye } from 'react-icons/fi';
import Badge from '../../../../shared/components/Badge';
import { formatCurrency } from '../../utils/adminHelpers';

const CustomerCard = ({ customer, onView }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-800 text-lg mb-1 truncate">{customer.name}</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <FiMail className="flex-shrink-0 text-gray-400" />
            <span className="break-all text-[13px] leading-tight" title={customer.email}>
              {customer.email}
            </span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FiPhone className="flex-shrink-0 text-gray-400" />
              <span>{customer.phone}</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
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
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-200">
        <div>
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <FiShoppingBag className="text-sm" />
            <span className="text-xs">Orders</span>
          </div>
          <p className="font-bold text-gray-800">{customer.orders || 0}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <FiDollarSign className="text-sm" />
            <span className="text-xs">Total Spent</span>
          </div>
          <p className="font-bold text-gray-800">
            {formatCurrency(customer.totalSpent || 0)}
          </p>
        </div>
      </div>

      <button
        onClick={() => onView(customer)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold text-sm"
      >
        <FiEye />
        View Details
      </button>
    </div>
  );
};

export default CustomerCard;

