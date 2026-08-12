import { useState, useEffect, useMemo } from "react";
import {
  FiSearch,
  FiAlertTriangle,
  FiEdit,
  FiPackage,
  FiPlus,
  FiMinus,
  FiTrendingDown,
  FiX,
  FiShoppingBag,
  FiCheck,
  FiUpload,
  FiEyeOff,
  FiEye,
  FiTrash2,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ExportButton from "../../Admin/components/ExportButton";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import MultiSelect from "../../Admin/components/MultiSelect";
import CategorySelector from "../../Admin/components/CategorySelector";
import { formatPrice, getOptimizedImageUrl } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import {
  updateVendorStock,
  updateVendorVariantStock,
  updateVendorProduct,
  uploadVendorImage,
} from "../services/vendorService";
import { PRODUCT_SIZES } from "../../../shared/utils/constants";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { useBrandStore } from "../../../shared/store/brandStore";
import {
  buildVariantCombinations,
  syncVariantPricesWithAxes,
  buildVariantPayload,
  normalizeVariantStateForForm,
  parseVariantAxis,
} from "../utils/variantHelpers";
import toast from "react-hot-toast";

const StockManagement = () => {
  const { vendor } = useVendorAuthStore();
  const { products, isLoading: storeLoading, fetchProducts, patchStock, patchVariantStock, removeProduct } = useVendorProductStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [alertThreshold, setAlertThreshold] = useState(10);
  const [isLoading, setIsLoading] = useState(false);

  // Edit Product Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

  const [formData, setFormData] = useState({
    productName: "",
    unit: "Piece",
    categoryId: null,
    subcategoryId: null,
    brandId: null,
    division: "Unisex",
    description: "",
    price: "",
    originalPrice: "",
    discount: 0,
    stock: "in_stock",
    stockQuantity: "",
    image: null,
    images: [],
    variants: {
      sizes: [],
      attributes: [],
      prices: {},
      stockMap: {},
      imageMap: {},
      defaultVariant: { size: "" },
      defaultSelection: {}
    },
    flashSale: false,
    isNewArrival: false,
    isFeatured: false,
    isVisible: true,
    codAllowed: true,
    returnable: true,
    cancelable: true,
    taxIncluded: false,
    hsnCode: "",
    warrantyPeriod: "",
    guaranteePeriod: "",
    taxRate: 18,
    seoTitle: "",
    seoDescription: "",
    tags: [],
    faqs: []
  });

  const variantCombinations = useMemo(() => {
    return buildVariantCombinations(
      formData.variants?.sizes || [],
      [],
      formData.variants?.attributes || []
    );
  }, [formData.variants?.sizes, formData.variants?.attributes]);

  // Auto-calculate total stock from variants
  useEffect(() => {
    if (variantCombinations.length > 0 && formData.variants?.stockMap) {
      const total = Object.values(formData.variants.stockMap).reduce((sum, val) => {
        const num = parseInt(val, 10);
        return sum + (isNaN(num) ? 0 : num);
      }, 0);
      if (parseInt(formData.stockQuantity || 0, 10) !== total) {
        setFormData(prev => ({ ...prev, stockQuantity: total }));
      }
    }
  }, [formData.variants?.stockMap, variantCombinations]);

  // Auto-calculate discount
  useEffect(() => {
    const price = parseFloat(formData.price);
    const originalPrice = parseFloat(formData.originalPrice);

    if (originalPrice && price && originalPrice > price) {
      const discount = Math.round(((originalPrice - price) / originalPrice) * 100);
      if (formData.discount !== discount) {
        setFormData(prev => ({ ...prev, discount }));
      }
    } else if (originalPrice && price && originalPrice <= price) {
      if (formData.discount !== 0) {
        setFormData(prev => ({ ...prev, discount: 0 }));
      }
    }
  }, [formData.price, formData.originalPrice]);

  const vendorId = vendor?.id;

  useEffect(() => {
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200 });
      initCategories();
      initBrands();
    }
  }, [vendorId, fetchProducts, initCategories, initBrands]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Stock filter (use backend-computed status for consistency)
    if (stockFilter !== "all") {
      filtered = filtered.filter(
        (product) => String(product.stock || "") === stockFilter
      );
    }

    return filtered;
  }, [products, searchQuery, stockFilter]);

  // Stock statistics
  const stockStats = useMemo(() => {
    const totalProducts = products.length;
    const inStock = products.filter((p) => p.stock === "in_stock").length;
    const lowStock = products.filter((p) => p.stock === "low_stock").length;
    const outOfStock = products.filter((p) => p.stock === "out_of_stock").length;
    const totalValue = products.reduce(
      (sum, p) => sum + (p.vendorPrice || p.price || 0) * (p.stockQuantity || 0),
      0
    );

    return { totalProducts, inStock, lowStock, outOfStock, totalValue };
  }, [products]);

  // Open Edit Product modal
  const handleOpenEditModal = (product) => {
    setEditingProduct(product);

    const normalizedVariants = normalizeVariantStateForForm(
      product.variants || {},
      product.vendorPrice || ""
    );

    setFormData({
      productName: product.name || "",
      unit: product.unit || "Piece",
      categoryId: product.categoryId?._id || product.categoryId || null,
      subcategoryId: product.subcategoryId?._id || product.subcategoryId || null,
      brandId: product.brandId?._id || product.brandId || null,
      division: product.division || "Unisex",
      description: product.description || "",
      price: product.vendorPrice || "",
      originalPrice: product.originalPrice || "",
      discount: product.discount || 0,
      stock: product.stock || "in_stock",
      stockQuantity: product.stockQuantity || 0,
      image: product.image || product.images?.[0] || null,
      images: product.images || [],
      variants: normalizedVariants,
      flashSale: product.flashSale || false,
      isNewArrival: product.isNewArrival || false,
      isFeatured: product.isFeatured || false,
      isVisible: product.isVisible !== undefined ? product.isVisible : true,
      codAllowed: product.codAllowed !== undefined ? product.codAllowed : true,
      returnable: product.returnable !== undefined ? product.returnable : true,
      cancelable: product.cancelable !== undefined ? product.cancelable : true,
      taxIncluded: product.taxIncluded || false,
      hsnCode: product.hsnCode || "",
      warrantyPeriod: product.warrantyPeriod || "",
      guaranteePeriod: product.guaranteePeriod || "",
      taxRate: product.taxRate || 18,
      seoTitle: product.seoTitle || "",
      seoDescription: product.seoDescription || "",
      tags: product.tags || [],
      faqs: product.faqs || []
    });
    setIsEditModalOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const uploadResponse = await uploadVendorImage(file);
      const imageUrl = uploadResponse.data?.url || uploadResponse.data;
      if (imageUrl) {
        setFormData(prev => ({ ...prev, image: imageUrl }));
        toast.success("Image uploaded");
      }
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  const updateVariantAxes = (axis, rawText) => {
    const parsed = parseVariantAxis(rawText);
    const nextSizes = axis === "sizes" ? parsed : (formData.variants?.sizes || []);
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      nextSizes,
      [],
      formData.variants?.attributes || [],
      formData.price
    );

    setFormData(prev => ({
      ...prev,
      variants: {
        ...prev.variants,
        sizes: nextSizes,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
      }
    }));
  };

  const updateVariantAttributes = (nextAttributes) => {
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      formData.variants?.sizes || [],
      [],
      nextAttributes,
      formData.price
    );

    setFormData(prev => ({
      ...prev,
      variants: {
        ...prev.variants,
        attributes: nextAttributes,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
      }
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.productName || !formData.price || !formData.categoryId) {
      toast.error("Required: Name, Selling Price & Category");
      return;
    }

    setIsLoading(true);
    try {
      const productId = editingProduct._id ?? editingProduct.id;
      const payload = {
        ...formData,
        name: formData.productName,
        price: parseFloat(formData.price),
        originalPrice: formData.originalPrice === "" ? null : parseFloat(formData.originalPrice),
        stockQuantity: parseInt(formData.stockQuantity || 0),
        categoryId: formData.subcategoryId || formData.categoryId,
        variants: buildVariantPayload(formData.variants)
      };

      await updateVendorProduct(productId, payload);
      toast.success("Product Updated");
      // Refresh global store to sync everywhere
      await fetchProducts({ fetchAll: true, limit: 200 });
      setIsEditModalOpen(false);
    } catch (error) {
      toast.error("Failed to save product");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle per-variant out-of-stock toggle from edit modal
  const [variantActionLoading, setVariantActionLoading] = useState(null);

  const handleVariantStockToggle = async (combo, isOut, currentStock) => {
    if (!editingProduct) return;
    setVariantActionLoading(combo.key);
    try {
      const newStockMap = { ...(formData.variants.stockMap || {}) };
      if (isOut) {
        const restockQty = parseInt(window.prompt(`Restock quantity for ${combo.label}:`, "10"), 10);
        if (!restockQty || restockQty <= 0) { setVariantActionLoading(null); return; }
        newStockMap[combo.key] = restockQty;
      } else {
        newStockMap[combo.key] = 0;
      }
      const newTotal = Object.values(newStockMap).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
      const productId = editingProduct._id ?? editingProduct.id;
      await updateVendorStock(productId, newTotal);
      await updateVendorVariantStock(productId, newStockMap);
      setFormData(prev => ({
        ...prev, stockQuantity: newTotal,
        variants: { ...prev.variants, stockMap: newStockMap }
      }));
      await fetchProducts({ fetchAll: true, limit: 200 });
      toast.success(isOut ? `${combo.label} restocked!` : `${combo.label} marked Out of Stock`);
    } catch { toast.error("Failed to update stock"); }
    finally { setVariantActionLoading(null); }
  };

  // Table columns
  const columns = [
    {
      key: "_id",
      label: "ID",
      sortable: true,
      render: (value, row) => String(value ?? row.id ?? "").slice(-8).toUpperCase(),
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={getOptimizedImageUrl(row.image || row.images?.[0], 40)}
            alt={value}
            loading="lazy"
            className="w-10 h-10 object-cover rounded-lg"
            onError={(e) => {
              e.target.src = "https://via.placeholder.com/50x50?text=Product";
            }}
          />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "vendorPrice",
      label: "Your Price",
      sortable: true,
      render: (value, row) => formatPrice(value || 0),
    },
    {
      key: "stockQuantity",
      label: "Current Stock",
      sortable: true,
      render: (value) => (
        <span className="font-semibold">{value?.toLocaleString() || 0}</span>
      ),
    },
    {
      key: "stock",
      label: "Status",
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
          {value?.replace("_", " ").toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenEditModal(row)}
            title="Edit Product"
            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={async () => {
              if (window.confirm(`Are you sure you want to delete "${row.name}"? This action cannot be undone.`)) {
                await removeProduct(row._id ?? row.id);
              }
            }}
            title="Delete Product"
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to manage stock</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Stock Management
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage your product inventory and stock levels
          </p>
        </div>
      </div>

      {/* Stock Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Products</p>
            <FiPackage className="text-blue-500 text-xl" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {stockStats.totalProducts}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">In Stock</p>
            <FiPackage className="text-green-500 text-xl" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {stockStats.inStock}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Low Stock</p>
            <FiAlertTriangle className="text-orange-500 text-xl" />
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {stockStats.lowStock}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Out of Stock</p>
            <FiTrendingDown className="text-red-500 text-xl" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {stockStats.outOfStock}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <AnimatedSelect
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            options={[
              { value: "all", label: "All Stock" },
              { value: "in_stock", label: "In Stock" },
              { value: "low_stock", label: "Low Stock" },
              { value: "out_of_stock", label: "Out of Stock" },
            ]}
            className="w-full sm:w-auto min-w-[160px]"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">
              Alert Threshold:
            </label>
            <input
              type="number"
              value={alertThreshold}
              onChange={(e) =>
                setAlertThreshold(parseInt(e.target.value, 10) || 10)
              }
              min="1"
              className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* DataTable */}
        {storeLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading products...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          <>
            <div className="mb-4">
              <ExportButton
                data={filteredProducts}
                headers={[
                  { label: "ID", accessor: (row) => String(row._id ?? row.id ?? "") },
                  { label: "Name", accessor: (row) => row.name },
                  { label: "Your Price", accessor: (row) => formatPrice(row.vendorPrice || 0) },
                  { label: "Stock", accessor: (row) => row.stockQuantity || 0 },
                  { label: "Status", accessor: (row) => row.stock || "N/A" },
                ]}
                filename="vendor-stock"
              />
            </div>
            <DataTable
              data={filteredProducts}
              columns={columns}
              pagination={true}
              itemsPerPage={10}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No products found</p>
          </div>
        )}
      </div>

      {/* ─── Edit Product Modal ─── */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100]">
            {/* Full-screen Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />

            {/* Content Wrapper */}
            <div className="relative inset-0 h-full w-full flex items-center justify-center p-2 sm:p-4 pb-24 md:pb-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[1.5rem] md:rounded-[2rem] shadow-2xl border border-emerald-50 pointer-events-auto overflow-hidden"
              >
                {/* Fixed Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-emerald-50 bg-white z-20">
                  <h2 className="text-base md:text-xl font-black text-[#003d29] tracking-tight flex items-center gap-2">
                    <FiShoppingBag className="text-emerald-600" /> Edit Product
                  </h2>
                  <button onClick={() => setIsEditModalOpen(false)} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-[#003d29] rounded-xl transition-colors"><FiX size={20} /></button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
                  <form onSubmit={handleSave} className="space-y-6">
                    {/* 1. Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Product Name *</label>
                        <input type="text" required value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value.replace(/[^a-zA-Z0-9\s]/g, "") })} className="w-full px-3 py-2.5 bg-emerald-50/20 border border-emerald-50 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold" placeholder="T-Shirt..." />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Unit</label>
                        <input type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value.replace(/[^a-zA-Z0-9\s]/g, "") })} className="w-full px-3 py-2.5 bg-emerald-50/20 border border-emerald-50 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold" placeholder="Piece/Box" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Division *</label>
                        <AnimatedSelect
                          value={formData.division}
                          onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                          options={[
                            { value: "Men", label: "Men" },
                            { value: "Women", label: "Women" },
                            { value: "Boys", label: "Boys" },
                            { value: "Girls", label: "Girls" },
                            { value: "Unisex", label: "Unisex" },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Category *</label>
                        <CategorySelector
                          value={formData.categoryId}
                          subcategoryId={formData.subcategoryId}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            [e.target.name]: e.target.value
                          }))}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Brand</label>
                        <AnimatedSelect
                          value={formData.brandId || ""}
                          onChange={(e) => setFormData({ ...formData, brandId: e.target.value || null })}
                          placeholder="Select Brand"
                          options={[
                            { value: "", label: "No Brand" },
                            ...brands.map(b => ({ value: b._id || b.id, label: b.name }))
                          ]}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Description</label>
                      <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2.5 bg-emerald-50/20 border border-emerald-50 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold" rows={2} placeholder="Briefly describe..." />
                    </div>

                    {/* 2. Pricing & Stock */}
                    <div className="bg-emerald-50/10 p-4 rounded-2xl border border-emerald-50 space-y-4">
                      <h3 className="text-xs font-black text-emerald-800 uppercase">Pricing & Base Inventory</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Selling Price *</label>
                          <input type="number" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full px-3 py-2.5 bg-white border border-emerald-50 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold" placeholder="0.00" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] md:text-xs font-black text-gray-400 uppercase ml-1">MRP</label>
                          <input type="number" value={formData.originalPrice} onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })} className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold" placeholder="0.00" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Discount (%)</label>
                          <input type="number" readOnly value={formData.discount} className="w-full px-3 py-2.5 bg-emerald-50/50 border border-emerald-50 rounded-xl text-emerald-600 text-xs md:text-sm font-black" placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Stock Quantity *</label>
                          <input
                            type="number"
                            required
                            readOnly={variantCombinations.length > 0}
                            value={formData.stockQuantity}
                            onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                            className={`w-full px-3 py-2.5 bg-white border border-emerald-50 rounded-xl focus:ring-1 focus:ring-emerald-500 text-xs md:text-sm font-bold ${variantCombinations.length > 0 ? 'bg-emerald-50/50 text-emerald-600' : ''}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Stock Status</label>
                          <AnimatedSelect
                            value={formData.stock}
                            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                            options={[
                              { value: 'in_stock', label: 'In Stock' },
                              { value: 'low_stock', label: 'Low Stock' },
                              { value: 'out_of_stock', label: 'Out of Stock' },
                            ]}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3. Variants Section */}
                    <div className="bg-emerald-50/10 p-4 rounded-2xl border border-emerald-50 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-emerald-800 uppercase">Product Variants</h3>
                        <button
                          type="button"
                          onClick={() => {
                            const current = formData.variants?.attributes || [];
                            updateVariantAttributes([...current, { name: "", values: [] }]);
                          }}
                          className="px-3 py-1 bg-[#003d29] text-white rounded-lg text-[10px] font-bold uppercase"
                        >
                          Add Attribute
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* Sizes MultiSelect */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-emerald-700 uppercase">Standard Sizes</label>
                          <MultiSelect
                            value={formData.variants?.sizes || []}
                            onChange={(e) => updateVariantAxes('sizes', e.target.value.join(', '))}
                            options={PRODUCT_SIZES}
                            placeholder="Select sizes..."
                          />
                        </div>

                        {/* Dynamic Attributes */}
                        {(formData.variants?.attributes || []).map((attr, index) => (
                          <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-[9px] font-bold text-gray-500 uppercase">Attr Name</label>
                              <input
                                type="text"
                                value={attr.name}
                                onChange={(e) => {
                                  const next = [...formData.variants.attributes];
                                  next[index].name = e.target.value.replace(/[^a-zA-Z0-9\s]/g, "");
                                  updateVariantAttributes(next);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-emerald-50 rounded-lg text-xs font-bold"
                                placeholder="e.g. Material"
                              />
                            </div>
                            <div className="md:col-span-8 space-y-1">
                              <label className="text-[9px] font-bold text-gray-500 uppercase">Values (comma separated)</label>
                              <input
                                type="text"
                                value={(attr.values || []).join(', ')}
                                onChange={(e) => {
                                  const next = [...formData.variants.attributes];
                                  next[index].values = parseVariantAxis(e.target.value);
                                  updateVariantAttributes(next);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-emerald-50 rounded-lg text-xs font-bold"
                                placeholder="Cotton, Silk..."
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => updateVariantAttributes(formData.variants.attributes.filter((_, i) => i !== index))}
                              className="md:col-span-1 p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                            >
                              <FiX size={14} className="mx-auto" />
                            </button>
                          </div>
                        ))}

                        {/* Variant Price/Stock/Status Grid (NO Quick Sale) */}
                        {variantCombinations.length > 0 && (
                          <div className="mt-4 border border-emerald-100 rounded-xl overflow-hidden bg-white">
                            <table className="w-full text-left text-[10px] md:text-xs">
                              <thead className="bg-emerald-50/50 text-emerald-800 font-black uppercase">
                                <tr>
                                  <th className="px-3 py-2">Variant</th>
                                  <th className="px-3 py-2">Price</th>
                                  <th className="px-3 py-2">Stock</th>
                                  <th className="px-3 py-2 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-50">
                                {variantCombinations.map((combo) => {
                                  const currentStock = parseInt(formData.variants.stockMap[combo.key] ?? 0, 10) || 0;
                                  const isOut = currentStock <= 0;
                                  const isActionLoading = variantActionLoading === combo.key;
                                  return (
                                    <tr key={combo.key} className={isOut ? 'bg-red-50/30' : ''}>
                                      <td className="px-3 py-2 font-bold text-gray-700">
                                        <div className="flex items-center gap-1.5">
                                          {combo.label}
                                          {isOut && <span className="text-[7px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-black uppercase">Out</span>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="number"
                                          readOnly
                                          value={formData.price}
                                          className="w-full px-2 py-1 bg-emerald-50/20 border border-emerald-50 rounded text-emerald-800 cursor-not-allowed"
                                          placeholder="Same as base price"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="number"
                                          value={formData.variants.stockMap[combo.key] ?? ""}
                                          onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            variants: { ...prev.variants, stockMap: { ...prev.variants.stockMap, [combo.key]: e.target.value } }
                                          }))}
                                          className={`w-full px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500 ${isOut ? 'bg-red-50 border-red-200 text-red-600 font-black' : 'bg-emerald-50/20 border-emerald-50'}`}
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button
                                          type="button"
                                          disabled={isActionLoading}
                                          onClick={() => handleVariantStockToggle(combo, isOut, currentStock)}
                                          className={`p-1.5 rounded-lg transition-all ${isActionLoading ? 'opacity-50' : ''} ${isOut
                                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                              : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                            }`}
                                          title={isOut ? 'Restock' : 'Mark Out of Stock'}
                                        >
                                          {isOut ? <FiEye size={14} /> : <FiEyeOff size={14} />}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4. Media & Additional Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Product Media</label>
                        <div className="relative border-2 border-dashed border-emerald-100 rounded-xl bg-emerald-50/10 p-4 text-center cursor-pointer hover:border-emerald-300">
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                          {formData.image ? (
                            <div className="flex items-center gap-3">
                              <img src={formData.image} className="w-12 h-12 rounded-lg object-cover" />
                              <div className="text-left"><p className="text-xs font-black">Main Image Set</p><p className="text-[10px] text-emerald-500 font-bold uppercase">Change</p></div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <FiUpload className="text-emerald-300" size={20} />
                              <p className="text-xs font-black">Upload Main Image</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] md:text-xs font-black text-emerald-800 uppercase ml-1">Settings & SEO</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-400">HSN CODE</label>
                            <input type="text" value={formData.hsnCode} onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-gray-100 rounded-lg text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-400">TAX RATE (%)</label>
                            <input type="number" value={formData.taxRate} onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-gray-100 rounded-lg text-xs" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tags & Options */}
                    <div className="flex flex-wrap gap-4">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <label className="text-[10px] font-bold text-emerald-800 uppercase">Tags (Comma separated)</label>
                        <input
                          type="text"
                          value={formData.tags.join(', ')}
                          onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                          className="w-full px-3 py-2 bg-emerald-50/10 border border-emerald-50 rounded-xl text-xs font-bold"
                          placeholder="shoes, adidas, sporty..."
                        />
                      </div>
                      <div className="flex items-center gap-4 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={formData.flashSale} onChange={(e) => setFormData({ ...formData, flashSale: e.target.checked })} className="w-4 h-4 rounded border-emerald-200 text-emerald-600 focus:ring-emerald-500" />
                          <span className="text-[10px] font-bold text-gray-600 uppercase group-hover:text-emerald-600 transition-colors">Flash Sale</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={formData.isVisible} onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })} className="w-4 h-4 rounded border-emerald-200 text-emerald-600 focus:ring-emerald-500" />
                          <span className="text-[10px] font-bold text-gray-600 uppercase group-hover:text-emerald-600 transition-colors">Visible</span>
                        </label>
                      </div>
                    </div>

                  </form>
                </div>

                {/* Fixed Footer */}
                <div className="p-4 md:p-6 border-t border-emerald-50 bg-white z-20">
                  <button type="submit" onClick={handleSave} disabled={isLoading} className="w-full py-4 bg-[#003d29] text-white rounded-[1.25rem] font-black text-sm tracking-widest hover:bg-[#002a1c] transition-all uppercase flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-900/10">
                    <FiCheck className="size-4" /> {isLoading ? "Saving..." : "Save Product"}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StockManagement;
