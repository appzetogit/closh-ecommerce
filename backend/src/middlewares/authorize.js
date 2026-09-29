import ApiError from '../utils/ApiError.js';
import User from '../models/User.model.js';
import Vendor from '../models/Vendor.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Admin from '../models/Admin.model.js';

/**
 * Role-based authorization middleware
 * Usage: authorize('admin'), authorize('vendor'), authorize('customer', 'admin')
 */
export const authorize = (...roles) =>
    (req, res, next) => {
        if (!req.user) {
            return next(new ApiError(401, 'Authentication required.'));
        }
        if (!roles.includes(req.user.role)) {
            return next(new ApiError(403, `Access denied. Required role: ${roles.join(' or ')}`));
        }
        next();
    };

/**
 * Middleware for generic admin access (any role that is in Admin collection)
 */
export const authorizeAdmin = (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required.'));
    // We assume any role that isn't customer, vendor, or delivery is an admin-type role 
    // This is safe because enforceAccountStatus will double check the Admin table.
    const forbidden = ['customer', 'vendor', 'delivery'];
    if (forbidden.includes(req.user.role)) {
        return next(new ApiError(403, 'Access denied. Generic admin role required.'));
    }
    next();
};


/**
 * Middleware to check if admin has specific permission
 * Superadmins bypass all permission checks
 */
export const checkPermission = (permission) => async (req, res, next) => {
    try {
        if (!req.user) return next(new ApiError(401, 'Authentication required.'));

        // Only Superadmin bypasses all permission checks
        if (req.user.role && String(req.user.role).toLowerCase() === 'superadmin') return next();

        const admin = await Admin.findById(req.user.id).select('permissions role isActive').lean();
        if (!admin || !admin.isActive) return next(new ApiError(403, 'Account inactive or not found.'));

        const requiredPermissions = Array.isArray(permission) ? permission : [permission];
        const hasPermission = requiredPermissions.some(p => admin.permissions?.includes(p));

        if (!hasPermission) {
            return next(new ApiError(403, `Permission denied: ${requiredPermissions.join(' or ')} required.`));
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Enforce latest account state on every protected request.
 * Prevents stale tokens from bypassing suspension/deactivation.
 */
export const enforceAccountStatus = async (req, res, next) => {
    try {
        if (!req.user?.id || !req.user?.role) {
            return next(new ApiError(401, 'Authentication required.'));
        }

        const role = String(req.user.role).toLowerCase();

        if (role === 'customer') {
            const user = await User.findById(req.user.id).select('isActive isVerified isDeleted').lean();
            if (!user || user.isDeleted) return next(new ApiError(401, 'Account not found.'));
            if (!user.isActive) return next(new ApiError(403, 'Account is deactivated. Contact support.'));
            if (!user.isVerified) return next(new ApiError(403, 'Please verify your email first.'));
            return next();
        }

        if (role === 'vendor') {
            const vendor = await Vendor.findById(req.user.id).select('status isVerified').lean();
            if (!vendor) return next(new ApiError(401, 'Account not found.'));
            if (!vendor.isVerified) return next(new ApiError(403, 'Please verify your email first.'));
            if (vendor.status !== 'approved') {
                return next(new ApiError(403, `Vendor account is ${vendor.status}.`));
            }
            return next();
        }

        if (role === 'delivery') {
            const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('applicationStatus isActive').lean();
            if (!deliveryBoy) return next(new ApiError(401, 'Account not found.'));
            if (deliveryBoy.applicationStatus !== 'approved') {
                return next(new ApiError(403, `Delivery account is ${deliveryBoy.applicationStatus}.`));
            }
            if (!deliveryBoy.isActive) {
                return next(new ApiError(403, 'Account is deactivated. Contact admin.'));
            }
            return next();
        }

        // Fallback or Admin-like roles
        const admin = await Admin.findById(req.user.id).select('isActive').lean();
        if (admin) {
            if (!admin.isActive) return next(new ApiError(403, 'Admin account is deactivated.'));
            return next();
        }

        return next(new ApiError(403, 'Access denied. Invalid account type.'));
    } catch (err) {
        return next(err);
    }
};
