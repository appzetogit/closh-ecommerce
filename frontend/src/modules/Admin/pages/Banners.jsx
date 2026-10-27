import { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiEyeOff, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useBannerStore } from '../../../shared/store/bannerStore';
import HomeBannerSlots from '../components/Banners/HomeBannerSlots';
import BannerForm from '../components/Banners/BannerForm';
import ExportButton from '../components/ExportButton';
import Pagination from '../components/Pagination';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatDateTime } from '../utils/adminHelpers';
import { reorderBanners as reorderBannersApi } from '../services/adminService';

const Banners = () => {
  const {
    banners,
    isLoading,
    fetchBanners,
    deleteBanner,
    toggleBannerStatus,
  } = useBannerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // Filtered banners
  const filteredBanners = useMemo(() => {
    return banners
      .filter((banner) => {
        const matchesSearch =
          !searchQuery ||
          (banner.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (banner.subtitle &&
            banner.subtitle.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesType = selectedType === 'all' || banner.type === selectedType;

        const matchesStatus =
          selectedStatus === 'all' ||
          (selectedStatus === 'active' && banner.isActive) ||
          (selectedStatus === 'inactive' && !banner.isActive);

        return matchesSearch && matchesType && matchesStatus;
      })
      .sort((a, b) => a.order - b.order);
  }, [banners, searchQuery, selectedType, selectedStatus]);

  // Pagination
  const paginatedBanners = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredBanners.slice(startIndex, endIndex);
  }, [filteredBanners, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredBanners.length / itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedType, selectedStatus]);

  const handleCreate = () => {
    setEditingBanner(null);
    setShowForm(true);
  };

  const handleEdit = (banner) => {
    setEditingBanner(banner);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this banner?')) {
      deleteBanner(id);
    }
  };

  const handleMoveUp = async (banner) => {
    const index = filteredBanners.findIndex((b) => b._id === banner._id);
    if (index <= 0) return;

    const current = filteredBanners[index];
    const previous = filteredBanners[index - 1];
    const currentOrder = Number(current.order || 0);
    const previousOrder = Number(previous.order || 0);

    try {
      await reorderBannersApi([
        { id: current._id, order: previousOrder },
        { id: previous._id, order: currentOrder },
      ]);
      await fetchBanners();
    } catch {
      // Store handles toast
    }
  };

  const handleMoveDown = async (banner) => {
    const index = filteredBanners.findIndex((b) => b._id === banner._id);
    if (index < 0 || index >= filteredBanners.length - 1) return;

    const current = filteredBanners[index];
    const next = filteredBanners[index + 1];
    const currentOrder = Number(current.order || 0);
    const nextOrder = Number(next.order || 0);

    try {
      await reorderBannersApi([
        { id: current._id, order: nextOrder },
        { id: next._id, order: currentOrder },
      ]);
      await fetchBanners();
    } catch {
      // Store handles toast
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingBanner(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Banners</h1>
          <p className="text-gray-600">Manage hero and promotional banners</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold"
        >
          <FiPlus />
          Add Banner
        </button>
      </div>

      <HomeBannerSlots />

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search banners..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Type Filter */}
          <AnimatedSelect
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'home_slider', label: 'Home Sliders' },
              { value: 'festival_offer', label: 'Festival Offer Banners' },
              { value: 'banner', label: 'Generic Banners' },
              { value: 'hero', label: 'Hero Banners' },
              { value: 'promotional', label: 'Promotional Banners' },
              { value: 'side_banner', label: 'Side Banners' },
            ]}
            className="min-w-[140px]"
          />

          {/* Status Filter */}
          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            className="min-w-[140px]"
          />

          {/* Export Button */}
          <ExportButton
            data={filteredBanners}
            headers={[
              { label: 'ID', accessor: (row) => row._id || row.id },
              { label: 'Type', accessor: (row) => row.type },
              { label: 'Title', accessor: (row) => row.title },
              { label: 'Subtitle', accessor: (row) => row.subtitle || '' },
              { label: 'Order', accessor: (row) => row.order },
              { label: 'Status', accessor: (row) => (row.isActive ? 'Active' : 'Inactive') },
            ]}
            filename="banners"
          />
        </div>
      </div>

      {/* Banners Grid */}
      <div className="space-y-6">
        {filteredBanners.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">No banners found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedBanners.map((banner, index) => {
                // Find the index in filteredBanners for move up/down functionality
                const filteredIndex = filteredBanners.findIndex((b) => b._id === banner._id);
                return (
                  <div
                    key={banner._id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="relative h-48 bg-gray-100">
                      {banner.image && (
                        <img
                          src={banner.image}
                          alt={banner.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant={banner.isActive ? 'success' : 'error'}>
                          {banner.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="absolute top-2 left-2">
                        <Badge variant="info">
                          {banner.type === 'hero'
                            ? 'Hero'
                            : banner.type === 'promotional'
                              ? 'Promo'
                              : banner.type === 'side_banner'
                                ? 'Side'
                                : banner.type === 'home_slider'
                                  ? 'Slider'
                                  : banner.type === 'festival_offer'
                                    ? 'Festival'
                                    : 'Banner'}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-gray-800 mb-1">{banner.title || 'Untitled'}</h3>
                      {banner.subtitle && (
                        <p className="text-sm text-gray-600 mb-2">{banner.subtitle}</p>
                      )}
                      {banner.link && (
                        <p className="text-xs text-primary-600 mb-2 truncate">{banner.link}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                        <span>Order: {banner.order}</span>
                        {banner.startDate && banner.endDate && (
                          <span>
                            {formatDateTime(banner.startDate)} - {formatDateTime(banner.endDate)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleMoveUp(banner)}
                          disabled={filteredIndex === 0}
                          className="flex-1 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move Up"
                        >
                          <FiArrowUp />
                        </button>
                        <button
                          onClick={() => handleMoveDown(banner)}
                          disabled={filteredIndex === filteredBanners.length - 1}
                          className="flex-1 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move Down"
                        >
                          <FiArrowDown />
                        </button>
                        <button
                          onClick={() => toggleBannerStatus(banner._id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={banner.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {banner.isActive ? <FiEye /> : <FiEyeOff />}
                        </button>
                        <button
                          onClick={() => handleEdit(banner)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <FiEdit />
                        </button>
                        <button
                          onClick={() => handleDelete(banner._id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredBanners.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Banner Form Modal */}
      {showForm && (
        <BannerForm
          banner={editingBanner}
          onClose={handleFormClose}
          onSave={() => {
            fetchBanners();
          }}
        />
      )}
    </motion.div>
  );
};

export default Banners;

