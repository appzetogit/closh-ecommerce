import { useState } from 'react';
import { FiSend, FiBell, FiUsers, FiTarget, FiImage, FiLink, FiX } from 'react-icons/fi';
import { motion } from 'framer-motion';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { uploadAdminImage } from '../../services/adminService';
import { useEffect } from 'react';

const PushNotifications = () => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    target: 'all',
    userId: '',
    schedule: 'now',
    scheduledDate: '',
    imageUrl: '',
    actionLink: '',
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    // Fetch users for the dropdown
    const fetchUsers = async () => {
      try {
        const response = await api.get('/admin/customers');
        setUsers(response.data.customers || []);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };
    fetchUsers();
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadAdminImage(file, 'notifications');
      const url = response?.data?.url;
      if (!url) {
        toast.error('Image upload failed');
        return;
      }
      setFormData((prev) => ({ ...prev, imageUrl: url }));
      toast.success('Image uploaded');
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSend = async () => {
    if (!formData.title || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.target === 'single' && !formData.userId) {
      toast.error('Please select a user');
      return;
    }

    try {
      setLoading(true);
      if (formData.target === 'single') {
        const payload = {
          userId: formData.userId,
          title: formData.title,
          message: formData.message,
          imageUrl: formData.imageUrl || undefined,
          actionLink: formData.actionLink || undefined,
        };
        console.log("🚀 Sending Single Push Payload:", payload);
        await api.post('/admin/notifications/push-to-user', payload);
        toast.success(`Notification sent to User!`);
      } else {
        const payload = {
          target: formData.target,
          title: formData.title,
          message: formData.message,
          imageUrl: formData.imageUrl || undefined,
          actionLink: formData.actionLink || undefined,
        };
        console.log("🚀 Sending Broadcast Payload:", payload);
        await api.post('/admin/notifications/broadcast', payload);
        toast.success(`Broadcast started to ${formData.target}!`);
      }

      setFormData({ ...formData, title: '', message: '', imageUrl: '', actionLink: '' });
    } catch (err) {
      console.error('Push Error:', err);
      toast.error(err.response?.data?.message || 'Failed to send notification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Push Notifications</h1>
        <p className="text-sm sm:text-base text-gray-600">Send push notifications to users</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiBell className="inline mr-2" />
              Notification Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter notification title"
              required
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Enter notification message"
              required
              rows={4}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiImage className="inline mr-2" />
              Image <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {formData.imageUrl ? (
              <div className="relative inline-block">
                <img
                  src={formData.imageUrl}
                  alt="Notification preview"
                  className="h-28 w-auto rounded-lg border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, imageUrl: '' })}
                  className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                >
                  <FiX size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-gray-50 transition-colors text-sm text-gray-500">
                <FiImage />
                {isUploadingImage ? 'Uploading...' : 'Click to upload an image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUploadingImage}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiLink className="inline mr-2" />
              Action Link <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.actionLink}
              onChange={(e) => setFormData({ ...formData, actionLink: e.target.value })}
              placeholder="e.g. /products/123 or https://..."
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-1">Opened when the user taps the notification.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiTarget className="inline mr-2" />
              Target Audience
            </label>
            <AnimatedSelect
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              options={[
                { value: 'all', label: 'All Users' },
                { value: 'single', label: 'Single User (Test)' },
                { value: 'customers', label: 'Customers Only' },
                { value: 'delivery-boy', label: 'Delivery boy' },
              ]}
            />
          </div>

          {formData.target === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FiUsers className="inline mr-2" />
                Select User
              </label>
              <select
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                required={formData.target === 'single'}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a user...</option>
                {users.map(u => (
                  <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule
            </label>
            <AnimatedSelect
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              options={[
                { value: 'now', label: 'Send Now' },
                { value: 'scheduled', label: 'Schedule Later' },
              ]}
            />
          </div>

          {formData.schedule === 'scheduled' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scheduled Date & Time
              </label>
              <input
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                required={formData.schedule === 'scheduled'}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold disabled:opacity-50"
          >
            <FiSend />
            <span>{loading ? 'Sending...' : 'Send Notification'}</span>
          </button>
        </form>
      </div>
    </motion.div>
  );
};

export default PushNotifications;

