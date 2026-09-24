import { useState, useEffect } from 'react';
import { FiSave, FiToggleLeft, FiToggleRight, FiHome, FiStar } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';

const ContentFeaturesSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [contentData, setContentData] = useState({});
  const [featuresData, setFeaturesData] = useState({});
  const [homepageData, setHomepageData] = useState({});
  const [reviewsData, setReviewsData] = useState({});
  const [activeSection, setActiveSection] = useState('features');

  useEffect(() => {
    initialize();
    if (settings) {
      if (settings.content) setContentData(settings.content);
      if (settings.features) setFeaturesData(settings.features);
      if (settings.homepage) setHomepageData(settings.homepage);
      if (settings.reviews) setReviewsData(settings.reviews);
    }
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.content) setContentData(settings.content);
      if (settings.features) setFeaturesData(settings.features);
      if (settings.homepage) setHomepageData(settings.homepage);
      if (settings.reviews) setReviewsData(settings.reviews);
    }
  }, [settings]);

  const handleContentChange = (field, value) => {
    setContentData({
      ...contentData,
      [field]: value,
    });
  };

  const handleFeatureToggle = (feature) => {
    setFeaturesData({
      ...featuresData,
      [feature]: !featuresData[feature],
    });
  };

  const handleHomepageSectionToggle = (section) => {
    setHomepageData({
      ...homepageData,
      sections: {
        ...homepageData.sections,
        [section]: {
          ...homepageData.sections[section],
          enabled: !homepageData.sections[section]?.enabled,
        },
      },
    });
  };

  const handleHomepageSectionOrder = (section, order) => {
    setHomepageData({
      ...homepageData,
      sections: {
        ...homepageData.sections,
        [section]: {
          ...homepageData.sections[section],
          order,
        },
      },
    });
  };

  // Friendly labels for the section keys HomePage.jsx's registry uses — see
  // homeSectionRegistry.js for the key -> component mapping this must match.
  const homepageSectionLabels = {
    uspStrip: 'USP Strip (delivery / try&buy / returns / payment icons)',
    offerTiles: 'Category Tiles (3-up Men/Women/Kids style tiles)',
    curatedCollage: 'Curated Collage (festive/promo banner grid)',
    dealsStrip: 'Deals Strip (only shows when a campaign is live)',
    tryAndBuyExplainer: 'Try & Buy Explainer',
    categoryScroller: 'Category Scroller (portrait cards)',
    brandBestsellers: 'Brand Bestsellers',
    forHim: 'For Him (menswear price-anchored grid)',
    forHer: 'For Her (womenswear price-anchored grid)',
    brandMarquee: 'Brand Marquee (scrolling logo strip)',
    serviceAreasStrip: 'Service Areas Strip',
    trustBadges: 'Trust Badges',
  };

  const handleReviewsChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('displaySettings.')) {
      const setting = name.replace('displaySettings.', '');
      setReviewsData({
        ...reviewsData,
        displaySettings: {
          ...reviewsData.displaySettings,
          [setting]: checked,
        },
      });
    } else {
      setReviewsData({
        ...reviewsData,
        [name]: type === 'checkbox' ? checked : value,
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings('content', contentData);
    updateSettings('features', featuresData);
    updateSettings('homepage', homepageData);
    updateSettings('reviews', reviewsData);
  };

  const sections = [
    { id: 'policies', label: 'Legal Policies', icon: FiStar },
    { id: 'features', label: 'Feature Toggles', icon: FiToggleRight },
    { id: 'homepage', label: 'Home Page', icon: FiHome },
    { id: 'reviews', label: 'Reviews & Ratings', icon: FiStar },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Content & Features</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage policies, features, homepage, and reviews</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${activeSection === section.id
                      ? 'border-primary-600 text-primary-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Policies Section */}
          {activeSection === 'policies' && (
            <div className="space-y-6">
              {[
                { label: 'Privacy Policy', field: 'privacy_policy' },
                { label: 'Terms & Conditions', field: 'terms_policy' },
                { label: 'Refund Policy', field: 'refund_policy' },
                { label: 'About Us', field: 'about_us' },
                { label: 'Contact Information (HTML supported)', field: 'contact_info' }
              ].map((item) => (
                <div key={item.field} className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">{item.label}</label>
                  <textarea
                    className="w-full h-32 p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-sans text-sm"
                    placeholder={`Enter ${item.label.toLowerCase()}...`}
                    value={contentData[item.field] || ''}
                    onChange={(e) => handleContentChange(item.field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Features Section */}
          {activeSection === 'features' && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Wishlist</h4>
                  <p className="text-xs text-gray-600">Allow customers to save products to wishlist</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.wishlistEnabled !== false}
                    onChange={() => handleFeatureToggle('wishlistEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Product Reviews</h4>
                  <p className="text-xs text-gray-600">Allow customers to review products</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.reviewsEnabled !== false}
                    onChange={() => handleFeatureToggle('reviewsEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Flash Sales</h4>
                  <p className="text-xs text-gray-600">Enable flash sale feature</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.flashSaleEnabled !== false}
                    onChange={() => handleFeatureToggle('flashSaleEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Daily Deals</h4>
                  <p className="text-xs text-gray-600">Enable daily deals feature</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.dailyDealsEnabled !== false}
                    onChange={() => handleFeatureToggle('dailyDealsEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Live Chat</h4>
                  <p className="text-xs text-gray-600">Enable live chat support</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.liveChatEnabled || false}
                    onChange={() => handleFeatureToggle('liveChatEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Coupon Codes</h4>
                  <p className="text-xs text-gray-600">Allow customers to use coupon codes</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={featuresData.couponCodesEnabled !== false}
                    onChange={() => handleFeatureToggle('couponCodesEnabled')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
          )}

          {/* Homepage Section */}
          {activeSection === 'homepage' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Hero Banner</h4>
                  <p className="text-xs text-gray-600">Display hero banner on homepage</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    checked={homepageData.heroBannerEnabled !== false}
                    onChange={(e) => setHomepageData({ ...homepageData, heroBannerEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Homepage Sections</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Turn sections on/off and set their display order (lower number = higher
                  on the page). The hero banner above is controlled separately.
                </p>
                <div className="space-y-3">
                  {Object.entries(homepageData.sections || {})
                    .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))
                    .map(([key, section]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
                      <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">
                        {homepageSectionLabels[key] || key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <input
                          type="number"
                          min="1"
                          value={section.order ?? ''}
                          onChange={(e) => handleHomepageSectionOrder(key, parseInt(e.target.value, 10) || 0)}
                          className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          title="Display order"
                        />
                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={section.enabled !== false}
                            onChange={() => handleHomepageSectionToggle(key)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Reviews Section */}
          {activeSection === 'reviews' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Review Moderation Mode
                </label>
                <AnimatedSelect
                  name="moderationMode"
                  value={reviewsData.moderationMode || 'manual'}
                  onChange={handleReviewsChange}
                  options={[
                    { value: 'auto', label: 'Auto-approve (Publish immediately)' },
                    { value: 'manual', label: 'Manual (Require admin approval)' },
                  ]}
                />
                <p className="text-xs text-gray-500 mt-1">How reviews are published</p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Purchase Required</h4>
                  <p className="text-xs text-gray-600">Only allow reviews from verified purchasers</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    name="purchaseRequired"
                    checked={reviewsData.purchaseRequired !== false}
                    onChange={handleReviewsChange}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Review Display Settings</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">Show All Reviews</span>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        name="displaySettings.showAll"
                        checked={reviewsData.displaySettings?.showAll !== false}
                        onChange={handleReviewsChange}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">Verified Purchases Only</span>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        name="displaySettings.verifiedOnly"
                        checked={reviewsData.displaySettings?.verifiedOnly || false}
                        onChange={handleReviewsChange}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">With Photos Only</span>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        name="displaySettings.withPhotosOnly"
                        checked={reviewsData.displaySettings?.withPhotosOnly || false}
                        onChange={handleReviewsChange}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
            >
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default ContentFeaturesSettings;

