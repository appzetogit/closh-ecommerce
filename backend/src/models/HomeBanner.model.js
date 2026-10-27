import mongoose from 'mongoose';

// Storefront banner slots managed from the admin panel (one banner per slot).
export const HOME_BANNER_SLOTS = ['bottom'];

const homeBannerSchema = new mongoose.Schema(
    {
        slot: { type: String, enum: HOME_BANNER_SLOTS, required: true, unique: true },
        image: { type: String, required: true },
        mobileImage: String,
        title: String,
        subtitle: String,
        badge: String,
        ctaText: String,
        link: String,
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const HomeBanner = mongoose.model('HomeBanner', homeBannerSchema);
export { HomeBanner };
export default HomeBanner;
