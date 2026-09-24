import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import toast from "react-hot-toast";
import logoImage from "../../../data/logos/ChatGPT Image Dec 2, 2025, 03_01_19 PM.png";
import * as settingsService from "../services/settingsService";

const defaultSettings = {
  general: {
    storeName: "Appzeto E-commerce",
    storeLogo: logoImage,
    favicon: logoImage,
    contactEmail: "contact@example.com",
    contactPhone: "+1234567890",
    address: "",
    businessHours: "Mon-Fri 9AM-6PM",
    timezone: "UTC",
    currency: "INR",
    language: "en",
    socialMedia: {
      facebook: "",
      instagram: "",
      twitter: "",
      linkedin: "",
    },
    accentColor: "#FFE11B",
    storeDescription: "",
    customerSupportEmail: "support@closh.com",
    customerSupportPhone: "+91 (800) 111-2222",
    vendorSupportEmail: "vendorsupport@closh.com",
    vendorSupportPhone: "+91 (800) 123-4567",
    storeClosed: false,
    storeClosedMessage: "We are currently undergoing maintenance. Please check back later.",
  },
  payment: {
    paymentMethods: ["cod", "card", "wallet"],
    codEnabled: true,
    cardEnabled: true,
    walletEnabled: true,
    upiEnabled: false,
    paymentGateway: "stripe",
    stripePublicKey: "",
    stripeSecretKey: "",
    paymentFees: {
      cod: 0,
      card: 2.5,
      wallet: 1.5,
      upi: 0.5,
    },
  },
  shipping: {
    shippingZones: [],
    freeShippingThreshold: 100,
    defaultShippingRate: 5,
    shippingMethods: ["standard", "express"],
  },
  orders: {
    cancellationTimeLimit: 24, // hours
    minimumOrderValue: 0,
    platformFee: 20,
    orderTrackingEnabled: true,
    orderConfirmationEmail: true,
    orderStatuses: [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ],
  },
  customers: {
    guestCheckoutEnabled: true,
    registrationRequired: false,
    emailVerificationRequired: false,
    customerAccountFeatures: {
      orderHistory: true,
      wishlist: true,
      addresses: true,
    },
  },
  products: {
    itemsPerPage: 12,
    gridColumns: 4,
    defaultSort: "popularity",
    lowStockThreshold: 10,
    outOfStockBehavior: "show", // 'hide' or 'show'
    stockAlertsEnabled: true,
  },
  tax: {
    defaultTaxRate: 18,
    taxCalculationMethod: "inclusive", // 'inclusive' or 'exclusive'
    priceDisplayFormat: "INR", // Currency format
    closhBusinessState: "Rajasthan",
    closhGstin: "",
    gstRules: [
      { minPrice: 0, maxPrice: 2500, rate: 5 },
      { minPrice: 2501, maxPrice: 99999999, rate: 18 }
    ],
  },
  content: {
    privacyPolicy: "",
    termsConditions: "",
    refundPolicy: "",
    privacy_policy: "",
    terms_policy: "",
    refund_policy: "",
    about_us: "",
    contact_info: "",
  },
  features: {
    wishlistEnabled: true,
    reviewsEnabled: true,
    flashSaleEnabled: true,
    dailyDealsEnabled: true,
    liveChatEnabled: true,
    couponCodesEnabled: true,
  },
  homepage: {
    heroBannerEnabled: true,
    // Keys here must match the ones HomePage.jsx looks up in its section
    // registry (see homeSectionRegistry.js) — that's what actually turns a
    // toggle+order pair here into a real change on the storefront.
    sections: {
      uspStrip: { enabled: true, order: 1 },
      offerTiles: { enabled: true, order: 2 },
      curatedCollage: { enabled: true, order: 3 },
      dealsStrip: { enabled: true, order: 4 },
      tryAndBuyExplainer: { enabled: true, order: 5 },
      categoryScroller: { enabled: true, order: 6 },
      brandBestsellers: { enabled: true, order: 7 },
      forHim: { enabled: true, order: 8 },
      forHer: { enabled: true, order: 9 },
      brandMarquee: { enabled: true, order: 10 },
      serviceAreasStrip: { enabled: true, order: 11 },
      trustBadges: { enabled: true, order: 12 },
    },
  },
  reviews: {
    moderationMode: "manual", // 'auto' or 'manual'
    purchaseRequired: true,
    displaySettings: {
      showAll: true,
      verifiedOnly: false,
      withPhotosOnly: false,
    },
  },
  email: {
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
    fromEmail: "noreply@example.com",
    fromName: "Appzeto Store",
  },
  notifications: {
    email: {
      orderConfirmation: true,
      shippingUpdate: true,
      deliveryUpdate: true,
    },
    smsEnabled: false,
    pushEnabled: false,
    admin: {
      newOrders: true,
      lowStock: true,
    },
  },
  seo: {
    metaTitle: "Appzeto E-commerce - Shop Online",
    metaDescription: "Shop the latest trends and products",
    metaKeywords: "ecommerce, shopping, online store",
    ogImage: logoImage,
    canonicalUrl: "",
  },
  theme: {
    primaryColor: "#10B981",
    secondaryColor: "#3B82F6",
    fontFamily: "Inter",
  },
};

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isLoading: false,

      // Initialize settings from API (Admin version - fetches all including sensitive)
      initialize: async () => {
        set({ isLoading: true });
        try {
          const response = await settingsService.getAllSettings();
          const backendSettings = response?.data || response || {};
          get()._applySettings(backendSettings);
        } catch (error) {
          console.error("Failed to fetch admin settings:", error);
          get()._fallbackToLocal();
        }
      },

      // Initialize settings from API (Public version - fetches non-sensitive only)
      initializePublic: async () => {
        // If we already have settings in cache, do a silent refresh
        const hasCachedSettings = !!get().settings?.general?.storeName;
        if (!hasCachedSettings) {
          set({ isLoading: true });
        }
        try {
          const response = await settingsService.getAllPublicSettings();
          const backendSettings = response?.data || response || {};
          get()._applySettings(backendSettings);
        } catch (error) {
          console.error("Failed to fetch public settings:", error);
          get()._fallbackToLocal();
        }
      },

      // Helper to apply settings with deep merge
      _applySettings: (backendSettings) => {
        const mergedSettings = JSON.parse(JSON.stringify(defaultSettings));
        Object.keys(backendSettings).forEach(key => {
          if (mergedSettings[key]) {
            mergedSettings[key] = {
              ...mergedSettings[key],
              ...backendSettings[key]
            };
          } else {
            mergedSettings[key] = backendSettings[key];
          }
        });
        set({ settings: mergedSettings, isLoading: false });
      },

      // Helper to fallback to local storage
      _fallbackToLocal: () => {
        const savedSettings = localStorage.getItem("admin-settings");
        if (savedSettings) {
           set({ settings: JSON.parse(savedSettings), isLoading: false });
        } else {
           set({ settings: defaultSettings, isLoading: false });
        }
      },

      // Get settings
      getSettings: () => {
        return get().settings;
      },

      // Update settings (Saves to both API and Local)
      updateSettings: async (category, settingsData) => {
        set({ isLoading: true });
        try {
          const currentSettings = get().settings;
          const categoryData = {
            ...currentSettings[category],
            ...settingsData,
          };
          
          const updatedSettings = {
            ...currentSettings,
            [category]: categoryData,
          };

          // Save to Backend
          await settingsService.updateAdminSetting(category, categoryData);

          // Update Local State
          set({ settings: updatedSettings, isLoading: false });
          
          localStorage.setItem(
            "admin-settings",
            JSON.stringify(updatedSettings)
          );
          
          toast.success("Settings updated and synced successfully", { id: 'settings-sync-success' });
          return updatedSettings;
        } catch (error) {
          set({ isLoading: false });
          toast.error("Failed to sync settings with server");
          throw error;
        }
      },
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
