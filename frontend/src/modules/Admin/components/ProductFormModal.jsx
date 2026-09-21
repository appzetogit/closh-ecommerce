import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { FiSave, FiX, FiUpload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { useBrandStore } from "../../../shared/store/brandStore";
import {
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
  getAllVendors,
  uploadAdminImage,
} from "../services/adminService";
import CategorySelector from "./CategorySelector";
import AnimatedSelect from "./AnimatedSelect";
import MultiSelect from "./MultiSelect";
import { PRODUCT_SIZES } from "../../../shared/utils/constants";
import toast from "react-hot-toast";
import Button from "./Button";
import { formatPrice } from "../../../shared/utils/helpers";
import { getVariantSignature } from "../../../shared/utils/variant";

const ProductFormModal = ({ isOpen, onClose, productId, onSuccess }) => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const isEdit = productId && productId !== "new";

  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();
  const [vendors, setVendors] = useState([]);
  const [isUploadingMainImage, setIsUploadingMainImage] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [variantAxisInput, setVariantAxisInput] = useState({
    colors: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [targetStock, setTargetStock] = useState("");
  const [manuallyEditedVariants, setManuallyEditedVariants] = useState({});
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);

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
    vendorId: null,
    stock: "in_stock",
    stockQuantity: 0,
    totalAllowedQuantity: "",
    minimumOrderQuantity: "",
    vendorPrice: "",
    warrantyPeriod: "",
    guaranteePeriod: "",
    hsnCode: "",
    productCode: "",
    division: "Unisex",
    flashSale: false,
    isNewArrival: false,
    isFeatured: false,
    isVisible: true,
    codAllowed: true,
    returnable: true,
    cancelable: true,
    taxIncluded: false,
    description: "",
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
    approvalStatus: "pending",
  });

  const extractId = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return value._id || value.id || "";
    return String(value);
  };

  const normalizeVariantPart = (value) => String(value || "").trim().toLowerCase();
  const parseVariantAxis = (rawText) => {
    const values = String(rawText || "")
      .split(",")
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    const seen = new Set();
    return values.filter((value) => {
      const key = normalizeVariantPart(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const createVariantKey = (size = "", color = "") => {
    const obj = {};
    if (size) obj.size = size;
    if (color) obj.color = color;
    return getVariantSignature(obj);
  };

  const variantCombinations = (() => {
    const sizes = Array.isArray(formData?.variants?.sizes) ? formData.variants.sizes : [];
    const colors = Array.isArray(formData?.variants?.colors) ? formData.variants.colors : [];
    const attributes = Array.isArray(formData?.variants?.attributes)
      ? formData.variants.attributes
        .map((attr) => ({
          name: String(attr?.name || "").trim(),
          key: normalizeVariantPart(attr?.name || ""),
          values: Array.isArray(attr?.values) ? attr.values.filter(Boolean) : [],
        }))
        .filter((attr) => attr.name && attr.key && attr.values.length > 0)
      : [];
    if (attributes.length > 0) {
      let combos = [{}];
      attributes.forEach((attr) => {
        const next = [];
        combos.forEach((selection) => {
          attr.values.forEach((value) => next.push({ ...selection, [attr.key]: value }));
        });
        combos = next;
      });
      return combos.map((selection) => ({
        selection,
        size: selection.size || "",
        color: selection.color || "",
        key: Object.entries(selection)
          .map(([axis, value]) => [normalizeVariantPart(axis), normalizeVariantPart(value)])
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([axis, value]) => `${axis}=${value}`)
          .join("|"),
        label: attributes.map((attr) => `${attr.name}: ${selection[attr.key] || "-"}`).join(" / "),
      }));
    }
    if (sizes.length > 0 && colors.length > 0) {
      return sizes.flatMap((size) =>
        colors.map((color) => ({ size, color, key: createVariantKey(size, color), label: `${size} / ${color}` }))
      );
    }
    if (sizes.length > 0) {
      return sizes.map((size) => ({ size, color: "", key: createVariantKey(size, ""), label: `${size} / Any Color` }));
    }
    if (colors.length > 0) {
      return colors.map((color) => ({ size: "", color, key: createVariantKey("", color), label: `Any Size / ${color}` }));
    }
    return [];
  })();

  useEffect(() => {
    initCategories();
    initBrands();
  }, [initCategories, initBrands]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const response = await getAllVendors({ status: "approved", limit: 200 });
        const vendorRows = response.data?.vendors || [];
        setVendors(vendorRows);
      } catch (error) {
        setVendors([]);
      }
    };

    fetchVendors();
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await getProductById(productId);
        let product = response.data;

        if (product) {
          if (product.hasPendingUpdates && product.pendingUpdates) {
             setHasPendingUpdates(true);
             toast("⚠️ This product has pending updates from the vendor.", {
                 icon: '⚠️',
                 style: {
                   background: '#f59e0b',
                   color: '#fff',
                 },
                 duration: 6000
             });
             // Merge pending updates over the original product for display
             product = { ...product, ...product.pendingUpdates };
          } else {
             setHasPendingUpdates(false);
          }

          const productCategoryId = extractId(product.categoryId);
          const productBrandId = extractId(product.brandId);
          const productVendorId = extractId(product.vendorId);

          // Determine if categoryId is a subcategory
          const category = categories.find(
            (cat) => String(cat.id) === String(productCategoryId) || String(cat._id) === String(productCategoryId)
          );
          const isSubcategory = category && category.parentId;

          const getCanonicalKey = (rawKey) => {
            if (!rawKey) return "";
            return String(rawKey)
              .trim()
              .toLowerCase()
              .split("|")
              .map(part => {
                if (part.includes("=")) {
                  return part.split("=")[1].trim();
                }
                return part.trim();
              })
              .filter(Boolean)
              .sort()
              .join("|");
          };

          const buildCombinationsForProduct = (variants) => {
            const sizes = Array.isArray(variants?.sizes) ? variants.sizes : [];
            const colors = Array.isArray(variants?.colors) ? variants.colors : [];
            const attributes = Array.isArray(variants?.attributes)
              ? variants.attributes
                .map((attr) => ({
                  name: String(attr?.name || "").trim(),
                  key: normalizeVariantPart(attr?.name || ""),
                  values: Array.isArray(attr?.values) ? attr.values.filter(Boolean) : [],
                }))
                .filter((attr) => attr.name && attr.key && attr.values.length > 0)
              : [];
            if (attributes.length > 0) {
              let combos = [{}];
              attributes.forEach((attr) => {
                const next = [];
                combos.forEach((selection) => {
                  attr.values.forEach((value) => next.push({ ...selection, [attr.key]: value }));
                });
                combos = next;
              });
              return combos.map((selection) => ({
                key: Object.entries(selection)
                  .map(([axis, value]) => [normalizeVariantPart(axis), normalizeVariantPart(value)])
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([axis, value]) => `${axis}=${value}`)
                  .join("|"),
              }));
            }
            if (sizes.length > 0 && colors.length > 0) {
              return sizes.flatMap((size) =>
                colors.map((color) => ({ key: createVariantKey(size, color) }))
              );
            }
            if (sizes.length > 0) {
              return sizes.map((size) => ({ key: createVariantKey(size, "") }));
            }
            if (colors.length > 0) {
              return colors.map((color) => ({ key: createVariantKey("", color) }));
            }
            return [];
          };

          const productCombos = buildCombinationsForProduct(product.variants);

          const normalizeVariantMap = (map) => {
            if (!map) return {};
            const normalized = {};
            Object.entries(map).forEach(([key, value]) => {
              const canonicalKey = getCanonicalKey(key);
              const matchingCombo = productCombos.find(c => getCanonicalKey(c.key) === canonicalKey);
              if (matchingCombo) {
                normalized[matchingCombo.key] = value;
              } else {
                const normalizedKey = key.split('|')
                  .map(part => part.trim().toLowerCase())
                  .filter(Boolean)
                  .sort()
                  .join('|');
                normalized[normalizedKey] = value;
              }
            });
            return normalized;
          };

          let discountVal = product.discount;
          if ((discountVal === undefined || discountVal === null || discountVal === "" || discountVal === 0) && product.originalPrice && product.price) {
            const mrp = parseFloat(product.originalPrice);
            const selling = parseFloat(product.price);
            if (mrp > 0 && selling <= mrp) {
              discountVal = Math.round(((mrp - selling) / mrp) * 100);
            }
          }

          setFormData({
            name: product.name || "",
            unit: product.unit || "",
            price: product.price || "",
            originalPrice: product.originalPrice || product.price || "",
            image: product.image || "",
            images: product.images || [],
            categoryId: isSubcategory
              ? category.parentId
              : productCategoryId || null,
            subcategoryId: isSubcategory
              ? productCategoryId
              : product.subcategoryId || null,
            brandId: productBrandId || null,
            warrantyPeriod: product.warrantyPeriod || "",
            guaranteePeriod: product.guaranteePeriod || "",
            hsnCode: product.hsnCode || "",
            productCode: product.productCode || "",
            division: product.division || "Unisex",
            flashSale: product.flashSale || false,
            isNewArrival: product.isNewArrival || false,
            isFeatured: product.isFeatured || false,
            isVisible: product.isVisible !== undefined ? product.isVisible : true,
            codAllowed:
              product.codAllowed !== undefined ? product.codAllowed : true,
            returnable:
              product.returnable !== undefined ? product.returnable : true,
            cancelable:
              product.cancelable !== undefined ? product.cancelable : true,
            taxIncluded:
              product.taxIncluded !== undefined ? product.taxIncluded : false,
            description: product.description || "",
            tags: product.tags || [],
            variants: {
              sizes: product.variants?.sizes || [],
              colors: product.variants?.colors || [],
              materials: product.variants?.materials || [],
              attributes: product.variants?.attributes || [],
              prices: normalizeVariantMap(product.variants?.prices),
              stockMap: normalizeVariantMap(product.variants?.stockMap),
              imageMap: product.variants?.imageMap || {},
              defaultVariant: product.variants?.defaultVariant || {},
              defaultSelection: product.variants?.defaultSelection || {},
            },
            seoTitle: product.seoTitle || "",
            seoDescription: product.seoDescription || "",
            relatedProducts: product.relatedProducts || [],
            faqs: Array.isArray(product.faqs) ? product.faqs : [],
            approvalStatus: product.approvalStatus || "pending",
            stock: product.stock || "in_stock",
            stockQuantity: product.stockQuantity || 0,
            totalAllowedQuantity: product.totalAllowedQuantity || "",
            minimumOrderQuantity: product.minimumOrderQuantity || "",
            vendorPrice: product.vendorPrice || product.originalPrice || "",
            vendorId: product.vendorId?._id || product.vendorId || null,
            discount: discountVal || 0,
          });
          setTagInput((product.tags || []).join(", "));

          // Initialize targetStock and manual edits
          setTargetStock(product.stockQuantity || "");
          const initialManual = {};
          if (product.variants?.stockMap) {
            Object.entries(product.variants.stockMap).forEach(([key, val]) => {
              if (val !== undefined && val !== "" && val !== null) {
                initialManual[key] = true;
              }
            });
          }
          setManuallyEditedVariants(initialManual);
        }
      } catch (error) {
        toast.error("Failed to fetch product details");
        onClose();
      }
    };

    if (isOpen && isEdit && productId && categories.length > 0) {
      fetchProduct();
    } else if (isOpen && !isEdit) {
      // Reset form for new product
      setFormData({
        name: "",
        unit: "",
        price: "",
        originalPrice: "",
        image: "",
        images: [],
        categoryId: null,
        subcategoryId: null,
        brandId: null,
        vendorId: "",
        stock: "in_stock",
        stockQuantity: "",
        totalAllowedQuantity: "",
        minimumOrderQuantity: "",
        warrantyPeriod: "",
        guaranteePeriod: "",
        hsnCode: "",
        productCode: "",
        division: "Unisex",
        flashSale: false,
        isNewArrival: false,
        isFeatured: false,
        isVisible: true,
        codAllowed: true,
        returnable: true,
        cancelable: true,
        taxIncluded: false,
        description: "",
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
        approvalStatus: "pending",
      });
      setTagInput("");
      setTargetStock("");
      setManuallyEditedVariants({});
    }
  }, [isOpen, isEdit, productId, onClose, categories]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "name") {
      // Only allow alphanumeric characters and spaces
      if (!/^[a-zA-Z0-9\s]*$/.test(value)) {
        return;
      }
    }

    if (name === "unit") {
      // Only allow alphabetical characters and spaces for unit (e.g., Piece, Kg, Gram)
      if (!/^[a-zA-Z\s]*$/.test(value)) {
        return;
      }
    }

    if (name === "hsnCode") {
      // Only allow numbers
      if (!/^\d*$/.test(value)) {
        return;
      }
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

      // If price was updated by the above logic, sync variant prices
      if (next.price !== undefined && next.price !== prev.price) {
        const nextPrices = { ...(prev.variants?.prices || {}) };
        let hasVariants = false;
        
        // Force update all existing keys
        Object.keys(nextPrices).forEach(key => {
          hasVariants = true;
          nextPrices[key] = next.price === "" ? "" : Number(next.price);
        });

        // Force update all active combinations
        if (typeof variantCombinations !== 'undefined' && Array.isArray(variantCombinations)) {
          variantCombinations.forEach(combo => {
            hasVariants = true;
            nextPrices[combo.key] = next.price === "" ? "" : Number(next.price);
          });
        }

        if (hasVariants) {
          next.variants = { ...(prev.variants || {}), prices: nextPrices };
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
      return formData.stockQuantity || "Stock";
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
    return remaining >= 0 ? `${remaining} (recom.)` : (formData.stockQuantity || "Stock");
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

  const [marginInput, setMarginInput] = useState("0");
  const marginInputRef = useRef(null);

  useEffect(() => {
    // Sync margin input with price changes, but only if not currently typing in it
    if (document.activeElement !== marginInputRef.current) {
      if (formData.price && formData.vendorPrice) {
        const price = parseFloat(formData.price) || 0;
        const cost = parseFloat(formData.vendorPrice) || 0;
        if (cost > 0) {
          const calculated = ((price - cost) / cost) * 100;
          setMarginInput(calculated.toFixed(2));
        }
      }
    }
  }, [formData.vendorPrice, formData.price]);

  const handleMarginChange = (e) => {
    const val = e.target.value;
    setMarginInput(val);

    const margin = parseFloat(val) || 0;
    const cost = parseFloat(formData.vendorPrice) || 0;
    if (cost > 0) {
      const newPriceStr = (cost + (cost * margin) / 100).toFixed(2);
      
      setFormData((prev) => {
        const next = { ...prev, price: newPriceStr };
        const oldPrice = prev.price;
        
        // Sync variant prices if they match the old price
        if (prev.variants?.prices) {
          const nextPrices = { ...prev.variants.prices };
          let hasVariants = false;
          Object.keys(nextPrices).forEach(key => {
            hasVariants = true;
            if (nextPrices[key] === Number(oldPrice) || nextPrices[key] === oldPrice || nextPrices[key] === "" || nextPrices[key] === undefined) {
              nextPrices[key] = newPriceStr === "" ? "" : Number(newPriceStr);
            }
          });
          if (hasVariants) {
            next.variants = { ...prev.variants, prices: nextPrices };
          }
        }
        return next;
      });
    }
  };

  // Auto-calculate total stock from variants (Centralized Logic)
  useEffect(() => {
    const stockMap = formData.variants?.stockMap || {};
    const total = Object.values(stockMap).reduce((sum, val) => {
      const num = parseInt(val, 10);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

    const currentTotal = parseInt(formData.stockQuantity || 0, 10);
    const hasAnyVariants = variantCombinations.length > 0;

    if (hasAnyVariants && total !== currentTotal) {
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
  }, [formData.variants?.stockMap, variantCombinations.length, manuallyEditedVariants]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingMainImage(true);
    try {
      const response = await uploadAdminImage(file, "products");
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error("Image upload failed");
        return;
      }
      setFormData((prev) => ({
        ...prev,
        image: imageUrl,
      }));
      toast.success("Image uploaded");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingMainImage(false);
      e.target.value = "";
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Validate all files
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

    setIsUploadingGallery(true);
    try {
      const uploadResults = await Promise.allSettled(
        validFiles.map((file) => uploadAdminImage(file, "products"))
      );

      const successfulUrls = uploadResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value?.data?.url)
        .filter(Boolean);

      if (successfulUrls.length > 0) {
        setFormData((prev) => ({
          ...prev,
          images: [...(prev.images || []), ...successfulUrls],
        }));
        toast.success(`${successfulUrls.length} image(s) added to gallery`);
      }
    } finally {
      setIsUploadingGallery(false);
      e.target.value = "";
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


  const syncVariantMaps = (sizes = [], colors = [], variants = {}) => {
    const combinations = [];
    if (sizes.length > 0 && colors.length > 0) {
      sizes.forEach(size => {
        colors.forEach(color => {
          combinations.push({ key: createVariantKey(size, color) });
        });
      });
    } else if (sizes.length > 0) {
      sizes.forEach(size => {
        combinations.push({ key: createVariantKey(size, "") });
      });
    } else if (colors.length > 0) {
      colors.forEach(color => {
        combinations.push({ key: createVariantKey("", color) });
      });
    }

    const nextPrices = {};
    const nextStockMap = {};
    const nextImageMap = {};

    combinations.forEach(({ key }) => {
      if (!key) return;
      if (variants.prices && Object.prototype.hasOwnProperty.call(variants.prices, key)) {
        nextPrices[key] = variants.prices[key];
      }
      if (variants.stockMap && Object.prototype.hasOwnProperty.call(variants.stockMap, key)) {
        nextStockMap[key] = variants.stockMap[key];
      }
      if (variants.imageMap && variants.imageMap[key]) {
        nextImageMap[key] = variants.imageMap[key];
      }
    });

    return { prices: nextPrices, stockMap: nextStockMap, imageMap: nextImageMap };
  };

  const updateVariantAxes = (axis, rawText) => {
    const parsed = parseVariantAxis(rawText);
    setFormData((prev) => {
      const nextSizes = axis === "sizes" ? parsed : (prev.variants?.sizes || []);
      const nextColors = axis === "colors" ? parsed : (prev.variants?.colors || []);
      const synced = syncVariantMaps(nextSizes, nextColors, prev.variants || {});
      const prevDefault = prev.variants?.defaultVariant || {};
      const nextDefaultSize = String(prevDefault.size || "");
      const nextDefaultColor = String(prevDefault.color || "");

      // For new variants, we can optionally pre-fill with main price/stock
      // but let's keep it empty to use placeholders/fallbacks for now.

      return {
        ...prev,
        variants: {
          ...prev.variants,
          sizes: nextSizes,
          colors: nextColors,
          prices: synced.prices,
          stockMap: synced.stockMap,
          imageMap: synced.imageMap,
          defaultVariant: {
            size: nextSizes.includes(nextDefaultSize) ? nextDefaultSize : "",
            color: nextColors.includes(nextDefaultColor) ? nextDefaultColor : "",
          },
        },
      };
    });
  };

  const syncAllVariants = (field, value) => {
    if (!value && value !== 0 && value !== "") return;
    setFormData(prev => {
      const fieldName = field === 'price' ? 'prices' : 'stockMap';
      const nextMap = { ...(prev.variants?.[fieldName] || {}) };

      variantCombinations.forEach(combo => {
        nextMap[combo.key] = value === "" ? "" : Number(value);
      });

      return {
        ...prev,
        variants: {
          ...prev.variants,
          [fieldName]: nextMap
        }
      };
    });
    toast.success(`Applied ${field} to all variants`);
  };

  const applyValueToSimilar = (field, combo, value) => {
    if (!combo || (!value && value !== 0 && value !== "" && field !== 'image')) return;

    // Determine the most relevant attribute to match on
    // Priority: Color (for images), then Size, then first dynamic attribute
    let matchKey = "";
    let matchValue = "";

    if (combo.color) {
      matchKey = "color";
      matchValue = combo.color;
    } else if (combo.size) {
      matchKey = "size";
      matchValue = combo.size;
    } else if (combo.selection) {
      const firstAttr = Object.entries(combo.selection)[0];
      if (firstAttr) {
        matchKey = "selection";
        matchValue = firstAttr; // We'll handle this specially
      }
    }

    if (!matchKey) return;

    setFormData(prev => {
      const fieldName = field === 'price' ? 'prices' : (field === 'stock' ? 'stockMap' : 'imageMap');
      const nextMap = { ...(prev.variants?.[fieldName] || {}) };

      variantCombinations.forEach(c => {
        let isMatch = false;
        if (matchKey === "selection") {
          isMatch = c.selection?.[matchValue[0]] === matchValue[1];
        } else {
          isMatch = c[matchKey] === matchValue;
        }

        if (isMatch) {
          nextMap[c.key] = field === 'image' ? value : (value === "" ? "" : Number(value));
        }
      });

      return {
        ...prev,
        variants: {
          ...prev.variants,
          [fieldName]: nextMap
        }
      };
    });
    toast.success(`Applied to all variants with ${matchKey === 'selection' ? matchValue[0] : matchKey}: ${matchKey === 'selection' ? matchValue[1] : matchValue}`);
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


  const parseAxisValues = (rawText) =>
    String(rawText || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean);

  const addAttributeRow = () => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        attributes: [...(prev.variants?.attributes || []), { name: "", values: [] }],
      },
    }));
  };

  const removeAttributeRow = (index) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        attributes: (prev.variants?.attributes || []).filter((_, i) => i !== index),
      },
    }));
  };

  const updateAttributeName = (index, name) => {
    setFormData((prev) => {
      const next = [...(prev.variants?.attributes || [])];
      next[index] = { ...(next[index] || {}), name: String(name || "") };
      return { ...prev, variants: { ...prev.variants, attributes: next } };
    });
  };

  const updateAttributeValues = (index, rawValues) => {
    setFormData((prev) => {
      const next = [...(prev.variants?.attributes || [])];
      next[index] = { ...(next[index] || {}), values: parseAxisValues(rawValues) };
      return { ...prev, variants: { ...prev.variants, attributes: next } };
    });
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

    setIsUploadingGallery(true);
    try {
      const response = await uploadAdminImage(file, "products/variants");
      const imageUrl = response?.data?.url;
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
    } finally {
      setIsUploadingGallery(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Comprehensive custom validation
    const missingFields = [];
    if (!formData.name?.trim()) {
      missingFields.push({ label: "Product Name", name: "name" });
    }

    const parsedPrice = parseFloat(formData.price || 0);
    if (!formData.price || isNaN(parsedPrice) || parsedPrice < 0) {
      missingFields.push({ label: "Selling Price", name: "price" });
    }

    const finalCategoryId = formData.subcategoryId || formData.categoryId || null;
    if (!finalCategoryId) {
      missingFields.push({ label: "Category", name: "categoryId" });
    }

    if (!formData.vendorId) {
      missingFields.push({ label: "Vendor", name: "vendorId" });
    }

    if (missingFields.length > 0) {
      toast.error(`Please fill in the remaining required fields: ${missingFields.map((f) => f.label).join(", ")}`);

      // Auto-scroll smoothly to the first missing field inside the modal scroll container
      const firstMissing = missingFields[0];
      let elementToScroll = document.getElementsByName(firstMissing.name)[0];
      if (firstMissing.name === "categoryId") {
        elementToScroll = document.getElementById("category-selector-button") || document.querySelector(".relative button");
      } else if (firstMissing.name === "vendorId") {
        elementToScroll = document.getElementsByName("vendorId")[0] || document.querySelector('select[name="vendorId"]');
      }
      if (elementToScroll) {
        elementToScroll.scrollIntoView({ behavior: "smooth", block: "center" });
        elementToScroll.focus?.();
      }
      return;
    }

    if (formData.originalPrice !== "" && formData.originalPrice !== null) {
      const mrp = Number(formData.originalPrice);
      if (mrp < 0) {
        toast.error("Original price cannot be negative");
        return;
      }

      const vendorPrice = Number(formData.vendorPrice || 0);
      const sellingPrice = Number(formData.price || 0);

      if (vendorPrice > 0 && mrp <= vendorPrice) {
        toast.error("Original Price (MRP) must be greater than Vendor Price (Cost)");
        return;
      }

      if (sellingPrice > 0 && mrp <= sellingPrice) {
        toast.error("Original Price (MRP) must be greater than Selling Price");
        return;
      }

      if (formData.variants && formData.variants.prices) {
        for (const [key, vPrice] of Object.entries(formData.variants.prices)) {
          if (vPrice !== "" && vPrice !== null && vPrice !== undefined) {
            const vp = Number(vPrice);
            if (vp > 0 && mrp <= vp) {
              toast.error("Original Price (MRP) must be greater than all Variant Prices");
              return;
            }
          }
        }
      }
    }

    if (formData.vendorPrice !== "" && formData.vendorPrice !== null && Number(formData.vendorPrice) < 0) {
      toast.error("Vendor price cannot be negative");
      return;
    }

    if (formData.stockQuantity !== "" && formData.stockQuantity !== null && Number(formData.stockQuantity) < 0) {
      toast.error("Stock quantity cannot be negative");
      return;
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

    // Validate Variant Prices and Stocks
    if (formData.variants) {
      const variantPrices = formData.variants.prices || {};
      const variantStocks = formData.variants.stockMap || {};

      for (const [key, price] of Object.entries(variantPrices)) {
        if (price !== "" && Number(price) < 0) {
          toast.error(`Variant price for ${key} cannot be negative`);
          return;
        }
      }

      for (const [key, stock] of Object.entries(variantStocks)) {
        if (stock !== "" && Number(stock) < 0) {
          toast.error(`Variant stock for ${key} cannot be negative`);
          return;
        }
      }
    }

    // Validate Variant Stock aggregate
    const mainStock = parseInt(formData.stockQuantity || 0, 10);
    if (variantCombinations.length > 0) {
      let totalVariantStock = 0;
      let hasVariantsWithStock = false;
      Object.entries(formData.variants?.stockMap || {}).forEach(([key, stock]) => {
        const isValidCombination = variantCombinations.some(c => c.key === key);
        if (isValidCombination && stock !== undefined && stock !== "" && Number(stock) > 0) {
          totalVariantStock += Number(stock);
          hasVariantsWithStock = true;
        }
      });

      if (hasVariantsWithStock && totalVariantStock > mainStock) {
        toast.error(`Total variant stock (${totalVariantStock}) cannot exceed main stock quantity (${mainStock}).`);
        return;
      }
    }

    const submissionData = {
      ...formData,
      price: parseFloat(formData.price || 0),
      originalPrice: (formData.originalPrice === "" || formData.originalPrice === null)
        ? null
        : parseFloat(formData.originalPrice),
      vendorPrice: (formData.vendorPrice === "" || formData.vendorPrice === null)
        ? parseFloat(formData.price || 0)
        : parseFloat(formData.vendorPrice),
      stockQuantity: parseInt(formData.stockQuantity || 0, 10),
      totalAllowedQuantity: (formData.totalAllowedQuantity === "" || formData.totalAllowedQuantity === null || isNaN(parseInt(formData.totalAllowedQuantity)))
        ? null
        : parseInt(formData.totalAllowedQuantity, 10),
      minimumOrderQuantity: (formData.minimumOrderQuantity === "" || formData.minimumOrderQuantity === null || isNaN(parseInt(formData.minimumOrderQuantity)))
        ? null
        : parseInt(formData.minimumOrderQuantity, 10),
      categoryId: finalCategoryId,
      subcategoryId: formData.subcategoryId || null,
      brandId: formData.brandId || null,
      vendorId: formData.vendorId || null,
      variants: {
        ...formData.variants,
        prices: Object.fromEntries(
          Object.entries(formData.variants?.prices || {})
            .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
            .map(([k, v]) => [k, parseFloat(v)])
        ),
        stockMap: Object.fromEntries(
          Object.entries(formData.variants?.stockMap || {})
            .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
            .map(([k, v]) => [k, parseInt(v, 10)])
        )
      },
      faqs: (formData.faqs || [])
        .map((faq) => ({
          question: String(faq?.question || "").trim(),
          answer: String(faq?.answer || "").trim(),
        }))
        .filter((faq) => faq.question && faq.answer),
    };

    try {
      if (isEdit) {
        await updateProduct(productId, submissionData);
        toast.success("Product updated successfully");
      } else {
        await createProduct(submissionData);
        toast.success("Product created successfully");
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      // Error is handled in interceptor
    }
  };

  const handleApprove = async () => {
    if (!formData.name || !formData.price || !formData.stockQuantity) {
      toast.error("Please fill in name, price and stock before approving");
      return;
    }

    if (Number(formData.price) < 0 || Number(formData.stockQuantity) < 0) {
      toast.error("Price and Stock cannot be negative");
      return;
    }

    if (formData.originalPrice !== "" && formData.originalPrice !== null) {
      const mrp = Number(formData.originalPrice);
      if (mrp < 0) {
        toast.error("Original price cannot be negative");
        return;
      }

      const vendorPrice = Number(formData.vendorPrice || 0);
      const sellingPrice = Number(formData.price || 0);

      if (vendorPrice > 0 && mrp <= vendorPrice) {
        toast.error("Original Price (MRP) must be greater than Vendor Price (Cost)");
        return;
      }

      if (sellingPrice > 0 && mrp <= sellingPrice) {
        toast.error("Original Price (MRP) must be greater than Selling Price");
        return;
      }
    }

    if (formData.vendorPrice !== "" && formData.vendorPrice !== null && Number(formData.vendorPrice) < 0) {
      toast.error("Vendor price cannot be negative");
      return;
    }

    const finalCategoryId = formData.subcategoryId || formData.categoryId || null;
    if (!finalCategoryId) {
      toast.error("Please select a category before approving");
      return;
    }

    // Validate Variant Prices and Stocks before approval
    if (formData.variants) {
      const variantPrices = formData.variants.prices || {};
      const variantStocks = formData.variants.stockMap || {};

      for (const [key, price] of Object.entries(variantPrices)) {
        if (price !== "" && Number(price) < 0) {
          toast.error(`Variant price for ${key} cannot be negative`);
          return;
        }
      }

      for (const [key, stock] of Object.entries(variantStocks)) {
        if (stock !== "" && Number(stock) < 0) {
          toast.error(`Variant stock for ${key} cannot be negative`);
          return;
        }
      }
    }

    try {
      // First update the status and activation fields
      await updateProductStatus(productId, "approved");

      // Validate Variant Stock
      const mainStock = parseInt(formData.stockQuantity || 0, 10);
      if (variantCombinations.length > 0) {
        let totalVariantStock = 0;
        let hasVariantsWithStock = false;
        Object.entries(formData.variants?.stockMap || {}).forEach(([key, stock]) => {
          const isValidCombination = variantCombinations.some(c => c.key === key);
          if (isValidCombination && stock !== undefined && stock !== "") {
            totalVariantStock += Number(stock);
            hasVariantsWithStock = true;
          }
        });

        if (hasVariantsWithStock && totalVariantStock > mainStock) {
          toast.error(`Total variant stock (${totalVariantStock}) cannot exceed main stock quantity (${mainStock}).`);
          return;
        }
      }

      // Then save the rest of the form (prices, etc)
      const submissionData = {
        ...formData,
        price: parseFloat(formData.price || 0),
        originalPrice: (formData.originalPrice === "" || formData.originalPrice === null)
          ? null
          : parseFloat(formData.originalPrice),
        vendorPrice: (formData.vendorPrice === "" || formData.vendorPrice === null)
          ? parseFloat(formData.price || 0)
          : parseFloat(formData.vendorPrice),
        stockQuantity: parseInt(formData.stockQuantity || 0, 10),
        totalAllowedQuantity: (formData.totalAllowedQuantity === "" || formData.totalAllowedQuantity === null || isNaN(parseInt(formData.totalAllowedQuantity)))
          ? null
          : parseInt(formData.totalAllowedQuantity, 10),
        minimumOrderQuantity: (formData.minimumOrderQuantity === "" || formData.minimumOrderQuantity === null || isNaN(parseInt(formData.minimumOrderQuantity)))
          ? null
          : parseInt(formData.minimumOrderQuantity, 10),
        categoryId: finalCategoryId,
        subcategoryId: formData.subcategoryId || null,
        brandId: formData.brandId || null,
        vendorId: formData.vendorId || null,
        variants: {
          ...formData.variants,
          prices: Object.fromEntries(
            Object.entries(formData.variants?.prices || {})
              .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
              .map(([k, v]) => [k, parseFloat(v)])
          ),
          stockMap: Object.fromEntries(
            Object.entries(formData.variants?.stockMap || {})
              .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
              .map(([k, v]) => [k, parseInt(v, 10)])
          )
        },
        faqs: (formData.faqs || [])
          .map((faq) => ({
            question: String(faq?.question || "").trim(),
            answer: String(faq?.answer || "").trim(),
          }))
          .filter((faq) => faq.question && faq.answer),
        isActive: true,
        isVisible: true,
        approvalStatus: "approved"
      };

      await updateProduct(productId, submissionData);
      toast.success("Product approved and saved successfully");

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      // Error handled by interceptor
    }
  };

  const handleReject = async () => {
    try {
      await updateProductStatus(productId, "rejected");
      toast.success("Product rejected");
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      // Error handled by interceptor
    }
  };

  const originalPriceVal = formData.originalPrice !== "" && formData.originalPrice !== null ? parseFloat(formData.originalPrice) : null;
  const vendorPriceVal = formData.vendorPrice !== "" && formData.vendorPrice !== null ? parseFloat(formData.vendorPrice) : null;
  const sellingPriceVal = formData.price !== "" && formData.price !== null ? parseFloat(formData.price) : null;
  let originalPriceError = "";
  if (originalPriceVal !== null && originalPriceVal < 0) {
    originalPriceError = "Cannot be negative";
  } else if (vendorPriceVal !== null && vendorPriceVal > 0 && originalPriceVal <= vendorPriceVal) {
    originalPriceError = "Must be greater than Vendor Price";
  } else if (sellingPriceVal !== null && sellingPriceVal > 0 && originalPriceVal <= sellingPriceVal) {
    originalPriceError = "Must be greater than Selling Price";
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
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
            className={`fixed inset-0 z-[10000] flex ${isAppRoute ? "items-start pt-[10px]" : "items-end"
              } sm:items-center justify-center p-4 pointer-events-none`}>
            <motion.div
              variants={{
                hidden: {
                  y: isAppRoute ? "-100%" : "100%",
                  scale: 0.95,
                  opacity: 0,
                },
                visible: {
                  y: 0,
                  scale: 1,
                  opacity: 1,
                  transition: {
                    type: "spring",
                    damping: 22,
                    stiffness: 350,
                    mass: 0.7,
                  },
                },
                exit: {
                  y: isAppRoute ? "-100%" : "100%",
                  scale: 0.95,
                  opacity: 0,
                  transition: {
                    type: "spring",
                    damping: 30,
                    stiffness: 400,
                  },
                },
              }}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className={`bg-white ${isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
                } sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col pointer-events-auto`}
              style={{ willChange: "transform" }}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {isEdit ? "Edit Product" : "Create Product"}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {isEdit
                      ? "Update product information"
                      : "Add a new product to your catalog"}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <FiX className="text-xl text-gray-600" />
                </button>
              </div>

              {hasPendingUpdates && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mx-4 mt-4 sm:mx-6 rounded-r-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-amber-500 font-bold text-xl">⚠️</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-amber-800">
                        Pending Updates from Vendor
                      </h3>
                      <div className="mt-1 text-sm text-amber-700">
                        <p>
                          This product has staged changes. The form below shows the vendor's proposed updates. Click <strong>Save Product</strong> to approve and apply these changes, or modify them as needed before saving.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Content - Scrollable */}
              <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                <form onSubmit={handleSubmit} noValidate className="space-y-6">
                  {/* Basic Information */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Basic Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Product Code
                        </label>
                        <input
                          type="text"
                          name="productCode"
                          value={formData.productCode || ""}
                          onChange={handleChange}
                          placeholder="Code on the physical sticker, e.g. CLH-1042"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                        />
                        <p className="mt-1 text-[10px] text-gray-500">
                          Must be unique. Printed on every order line so this exact piece can be matched.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Gender / Division
                        </label>
                        <AnimatedSelect
                          name="division"
                          value={formData.division || "Unisex"}
                          onChange={handleChange}
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

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Unit
                        </label>
                        <input
                          type="text"
                          name="unit"
                          value={formData.unit}
                          onChange={handleChange}
                          placeholder="e.g., Piece, Kilogram, Gram"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                              .map((brand) => ({
                                value: String(brand.id || brand._id),
                                label: brand.name,
                              })),
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Vendor <span className="text-red-500">*</span>
                        </label>
                        <AnimatedSelect
                          name="vendorId"
                          value={formData.vendorId || ""}
                          onChange={handleChange}
                          placeholder="Select Vendor"
                          options={[
                            { value: "", label: "Select Vendor" },
                            ...vendors.map((vendor) => ({
                              value: String(vendor._id || vendor.id),
                              label: vendor.storeName || vendor.name || "Vendor",
                            })),
                          ]}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Description
                        </label>
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleChange}
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Product description..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Pricing & Margin
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Tier 1: MRP */}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <label className="block text-sm font-bold text-gray-700 mb-2">
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
                          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white font-bold no-spinner ${originalPriceError ? 'border-red-500 focus:ring-red-500 text-red-900' : 'border-gray-300 focus:ring-gray-500'}`}
                          placeholder="MRP for strikethrough"
                        />
                        {originalPriceError ? (
                          <p className="mt-1 text-xs text-red-500 font-medium">{originalPriceError}</p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">Maximum Retail Price</p>
                        )}
                      </div>

                      {/* Tier 2: Vendor Pricing */}
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <label className="block text-sm font-bold text-blue-700 mb-2">
                          Vendor Price (Cost)
                        </label>
                        <input
                          type="number"
                          name="vendorPrice"
                          value={formData.vendorPrice}
                          onChange={handleChange}
                          onWheel={(e) => e.target.blur()}
                          min="0"
                          step="0.01"
                          className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold text-blue-900 no-spinner"
                          placeholder="Vendor's payment"
                        />
                        <p className="mt-1 text-xs text-blue-600">Base cost from vendor</p>
                      </div>

                      {/* Tier 3: Margin */}
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <label className="block text-sm font-bold text-purple-700 mb-2">
                          Margin (%)
                        </label>
                        <div className="relative">
                          <input
                            ref={marginInputRef}
                            type="number"
                            value={marginInput}
                            onChange={handleMarginChange}
                            onWheel={(e) => e.target.blur()}
                            step="0.1"
                            className="w-full pl-3 pr-8 py-2 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white font-bold text-purple-900 no-spinner"
                            placeholder="Profit %"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 font-bold text-xs">%</span>
                        </div>
                        <p className="mt-1 text-xs text-purple-600">Calculates selling price</p>
                      </div>

                      {/* Tier 4: Selling Price */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <label className="block text-sm font-bold text-green-700 mb-2">
                          Selling Price <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          name="price"
                          value={formData.price}
                          onChange={(e) => {
                            const newPrice = e.target.value;
                            setFormData(prev => {
                              const oldPrice = prev.price;
                              const next = { ...prev, price: newPrice };
                              if (prev.variants?.prices) {
                                const nextPrices = { ...prev.variants.prices };
                                let hasVariants = false;
                                Object.keys(nextPrices).forEach(key => {
                                  hasVariants = true;
                                  // Sync if it was matching the old price or if it's empty
                                  if (nextPrices[key] === Number(oldPrice) || nextPrices[key] === oldPrice || nextPrices[key] === "" || nextPrices[key] === undefined) {
                                    nextPrices[key] = newPrice === "" ? "" : Number(newPrice);
                                  }
                                });
                                if (hasVariants) {
                                  next.variants = { ...prev.variants, prices: nextPrices };
                                }
                              }
                              return next;
                            });
                          }}
                          required
                          min="0"
                          step="0.01"
                          onWheel={(e) => e.target.blur()}
                          className="w-full px-3 py-2 text-sm border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white font-bold text-green-900 no-spinner"
                          placeholder="Final price"
                        />
                        <p className="mt-1 text-xs text-green-600 font-medium">Customer-facing price</p>
                      </div>

                      {formData.price && formData.vendorPrice && parseFloat(formData.vendorPrice) > 0 && (
                        <div className="md:col-span-4 bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center">
                          <div className="flex gap-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-gray-500 ">Net Profit</span>
                              <span className={`text-sm font-bold ${parseFloat(formData.price) - parseFloat(formData.vendorPrice) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatPrice(parseFloat(formData.price) - parseFloat(formData.vendorPrice))}
                              </span>
                            </div>
                            <div className="flex flex-col border-l pl-4 border-gray-300">
                              <span className="text-[10px] uppercase font-bold text-gray-500 ">Markup %</span>
                              {(() => {
                                const mp = ((parseFloat(formData.price) - parseFloat(formData.vendorPrice)) / parseFloat(formData.vendorPrice)) * 100;
                                return (
                                  <span className={`text-sm font-bold ${mp >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {mp.toFixed(2)}%
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col border-l pl-4 border-gray-300">
                              <span className="text-[10px] uppercase font-bold text-gray-500 ">Total Customer Discount</span>
                              <span className="text-sm font-bold text-orange-600">
                                {formData.originalPrice && parseFloat(formData.originalPrice || 0) > parseFloat(formData.price || 0)
                                  ? formatPrice(parseFloat(formData.originalPrice || 0) - parseFloat(formData.price || 0))
                                  : "No Discount"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-gray-500 ">Listing Price</span>
                              <span className="text-xl font-bold text-gray-900 leading-tight">
                                {formatPrice(parseFloat(formData.price))}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Product Media */}
                  <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 sm:p-6 border-2 border-primary-200 shadow-lg">
                    <h3 className="text-xl font-bold text-primary-800 mb-6 flex items-center gap-2">
                      <FiUpload className="text-2xl" />
                      Product Media
                    </h3>

                    <div className="space-y-6">
                      {/* Main Image */}
                      <div className="bg-white rounded-lg p-4 border border-primary-200">
                        <h4 className="text-lg font-semibold text-gray-800 mb-4">
                          Main Image
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Upload Main Image
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                              id="main-image-upload-modal"
                              disabled={isUploadingMainImage}
                            />
                            <label
                              htmlFor="main-image-upload-modal"
                              className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-primary-300 rounded-lg transition-colors bg-white ${isUploadingMainImage ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary-500 hover:bg-primary-50"}`}>
                              <FiUpload className="text-lg text-primary-600" />
                              <span className="text-sm font-medium text-gray-700">
                                {isUploadingMainImage
                                  ? "Uploading Main Image..."
                                  : formData.image
                                    ? "Change Main Image"
                                    : "Choose Main Image"}
                              </span>
                            </label>
                          </div>
                          {formData.image && (
                            <div className="mt-4 flex items-start gap-4">
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
                                onClick={() =>
                                  setFormData({ ...formData, image: "" })
                                }
                                className="mt-2 px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium">
                                Remove Image
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Product Gallery */}
                      <div className="bg-white rounded-lg p-4 border border-primary-200">
                        <h4 className="text-lg font-semibold text-gray-800 mb-4">
                          Product Gallery
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Upload Gallery Images (Multiple)
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleGalleryUpload}
                              className="hidden"
                              id="gallery-upload-modal"
                              disabled={isUploadingGallery}
                            />
                            <label
                              htmlFor="gallery-upload-modal"
                              className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-primary-300 rounded-lg transition-colors bg-white ${isUploadingGallery ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary-500 hover:bg-primary-50"}`}>
                              <FiUpload className="text-lg text-primary-600" />
                              <span className="text-sm font-medium text-gray-700">
                                {isUploadingGallery
                                  ? "Uploading Gallery Images..."
                                  : "Choose Gallery Images"}
                              </span>
                            </label>
                          </div>
                          {formData.images && formData.images.length > 0 && (
                            <div className="mt-4">
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                              <p className="mt-2 text-xs text-gray-500">
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
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Inventory
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Stock Quantity <span className="text-red-500">*</span>
                        </label>
                        <div className="relative group">
                          <input
                            type="number"
                            name="stockQuantity"
                            value={formData.stockQuantity}
                            onChange={handleChange}
                            onWheel={(e) => e.target.blur()}
                            required
                            min="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 no-spinner"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Stock Status
                        </label>
                        <AnimatedSelect
                          name="stock"
                          value={formData.stock}
                          onChange={handleChange}
                          options={[
                            { value: "in_stock", label: "In Stock" },
                            { value: "low_stock", label: "Low Stock" },
                            { value: "out_of_stock", label: "Out of Stock" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Product Information */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Additional Product Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Total Allowed Quantity
                        </label>
                        <input
                          type="number"
                          name="totalAllowedQuantity"
                          value={formData.totalAllowedQuantity}
                          onChange={handleChange}
                          min="0"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Enter total allowed quantity"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Minimum Order Quantity
                        </label>
                        <input
                          type="number"
                          name="minimumOrderQuantity"
                          value={formData.minimumOrderQuantity}
                          onChange={handleChange}
                          min="1"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Enter minimum order quantity"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Warranty Period
                        </label>
                        <input
                          type="text"
                          name="warrantyPeriod"
                          value={formData.warrantyPeriod}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="e.g., 1 Year, 6 Months"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Guarantee Period
                        </label>
                        <input
                          type="text"
                          name="guaranteePeriod"
                          value={formData.guaranteePeriod}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="e.g., 1 Year, 6 Months"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          HSN Code
                        </label>
                        <input
                          type="text"
                          name="hsnCode"
                          value={formData.hsnCode}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Enter HSN Code"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Product Variants */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Product Variants
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Sizes
                        </label>
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
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-semibold text-gray-700">
                            Dynamic Attributes (optional)
                          </label>
                          <button
                            type="button"
                            onClick={addAttributeRow}
                            className="px-2 py-1 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-white hover:text-black"
                          >
                            Add Attribute
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(formData.variants?.attributes || []).map((attribute, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                              <input
                                type="text"
                                value={attribute?.name || ""}
                                onChange={(e) => updateAttributeName(index, e.target.value)}
                                placeholder="Attribute name"
                                className="md:col-span-3 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                              <input
                                type="text"
                                value={(attribute?.values || []).join(", ")}
                                onChange={(e) => updateAttributeValues(index, e.target.value)}
                                placeholder="Values (comma separated)"
                                className="md:col-span-8 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                        <div className="border border-gray-200 rounded-lg p-4 bg-white">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                            <p className="text-xs font-bold text-gray-700">
                              Variant Price / Stock / Image Details
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => syncAllVariants('price', formData.price)}
                                className="text-[10px] font-bold px-2 py-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                              >
                                Use Main Price For All
                              </button>
                              <button
                                type="button"
                                onClick={() => syncAllVariants('stock', formData.stockQuantity)}
                                className="text-[10px] font-bold px-2 py-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                              >
                                Use Main Stock For All
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {variantCombinations.map((combo, idx) => {
                              const vPrice = formData.variants?.prices?.[combo.key];
                              const vStock = formData.variants?.stockMap?.[combo.key];
                              const vImage = formData.variants?.imageMap?.[combo.key];

                              return (
                                <div key={combo.key} className="p-3 bg-gray-50 rounded-xl border border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="md:w-1/4">
                                      <p className="text-sm font-bold text-gray-800">
                                        {combo.label || ((combo.size || "Any Size") + " / " + (combo.color || "Any Color"))}
                                      </p>
                                      <p className="text-[10px] text-gray-500 uppercase font-medium tracking-wider">Variant Option</p>
                                    </div>

                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {/* Price Input */}
                                      <div className="relative group">
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Price</label>
                                        <div className="flex gap-1">
                                          <div className="w-full">
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={vPrice !== undefined ? vPrice : formData.price || ""}
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
                                              onWheel={(e) => e.target.blur()}
                                              className={`w-full px-3 py-2 bg-white border rounded-lg focus:ring-2 outline-none text-sm font-medium no-spinner ${originalPriceVal !== null && vPrice !== undefined && vPrice !== "" && originalPriceVal <= Number(vPrice) ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}`}
                                              placeholder={formData.price || "Price"}
                                            />
                                            {originalPriceVal !== null && vPrice !== undefined && vPrice !== "" && originalPriceVal <= Number(vPrice) && (
                                              <p className="text-red-500 text-[10px] mt-1 font-medium leading-tight">Must be &lt; MRP</p>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => applyValueToSimilar('price', combo, vPrice ?? formData.price)}
                                            className="px-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                                            title="Apply this price to all similar variants"
                                          >
                                            <FiSave size={14} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Stock Input */}
                                      <div className="relative group">
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Stock</label>
                                        <div className="flex gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={vStock ?? ""}
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
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm font-medium no-spinner"
                                            placeholder={getRecommendedPlaceholder(combo.key)}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => applyValueToSimilar('stock', combo, vStock ?? formData.stockQuantity)}
                                            className="px-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                                            title="Apply this stock to all similar variants"
                                          >
                                            <FiSave size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Tags
                    </h3>
                    <div>
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTagInput(val);
                          const tags = val
                            .split(",")
                            .map((t) => t.trim())
                            .filter((t) => t);
                          setFormData((prev) => ({ ...prev, tags }));
                        }}
                        placeholder="tag1, tag2, tag3"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* Product FAQs */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-800">Product FAQs</h3>
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
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                          />
                          <textarea
                            value={faq.answer || ""}
                            onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
                            rows={2}
                            placeholder="Answer"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                          />
                        </div>
                      ))}
                      {(formData.faqs || []).length === 0 && (
                        <p className="text-xs text-gray-500">No FAQs added yet.</p>
                      )}
                    </div>
                  </div>

                  {/* SEO */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      SEO Settings
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          SEO Title
                        </label>
                        <input
                          type="text"
                          name="seoTitle"
                          value={formData.seoTitle}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="SEO optimized title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          SEO Description
                        </label>
                        <textarea
                          name="seoDescription"
                          value={formData.seoDescription}
                          onChange={handleChange}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="SEO meta description"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Options
                    </h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="flashSale"
                          checked={formData.flashSale}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Flash Sale
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isNewArrival"
                          checked={formData.isNewArrival}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          New Arrival
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isFeatured"
                          checked={formData.isFeatured}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Featured Product
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isVisible"
                          checked={formData.isVisible}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Visible to Customers
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Product Settings */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                      Product Settings
                    </h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="codAllowed"
                          checked={formData.codAllowed}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          COD Allowed
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="returnable"
                          checked={formData.returnable}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Returnable
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="cancelable"
                          checked={formData.cancelable}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Cancelable
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="taxIncluded"
                          checked={formData.taxIncluded}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Tax Included in Prices
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                    <Button
                      type="button"
                      onClick={onClose}
                      variant="secondary"
                      size="sm">
                      Cancel
                    </Button>

                    {isEdit && formData.approvalStatus === 'pending' && (
                      <>
                        <Button
                          type="button"
                          onClick={handleReject}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          size="sm">
                          Reject Product
                        </Button>
                        <Button
                          type="button"
                          onClick={handleApprove}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm">
                          Approve & Save
                        </Button>
                      </>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      icon={FiSave}
                      size="sm">
                      {isEdit ? "Update Product" : "Create Product"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence >
  );
};

export default ProductFormModal;
