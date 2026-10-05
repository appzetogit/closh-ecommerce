import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FiStar,
  FiHeart,
  FiShoppingBag,
  FiMinus,
  FiPlus,
  FiArrowLeft,
  FiShare2,
  FiCheckCircle,
  FiTrash2,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../../shared/store/useStore";
import { useWishlistStore } from "../../../shared/store/wishlistStore";
import { useReviewsStore } from "../../../shared/store/reviewsStore";
import { useOrderStore } from "../../../shared/store/orderStore";
import { useAuthStore } from "../../../shared/store/authStore";
import {
  getProductById,
  getSimilarProducts,
  getVendorById,
  getBrandById,
} from "../data/catalogData";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";
import { getVariantSignature, resolveVariantPrice } from "../../../shared/utils/variant";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import ImageGallery from "../../../shared/components/Product/ImageGallery";
import VariantSelector from "../../../shared/components/Product/VariantSelector";

import MobileProductCard from "../components/Mobile/MobileProductCard";
import PageTransition from "../../../shared/components/PageTransition";
import Badge from "../../../shared/components/Badge";
import ProductCard from "../../../shared/components/ProductCard";

// Variant pricing (resolveVariantPrice) is shared with checkout/order pricing: see
// shared/utils/variant.js. This copy missed the "size|" key format.

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));
const normalizeProduct = (raw) => {
  if (!raw) return null;

  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = String(raw?.id || raw?._id || "").trim();
  if (!id) return null;

  const vendorId = String(vendorObj?._id || vendorObj?.id || raw?.vendorId || "").trim();
  const brandId = String(brandObj?._id || brandObj?.id || raw?.brandId || "").trim();
  const categoryId = String(categoryObj?._id || categoryObj?.id || raw?.categoryId || "").trim();
  const image = raw?.image || raw?.images?.[0] || "";
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : image ? [image] : [];

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    brandId,
    categoryId,
    image,
    images,
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined && raw?.originalPrice !== null
        ? Number(raw.originalPrice)
        : undefined,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    stockQuantity: Number(raw?.stockQuantity) || 0,
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    vendor: vendorObj
      ? {
        ...vendorObj,
        id: String(vendorObj?.id || vendorObj?._id || vendorId),
      }
      : null,
    brand: brandObj
      ? {
        ...brandObj,
        id: String(brandObj?.id || brandObj?._id || brandId),
      }
      : null,
    stock:
      raw?.stock ||
      (Number(raw?.stockQuantity) > 0 ? "in_stock" : "out_of_stock"),
    description: String(raw?.description || "").trim(),
  };
};

const MobileProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const localFallbackProduct = useMemo(() => normalizeProduct(getProductById(id)), [id]);
  const [product, setProduct] = useState(localFallbackProduct);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);

  const { items, addItem, removeItem } = useCartStore();
  const triggerCartAnimation = useUIStore(
    (state) => state.triggerCartAnimation
  );
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const { fetchReviews, sortReviews } = useReviewsStore();
  const { getAllOrders } = useOrderStore();
  const { user, isAuthenticated } = useAuthStore();
  const vendor = useMemo(() => {
    if (!product) return null;
    if (product.vendor?.id) return product.vendor;
    return getVendorById(product.vendorId);
  }, [product]);
  const brand = useMemo(() => {
    if (!product) return null;
    if (product.brand?.id) return product.brand;
    return getBrandById(product.brandId);
  }, [product]);

  const isFavorite = product ? isInWishlist(product.id) : false;
  const selectedVariantSignature = getVariantSignature(selectedVariant || {});
  const currentPrice = useMemo(() => {
    return resolveVariantPrice(product, selectedVariant);
  }, [product, selectedVariant]);

  const isInCart = product
    ? items.some(
      (item) =>
        String(item.id) === String(product.id) &&
        getVariantSignature(item.variant || {}) === selectedVariantSignature
    )
    : false;
  const productReviews = product ? sortReviews(product.id, "newest") : [];

  useEffect(() => {
    let active = true;
    setIsLoadingProduct(true);

    const loadProductDetail = async () => {
      try {
        const [detailRes, similarRes] = await Promise.allSettled([
          api.get(`/products/${id}`),
          api.get(`/similar/${id}`),
        ]);

        const detailPayload =
          detailRes.status === "fulfilled"
            ? detailRes.value?.data ?? detailRes.value
            : null;
        const resolvedProduct = normalizeProduct(detailPayload) || localFallbackProduct;

        const similarPayload =
          similarRes.status === "fulfilled"
            ? similarRes.value?.data ?? similarRes.value
            : null;
        const resolvedSimilar = Array.isArray(similarPayload)
          ? similarPayload
            .map(normalizeProduct)
            .filter(
              (item) => item?.id && String(item.id) !== String(resolvedProduct?.id || "")
            )
            .slice(0, 5)
          : [];

        if (!active) return;

        setProduct(resolvedProduct);
        if (resolvedSimilar.length > 0) {
          setSimilarProducts(resolvedSimilar);
        } else if (resolvedProduct?.id) {
          setSimilarProducts(getSimilarProducts(resolvedProduct.id, 5));
        } else {
          setSimilarProducts([]);
        }
      } catch {
        if (!active) return;
        setProduct(localFallbackProduct);
        setSimilarProducts(
          localFallbackProduct?.id ? getSimilarProducts(localFallbackProduct.id, 5) : []
        );
      } finally {
        if (active) setIsLoadingProduct(false);
      }
    };

    loadProductDetail();
    return () => {
      active = false;
    };
  }, [id, localFallbackProduct]);

  useEffect(() => {
    if (product?.variants?.defaultSelection && typeof product.variants.defaultSelection === "object") {
      setSelectedVariant(product.variants.defaultSelection);
      return;
    }
    if (product?.variants?.defaultVariant) {
      setSelectedVariant(product.variants.defaultVariant);
      return;
    }
    setSelectedVariant({});
  }, [product]);

  useEffect(() => {
    if (product?.id) {
      fetchReviews(product.id, { sort: "newest", limit: 50 });
    }
  }, [product?.id, fetchReviews]);

  if (!product) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              {isLoadingProduct ? (
                <h2 className="text-xl font-bold text-gray-800 mb-4">Loading product...</h2>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    Product Not Found
                  </h2>
                  <button
                    onClick={() => navigate("/home")}
                    className="gradient-green text-white px-6 py-3 rounded-xl font-semibold">
                    Go Back Home
                  </button>
                </>
              )}
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  const handleAddToCart = () => {
    if (!product) return;
    if (product.stock === "out_of_stock") {
      toast.error("Product is out of stock");
      return;
    }
    const attributeAxes = Array.isArray(product?.variants?.attributes)
      ? product.variants.attributes.filter((attr) => Array.isArray(attr?.values) && attr.values.length > 0)
      : [];
    const hasDynamicAxes = attributeAxes.length > 0;
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    const isMissingDynamicAxis = hasDynamicAxes
      ? attributeAxes.some((attr) => !String(selectedVariant?.[attr.name] || selectedVariant?.[String(attr.name || "").toLowerCase().replace(/\s+/g, "_")] || "").trim())
      : false;
    const selectedSize = String(selectedVariant?.size || "").trim();
    const selectedColor = String(selectedVariant?.color || "").trim();
    if (isMissingDynamicAxis || ((hasSizeVariants && !selectedSize) || (hasColorVariants && !selectedColor))) {
      toast.error("Please select required variant options");
      return;
    }

    const finalPrice = resolveVariantPrice(product, selectedVariant);
    const variantKey = getVariantSignature(selectedVariant || {});
    const variantStockValue = Number(
      product?.variants?.stockMap?.[variantKey] ??
      product?.variants?.stockMap?.get?.(variantKey)
    );
    const effectiveStock = Number.isFinite(variantStockValue)
      ? variantStockValue
      : Number(product.stockQuantity || 0);
    if (effectiveStock <= 0) {
      toast.error("Selected variant is out of stock");
      return;
    }
    if (quantity > effectiveStock) {
      toast.error(`Only ${effectiveStock} item(s) available for selected variant`);
      return;
    }

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      price: finalPrice,
      image: product.image,
      quantity: quantity,
      variant: selectedVariant,
      stockQuantity: effectiveStock,
      vendorId: product.vendorId,
      vendorName: vendor?.storeName || vendor?.name || product.vendorName,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
    toast.success("Added to cart!");
  };

  const handleRemoveFromCart = () => {
    if (!product) return;
    removeItem(product.id, selectedVariant || {});
    toast.success("Removed from cart!");
  };

  const handleFavorite = () => {
    if (!product) return;
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success("Removed from wishlist");
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success("Added to wishlist");
      }
    }
  };

  const handleQuantityChange = (change) => {
    const newQuantity = quantity + change;
    const variantKey = getVariantSignature(selectedVariant || {});
    const variantStockValue = Number(
      product?.variants?.stockMap?.[variantKey] ??
      product?.variants?.stockMap?.get?.(variantKey)
    );
    const maxStock = Number.isFinite(variantStockValue)
      ? Math.max(0, variantStockValue)
      : Number(product?.stockQuantity || 0);
    if (newQuantity >= 1 && newQuantity <= (maxStock || 10)) {
      setQuantity(newQuantity);
    }
  };

  const productImages = useMemo(() => {
    if (!product) return [];

    let variantImage = "";
    if (selectedVariant && product?.variants?.imageMap) {
      const signature = getVariantSignature(selectedVariant);
      const entries = product.variants.imageMap instanceof Map
        ? Array.from(product.variants.imageMap.entries())
        : Object.entries(product.variants.imageMap || {});

      // 1. Exact match
      let match = entries.find(([k]) => String(k).trim() === signature);
      
      // 2. Case-insensitive match 
      if (!match) {
        match = entries.find(([k]) => String(k).trim().toLowerCase() === signature.toLowerCase());
      }

      // 3. Simple axis match or legacy format (size|color)
      if (!match) {
        const size = String(selectedVariant.size || "").trim().toLowerCase();
        const color = String(selectedVariant.color || "").trim().toLowerCase();
        const candidates = [`${size}|${color}`, `${size}-${color}`, size && !color ? size : null, color && !size ? color : null].filter(Boolean);
        
        for (const candidate of candidates) {
          match = entries.find(([k]) => String(k).trim().toLowerCase() === candidate.toLowerCase());
          if (match) break;
        }
      }

      if (match) variantImage = String(match[1] || "").trim();
    }

    let images = [];
    if (product.image) {
      images.push(product.image);
    }
    if (Array.isArray(product.images) && product.images.length > 0) {
      const otherImages = product.images.filter(img => img !== product.image && img);
      images = [...images, ...otherImages];
    }

    if (variantImage) {
      return [variantImage, ...images.filter((img) => img !== variantImage)];
    }
    return images;
  }, [product, selectedVariant]);

  const selectedAvailableStock = useMemo(() => {
    if (!product) return 0;
    
    if (selectedVariant && product?.variants?.stockMap) {
      const signature = getVariantSignature(selectedVariant);
      const entries = product.variants.stockMap instanceof Map
        ? Array.from(product.variants.stockMap.entries())
        : Object.entries(product.variants.stockMap || {});

      let match = entries.find(([k]) => String(k).trim() === signature);
      if (!match) {
        match = entries.find(([k]) => String(k).trim().toLowerCase() === signature.toLowerCase());
      }

      if (!match) {
        const size = String(selectedVariant.size || "").trim().toLowerCase();
        const color = String(selectedVariant.color || "").trim().toLowerCase();
        const candidates = [`${size}|${color}`, `${size}-${color}`, size && !color ? size : null, color && !size ? color : null].filter(Boolean);
        
        for (const candidate of candidates) {
          match = entries.find(([k]) => String(k).trim().toLowerCase() === candidate.toLowerCase());
          if (match) break;
        }
      }

      if (match) {
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : Number(product.stockQuantity || 0);
      }
    }

    return Number(product.stockQuantity || 0);
  }, [product, selectedVariant]);

  const productFaqs = useMemo(() => {
    if (!Array.isArray(product?.faqs)) return [];
    return product.faqs
      .map((faq) => ({
        question: String(faq?.question || "").trim(),
        answer: String(faq?.answer || "").trim(),
      }))
      .filter((faq) => faq.question && faq.answer);
  }, [product?.faqs]);





  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={true}>
        <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto">
          {/* Back Button */}
          <div className="px-4 pt-4 lg:pt-8 lg:px-8 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors group">
              <div className="p-2 rounded-full group-hover:bg-gray-100 transition-colors">
                <FiArrowLeft className="text-xl" />
              </div>
              <span className="font-medium">Back</span>
            </button>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-16 lg:px-8 lg:items-start">
            {/* Left Column: Product Image */}
            <div className="px-4 py-4 lg:p-0 sticky top-24">
              <div className="bg-white rounded-3xl p-2 lg:p-4 shadow-sm border border-gray-100">
                <ImageGallery images={productImages} productName={product.name} />
              </div>
              {product.flashSale && (
                <div className="mt-4 flex justify-center lg:justify-start">
                  <Badge variant="flash" size="lg">Flash Sale - Limited Time Offer</Badge>
                </div>
              )}
            </div>

            {/* Right Column: Product Info */}
            <div className="px-4 py-4 lg:p-0">
              <div className="flex flex-col gap-6">
                <div>
                  {/* Vendor Badge */}
                  {vendor && (
                    <div className="mb-4">
                      <Link
                        to={`/seller/${vendor.id}`}
                        className="inline-flex items-center gap-3 px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-full transition-all duration-300 border border-gray-200 group">
                        {vendor.storeLogo ? (
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-gray-200 flex-shrink-0">
                            <img
                              src={vendor.storeLogo}
                              alt={vendor.storeName || vendor.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                            <FiShoppingBag className="text-white text-xs" />
                          </div>
                        )}
                        <span className="font-medium text-sm group-hover:text-primary-600 transition-colors">
                          {vendor.storeName || vendor.name}
                        </span>
                        {vendor.isVerified && (
                          <FiCheckCircle
                            className="text-accent-500 text-sm"
                            title="Verified Vendor"
                          />
                        )}
                        <span className="text-gray-400 group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}
                  {brand && (
                    <div className="mb-4">
                      <Link
                        to={`/brand/${brand.id}`}
                        className="inline-flex items-center gap-3 px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-full transition-all duration-300 border border-gray-200 group">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-gray-200 flex-shrink-0">
                          <img
                            src={brand.logo}
                            alt={brand.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <span className="font-medium text-sm group-hover:text-primary-600 transition-colors">
                          {brand.name}
                        </span>
                        <span className="text-gray-400 group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}

                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4 leading-tight">
                    {product.name}
                  </h1>

                  {/* Rating & Reviews */}
                  {product.rating && (
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100">
                        <span className="font-bold text-yellow-700">{product.rating}</span>
                        <FiStar className="text-yellow-500 fill-yellow-500" />
                      </div>
                      <span className="text-gray-500 text-sm font-medium hover:text-gray-700 cursor-pointer">
                        {product.reviewCount || 0} Reviews
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded-lg">
                        {product.stock === "in_stock" ? "In Stock" : product.stock === "low_stock" ? "Low Stock" : "Out of Stock"}
                      </span>
                    </div>
                  )}

                  {/* Price */}
                  <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-100">
                    <div className="flex items-end gap-3 mb-2">
                      <span className="text-4xl font-bold text-gray-900">
                        {formatPrice(currentPrice)}
                      </span>
                      {product.originalPrice && (
                        <span className="text-xl text-gray-400 line-through font-medium mb-1.5">
                          {formatPrice(product.originalPrice)}
                        </span>
                      )}
                    </div>
                    {product.originalPrice && (
                      <div className="flex items-center gap-2">
                        <span className="text-accent-600 font-bold bg-accent-50 px-3 py-1 rounded-full text-sm">
                          {Math.round(
                            ((product.originalPrice - currentPrice) /
                              product.originalPrice) *
                            100
                          )}% OFF
                        </span>
                        <span className="text-sm text-gray-500">Best price guaranteed</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variants & Quantity */}
                <div className="space-y-6 border-b border-gray-100 pb-8">
                  {product.variants && (
                    <VariantSelector
                      variants={product.variants}
                      onVariantChange={setSelectedVariant}
                      currentPrice={product.price}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      Quantity
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
                        <button
                          onClick={() => handleQuantityChange(-1)}
                          disabled={quantity <= 1}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm hover:shadow-md disabled:shadow-none disabled:bg-transparent disabled:opacity-50 transition-all text-gray-700">
                          <FiMinus />
                        </button>
                        <span className="w-12 text-center font-bold text-gray-900 text-lg">
                          {quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(1)}
                          disabled={quantity >= (selectedAvailableStock || 10)}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm hover:shadow-md disabled:shadow-none disabled:bg-transparent disabled:opacity-50 transition-all text-gray-700">
                          <FiPlus />
                        </button>
                      </div>
                      <span className="text-sm text-gray-500">
                        {selectedAvailableStock} in stock
                      </span>
                    </div>
                  </div>
                </div>

                {/* DESKTOP ACTIONS */}
                <div className="hidden lg:grid grid-cols-5 gap-4 py-4">
                  {isInCart ? (
                    <button
                      onClick={handleRemoveFromCart}
                      className="col-span-3 py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100">
                      <FiTrash2 className="text-xl" />
                      <span>Remove from Cart</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      disabled={product.stock === "out_of_stock"}
                      className={`col-span-3 py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3 ${product.stock === "out_of_stock"
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                        : "gradient-green text-white hover:shadow-glow-green hover:-translate-y-0.5"
                        }`}>
                      <FiShoppingBag className="text-xl" />
                      <span>
                        {product.stock === "out_of_stock"
                          ? "Out of Stock"
                          : "Add to Cart"}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={handleFavorite}
                    className={`col-span-1 py-4 rounded-xl font-semibold transition-all duration-300 border-2 flex items-center justify-center ${isFavorite
                      ? "bg-red-50 text-red-500 border-red-200 hover:bg-red-100"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-white hover:text-black"
                      }`}>
                    <FiHeart
                      className={`text-2xl ${isFavorite ? "fill-current" : ""}`}
                    />
                  </button>

                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: product.name,
                          text: `Check out ${product.name}`,
                          url: window.location.href,
                        });
                      } else {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success("Link copied to clipboard");
                      }
                    }}
                    className="col-span-1 py-4 bg-white text-gray-700 border-2 border-gray-200 rounded-xl font-semibold transition-all duration-300 hover:border-gray-300 hover:bg-white hover:text-black flex items-center justify-center">
                    <FiShare2 className="text-2xl" />
                  </button>
                </div>

                {/* Description */}
                <div className="pt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Product Description
                  </h3>
                  <div className="prose prose-sm lg:prose-base text-gray-600 leading-relaxed bg-white p-6 rounded-2xl border border-gray-100">
                    {product.description ? (
                      <p>{product.description}</p>
                    ) : (
                      <p>
                        High-quality {product.name.toLowerCase()} available. This product is carefully selected
                        to ensure the best quality and freshness.
                      </p>
                    )}
                  </div>
                </div>

                {/* FAQs */}
                {productFaqs.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      Product FAQs
                    </h3>
                    <div className="space-y-3">
                      {productFaqs.map((faq, index) => (
                        <div
                          key={`${faq.question}-${index}`}
                          className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm"
                        >
                          <p className="text-sm font-bold text-gray-800 mb-2">
                            {faq.question}
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {/* Reviews List */}
                {productReviews.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      Customer Reviews ({productReviews.length})
                    </h3>
                    <div className="space-y-4">
                      {productReviews.slice(0, 3).map((review) => (
                        <div key={review.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
                                {review.user.charAt(0)}
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {review.user}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-sm text-gray-700">{review.rating}</span>
                              <FiStar className="text-yellow-400 fill-yellow-400 text-sm" />
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed pl-10">{review.comment}</p>
                          {review.vendorResponse && (
                            <div className="mt-3 ml-10 bg-primary-50 border border-primary-100 rounded-lg p-3">
                              <p className="text-xs font-semibold text-primary-700 mb-1">
                                Vendor Response
                              </p>
                              <p className="text-sm text-primary-800">{review.vendorResponse}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Similar Products */}
          {similarProducts.length > 0 && (
            <div className="px-4 py-8 lg:px-8 mt-8 lg:mt-16 border-t border-gray-200">
              <h3 className="text-xl lg:text-2xl font-bold text-gray-900 mb-6">
                You May Also Like
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                {similarProducts.map((similarProduct) => (
                  <ProductCard
                    key={similarProduct.id}
                    product={similarProduct}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Bar (Mobile Only) */}
        <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40 safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleFavorite}
              className={`p-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center ${isFavorite
                ? "bg-red-50 text-red-600 border-2 border-red-200"
                : "bg-gray-100 text-gray-700"
                }`}>
              <FiHeart
                className={`text-xl ${isFavorite ? "fill-red-600" : ""}`}
              />
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: product.name,
                    text: `Check out ${product.name}`,
                    url: window.location.href,
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Link copied to clipboard");
                }
              }}
              className="p-3 bg-gray-100 text-gray-700 rounded-xl font-semibold transition-all duration-300">
              <FiShare2 className="text-xl" />
            </button>
            {isInCart ? (
              <button
                onClick={handleRemoveFromCart}
                className="flex-1 py-4 rounded-xl font-semibold text-base transition-all duration-300 flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100">
                <FiTrash2 className="text-xl" />
                <span>Remove</span>
              </button>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={product.stock === "out_of_stock"}
                className={`flex-1 py-4 rounded-xl font-semibold text-base transition-all duration-300 flex items-center justify-center gap-2 ${product.stock === "out_of_stock"
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "gradient-green text-white hover:shadow-glow-green"
                  }`}>
                <FiShoppingBag className="text-xl" />
                <span>
                  {product.stock === "out_of_stock"
                    ? "Out of Stock"
                    : "Add to Cart"}
                </span>
              </button>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileProductDetail;
