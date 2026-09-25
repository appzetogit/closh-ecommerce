import { useState, useEffect } from 'react';
import { FiSearch, FiCheck, FiX, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../components/DataTable';
import ExportButton from '../components/ExportButton';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatDateTime } from '../utils/adminHelpers';
import { useReviewStore } from '../../../shared/store/reviewStore';
import toast from 'react-hot-toast';

const Reviews = () => {
  const { reviews, analytics, isLoading, fetchReviews, fetchDeliveryReviews, fetchReviewAnalytics, updateReviewStatus, deleteReview, pagination } = useReviewStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('product'); // 'product' or 'delivery'
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchReviewAnalytics();
  }, [fetchReviewAnalytics]);

  // Changing tab/search/status should always jump back to page 1 - otherwise
  // switching filters while on, say, page 3 can land on a page that no
  // longer has any results for the new filter.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus, activeTab]);

  useEffect(() => {
    const params = {
      search: searchQuery,
      status: selectedStatus === 'all' ? undefined : selectedStatus,
      page: currentPage,
    };
    if (activeTab === 'product') {
      fetchReviews(params);
    } else {
      fetchDeliveryReviews(params);
    }
  }, [searchQuery, selectedStatus, activeTab, currentPage, fetchReviews, fetchDeliveryReviews]);

  const handleApprove = async (id) => {
    await updateReviewStatus(id, 'approved');
  };

  const handleReject = async (id) => {
    await updateReviewStatus(id, 'pending'); // Or 'rejected' if supported
  };

  const productColumns = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      render: (value) => <span className="text-[10px] font-mono text-gray-500">{value}</span>
    },
    {
      key: 'productName',
      label: 'Product',
      sortable: true,
    },
    {
      key: 'customerName',
      label: 'Customer',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{row.customerEmail}</p>
        </div>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <span key={i} className={i < value ? 'text-yellow-400' : 'text-gray-300'}>
              ★
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'comment',
      label: 'Comment',
      sortable: false,
      render: (value) => <p className="max-w-xs truncate text-sm">{value}</p>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === 'approved'
              ? 'success'
              : value === 'pending'
                ? 'warning'
                : 'error'
          }
        >
          {value}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.status === 'pending' && (
            <>
              <button
                onClick={() => handleApprove(row.id)}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve"
              >
                <FiCheck />
              </button>
            </>
          )}
          <button
            onClick={() => deleteReview(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  const deliveryColumns = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      render: (value) => <span className="text-[10px] font-mono text-gray-500">{value}</span>
    },
    {
      key: 'reviewerType',
      label: 'Type',
      sortable: true,
      render: (value) => (
        <Badge variant={value === 'user' ? 'success' : 'warning'}>
          {value === 'user' ? 'Customer \u2192 Rider' : 'Rider \u2192 Customer'}
        </Badge>
      )
    },
    {
      key: 'reviewerName',
      label: 'Reviewer',
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-semibold text-gray-800">{value || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'targetName',
      label: 'Target',
      sortable: true,
      render: (value) => (
        <div>
          <p className="font-semibold text-gray-800">{value || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <span key={i} className={i < value ? 'text-yellow-400' : 'text-gray-300'}>
              ★
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'comment',
      label: 'Comment',
      sortable: false,
      render: (value) => <p className="max-w-xs truncate text-sm">{value || 'No comment'}</p>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.status === 'pending' && (
            <button
              onClick={() => handleApprove(row.id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Approve"
            >
              <FiCheck />
            </button>
          )}
          <button
            onClick={() => deleteReview(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  const currentColumns = activeTab === 'product' ? productColumns : deliveryColumns;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Reviews</h1>
          <p className="text-gray-600">Manage product and delivery reviews</p>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 font-medium mb-1">Total Reviews</p>
          <p className="text-2xl font-bold text-gray-800">{analytics?.totalReviews || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 font-medium mb-1">Average Product Rating</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-800">{analytics?.averageProductRating ? Number(analytics.averageProductRating).toFixed(1) : '0.0'}</p>
            <div className="flex">
               <span className="text-yellow-400">★</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 font-medium mb-1">Average Delivery Rating</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-800">{analytics?.averageDeliveryRating ? Number(analytics.averageDeliveryRating).toFixed(1) : '0.0'}</p>
            <div className="flex">
               <span className="text-yellow-400">★</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('product')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${activeTab === 'product' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Product Reviews
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          className={`py-3 px-6 text-sm font-bold border-b-2 transition-colors ${activeTab === 'delivery' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Delivery Reviews
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reviews..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'approved', label: 'Approved' },
              { value: 'pending', label: 'Pending' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            className="min-w-[140px]"
          />
          <ExportButton
            data={reviews}
            headers={activeTab === 'product' ? [
              { label: 'ID', accessor: (row) => row.id },
              { label: 'Product', accessor: (row) => row.productName },
              { label: 'Customer', accessor: (row) => row.customerName },
              { label: 'Rating', accessor: (row) => row.rating },
              { label: 'Comment', accessor: (row) => row.comment },
              { label: 'Status', accessor: (row) => row.status },
            ] : [
              { label: 'ID', accessor: (row) => row.id },
              { label: 'Type', accessor: (row) => row.reviewerType },
              { label: 'Reviewer', accessor: (row) => row.reviewerName },
              { label: 'Target', accessor: (row) => row.targetName },
              { label: 'Rating', accessor: (row) => row.rating },
              { label: 'Comment', accessor: (row) => row.comment },
            ]}
            filename={activeTab === 'product' ? "product_reviews" : "delivery_reviews"}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={reviews}
          columns={currentColumns}
          loading={isLoading}
          pagination={true}
          itemsPerPage={pagination.limit}
          serverSide
          page={currentPage}
          totalItems={pagination.total}
          onPageChange={setCurrentPage}
        />
      </div>
    </motion.div>
  );
};

export default Reviews;

