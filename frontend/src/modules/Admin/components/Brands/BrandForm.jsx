import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FiX, FiSave, FiUpload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useBrandStore } from "../../../../shared/store/brandStore";
import toast from "react-hot-toast";
import Button from "../Button";
import { uploadAdminImage } from "../../services/adminService";

const BrandForm = ({ brand, onClose, onSave }) => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { createBrand, updateBrand } = useBrandStore();
  const isEdit = !!brand;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    logo: "",
    description: "",
    website: "",
    isActive: true,
  });

  useEffect(() => {
    if (brand) {
      setFormData({
        name: brand.name || "",
        logo: brand.logo || "",
        description: brand.description || "",
        website: brand.website || "",
        isActive: brand.isActive !== undefined ? brand.isActive : true,
      });
    }
  }, [brand]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Brand name is required");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (isEdit) {
        await updateBrand(brand.id, formData);
      } else {
        await createBrand(formData);
      }
      onSave?.();
      onClose();
    } catch (error) {
      // Error handled in store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const response = await uploadAdminImage(file, "brands");
      const logoUrl = response?.data?.url;
      if (!logoUrl) {
        toast.error("Logo upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, logo: logoUrl }));
      toast.success("Logo uploaded");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingLogo(false);
      e.target.value = "";
    }
  };

  return (
    <AnimatePresence>
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
          className={`fixed inset-0 z-[10000] flex ${
            isAppRoute ? "items-start pt-[10px]" : "items-end"
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
            className={`bg-white ${
              isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
            } sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-admin pointer-events-auto`}
            style={{ willChange: "transform" }}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-800">
                {isEdit ? "Edit Brand" : "Create Brand"}
              </h2>
              <Button
                onClick={onClose}
                variant="icon"
                icon={FiX}
                className="text-gray-600"
              />
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Basic Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Brand Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="e.g., Nike, Adidas"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Brand description..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Website URL
                    </label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Brand Logo
                </h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Logo URL
                  </label>
                  <input
                    type="text"
                    name="logo"
                    value={formData.logo}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="data/brands/brand-logo.png"
                  />
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-semibold">
                      <FiUpload />
                      {isUploadingLogo ? "Uploading..." : "Upload Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                        disabled={isUploadingLogo}
                      />
                    </label>
                  </div>
                  {formData.logo && (
                    <div className="mt-4">
                      <img
                        src={formData.logo}
                        alt="Preview"
                        className="w-32 h-32 object-contain rounded-lg border border-gray-200 bg-white p-2"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Settings
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    Active
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                <Button type="button" onClick={onClose} variant="secondary">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={FiSave}
                  disabled={isSubmitting}>
                  {isEdit ? "Update Brand" : "Create Brand"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default BrandForm;
