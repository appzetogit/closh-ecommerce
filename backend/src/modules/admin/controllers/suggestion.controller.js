import Suggestion from '../../../models/Suggestion.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * @desc    Get all customer suggestions with search/status filter + pagination
 * @route   GET /api/admin/suggestions
 * @access  Private (Admin)
 */
export const getAllSuggestions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};
    if (status === 'new' || status === 'reviewed') filter.status = status;

    if (search) {
        const regex = new RegExp(String(search).trim(), 'i');
        filter.$or = [{ message: regex }, { name: regex }, { email: regex }];
    }

    const suggestions = await Suggestion.find(filter)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean();

    const total = await Suggestion.countDocuments(filter);

    const normalized = suggestions.map((s) => ({
        ...s,
        id: s._id,
        customerName: s.userId?.name || s.name || 'Guest',
        customerEmail: s.userId?.email || s.email || '',
    }));

    res.status(200).json(
        new ApiResponse(200, {
            suggestions: normalized,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Suggestions fetched successfully')
    );
});

/**
 * @desc    Mark a suggestion as reviewed/new
 * @route   PATCH /api/admin/suggestions/:id/status
 * @access  Private (Admin)
 */
export const updateSuggestionStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['new', 'reviewed'].includes(status)) {
        throw new ApiError(400, 'status must be "new" or "reviewed".');
    }

    const suggestion = await Suggestion.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!suggestion) throw new ApiError(404, 'Suggestion not found.');

    res.status(200).json(new ApiResponse(200, suggestion, `Suggestion marked ${status}.`));
});

/**
 * @desc    Delete a suggestion
 * @route   DELETE /api/admin/suggestions/:id
 * @access  Private (Admin)
 */
export const deleteSuggestion = asyncHandler(async (req, res) => {
    const suggestion = await Suggestion.findByIdAndDelete(req.params.id);
    if (!suggestion) throw new ApiError(404, 'Suggestion not found.');

    res.status(200).json(new ApiResponse(200, null, 'Suggestion deleted.'));
});
