import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useCustomerStore } from '../../../../shared/store/customerStore';
import CustomerCard from '../../components/Customers/CustomerCard';
import CustomerDetail from '../../components/Customers/CustomerDetail';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import AnimatedSelect from '../../components/AnimatedSelect';
import { formatPrice } from '../../../../shared/utils/helpers';

const ViewCustomers = () => {
  const { customers, pagination, initialize } = useCustomerStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [startInEditMode, setStartInEditMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const params = {
      page: currentPage,
      limit: itemsPerPage,
      search: searchQuery,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
    };
    initialize(params);
  }, [currentPage, searchQuery, selectedStatus, initialize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus]);

  const handleViewCustomer = (customer, editMode = false) => {
    setSelectedCustomer(customer);
    setStartInEditMode(editMode);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedCustomer(null);
    setStartInEditMode(false);
    if (searchParams.get('edit')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      });
    }
  };

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || customers.length === 0 || showDetail) return;
    const target = customers.find((customer) => String(customer.id) === String(editId));
    if (!target) return;
    handleViewCustomer(target, true);
  }, [customers, searchParams, showDetail]);

  const columns = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      sortable: false,
      render: (value) => value || 'N/A',
    },
    {
      key: 'orders',
      label: 'Orders',
      sortable: true,
      render: (value) => value || 0,
    },
    {
      key: 'totalSpent',
      label: 'Total Spent',
      sortable: true,
      render: (value) => formatPrice(value || 0),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${value === 'active'
            ? 'bg-green-100 text-green-800'
            : value === 'deleted'
              ? 'bg-gray-200 text-gray-600'
              : 'bg-red-100 text-red-800'
            }`}
        >
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => handleViewCustomer(row)}
          className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">View Customers</h1>
          <p className="text-sm sm:text-base text-gray-600">Browse and manage customer information</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'deleted', label: 'Deleted' },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />

          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded text-sm font-medium transition-colors ${viewMode === 'grid'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600'
                }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded text-sm font-medium transition-colors ${viewMode === 'table'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600'
                }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {customers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {customers.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  onView={handleViewCustomer}
                />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              className="mt-6"
            />
          </>
        ) : (
          <DataTable
            data={customers}
            columns={columns}
            pagination={false}
          />
        )}
      </div>

      {showDetail && selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          onClose={handleCloseDetail}
          startEditing={startInEditMode}
          onUpdate={() => {
            initialize({
              page: currentPage,
              limit: itemsPerPage,
              search: searchQuery,
              status: selectedStatus !== 'all' ? selectedStatus : undefined,
            });
          }}
        />
      )}
    </motion.div>
  );
};

export default ViewCustomers;

