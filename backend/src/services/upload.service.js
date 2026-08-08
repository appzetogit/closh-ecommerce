import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../../uploads');

// Same convention the rest of the app already uses (see constants.js on the
// frontend and buildDocUrl in admin/delivery.controller.js on the backend).
const PUBLIC_BASE_URL =
    process.env.SERVER_PUBLIC_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://api.closh.in' : `http://localhost:${process.env.PORT || 5000}`);

// Delivery KYC documents (driving license, Aadhar) must land in the
// signed-token-guarded /uploads/delivery-docs/ route (see app.js) rather
// than being served as plain public files, and must stay a *relative* URL
// so buildDocUrl() actually appends the token instead of passing it through.
const isDeliveryDocFolder = (cleanFolder) => cleanFolder.startsWith('delivery/documents');

/**
 * Save a local file to the local uploads directory instead of Cloudinary.
 * @param {string} localFilePath - Path to temporary uploaded file from multer
 * @param {string} folder - Target subfolder (e.g., 'vendors/products', 'users/avatars')
 * @param {string} [publicId] - Optional custom public ID/filename
 * @returns {Promise<{url: string, publicId: string}>}
 */
const saveFileLocally = async (localFilePath, folder = 'general', publicId) => {
    if (!localFilePath) {
        throw new Error('Local file path is required for upload');
    }

    // Clean folder path to avoid leading/trailing slashes or redundant 'uploads/' prefix
    let cleanFolder = String(folder || 'general')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
    if (cleanFolder.startsWith('uploads/')) {
        cleanFolder = cleanFolder.slice(8);
    }
    if (!cleanFolder) cleanFolder = 'general';

    const isDeliveryDoc = isDeliveryDocFolder(cleanFolder);
    // Delivery docs are flattened into the one guarded folder, matching where
    // the migrated (Cloudinary-era) KYC documents already live.
    const storageFolder = isDeliveryDoc ? 'delivery-docs' : cleanFolder;

    const targetDir = path.join(uploadsRoot, storageFolder);
    await fs.mkdir(targetDir, { recursive: true });

    let filename = path.basename(localFilePath);
    if (publicId && typeof publicId === 'string') {
        const ext = path.extname(localFilePath) || path.extname(publicId) || '';
        const base = path.basename(publicId, path.extname(publicId));
        if (base) {
            filename = `${base}${ext}`;
        }
    }

    const targetPath = path.join(targetDir, filename);

    // If the file is not already at the target location, move or copy it
    if (path.resolve(localFilePath) !== path.resolve(targetPath)) {
        try {
            await fs.rename(localFilePath, targetPath);
        } catch {
            await fs.copyFile(localFilePath, targetPath);
            await fs.unlink(localFilePath).catch(() => {});
        }
    }

    const relativeUrl = `/uploads/${storageFolder}/${filename}`.replace(/\/+/g, '/');
    const relativePublicId = `${storageFolder}/${filename}`.replace(/\/+/g, '/');

    return {
        // Delivery docs stay relative so buildDocUrl() can sign them; everything
        // else is absolute so it's a drop-in replacement for the old Cloudinary
        // secure_url (nothing downstream needs to prefix a base URL itself).
        url: isDeliveryDoc ? relativeUrl : `${PUBLIC_BASE_URL}${relativeUrl}`,
        publicId: relativePublicId,
    };
};

/**
 * Save image locally
 */
export const uploadToCloudinary = async (localFilePath, folder, publicId) => {
    return saveFileLocally(localFilePath, folder, publicId);
};

/**
 * Save file locally with configurable resource type
 */
export const uploadFileToCloudinary = async (
    localFilePath,
    folder,
    resourceType = 'auto',
    publicId
) => {
    return saveFileLocally(localFilePath, folder, publicId);
};

/**
 * Save local file to uploads directory
 */
export const uploadLocalFileToCloudinaryAndCleanup = async (localFilePath, folder, publicId) => {
    return saveFileLocally(localFilePath, folder, publicId);
};

/**
 * Save local file to uploads directory with resource type
 */
export const uploadLocalFileToCloudinaryAndCleanupWithType = async (
    localFilePath,
    folder,
    resourceType = 'auto',
    publicId
) => {
    return saveFileLocally(localFilePath, folder, publicId);
};

/**
 * Delete a local file by public ID or path
 */
export const deleteFromCloudinary = async (publicId) => {
    if (!publicId || typeof publicId !== 'string') return false;
    try {
        let clean = publicId.replace(/\\/g, '/').replace(/^\/+/, '');
        if (clean.startsWith('uploads/')) {
            clean = clean.slice(8);
        }
        const filePath = path.join(uploadsRoot, clean);
        if (fsSync.existsSync(filePath)) {
            await fs.unlink(filePath);
            return true;
        }
    } catch {
        // ignore error if file missing or cannot be deleted
    }
    return false;
};

/**
 * Best-effort local file cleanup helper.
 */
export const cleanupLocalFile = async (localFilePath) => {
    if (!localFilePath) return false;
    try {
        await fs.unlink(localFilePath);
        return true;
    } catch {
        return false;
    }
};

/**
 * Best-effort cleanup for multiple local files.
 */
export const cleanupLocalFiles = async (paths = []) => {
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    await Promise.allSettled(uniquePaths.map((filePath) => cleanupLocalFile(filePath)));
};

