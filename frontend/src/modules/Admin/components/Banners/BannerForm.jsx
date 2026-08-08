import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FiX, FiSave, FiUpload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useBannerStore } from "../../../../shared/store/bannerStore";
import AnimatedSelect from "../AnimatedSelect";
import toast from "react-hot-toast";
import Button from "../Button";
import { uploadAdminImage } from "../../services/adminService";

const BannerForm = ({ banner, onClose, onSave }) => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { createBanner, updateBanner } = useBannerStore();
  const isEdit = !!banner;
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    type: "hero",
    title: "",
    subtitle: "",
    description: "",
    image: "",
    link: "",
    order: 1,
    isActive: true,
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    if (banner) {
      setFormData({
        type: banner.type || "hero",
        title: banner.title || "",
        subtitle: banner.subtitle || "",
        description: banner.description || "",
        image: banner.image || "",
        link: banner.link || "",
        order: banner.order || 1,
        isActive: banner.isActive !== undefined ? banner.isActive : true,
        startDate: banner.startDate ? banner.startDate.split("T")[0] : "",
        endDate: banner.endDate ? banner.endDate.split("T")[0] : "",
      });
    }
  }, [banner]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadAdminImage(file, "banners");
      const url = response?.data?.url;
      if (!url) {
        toast.error("Image upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, image: url }));
      toast.success("Image uploaded");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.image.trim()) {
      toast.error("Banner image is required");
      return;
    }

    if (formData.startDate && formData.endDate) {
      if (new Date(formData.startDate) >= new Date(formData.endDate)) {
        toast.error("End date must be after start date");
        return;
      }
    }

    try {
      const bannerData = {
        ...formData,
        startDate: formData.startDate
          ? new Date(formData.startDate).toISOString()
          : null,
        endDate: formData.endDate
          ? new Date(formData.endDate).toISOString()
          : null,
        order: parseInt(formData.order),
      };

      if (isEdit) {
        await updateBanner(banner._id, bannerData);
      } else {
        await createBanner(bannerData);
      }
      onSave?.();
      onClose();
    } catch (error) {
      // Error handled in store
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
              } sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-admin pointer-events-auto`}
            style={{ willChange: "transform" }}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-800">
                {isEdit ? "Edit Banner" : "Create Banner"}
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
                      Banner Type <span className="text-red-500">*</span>
                    </label>
                    <AnimatedSelect
                      name="type"
                      value={formData.type}
                      onChange={handleChange}
                      required
                      options={[
                        { value: "home_slider", label: "Home Slider" },
                        { value: "festival_offer", label: "Festival Offer Banner" },
                        { value: "banner", label: "Generic Banner" },
                        { value: "hero", label: "Hero Banner" },
                        { value: "promotional", label: "Promotional Banner" },
                        { value: "side_banner", label: "Side Banner (Home Right)" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Banner title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      name="subtitle"
                      value={formData.subtitle}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Banner subtitle"
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
                      placeholder="Banner description"
                    />
                  </div>
                </div>
              </div>

              {/* Image */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Banner Image
                </h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Image URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="image"
                    value={formData.image}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="data/banners/banner.png"
                  />
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-semibold">
                      <FiUpload />
                      {isUploadingImage ? "Uploading..." : "Upload Image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={isUploadingImage}
                      />
                    </label>
                  </div>
                  {formData.image && (
                    <div className="mt-4">
                      <img
                        src={formData.image}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Link */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Link Settings
                </h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Link URL
                  </label>
                  <input
                    type="text"
                    name="link"
                    value={formData.link}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="/category/electronics or https://example.com"
                  />
                </div>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Schedule (Optional)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleChange}
                      min={formData.startDate}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Settings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Display Order
                    </label>
                    <input
                      type="number"
                      name="order"
                      value={formData.order}
                      onChange={handleChange}
                      min="1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

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
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                <Button type="button" onClick={onClose} variant="secondary">
                  Cancel
                </Button>
                <Button type="submit" variant="primary" icon={FiSave}>
                  {isEdit ? "Update Banner" : "Create Banner"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default BannerForm;
