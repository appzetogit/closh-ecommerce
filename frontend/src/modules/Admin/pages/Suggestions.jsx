import { useState, useEffect } from 'react';
import { FiSearch, FiCheck, FiTrash2, FiSend } from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from '../components/DataTable';
import ExportButton from '../components/ExportButton';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatDateTime } from '../utils/adminHelpers';
import { useSuggestionStore } from '../../../shared/store/suggestionStore';

const Suggestions = () => {
  const { suggestions, isLoading, fetchSuggestions, updateSuggestionStatus, deleteSuggestion, pagination } = useSuggestionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    const params = {
      search: searchQuery,
      status: selectedStatus === 'all' ? undefined : selectedStatus,
    };
    fetchSuggestions(params);
  }, [searchQuery, selectedStatus, fetchSuggestions]);

  const handleMarkReviewed = async (id) => {
    await updateSuggestionStatus(id, 'reviewed');
  };

  const columns = [
    {
      key: 'createdAt',
      label: 'Submitted',
      sortable: true,
      render: (value) => <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(value)}</span>,
    },
    {
      key: 'customerName',
      label: 'From',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          {row.customerEmail && <p className="text-xs text-gray-500">{row.customerEmail}</p>}
        </div>
      ),
    },
    {
      key: 'message',
      label: 'Suggestion',
      sortable: false,
      render: (value) => <p className="max-w-md whitespace-pre-wrap text-sm text-gray-700">{value}</p>,
    },
    {
      key: 'pageUrl',
      label: 'Page',
      sortable: false,
      render: (value) => value ? <span className="text-xs font-mono text-gray-400 break-all">{value}</span> : '-',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <Badge variant={value === 'reviewed' ? 'success' : 'warning'}>{value}</Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.status === 'new' && (
            <button
              onClick={() => handleMarkReviewed(row.id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Mark as reviewed"
            >
              <FiCheck />
            </button>
          )}
          <button
            onClick={() => deleteSuggestion(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
            <FiSend className="text-primary-600" /> Suggestions &amp; Feedback
          </h1>
          <p className="text-gray-600">What customers submitted from the "Suggestions & your thoughts" box on the site</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search suggestions..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'new', label: 'New' },
              { value: 'reviewed', label: 'Reviewed' },
            ]}
            className="min-w-[140px]"
          />
          <ExportButton
            data={suggestions}
            headers={[
              { label: 'Submitted', accessor: (row) => formatDateTime(row.createdAt) },
              { label: 'From', accessor: (row) => row.customerName },
              { label: 'Email', accessor: (row) => row.customerEmail },
              { label: 'Suggestion', accessor: (row) => row.message },
              { label: 'Page', accessor: (row) => row.pageUrl },
              { label: 'Status', accessor: (row) => row.status },
            ]}
            filename="suggestions"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={suggestions}
          columns={columns}
          loading={isLoading}
          pagination={true}
          itemsPerPage={pagination.limit}
          totalItems={pagination.total}
        />
      </div>
    </motion.div>
  );
};

export default Suggestions;
