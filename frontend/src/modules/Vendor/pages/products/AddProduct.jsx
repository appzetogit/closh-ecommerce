import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FiSave, FiUpload, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorProductStore } from "../../store/vendorProductStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { uploadVendorImage, uploadVendorImages, getAllAttributeSets } from "../../services/vendorService";
import CategorySelector from "../../../Admin/components/CategorySelector";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import toast from "react-hot-toast";
import MultiSelect from "../../../Admin/components/MultiSelect";
import { PRODUCT_SIZES } from "../../../../shared/utils/constants";
import { requestCameraPermission } from "@shared/utils/permissionHelper";
import {
  parseVariantAxis,
  buildVariantCombinations,
  syncVariantPricesWithAxes,
  buildVariantPayload,
} from "../../utils/variantHelpers";

const AddProduct = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { addProduct, isSaving } = useVendorProductStore();
  const { initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

  const [availableSets, setAvailableSets] = useState([]);

  const vendorId = vendor?.id || vendor?._id;

  const [formData, setFormData] = useState({
    name: "",
    unit: "",
    price: "",
    originalPrice: "",
    image: "",
    images: [],
    categoryId: null,
    subcategoryId: null,
    brandId: null,
    division: "Unisex",
    productCode: "",
    tryAndBuyEnabled: true,
    stock: "in_stock",
    stockQuantity: "",
    totalAllowedQuantity: "",
    minimumOrderQuantity: "",
    warrantyPeriod: "",
    guaranteePeriod: "",
    hsnCode: "",
    flashSale: false,
    isNewArrival: false,
    isFeatured: false,
    isVisible: true,
    codAllowed: true,
    returnable: true,
    cancelable: true,
    taxIncluded: false,
    description: "",
    discount: "",
    tags: [],
    variants: {
      sizes: [],
      colors: [],
      materials: [],
      attributes: [],
      prices: {},
      stockMap: {},
      imageMap: {},
      defaultVariant: {},
      defaultSelection: {},
    },
    seoTitle: "",
    seoDescription: "",
    relatedProducts: [],
    faqs: [],
  });
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [variantAxisInput, setVariantAxisInput] = useState({
    colors: "",
  });
  const [targetStock, setTargetStock] = useState("");
  const [manuallyEditedVariants, setManuallyEditedVariants] = useState({});
  const variantCombinations = useMemo(
    () =>
      buildVariantCombinations(
        formData.variants?.sizes || [],
        formData.variants?.colors || [],
        formData.variants?.attributes || []
      ),
    [formData.variants?.sizes, formData.variants?.colors, formData.variants?.attributes]
  );

  useEffect(() => {
    initCategories();
    initBrands();
    fetchAttributeSets();
  }, [initCategories, initBrands]);

  const fetchAttributeSets = async () => {
    try {
      const res = await getAllAttributeSets();
      if (res?.data) {
        setAvailableSets(res.data);
      }
    } catch (e) {
      console.error("Failed to load attribute sets", e);
    }
  };

  useEffect(() => {
    if (!vendorId) {
      toast.error("Please log in to add products");
      navigate("/vendor/login");
    }
  }, [vendorId, navigate]);

  const handleChange = (e) => {
    const { name, type, checked } = e.target;
    let value = e.target.value;
    if (name === "name" || name === "unit") {
      value = value.replace(/[^a-zA-Z0-9\s]/g, "");
    }
    if (name === "stockQuantity") {
      setTargetStock(value);
    }
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      // Synchronization Logic for Price / Original Price / Discount
      if (name === "price") {
        const sellingPrice = parseFloat(value) || 0;
        const mrp = parseFloat(prev.originalPrice) || 0;
        if (mrp > 0 && sellingPrice <= mrp) {
          next.discount = Math.max(0, Math.min(100, Math.round(((mrp - sellingPrice) / mrp) * 100)));
        } else {
          next.discount = 0;
        }
      } else if (name === "originalPrice") {
        const mrp = parseFloat(value) || 0;
        const sellingPrice = parseFloat(prev.price) || 0;
        if (mrp > 0 && sellingPrice <= mrp) {
          next.discount = Math.max(0, Math.min(100, Math.round(((mrp - sellingPrice) / mrp) * 100)));
        } else if (mrp > 0 && prev.discount !== "" && prev.discount > 0) {
          const discountPct = parseFloat(prev.discount) || 0;
          next.price = Number((mrp * (1 - discountPct / 100)).toFixed(2));
        } else {
          next.discount = 0;
        }
      } else if (name === "discount") {
        const discountPct = parseFloat(value) || 0;
        const mrp = parseFloat(prev.originalPrice) || 0;
        if (mrp > 0) {
          next.price = Number((mrp * (1 - discountPct / 100)).toFixed(2));
        }
      }

      return next;
    });
  };

  const autoRecommendStocks = (currentStockMap, manualMap, currentTargetStock, combos) => {
    if (!currentTargetStock || isNaN(Number(currentTargetStock)) || Number(currentTargetStock) <= 0) {
      return currentStockMap;
    }
    if (!combos || combos.length === 0) {
      return currentStockMap;
    }

    const target = Number(currentTargetStock);
    const nextStockMap = { ...currentStockMap };

    // Find all combos that are not manually edited
    const nonManualCombos = combos.filter(c => !manualMap[c.key]);

    // If there is exactly one non-manually edited variant, auto-fill it with the remaining stock
    if (nonManualCombos.length === 1) {
      const lastCombo = nonManualCombos[0];
      const sumOfManual = combos
        .filter(c => c.key !== lastCombo.key)
        .reduce((sum, c) => {
          const val = nextStockMap[c.key];
          const num = parseInt(val, 10);
          return sum + (isNaN(num) ? 0 : num);
        }, 0);

      const remaining = target - sumOfManual;
      if (remaining >= 0) {
        nextStockMap[lastCombo.key] = remaining;
      }
    }

    return nextStockMap;
  };

  const getRecommendedPlaceholder = (comboKey) => {
    if (!targetStock || isNaN(Number(targetStock)) || Number(targetStock) <= 0) {
      return "Variant stock";
    }
    const target = Number(targetStock);
    const stockMap = formData.variants?.stockMap || {};

    // Sum of all other variants
    const sumOfOthers = variantCombinations
      .filter(c => c.key !== comboKey)
      .reduce((sum, c) => {
        const val = stockMap[c.key];
        const num = parseInt(val, 10);
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

    const remaining = target - sumOfOthers;
    return remaining >= 0 ? `${remaining} (recom.)` : "Variant stock";
  };

  // Sync / Auto-fill effect
  useEffect(() => {
    if (!targetStock || isNaN(Number(targetStock)) || Number(targetStock) <= 0) return;
    if (variantCombinations.length === 0) return;

    setFormData((prev) => {
      const currentStockMap = prev.variants?.stockMap || {};
      const nextStockMap = autoRecommendStocks(
        currentStockMap,
        manuallyEditedVariants,
        targetStock,
        variantCombinations
      );

      // Check if there is any actual difference
      let hasChanges = false;
      variantCombinations.forEach((combo) => {
        if (currentStockMap[combo.key] !== nextStockMap[combo.key]) {
          hasChanges = true;
        }
      });

      if (hasChanges) {
        return {
          ...prev,
          variants: {
            ...prev.variants,
            stockMap: nextStockMap,
          },
        };
      }
      return prev;
    });
  }, [targetStock, manuallyEditedVariants, variantCombinations]);

  // Auto-calculate total stock from variants (Centralized Logic)
  useEffect(() => {
    const hasVariants =
      (formData.variants?.sizes?.length > 0) ||
      (formData.variants?.colors?.length > 0) ||
      (formData.variants?.attributes?.length > 0);

    if (hasVariants && formData.variants?.stockMap) {
      const total = Object.values(formData.variants.stockMap).reduce((sum, val) => {
        const num = parseInt(val, 10);
        return sum + (isNaN(num) ? 0 : num);
      }, 0);

      if (parseInt(formData.stockQuantity || 0, 10) !== total) {
        setFormData((prev) => ({
          ...prev,
          stockQuantity: total,
        }));

        // If all variants are manually edited, update targetStock
        const nonManualCombos = variantCombinations.filter(c => !manuallyEditedVariants[c.key]);
        if (nonManualCombos.length === 0) {
          setTargetStock(total);
        }
      }
    }
  }, [
    formData.variants?.stockMap,
    formData.variants?.sizes,
    formData.variants?.colors,
    formData.variants?.attributes,
    manuallyEditedVariants,
    variantCombinations,
  ]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }

      setIsUploadingMedia(true);
      try {
        const res = await uploadVendorImage(file, "vendors/products");
        const uploaded = res?.data ?? res;
        setFormData((prev) => ({
          ...prev,
          image: uploaded?.url || "",
        }));
        toast.success("Main image uploaded");
      } catch {
        // errors handled by api.js
      } finally {
        setIsUploadingMedia(false);
      }
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} size should be less than 5MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImages(validFiles, "vendors/products");
      const uploaded = res?.data ?? res;
      const uploadedUrls = Array.isArray(uploaded)
        ? uploaded.map((u) => u?.url).filter(Boolean)
        : [];

      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls],
      }));
      toast.success(`${uploadedUrls.length} image(s) added to gallery`);
    } catch {
      // errors handled by api.js
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const removeGalleryImage = (index) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
  };

  const handleFaqChange = (index, field, value) => {
    setFormData((prev) => {
      const nextFaqs = [...(prev.faqs || [])];
      nextFaqs[index] = {
        ...(nextFaqs[index] || { question: "", answer: "" }),
        [field]: value,
      };
      return { ...prev, faqs: nextFaqs };
    });
  };

  const addFaq = () => {
    setFormData((prev) => ({
      ...prev,
      faqs: [...(prev.faqs || []), { question: "", answer: "" }],
    }));
  };

  const removeFaq = (index) => {
    setFormData((prev) => ({
      ...prev,
      faqs: (prev.faqs || []).filter((_, i) => i !== index),
    }));
  };

  const updateVariantAxes = (axis, rawText) => {
    const parsed = parseVariantAxis(rawText);
    const nextSizes = axis === "sizes" ? parsed : (formData.variants?.sizes || []);
    const nextColors = axis === "colors" ? parsed : (formData.variants?.colors || []);
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      nextSizes,
      nextColors,
      formData.variants?.attributes || [],
      formData.price
    );

    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        sizes: nextSizes,
        colors: nextColors,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
        defaultVariant: {
          size: String(prev.variants?.defaultVariant?.size || ""),
          color: String(prev.variants?.defaultVariant?.color || ""),
        },
      },
    }));
  };

  const updateVariantAttributes = (nextAttributes) => {
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      formData.variants?.sizes || [],
      formData.variants?.colors || [],
      nextAttributes,
      formData.price
    );

    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        attributes: nextAttributes,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
      },
    }));
  };

  const addAttributeRow = () => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    updateVariantAttributes([...current, { name: "", values: [] }]);
  };

  const removeAttributeRow = (index) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    updateVariantAttributes(current.filter((_, i) => i !== index));
  };

  const updateAttributeName = (index, name) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    const next = [...current];
    const cleanName = String(name || "").replace(/[^a-zA-Z0-9\s]/g, "");
    next[index] = { ...(next[index] || {}), name: cleanName };
    updateVariantAttributes(next);
  };

  const updateAttributeValues = (index, rawValues) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    const next = [...current];
    const values = parseVariantAxis(rawValues);
    next[index] = { ...(next[index] || {}), values };
    updateVariantAttributes(next);
  };

  const addVariantAxisValues = (axis, rawInput) => {
    const parsed = parseVariantAxis(rawInput);
    if (!parsed.length) {
      if (rawInput.trim()) toast.error(`No valid ${axis === "sizes" ? "size" : "color"} values found`);
      return;
    }
    const current = Array.isArray(formData?.variants?.[axis]) ? formData.variants[axis] : [];

    // Check for duplicates
    const duplicates = parsed.filter(val =>
      current.some(c => String(c).trim().toLowerCase() === String(val).trim().toLowerCase())
    );

    if (duplicates.length > 0) {
      toast.error(`${axis === "sizes" ? "Size" : "Color"} "${duplicates[0]}" already exists`);
      return;
    }

    const merged = [...current, ...parsed];
    updateVariantAxes(axis, merged.join(", "));
    setVariantAxisInput((prev) => ({ ...prev, [axis]: "" }));
  };

  const removeVariantAxisValue = (axis, valueToRemove) => {
    const current = Array.isArray(formData?.variants?.[axis]) ? formData.variants[axis] : [];
    const next = current.filter((value) => String(value) !== String(valueToRemove));
    updateVariantAxes(axis, next.join(", "));
  };

  const handleVariantAxisInputKeyDown = (axis, e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addVariantAxisValues(axis, variantAxisInput[axis]);
    }
  };

  const handleVariantImageUpload = async (variantKey, file) => {
    if (!file || !variantKey) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImage(file, "vendors/products/variants");
      const uploaded = res?.data ?? res;
      const imageUrl = uploaded?.url || "";
      if (!imageUrl) return;
      setFormData((prev) => ({
        ...prev,
        variants: {
          ...prev.variants,
          imageMap: {
            ...(prev.variants?.imageMap || {}),
            [variantKey]: imageUrl,
          },
        },
      }));
      toast.success("Variant image uploaded");
    } catch {
      // api interceptor handles error toast
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!vendorId) {
      toast.error("Please log in to add products");
      return;
    }

    // Comprehensive custom validation
    const missingFields = [];
    if (!formData.name?.trim()) {
      missingFields.push({ label: "Product Name", name: "name" });
    }
    if (!formData.categoryId) {
      missingFields.push({ label: "Category", name: "categoryId" });
    }

    const parsedPrice = parseFloat(formData.price || 0);
    if (!formData.price || isNaN(parsedPrice) || parsedPrice < 0) {
      missingFields.push({ label: "Your Selling Price", name: "price" });
    }

    const parsedStockQuantity = parseInt(formData.stockQuantity || 0, 10);
    if (formData.stockQuantity === "" || formData.stockQuantity === undefined || formData.stockQuantity === null || isNaN(parsedStockQuantity) || parsedStockQuantity < 0) {
      missingFields.push({ label: "Stock Quantity", name: "stockQuantity" });
    }

    if (missingFields.length > 0) {
      toast.error(`Please fill in the remaining required fields: ${missingFields.map((f) => f.label).join(", ")}`);

      // Auto-scroll smoothly to the first missing field
      const firstMissing = missingFields[0];
      let elementToScroll = document.getElementsByName(firstMissing.name)[0];
      if (firstMissing.name === "categoryId") {
        elementToScroll = document.getElementById("category-selector-button") || document.querySelector(".relative button");
      }
      if (elementToScroll) {
        elementToScroll.scrollIntoView({ behavior: "smooth", block: "center" });
        elementToScroll.focus?.();
      }
      return;
    }

    // Optional but helpful: If they started adding variants, ensure at least one is valid
    const hasAnyVariants = (formData.variants?.sizes?.length > 0 ||
      formData.variants?.colors?.length > 0 ||
      formData.variants?.attributes?.length > 0);

    // If they have no variants, ensure stock quantity is not 0 (optional business rule)
    // if (!hasAnyVariants && parsedStockQuantity <= 0) {
    //   toast.error("Stock quantity must be greater than 0 for simple products");
    //   return;
    // }

    // Determine final categoryId
    const finalCategoryId = formData.subcategoryId
      ? formData.subcategoryId
      : formData.categoryId ?? null;

    const parsedOriginalPrice = (formData.originalPrice === "" || formData.originalPrice === null)
      ? null
      : parseFloat(formData.originalPrice);
    const parsedTotalAllowedQuantity = (formData.totalAllowedQuantity === "" || formData.totalAllowedQuantity === null || isNaN(parseInt(formData.totalAllowedQuantity)))
      ? null
      : parseInt(formData.totalAllowedQuantity, 10);
    const parsedMinimumOrderQuantity = (formData.minimumOrderQuantity === "" || formData.minimumOrderQuantity === null || isNaN(parseInt(formData.minimumOrderQuantity)))
      ? null
      : parseInt(formData.minimumOrderQuantity, 10);

    if (!Number.isFinite(parsedPrice) || !Number.isFinite(parsedStockQuantity)) {
      toast.error("Please enter valid numeric values");
      return;
    }

    if (parsedOriginalPrice !== null) {
      if (parsedOriginalPrice < 0) {
        toast.error("Original price cannot be negative");
        return;
      }
      if (parsedPrice > 0 && parsedOriginalPrice <= parsedPrice) {
        toast.error("Original Price (MRP) must be greater than Your Selling Price");
        return;
      }

      if (formData.variants && formData.variants.prices) {
        for (const [key, vPrice] of Object.entries(formData.variants.prices)) {
          if (vPrice !== "" && vPrice !== null && vPrice !== undefined) {
            const vp = Number(vPrice);
            if (vp > 0 && parsedOriginalPrice <= vp) {
              toast.error("Original Price (MRP) must be greater than all Variant Prices");
              return;
            }
          }
        }
      }
    }

    const hasInvalidFaq = (formData.faqs || []).some((faq) => {
      const question = String(faq?.question || "").trim();
      const answer = String(faq?.answer || "").trim();
      return (question && !answer) || (!question && answer);
    });
    if (hasInvalidFaq) {
      toast.error("Each FAQ must have both question and answer");
      return;
    }

    const payload = {
      ...formData,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      discount: parseFloat(formData.discount || 0),
      stockQuantity: parsedStockQuantity,
      totalAllowedQuantity: parsedTotalAllowedQuantity,
      minimumOrderQuantity: parsedMinimumOrderQuantity,
      warrantyPeriod: formData.warrantyPeriod || null,
      guaranteePeriod: formData.guaranteePeriod || null,
      hsnCode: formData.hsnCode || null,
      categoryId: finalCategoryId,
      subcategoryId: formData.subcategoryId ? formData.subcategoryId : null,
      brandId: formData.brandId ?? null,
      faqs: (formData.faqs || [])
        .map((faq) => ({
          question: String(faq?.question || "").trim(),
          answer: String(faq?.answer || "").trim(),
        }))
        .filter((faq) => faq.question && faq.answer),
      variants: buildVariantPayload(formData.variants || {}),
    };

    const result = await addProduct(payload);
    if (result) {
      navigate("/vendor/products/manage-products");
    }
  };

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to add products</p>
      </div>
    );
  }

  const originalPriceVal = formData.originalPrice !== "" && formData.originalPrice !== null ? parseFloat(formData.originalPrice) : null;
  const sellingPriceVal = formData.price !== "" && formData.price !== null ? parseFloat(formData.price) : null;
  let originalPriceError = "";
  if (originalPriceVal !== null && originalPriceVal < 0) {
    originalPriceError = "Cannot be negative";
  } else if (originalPriceVal !== null && sellingPriceVal !== null && originalPriceVal <= sellingPriceVal) {
    originalPriceError = "Must be greater than Your Selling Price";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200 space-y-4">
        {/* Basic Information */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Enter product name"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Product Code
              </label>
              <input
                type="text"
                name="productCode"
                value={formData.productCode || ""}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm uppercase"
                placeholder="Code on the physical sticker, e.g. CLH-1042"
              />
              <p className="mt-1 text-[10px] text-gray-500">
                Must be unique. Printed on every order line so this exact piece can be matched.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Unit
              </label>
              <input
                type="text"
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                placeholder="e.g., Piece, Kilogram, Gram, Pair"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <CategorySelector
                value={formData.categoryId}
                subcategoryId={formData.subcategoryId}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Brand
              </label>
              <AnimatedSelect
                name="brandId"
                value={formData.brandId || ""}
                onChange={handleChange}
                placeholder="Select Brand"
                options={[
                  { value: "", label: "Select Brand" },
                  ...brands
                    .filter((brand) => brand.isActive !== false)
                    .map((brand) => ({ value: String(brand.id), label: brand.name })),
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Gender / Division <span className="text-red-500">*</span>
              </label>
              <AnimatedSelect
                name="division"
                value={formData.division || "Unisex"}
                onChange={handleChange}
                required
                options={[
                  { value: "Men", label: "Men" },
                  { value: "Women", label: "Women" },
                  { value: "Boys", label: "Boys" },
                  { value: "Girls", label: "Girls" },
                  { value: "Kids", label: "Kids (shows to Boys + Girls)" },
                  { value: "Unisex", label: "Unisex (shows to Men + Women)" },
                ]}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Enter product description..."
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Original Price (MRP)
              </label>
              <input
                type="number"
                name="originalPrice"
                value={formData.originalPrice}
                onChange={handleChange}
                onWheel={(e) => e.target.blur()}
                min="0"
                step="0.01"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm no-spinner ${originalPriceError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}`}
                placeholder="0.00"
              />
              {originalPriceError && <p className="text-red-500 text-[10px] mt-1 font-medium">{originalPriceError}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Your Selling Price (Cost to Admin/Store) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                onWheel={(e) => e.target.blur()}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm no-spinner"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Discount Percent
              </label>
              <input
                type="number"
                name="discount"
                value={formData.discount}
                onChange={handleChange}
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="number"
              />
            </div>
          </div>
        </div>

        {/* Product Media */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-3 sm:p-4 border-2 border-primary-200 shadow-lg">
          <h2 className="text-base font-bold text-primary-800 mb-3 flex items-center gap-2">
            <FiUpload className="text-lg" />
            Product Media
          </h2>

          <div className="space-y-3">
            {/* Main Image */}
            <div className="bg-white rounded-lg p-3 border border-primary-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Main Image
              </h3>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Main Image
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="main-image-upload"
                  />
                  <label
                    htmlFor="main-image-upload"
                    onClick={() => requestCameraPermission()}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors bg-white">
                    <FiUpload className="text-base text-primary-600" />
                    <span className="text-xs font-medium text-gray-700">
                      {formData.image
                        ? "Change Main Image"
                        : "Choose Main Image"}
                    </span>
                  </label>
                </div>
                {formData.image && (
                  <div className="mt-2 flex items-start gap-3">
                    <img
                      src={formData.image}
                      alt="Main Preview"
                      className="w-24 h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image: "" })}
                      className="mt-1 px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium">
                      Remove Image
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Product Gallery */}
            <div className="bg-white rounded-lg p-3 border border-primary-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Product Gallery
              </h3>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Gallery Images (Multiple)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryUpload}
                    className="hidden"
                    id="gallery-upload"
                  />
                  <label
                    htmlFor="gallery-upload"
                    onClick={() => requestCameraPermission()}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors bg-white">
                    <FiUpload className="text-base text-primary-600" />
                    <span className="text-xs font-medium text-gray-700">
                      Choose Gallery Images
                    </span>
                  </label>
                </div>
                {formData.images && formData.images.length > 0 && (
                  <div className="mt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {formData.images.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img}
                            alt={`Gallery ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Remove image">
                            <FiX className="text-xs" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {formData.images.length} image(s) in gallery
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Inventory</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Stock Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="stockQuantity"
                value={formData.stockQuantity}
                onChange={handleChange}
                onWheel={(e) => e.target.blur()}
                required
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm no-spinner"
                placeholder="0"
              />
              {variantCombinations.length > 0 && (
                <p className="mt-1 text-[10px] font-bold text-primary-600 uppercase tracking-tighter">
                  Enter target stock here to auto-recommend variant stocks below
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Stock Status
              </label>
              <AnimatedSelect
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                options={[
                  { value: 'in_stock', label: 'In Stock' },
                  { value: 'low_stock', label: 'Low Stock' },
                  { value: 'out_of_stock', label: 'Out of Stock' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            Additional Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">
                Total Allowed Quantity
              </label>
              <input
                type="number"
                name="totalAllowedQuantity"
                value={formData.totalAllowedQuantity}
                onChange={handleChange}
                onWheel={(e) => e.target.blur()}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm no-spinner"
                placeholder="Limit per user"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">
                Minimum Order Quantity
              </label>
              <input
                type="number"
                name="minimumOrderQuantity"
                value={formData.minimumOrderQuantity}
                onChange={handleChange}
                onWheel={(e) => e.target.blur()}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm no-spinner"
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">
                HSN Code
              </label>
              <input
                type="text"
                name="hsnCode"
                value={formData.hsnCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  handleChange({ target: { name: "hsnCode", value: val } });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Enter HSN Code"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">
                Warranty Period
              </label>
              <input
                type="text"
                name="warrantyPeriod"
                value={formData.warrantyPeriod}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="e.g. 1 Year"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">
                Guarantee Period
              </label>
              <input
                type="text"
                name="guaranteePeriod"
                value={formData.guaranteePeriod}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="e.g. 6 Months"
              />
            </div>
          </div>
        </div>

        {/* Product Variants */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">
            Product Variants
          </h2>
          <div className="space-y-3">
            {/* Attribute Sets Dropdowns Refactored Inline */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Sizes
                </label>
                {availableSets.length > 0 && (
                  <select
                    className="px-2 py-1 bg-white border border-gray-300 rounded-md focus:ring-primary-500 text-[10px] font-semibold text-gray-600 outline-none"
                    onChange={e => {
                      const set = availableSets.find(s => s._id === e.target.value);
                      if (set && set.values?.length) {
                        addVariantAxisValues('sizes', set.values.join(', '));
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Copy from Set...</option>
                    {availableSets.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mt-2">
                <MultiSelect
                  value={formData.variants?.sizes || []}
                  onChange={(e) => updateVariantAxes('sizes', e.target.value.join(', '))}
                  options={PRODUCT_SIZES}
                  placeholder="Select or search sizes..."
                  searchable={true}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Dynamic Attributes (optional)
                </label>
                <div className="flex items-center gap-2">
                  {availableSets.length > 0 && (
                    <select
                      className="px-2 py-1 bg-white border border-gray-300 rounded-md focus:ring-primary-500 text-[10px] font-semibold text-gray-600 outline-none"
                      onChange={e => {
                        const set = availableSets.find(s => s._id === e.target.value);
                        if (set && set.values?.length) {
                          const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
                          updateVariantAttributes([...current, { name: set.name, values: set.values }]);
                        }
                        e.target.value = "";
                      }}
                    >
                      <option value="">+ Add from Set...</option>
                      {availableSets.map(s => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={addAttributeRow}
                    className="px-2 py-1 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-white hover:text-black"
                  >
                    Add Attribute
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                Example: RAM {"->"} 8GB, 16GB | Storage {"->"} 128GB, 256GB
              </p>
              <div className="space-y-2">
                {(formData.variants?.attributes || []).map((attribute, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={attribute?.name || ""}
                      onChange={(e) => updateAttributeName(index, e.target.value)}
                      placeholder="Attribute name"
                      className="md:col-span-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                    <input
                      type="text"
                      value={(attribute?.values || []).join(", ")}
                      onChange={(e) => updateAttributeValues(index, e.target.value)}
                      placeholder="Values (comma separated)"
                      className="md:col-span-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttributeRow(index)}
                      className="md:col-span-1 px-2 py-2 border border-gray-300 rounded-lg hover:bg-white hover:text-black text-gray-600"
                      aria-label="Remove attribute"
                    >
                      <FiX className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {variantCombinations.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Variant Prices
                </p>
                <div className="space-y-2">
                  {variantCombinations.map((combo) => (
                    <div key={combo.key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                      <p className="text-xs text-gray-700 md:col-span-1">
                        {combo.label || ((combo.size || "Any Size") + " / " + (combo.color || "Any Color"))}
                      </p>
                      <div className="w-full">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.variants?.prices?.[combo.key] ?? ""}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              variants: {
                                ...prev.variants,
                                prices: {
                                  ...(prev.variants?.prices || {}),
                                  [combo.key]: nextValue === "" ? "" : Number(nextValue),
                                },
                              },
                            }));
                          }}
                          className={`w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 text-xs ${originalPriceVal !== null && formData.variants?.prices?.[combo.key] && originalPriceVal <= formData.variants.prices[combo.key] ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}`}
                          placeholder="Use base price"
                        />
                        {originalPriceVal !== null && formData.variants?.prices?.[combo.key] && originalPriceVal <= formData.variants.prices[combo.key] && (
                          <p className="text-red-500 text-[10px] mt-1 font-medium leading-tight">Must be &lt; MRP</p>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formData.variants?.stockMap?.[combo.key] ?? ""}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          const isCleared = nextValue === "";

                          setManuallyEditedVariants((prev) => {
                            const next = { ...prev };
                            if (isCleared) {
                              delete next[combo.key];
                            } else {
                              next[combo.key] = true;
                            }
                            return next;
                          });

                          setFormData((prev) => ({
                            ...prev,
                            variants: {
                              ...prev.variants,
                              stockMap: {
                                ...(prev.variants?.stockMap || {}),
                                [combo.key]: nextValue === "" ? "" : Number(nextValue),
                              },
                            },
                          }));
                        }}
                        onWheel={(e) => e.target.blur()}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs no-spinner"
                        placeholder={getRecommendedPlaceholder(combo.key)}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          id={`variant-image-${combo.key}`}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleVariantImageUpload(combo.key, file);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={`variant-image-${combo.key}`}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs cursor-pointer hover:bg-gray-100"
                        >
                          Upload
                        </label>
                        {formData.variants?.imageMap?.[combo.key] && (
                          <img
                            src={formData.variants.imageMap[combo.key]}
                            alt="Variant"
                            className="w-8 h-8 rounded object-cover border border-gray-300"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <select
                    value={formData.variants?.defaultVariant?.size || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        variants: {
                          ...prev.variants,
                          defaultVariant: {
                            ...(prev.variants?.defaultVariant || {}),
                            size: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  >
                    <option value="">Default size (optional)</option>
                    {(formData.variants?.sizes || []).map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>

                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Tags</h2>
          <div>
            <input
              type="text"
              value={(formData.tags || []).join(", ")}
              onChange={(e) => {
                const tags = e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
                setFormData({ ...formData, tags });
              }}
              placeholder="tag1, tag2, tag3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Separate tags with commas
            </p>
          </div>
        </div>

        {/* Options */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">
            Product Options
          </h2>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="tryAndBuyEnabled"
                checked={formData.tryAndBuyEnabled !== false}
                onChange={handleChange}
                className="w-4 h-4 mt-0.5 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Available for Try &amp; Buy
                <span className="block text-[10px] font-normal text-gray-500">
                  Uncheck for items that cannot be tried on at the door, such as
                  innerwear. Those stay Check &amp; Buy only.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="flashSale"
                checked={formData.flashSale}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Flash Sale
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isNewArrival"
                checked={formData.isNewArrival}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                New Arrival
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isFeatured"
                checked={formData.isFeatured}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Featured Product
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isVisible"
                checked={formData.isVisible}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Visible to Customers
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate("/vendor/products/manage-products")}
            className="w-full sm:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isUploadingMedia}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
            <FiSave />
            {isUploadingMedia ? "Uploading Media..." : isSaving ? "Creating..." : "Create Product"}
          </button>
        </div>

        {/* Product FAQs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-800">Product FAQs</h2>
            <button
              type="button"
              onClick={addFaq}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Add FAQ
            </button>
          </div>
          <div className="space-y-3">
            {(formData.faqs || []).map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">FAQ #{index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeFaq(index)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={faq.question || ""}
                  onChange={(e) => handleFaqChange(index, "question", e.target.value)}
                  placeholder="Question"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                />
                <textarea
                  value={faq.answer || ""}
                  onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
                  rows={2}
                  placeholder="Answer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                />
              </div>
            ))}
            {(formData.faqs || []).length === 0 && (
              <p className="text-xs text-gray-500">No FAQs added yet.</p>
            )}
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default AddProduct;

