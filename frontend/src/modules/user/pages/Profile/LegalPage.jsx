import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AccountLayout from '../../components/Profile/AccountLayout';
import { getPublicSetting } from '../../../../shared/services/settingsService';
import { useSettingsStore } from '../../../../shared/store/settingsStore';

// Initial/Fallback data in case nothing is in localStorage/Admin yet
const getLegalData = (settings) => {
    const general = settings?.general || {};
    const supportEmail = general.customerSupportEmail || "support@closh.com";
    const supportPhone = general.customerSupportPhone || "+91 (800) 111-2222";
    const address = general.address || "Mumbai, Maharashtra, India";
    const storeName = general.storeName || "CLOSH";

    return {
    'about': {
        title: 'About Us',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">Welcome to ${storeName}, your number one source for all things fashion. We're dedicated to giving you the very best of clothing, with a focus on dependability, customer service and uniqueness.</p>
                <p class="text-gray-600 leading-relaxed font-medium">Founded in 2024, ${storeName} has come a long way from its beginnings. When we first started out, our passion for fashion-forward clothing drove us to do intense research so that ${storeName} can offer you the world's most stylish and premium apparel.</p>
                <div class="mt-8 p-6 bg-white rounded-2xl border border-gray-100">
                    <h3 class="font-bold text-black uppercase  text-lg mb-2">Our Mission</h3>
                    <p class="text-gray-500 font-bold text-[11px] uppercase ">To empower people through fashion and quality.</p>
                </div>
            </div>
        `
    },
    'terms': {
        title: 'Terms and Conditions',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">By accessing this website, you are agreeing to be bound by these website Terms and Conditions of Use, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws.</p>
                <h3 class="font-bold text-black uppercase  text-lg mt-6">Use License</h3>
                <p class="text-gray-600 leading-relaxed font-medium">Permission is granted to temporarily download one copy of the materials (information or software) on ${storeName}'s website for personal, non-commercial transitory viewing only.</p>
            </div>
        `
    },
    'privacy': {
        title: 'Privacy Policy',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">Your privacy is important to us. It is ${storeName}'s policy to respect your privacy regarding any information we may collect from you across our website, and other sites we own and operate.</p>
                <p class="text-gray-600 leading-relaxed font-medium">We only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent.</p>
            </div>
        `
    },
    'refund': {
        title: 'Refund Policy',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">We want you to be totally satisfied with your purchase! If you're not happy, we're not happy.</p>
                <p class="text-gray-600 leading-relaxed font-medium">You have 15 calendar days to return an item from the date you received it. To be eligible for a return, your item must be unused and in the same condition that you received it.</p>
            </div>
        `
    },
    'return': {
        title: 'Return & Exchange Policy',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">We offer two convenient delivery options to ensure your complete satisfaction. Please review them carefully to choose the one that best suits your needs:</p>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <h4 class="font-bold text-gray-900 mb-1">1. Try and Buy</h4>
                    <p class="text-gray-600 leading-relaxed text-sm">With our "Try and Buy" option, you can try on the items at the time of delivery. If the fit, style, or quality does not meet your expectations, you can return them immediately to the delivery executive without any hassle.</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <h4 class="font-bold text-gray-900 mb-1">2. Check and Buy</h4>
                    <p class="text-gray-600 leading-relaxed text-sm">Under the "Check and Buy" policy, you are permitted to open the package and inspect the items for any defects or damage before accepting the delivery. This ensures you only receive products in perfect condition.</p>
                </div>
                <p class="text-gray-600 leading-relaxed font-medium">For any further questions regarding returns or exchanges, please reach out to our customer support team.</p>
            </div>
        `
    },
    'shipping': {
        title: 'Shipping Policy',
        content: `
            <div class="space-y-4">
                <p class="text-gray-600 leading-relaxed font-medium">At Clouse, we prioritize speed. Orders are processed immediately, and we offer lightning-fast delivery within 60 minutes for eligible locations.</p>
                <p class="text-gray-600 leading-relaxed font-medium">You will receive real-time tracking updates as soon as your order is dispatched with our delivery executive.</p>
            </div>
        `
    },
    'contact': {
        title: 'Contact Us',
        content: `
            <div class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="mailto:${supportEmail}" class="p-6 bg-white rounded-[24px] border border-gray-100 hover:border-black transition-all group no-underline block shadow-sm hover:shadow-xl">
                        <div class="flex items-center justify-between mb-3">
                            <span class="block font-black text-[10px] uppercase text-gray-400 tracking-widest">Email Us</span>
                            <div class="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            </div>
                        </div>
                        <p class="font-black text-black text-[15px] tracking-tight group-hover:translate-x-1 transition-transform">${supportEmail}</p>
                    </a>
                    <a href="tel:${supportPhone.replace(/[^0-9+]/g, '')}" class="p-6 bg-white rounded-[24px] border border-gray-100 hover:border-black transition-all group no-underline block shadow-sm hover:shadow-xl">
                        <div class="flex items-center justify-between mb-3">
                            <span class="block font-black text-[10px] uppercase text-gray-400 tracking-widest">Call Us</span>
                            <div class="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.29-2.29a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            </div>
                        </div>
                        <p class="font-black text-black text-[15px] tracking-tight group-hover:translate-x-1 transition-transform">${supportPhone}</p>
                    </a>
                </div>
                <div class="p-8 bg-black text-white rounded-[32px] shadow-2xl relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <h3 class="font-black text-[14px] uppercase tracking-[0.2em] mb-3 text-[#ffcc00]">Headquarters</h3>
                    <p class="text-[13px] font-bold opacity-80 leading-relaxed max-w-xs">${address.replace(/\n/g, '<br/>')}</p>
                </div>
            </div>
        `
    }
    };
};

const LegalPage = ({ fixedPageId }) => {
    const { pageId } = useParams();
    const effectivePageId = fixedPageId || pageId;
    const { settings, initializePublic } = useSettingsStore();
    const [pageContent, setPageContent] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const general = settings?.general || {};
    const supportEmail = general.customerSupportEmail || "support@closh.in";
    const supportPhone = general.customerSupportPhone || "+91 (800) 111-2222";

    const keyMap = {
        'terms': 'terms_policy',
        'privacy': 'privacy_policy',
        'refund': 'refund_policy',
        'about': 'about_us',
        'contact': 'contact_info',
        'return': 'return_policy',
        'shipping': 'shipping_policy'
    };

    useEffect(() => {
        const fetchContent = async () => {
            // Keep existing pageContent visible while fetching updates if possible
            const legalData = getLegalData(settings);
            
            try {
                await initializePublic();
                
                const key = keyMap[effectivePageId];
                if (key) {
                    // Try direct key first (from direct Settings update)
                    const res = await getPublicSetting(key, true);
                    if (typeof res?.data === 'string' && !res.data.includes('<h1>Terms and Conditions</h1>')) {
                        setPageContent({
                            title: legalData[effectivePageId]?.title || 'Information',
                            content: res.data.replace(/\n/g, '<br/>')
                        });
                        setIsLoading(false);
                        return;
                    }

                    // Try 'content' category next (Legacy grouped settings)
                    const contentRes = await getPublicSetting('content', true);
                    if (contentRes?.data && contentRes.data[key]) {
                        setPageContent({
                            title: legalData[effectivePageId]?.title || 'Information',
                            content: contentRes.data[key].replace(/\n/g, '<br/>')
                        });
                        setIsLoading(false);
                        return;
                    }
                }

                // Fallback to default bundled data
                setPageContent(legalData[effectivePageId] || {
                    title: 'Information',
                    content: '<p class="text-gray-500 font-bold uppercase text-[10px] ">Coming soon...</p>'
                });
            } catch (err) {
                if (err?.response?.status !== 404) {
                    console.error('Error fetching legal content:', err);
                }
                const legalData = getLegalData(settings);
                setPageContent(legalData[effectivePageId] || {
                    title: 'Information',
                    content: '<p class="text-gray-500 font-bold uppercase text-[10px] ">Coming soon...</p>'
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchContent();
    }, [effectivePageId]); // Removed settings?.general to avoid unnecessary re-triggers

    if (isLoading && !pageContent) return <div className="p-20 text-center text-gray-400 font-bold uppercase animate-pulse">Loading...</div>;
    if (!pageContent) return null;

    return (
        <AccountLayout>
            <div className="max-w-[800px] mx-auto animate-fadeInUp">
                <div className="mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold uppercase  text-black mb-2">
                        {pageContent.title}
                    </h1>
                    <div className="h-1.5 w-20 bg-[#ffcc00] rounded-full"></div>
                </div>

                <div
                    className="legal-rich-text text-gray-700 leading-relaxed font-medium mb-12"
                    dangerouslySetInnerHTML={{ __html: pageContent.content }}
                />
                
                {/* Need Help Block */}
                <div className="mt-12 p-8 bg-blue-50/50 rounded-[24px] border border-blue-100 flex flex-col items-center text-center">
                    <h3 className="text-xl font-black text-gray-900 mb-3">Need Help?</h3>
                    <p className="text-sm font-medium text-gray-600 mb-6 max-w-md">
                        Still need help? Reach out to our customer support team directly through email or phone.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <a href={`mailto:${supportEmail}`} className="px-6 py-3 bg-[#ff5722] text-white rounded-full font-bold text-sm hover:bg-[#e64a19] transition-colors shadow-lg shadow-[#ff5722]/30">
                            {supportEmail}
                        </a>
                        <span className="hidden sm:block text-gray-300 font-black">/</span>
                        <a href={`tel:${supportPhone.replace(/[^0-9+]/g, '')}`} className="px-6 py-3 bg-white text-gray-900 border border-gray-200 rounded-full font-bold text-sm hover:bg-gray-50 transition-colors shadow-sm">
                            {supportPhone}
                        </a>
                    </div>
                </div>
            </div>
        </AccountLayout>
    );
};

export default LegalPage;
