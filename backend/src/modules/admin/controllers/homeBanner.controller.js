import asyncHandler from '../../../utils/asyncHandler.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import HomeBanner, { HOME_BANNER_SLOTS } from '../../../models/HomeBanner.model.js';
import { clearCachePattern } from '../../../utils/cache.js';

const assertSlot = (slot) => {
    if (!HOME_BANNER_SLOTS.includes(slot)) {
        throw new ApiError(400, `slot must be one of: ${HOME_BANNER_SLOTS.join(', ')}`);
    }
};

// Same-site path ("/sale/x") or absolute http(s) URL; anything else is dropped.
const cleanLink = (value) => {
    const link = String(value || '').trim();
    if (/^https?:\/\//i.test(link)) return link;
    if (link.startsWith('/') && !link.startsWith('//')) return link;
    return '';
};

// GET /api/admin/home-banners -> { bottom } (null when the slot is empty)
export const getHomeBanners = asyncHandler(async (req, res) => {
    const rows = await HomeBanner.find({});
    const data = Object.fromEntries(HOME_BANNER_SLOTS.map((s) => [s, rows.find((r) => r.slot === s) || null]));
    return res.status(200).json(new ApiResponse(200, data, 'Home banners fetched successfully'));
});

// PUT /api/admin/home-banners/:slot  (create or replace the banner in that slot)
export const upsertHomeBanner = asyncHandler(async (req, res) => {
    const { slot } = req.params;
    assertSlot(slot);
    const { image, mobileImage, title, subtitle, badge, ctaText, link, isActive } = req.body || {};
    if (!String(image || '').trim()) throw new ApiError(400, 'image is required');

    const banner = await HomeBanner.findOneAndUpdate(
        { slot },
        {
            slot,
            image: String(image).trim(),
            mobileImage: String(mobileImage || '').trim(),
            title: String(title || '').trim().slice(0, 80),
            subtitle: String(subtitle || '').trim().slice(0, 160),
            badge: String(badge || '').trim().slice(0, 20),
            ctaText: String(ctaText || '').trim().slice(0, 24),
            link: cleanLink(link),
            isActive: isActive === undefined ? true : Boolean(isActive),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    await clearCachePattern('home-banners:*');
    return res.status(200).json(new ApiResponse(200, banner, 'Home banner saved successfully'));
});

// DELETE /api/admin/home-banners/:slot
export const deleteHomeBanner = asyncHandler(async (req, res) => {
    const { slot } = req.params;
    assertSlot(slot);
    const banner = await HomeBanner.findOneAndDelete({ slot });
    if (!banner) throw new ApiError(404, 'No banner in this slot');
    await clearCachePattern('home-banners:*');
    return res.status(200).json(new ApiResponse(200, null, 'Home banner removed successfully'));
});
