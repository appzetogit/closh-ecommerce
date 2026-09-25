import mongoose from 'mongoose';

// A lightweight "suggestions & thoughts" box shown on every customer page
// (see frontend SuggestionBox.jsx). Guests can submit without logging in;
// if a customer happens to be authenticated we attach their userId so admin
// can see who it came from, but nothing here requires an account.
const suggestionSchema = new mongoose.Schema(
    {
        message: { type: String, required: true, trim: true, maxlength: 2000 },
        name: { type: String, trim: true, default: '' },
        email: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        pageUrl: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['new', 'reviewed'], default: 'new', index: true },
    },
    { timestamps: true }
);

suggestionSchema.index({ createdAt: -1 });

const Suggestion = mongoose.model('Suggestion', suggestionSchema);
export default Suggestion;
