import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiSend, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';

/**
 * A "Suggestions & your thoughts" box shown at the bottom of every
 * customer-facing page (rendered once, universally, from UserLayout.jsx —
 * not per-page). Submissions land in Suggestion.model.js and show up in the
 * admin panel under Suggestions & Feedback. Guests can submit without an
 * account; the backend attaches the logged-in user if one is authenticated.
 */
const SuggestionBox = () => {
    const location = useLocation();
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = message.trim();
        if (!trimmed) {
            toast.error('Please write your suggestion first');
            return;
        }
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            await api.post('/suggestions', {
                message: trimmed,
                pageUrl: location.pathname,
            });
            setSubmitted(true);
            setMessage('');
            toast.success('Thanks for the feedback!');
        } catch (err) {
            // api's interceptor already toasts the server error message
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="w-full bg-white py-6 md:py-8 border-t border-gray-100">
            <div className="max-w-2xl mx-auto px-4">
                {submitted ? (
                    <div className="flex flex-col items-center gap-2 text-center py-4">
                        <FiCheckCircle size={28} className="text-emerald-500" />
                        <p className="font-bold text-gray-900">Thanks for letting us know!</p>
                        <p className="text-sm text-gray-500">We read every suggestion.</p>
                        <button
                            onClick={() => setSubmitted(false)}
                            className="mt-2 text-xs font-bold text-indigo-600 uppercase tracking-wide"
                        >
                            Share another thought
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="rounded-2xl bg-[#F6F6F8] border border-black/[0.04] p-4 md:p-5">
                        <p className="text-[14px] md:text-[15px] font-black text-gray-900 leading-tight">
                            Suggestions &amp; your thoughts
                        </p>
                        <p className="text-[11px] md:text-[12px] text-gray-500 font-medium mt-0.5">
                            Tell us what we could do better — it goes straight to our team.
                        </p>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type your suggestion here..."
                            rows={3}
                            maxLength={2000}
                            className="w-full mt-3 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                        />
                        <div className="flex justify-end mt-2.5">
                            <button
                                type="submit"
                                disabled={isSubmitting || !message.trim()}
                                className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 text-white text-[11px] font-black uppercase tracking-wide px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                            >
                                <FiSend size={13} />
                                {isSubmitting ? 'Sending...' : 'Send'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </section>
    );
};

export default SuggestionBox;
