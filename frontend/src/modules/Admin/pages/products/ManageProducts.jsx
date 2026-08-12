import { useState, useMemo, useEffect } from "react";
import { FiSearch, FiEdit, FiTrash2, FiPlus } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../components/DataTable";
import ExportButton from "../../components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";
import ProductFormModal from "../../components/ProductFormModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice, getOptimizedImageUrl } from "../../../../shared/utils/helpers";

import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { getAllProducts, deleteProduct, getAllVendors, updateProductStatus } from "../../services/adminService";
import toast from "react-hot-toast";
import { FiUser, FiCheckCircle, FiClock, FiXCircle, FiGrid } from "react-icons/fi";

const ManageProducts = () => {
  const [products, setProducts] = useState([]);
  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [categoryPath, setCategoryPath] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    productId: null,
  });
  const [productFormModal, setProductFormModal] = useState({
    isOpen: false,
    productId: null,
  });
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState("all");
  const [selectedTab, setSelectedTab] = useState("all"); // all, pending, approved, rejected, by_vendor
  const [explorerVendorId, setExplorerVendorId] = useState(null);
  const [explorerStatus, setExplorerStatus] = useState("all");
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");

  useEffect(() => {
    initCategories();
    initBrands();
    loadVendors();
    loadProducts();
  }, [initCategories, initBrands]);

  // Set initial vendor for explorer
  useEffect(() => {
    if (selectedTab === "by_vendor" && !explorerVendorId && vendors.length > 0) {
      setExplorerVendorId(vendors[0]._id || vendors[0].id);
    }
  }, [selectedTab, vendors, explorerVendorId]);

  const loadVendors = async () => {
    try {
      const response = await getAllVendors({ limit: 500 });
      setVendors(response.data?.vendors || []);
    } catch (error) {
      setVendors([]);
    }
  };

  const loadProducts = async () => {
    try {
      let currentPage = 1;
      let totalPages = 1;
      const products = [];

      do {
        const response = await getAllProducts({ page: currentPage, limit: 100, includeInactive: true });
        const pageProducts = Array.isArray(response.data)
          ? response.data
          : (response.data?.products || []);
        products.push(...pageProducts);

        totalPages = Number(response.data?.pages || 1);
        currentPage += 1;
      } while (currentPage <= totalPages);

      const normalizedProducts = products.map(p => ({
        ...p,
        id: p._id,
        image: p.image || p.images?.[0] || "https://placehold.co/50x50?text=Product",
        stockStatus: p.stock || (p.stockQuantity > 5 ? "in_stock" : p.stockQuantity > 0 ? "low_stock" : "out_of_stock"),
        vendorName: p.vendorId?.storeName || p.vendorId?.name || "Global",
        vendorIdStr: String(p.vendorId?._id || p.vendorId || ""),
        approvalStatus: p.approvalStatus || "pending"
      }));
      setProducts(normalizedProducts);
    } catch (error) {
      // Error is handled in interceptor
    }
  };

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.vendorName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedTab !== "all") {
      filtered = filtered.filter((product) => product.approvalStatus === selectedTab);
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((product) => product.stockStatus === selectedStatus);
    }

    const activeCategory = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : "all";
    if (activeCategory !== "all") {
      const getDescendantIds = (parentId) => {
        const children = categories.filter(cat => {
            const pId = typeof cat.parentId === 'object' ? cat.parentId?._id || cat.parentId?.id : cat.parentId;
            return String(pId) === String(parentId);
        });
        let ids = [String(parentId)];
        for (let child of children) {
            ids = [...ids, ...getDescendantIds(String(child.id || child._id))];
        }
        return ids;
      };
      const allowedCatIds = getDescendantIds(activeCategory);

      filtered = filtered.filter(
        (product) => allowedCatIds.includes(String(product.categoryId?._id || product.categoryId))
      );
    }

    if (selectedBrand !== "all") {
      filtered = filtered.filter(
        (product) => String(product.brandId?._id || product.brandId) === String(selectedBrand)
      );
    }

    if (selectedVendor !== "all") {
      filtered = filtered.filter(
        (product) => product.vendorIdStr === String(selectedVendor)
      );
    }

    return filtered;
  }, [products, searchQuery, selectedStatus, categoryPath, categories, selectedBrand, selectedTab, selectedVendor]);

  const columns = [
    {
      key: "id",
      label: "ID",
      sortable: true,
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={getOptimizedImageUrl(row.image, 40)}
            alt={value}
            loading="lazy"
            className="w-10 h-10 object-cover rounded-lg"
            onError={(e) => {
              e.target.src = "https://placehold.co/50x50?text=Product";
            }}
          />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "stockQuantity",
      label: "Stock",
      sortable: true,
      render: (value) => Number(value || 0).toLocaleString(),
    },
    {
      key: "vendorName",
      label: "Vendor",
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <FiUser className="text-gray-400" size={14} />
          <span className="text-xs font-semibold text-gray-700">{value}</span>
        </div>
      )
    },
    {
      key: "approvalStatus",
      label: "Approval",
      sortable: true,
      render: (value) => {
        let variant = "warning";
        let icon = <FiClock size={12} />;
        if (value === "approved") { variant = "success"; icon = <FiCheckCircle size={12} />; }
        if (value === "rejected") { variant = "error"; icon = <FiXCircle size={12} />; }

        return (
          <Badge variant={variant} className="flex items-center gap-1">
            {icon}
            {String(value || "pending").toUpperCase()}
          </Badge>
        );
      },
    },
    {
      key: "stockStatus",
      label: "Inventory",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "in_stock"
              ? "success"
              : value === "low_stock"
                ? "warning"
                : "error"
          }>
          {value.replace("_", " ").toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.approvalStatus === "pending" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickStatusUpdate(row.id, "approved");
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve"
              >
                <FiCheckCircle />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickStatusUpdate(row.id, "rejected");
                }}
                className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                title="Reject"
              >
                <FiXCircle />
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProductFormModal({ isOpen: true, productId: row.id });
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <FiEdit />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({ isOpen: true, productId: row.id });
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  const handleQuickStatusUpdate = async (productId, status) => {
    try {
      const response = await updateProductStatus(productId, status);
      if (response.success || response.data) {
        toast.success(`Product ${status} successfully`);
        loadProducts(); // Refresh the list
      }
    } catch (error) {
      toast.error(`Failed to ${status} product`);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteProduct(deleteModal.productId);
      setProducts(products.filter((p) => p.id !== deleteModal.productId));
      setDeleteModal({ isOpen: false, productId: null });
      toast.success("Product deleted successfully");
    } catch (error) {
      setDeleteModal({ isOpen: false, productId: null });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Product Management
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Manage your global catalog and vendor submissions.
          </p>
        </div>
        <button
          onClick={() => setProductFormModal({ isOpen: true, productId: "new" })}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-sm font-bold"
        >
          <FiPlus />
          Add Global Product
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Status Tabs */}
        <div className="flex border-b border-gray-200 bg-white/50 overflow-x-auto no-scrollbar">
          {[
            { id: "all", label: "All Products", icon: FiGrid },
            { id: "pending", label: "Pending Approval", icon: FiClock },
            { id: "approved", label: "Approved", icon: FiCheckCircle },
            { id: "rejected", label: "Rejected", icon: FiXCircle },
            { id: "by_vendor", label: "By Vendor", icon: FiUser },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${selectedTab === tab.id
                ? "border-primary-600 text-primary-600 bg-white shadow-[0_-2px_0_inset_#7c3aed]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.id !== "by_vendor" && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${selectedTab === tab.id
                    ? "bg-primary-100 text-primary-700"
                    : "bg-gray-200 text-gray-600"
                    }`}
                >
                  {tab.id === "all"
                    ? products.length
                    : products.filter((p) => p.approvalStatus === tab.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {selectedTab !== "by_vendor" ? (
            <>
              {/* Filters Section */}
              <div className="mb-6 pb-6 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                  <div className="relative flex-1 w-full sm:min-w-[200px]">
                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search products..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
                    />
                  </div>

                  <AnimatedSelect
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    options={[
                      { value: "all", label: "All Status" },
                      { value: "in_stock", label: "In Stock" },
                      { value: "low_stock", label: "Low Stock" },
                      { value: "out_of_stock", label: "Out of Stock" },
                    ]}
                    className="w-full sm:w-auto min-w-[140px]"
                  />

                  {/* Cascading Category Selects */}
                  {(() => {
                    const levels = [];
                    
                    // 1. Root Level
                    const rootCategories = categories.filter(cat => !cat.parentId && cat.isActive !== false);
                    levels.push({
                      options: rootCategories,
                      selectedValue: categoryPath[0] || "all",
                      onChange: (val) => {
                        if (val === "all") setCategoryPath([]);
                        else setCategoryPath([val]);
                      },
                      placeholder: "All Categories"
                    });

                    // 2. Subsequent Levels
                    for (let i = 0; i < categoryPath.length; i++) {
                      const selectedId = categoryPath[i];
                      const subCats = categories.filter(cat => {
                        const parentId = typeof cat.parentId === 'object' ? cat.parentId?._id || cat.parentId?.id : cat.parentId;
                        return String(parentId) === String(selectedId) && cat.isActive !== false;
                      });

                      if (subCats.length > 0) {
                        levels.push({
                          options: subCats,
                          selectedValue: categoryPath[i + 1] || "all",
                          onChange: (val) => {
                            const newPath = categoryPath.slice(0, i + 1); // Keep up to current level
                            if (val !== "all") newPath.push(val);
                            setCategoryPath(newPath);
                          },
                          placeholder: "Sub Category"
                        });
                      }
                    }

                    return levels.map((level, index) => (
                      <AnimatedSelect
                        key={`category-level-${index}`}
                        value={level.selectedValue}
                        onChange={(e) => level.onChange(e.target.value)}
                        options={[
                          { value: "all", label: level.placeholder },
                          ...level.options.map((cat) => ({ value: String(cat.id || cat._id), label: cat.name })),
                        ]}
                        className="w-full sm:w-auto min-w-[160px]"
                      />
                    ));
                  })()}

                  <AnimatedSelect
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    options={[
                      { value: "all", label: "All Brands" },
                      ...brands
                        .filter((brand) => brand.isActive !== false)
                        .map((brand) => ({
                          value: String(brand.id || brand._id),
                          label: brand.name,
                        })),
                    ]}
                    className="w-full sm:w-auto min-w-[160px]"
                  />

                  <AnimatedSelect
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    options={[
                      { value: "all", label: "All Vendors" },
                      ...vendors.map((v) => ({
                        value: String(v._id || v.id),
                        label: v.storeName || v.name,
                      })),
                    ]}
                    className="w-full sm:w-auto min-w-[160px]"
                  />

                  <div className="w-full sm:w-auto">
                    <ExportButton
                      data={filteredProducts}
                      headers={[
                        { label: "ID", accessor: (row) => row.id },
                        { label: "Name", accessor: (row) => row.name },
                        {
                          label: "Price",
                          accessor: (row) => formatPrice(row.price),
                        },
                        { label: "Stock", accessor: (row) => row.stockQuantity },
                        { label: "Status", accessor: (row) => row.stock },
                      ]}
                      filename="products"
                    />
                  </div>
                </div>
              </div>

              {/* DataTable */}
              <DataTable
                data={filteredProducts}
                columns={columns}
                pagination={true}
                itemsPerPage={10}
                onRowClick={(row) =>
                  setProductFormModal({ isOpen: true, productId: row.id })
                }
              />
            </>
          ) : (
            /* Vendor Wise Explorer View */
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
              {/* Vendor Sidebar */}
              <div className="lg:border-r border-gray-100 pr-4 space-y-4">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    value={vendorSearchQuery}
                    onChange={(e) => setVendorSearchQuery(e.target.value)}
                    placeholder="Filter vendors..."
                    className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="max-h-[500px] overflow-y-auto no-scrollbar space-y-1">
                  {vendors
                    .filter(v => (v.storeName || v.name || "").toLowerCase().includes(vendorSearchQuery.toLowerCase()))
                    .map((vendor) => (
                      <button
                        key={vendor._id || vendor.id}
                        onClick={() => setExplorerVendorId(vendor._id || vendor.id)}
                        className={`w-full text-left px-3 py-3 rounded-xl transition-all flex items-center gap-3 ${explorerVendorId === (vendor._id || vendor.id)
                          ? "bg-primary-50 text-primary-700 shadow-sm border-l-4 border-primary-600"
                          : "hover:bg-white hover:text-black text-gray-600"
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${explorerVendorId === (vendor._id || vendor.id) ? "bg-primary-600 text-white" : "bg-gray-100"}`}>
                          {(vendor.storeName || vendor.name)?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs truncate">{vendor.storeName || vendor.name}</p>
                          <p className="text-[10px] opacity-70">
                            {products.filter(p => String(p.vendorId?._id || p.vendorId) === String(vendor._id || vendor.id)).length} Products
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Vendor Products Details */}
              <div className="lg:col-span-3 space-y-4">
                {explorerVendorId ? (
                  <>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div>
                        <h3 className="font-bold text-lg text-gray-800">
                          {vendors.find(v => (v._id || v.id) === explorerVendorId)?.storeName || "Vendor Products"}
                        </h3>
                        <p className="text-xs text-gray-500">Managing products for this vendor</p>
                      </div>
                      <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                        {[
                          { id: "all", label: "All" },
                          { id: "approved", label: "Approved" },
                          { id: "pending", label: "Pending" },
                          { id: "rejected", label: "Rejected" },
                        ].map(st => (
                          <button
                            key={st.id}
                            onClick={() => setExplorerStatus(st.id)}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase  rounded-md transition-all ${explorerStatus === st.id
                              ? "bg-white text-primary-600 shadow-sm"
                              : "text-gray-500 hover:text-gray-700 hover:bg-white hover:text-black/50"
                              }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <DataTable
                      data={products.filter(p =>
                        String(p.vendorId?._id || p.vendorId || "") === String(explorerVendorId) &&
                        (explorerStatus === "all" || p.approvalStatus === explorerStatus)
                      )}
                      columns={columns}
                      pagination={true}
                      itemsPerPage={8}
                      onRowClick={(row) =>
                        setProductFormModal({ isOpen: true, productId: row.id })
                      }
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                    <FiUser size={48} className="opacity-20 mb-4" />
                    <p className="font-bold uppercase  opacity-40">Select a vendor from list</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, productId: null })}
        onConfirm={confirmDelete}
        title="Delete Product?"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      <ProductFormModal
        isOpen={productFormModal.isOpen}
        onClose={() => setProductFormModal({ isOpen: false, productId: null })}
        productId={productFormModal.productId}
        onSuccess={() => {
          loadProducts();
        }}
      />
    </motion.div>
  );
};


export default ManageProducts;
