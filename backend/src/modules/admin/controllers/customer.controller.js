import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.model.js';
import Order from '../../../models/Order.model.js';
import Address from '../../../models/Address.model.js';

/**
 * @desc    Get all customers with pagination and filters
 * @route   GET /api/admin/customers
 * @access  Private (Admin)
 */
export const getAllCustomers = asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 10 } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = { role: 'customer' };

    // Deleted accounts are soft-deleted, so they stay visible here by default;
    // 'active'/'inactive' filters exclude them, and 'deleted' isolates them.
    if (status === 'deleted') {
        filter.isDeleted = true;
    } else if (status === 'active') {
        filter.isActive = true;
        filter.isDeleted = { $ne: true };
    } else if (status === 'blocked' || status === 'inactive') {
        filter.isActive = false;
        filter.isDeleted = { $ne: true };
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (numericPage - 1) * numericLimit;

    const customers = await User.find(filter)
        .select('-password -otp -otpExpiry')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit);

    const total = await User.countDocuments(filter);

    const customerIds = customers.map((customer) => customer._id);

    const [statsByUser, addressesByUser] = await Promise.all([
        Order.aggregate([
            { $match: { userId: { $in: customerIds } } },
            {
                $group: {
                    _id: '$userId',
                    orders: { $sum: 1 },
                    totalSpent: { $sum: '$total' },
                    lastOrderDate: { $max: '$createdAt' },
                },
            },
        ]),
        Address.find({ userId: { $in: customerIds } })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean(),
    ]);

    const statsMap = new Map(
        statsByUser.map((stats) => [String(stats._id), stats])
    );

    const addressesMap = new Map();
    for (const address of addressesByUser) {
        const userId = String(address.userId);
        const existing = addressesMap.get(userId) || [];
        existing.push(address);
        addressesMap.set(userId, existing);
    }

    const customersWithStats = customers.map((customer) => {
        const customerStats = statsMap.get(String(customer._id)) || {
            orders: 0,
            totalSpent: 0,
            lastOrderDate: null,
        };

        return {
            ...customer._doc,
            orders: customerStats.orders,
            totalSpent: customerStats.totalSpent,
            lastOrderDate: customerStats.lastOrderDate,
            addresses: addressesMap.get(String(customer._id)) || [],
        };
    });

    res.status(200).json(
        new ApiResponse(200, {
            customers: customersWithStats,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Customers fetched successfully')
    );
});

/**
 * @desc    Get customer details with order summary
 * @route   GET /api/admin/customers/:id
 * @access  Private (Admin)
 */
export const getCustomerById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customerObjectId = new mongoose.Types.ObjectId(id);

    const customer = await User.findOne({ _id: customerObjectId, role: 'customer' })
        .select('-password -otp -otpExpiry');

    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const [orderStats, addresses] = await Promise.all([
        Order.aggregate([
            { $match: { userId: customerObjectId } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$total' },
                    lastOrderDate: { $max: '$createdAt' }
                }
            }
        ]),
        Address.find({ userId: customerObjectId })
            .sort({ isDefault: -1, createdAt: -1 })
            .lean(),
    ]);

    const stats = orderStats.length > 0 ? orderStats[0] : {
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: null
    };

    res.status(200).json(
        new ApiResponse(200, {
            ...customer.toObject(),
            orders: stats.totalOrders,
            totalSpent: stats.totalSpent,
            lastOrderDate: stats.lastOrderDate,
            addresses: addresses || []
        }, 'Customer details fetched successfully')
    );
});

/**
 * @desc    Toggle customer active status
 * @route   PATCH /api/admin/customers/:id/status
 * @access  Private (Admin)
 */
export const updateCustomerStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
        throw new ApiError(400, 'isActive status must be a boolean');
    }

    const target = await User.findOne({ _id: req.params.id, role: 'customer' }).select('isDeleted');
    if (!target) {
        throw new ApiError(404, 'Customer not found');
    }
    if (target.isDeleted) {
        throw new ApiError(400, 'This account was deleted by the user and cannot be reactivated.');
    }

    const customer = await User.findOneAndUpdate(
        { _id: req.params.id, role: 'customer' },
        { isActive },
        { new: true }
    ).select('-password');

    res.status(200).json(
        new ApiResponse(200, customer, `Customer status updated to ${isActive ? 'active' : 'inactive'}`)
    );
});

/**
 * @desc    Update customer details
 * @route   PUT /api/admin/customers/:id
 * @access  Private (Admin)
 */
export const updateCustomerDetail = asyncHandler(async (req, res) => {
    const { name, phone } = req.body;

    const customer = await User.findOneAndUpdate(
        { _id: req.params.id, role: 'customer' },
        { name, phone },
        { new: true, runValidators: true }
    ).select('-password');

    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    res.status(200).json(
        new ApiResponse(200, customer, 'Customer updated successfully')
    );
});

/**
 * @desc    Delete a customer address
 * @route   DELETE /api/admin/customers/:customerId/addresses/:addressId
 * @access  Private (Admin)
 */
export const deleteCustomerAddress = asyncHandler(async (req, res) => {
    const { customerId, addressId } = req.params;

    const customer = await User.findOne({ _id: customerId, role: 'customer' }).select('_id');
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const address = await Address.findOneAndDelete({ _id: addressId, userId: customerId });
    if (!address) {
        throw new ApiError(404, 'Address not found');
    }

    res.status(200).json(
        new ApiResponse(200, null, 'Address deleted successfully')
    );
});

/**
 * @desc    Get customer orders (paginated)
 * @route   GET /api/admin/customers/:id/orders
 * @access  Private (Admin)
 */
export const getCustomerOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;

    const customer = await User.findOne({ _id: req.params.id, role: 'customer' }).select('_id');
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const filter = {
        userId: customer._id,
        isDeleted: { $ne: true },
    };

    if (status) {
        filter.status = status;
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            orders,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit),
            },
        }, 'Customer orders fetched successfully')
    );
});

/**
 * @desc    Get customer transactions (paginated)
 * @route   GET /api/admin/customers/transactions
 * @access  Private (Admin)
 */
export const getCustomerTransactions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, status = 'all' } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;

    const filter = {
        userId: { $ne: null },
        isDeleted: { $ne: true },
    };

    if (status === 'completed') {
        filter.$or = [{ paymentStatus: 'paid' }, { paymentStatus: 'refunded' }];
    } else if (status === 'pending') {
        filter.paymentStatus = 'pending';
        filter.status = { $ne: 'cancelled' };
    } else if (status === 'failed') {
        filter.$or = [{ paymentStatus: 'failed' }, { status: 'cancelled' }];
    }

    if (search) {
        const regex = new RegExp(search, 'i');
        const matchedUsers = await User.find({
            role: 'customer',
            $or: [{ name: regex }, { email: regex }, { phone: regex }],
        }).select('_id').limit(300).lean();
        const matchedUserIds = matchedUsers.map((u) => u._id);

        const searchOr = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
        ];

        if (matchedUserIds.length > 0) {
            searchOr.push({ userId: { $in: matchedUserIds } });
        }

        if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
            delete filter.$or;
        } else {
            filter.$or = searchOr;
        }
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            orders,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit),
            },
        }, 'Customer transactions fetched successfully')
    );
});

/**
 * @desc    Get customer addresses (paginated)
 * @route   GET /api/admin/customers/addresses
 * @access  Private (Admin)
 */
export const getCustomerAddresses = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;

    const matchSearch = search
        ? {
            $or: [
                { 'customer.name': { $regex: search, $options: 'i' } },
                { 'customer.email': { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } },
                { city: { $regex: search, $options: 'i' } },
            ],
        }
        : null;

    const basePipeline = [
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'customer',
            },
        },
        { $unwind: '$customer' },
        { $match: { 'customer.role': 'customer' } },
    ];

    if (matchSearch) {
        basePipeline.push({ $match: matchSearch });
    }

    const dataPipeline = [
        ...basePipeline,
        { $sort: { isDefault: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: numericLimit },
        {
            $project: {
                _id: 1,
                userId: 1,
                name: 1,
                fullName: 1,
                phone: 1,
                address: 1,
                city: 1,
                state: 1,
                zipCode: 1,
                country: 1,
                isDefault: 1,
                createdAt: 1,
                updatedAt: 1,
                customerId: '$customer._id',
                customerName: '$customer.name',
                customerEmail: '$customer.email',
            },
        },
    ];

    const countPipeline = [
        ...basePipeline,
        { $count: 'total' },
    ];

    const [addresses, countRows] = await Promise.all([
        Address.aggregate(dataPipeline),
        Address.aggregate(countPipeline),
    ]);

    const total = countRows?.[0]?.total || 0;

    res.status(200).json(
        new ApiResponse(200, {
            addresses,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit),
            },
        }, 'Customer addresses fetched successfully')
    );
});
