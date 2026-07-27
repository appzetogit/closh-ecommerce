import React, { useState, useEffect } from 'react';
import { Star, ThumbsUp, MessageSquare, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { useReviewsStore } from '../../../../shared/store/reviewsStore';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useOrderStore } from '../../../../shared/store/orderStore';
import ReviewForm from '../../../../shared/components/Product/ReviewForm';

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));

const ProductReviews = ({ productId, initialRating, initialReviewCount }) => {
    const { fetchReviews, getReviews, voteHelpful, hasVoted, sortReviews, isLoading, addReview } = useReviewsStore();
    const { user, isAuthenticated } = useAuth();
    const { getAllOrders } = useOrderStore();
    const [reviews, setReviews] = useState([]);
    const [sortBy, setSortBy] = useState('newest');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [stats, setStats] = useState({ average: initialRating || 0, count: initialReviewCount || 0, distribution: { 5:0, 4:0, 3:0, 2:0, 1:0 }});

    const sortOptions = [
        { value: 'newest', label: 'Newest First' },
        { value: 'highest-rating', label: 'Highest Rated' },
        { value: 'lowest-rating', label: 'Lowest Rated' },
        { value: 'most-helpful', label: 'Most Helpful' },
    ];
    const selectedSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Newest First';

    useEffect(() => {
        const loadReviews = async () => {
            if (productId) {
                await fetchReviews(productId, { sort: sortBy });
                const fetched = getReviews(productId);
                setReviews(fetched);
                
                // Calculate stats if we have reviews
                if (fetched && fetched.length > 0) {
                    const dist = { 5:0, 4:0, 3:0, 2:0, 1:0 };
                    let totalRating = 0;
                    fetched.forEach(r => {
                        if (r.rating >= 1 && r.rating <= 5) dist[Math.round(r.rating)]++;
                        totalRating += r.rating;
                    });
                    setStats({
                        average: (totalRating / fetched.length).toFixed(1),
                        count: fetched.length,
                        distribution: dist
                    });
                }
            }
        };
        loadReviews();
    }, [productId, sortBy, fetchReviews, getReviews]);

    const handleSortChange = (e) => {
        setSortBy(e.target.value);
        if (productId) {
            setReviews(sortReviews(productId, e.target.value));
        }
    };

    const handleVoteHelpful = async (reviewId) => {
        if (!user) {
            toast.error('Please log in to vote on reviews');
            return;
        }
        if (hasVoted(productId, reviewId)) {
            toast.success('You have already voted on this review');
            return;
        }
        await voteHelpful(productId, reviewId);
        setReviews(getReviews(productId)); // Refresh local state
    };

    const eligibleDeliveredOrderId = React.useMemo(() => {
        if (!isAuthenticated || !user?.id || !isMongoId(productId)) return null;
        const userOrders = getAllOrders(user.id) || [];
        const eligibleOrder = userOrders.find((order) => {
            if (String(order?.status || "").toLowerCase() !== "delivered") return false;
            const items = Array.isArray(order?.items) ? order.items : [];
            return items.some(
                (item) => String(item?.productId || item?.id || "") === String(productId)
            );
        });
        return eligibleOrder?._id || null;
    }, [isAuthenticated, user, productId, getAllOrders]);

    const handleSubmitReview = async (reviewData) => {
        if (!eligibleDeliveredOrderId) {
            toast.error("You can review only after this product is delivered");
            return false;
        }

        const ok = await addReview(productId, {
            ...reviewData,
            orderId: eligibleDeliveredOrderId,
        });
        if (!ok) {
            toast.error("Unable to submit review");
            return false;
        }

        await fetchReviews(productId, { sort: sortBy });
        setReviews(getReviews(productId));
        return true;
    };

    if (isLoading && reviews.length === 0) {
        return <div className="py-10 flex justify-center"><div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="py-8 md:py-12 border-t border-gray-100">
            <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wide text-gray-900 mb-8">Customer Reviews</h2>
            
            <div className="flex flex-col md:flex-row gap-8 lg:gap-12 mb-10">
                {/* Summary Section */}
                <div className="w-full md:w-1/3 shrink-0">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="text-4xl md:text-5xl font-black text-gray-900">{stats.average}</div>
                        <div>
                            <div className="flex gap-1 mb-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} size={16} className={star <= Math.round(stats.average) ? "fill-[#D4AF37] text-black" : "fill-gray-100 text-gray-200"} />
                                ))}
                            </div>
                            <p className="text-xs font-bold text-gray-500 uppercase">{stats.count} Ratings</p>
                        </div>
                    </div>
                    
                    <div className="space-y-2.5">
                        {[5, 4, 3, 2, 1].map(star => {
                            const count = stats.distribution[star] || 0;
                            const percentage = stats.count > 0 ? (count / stats.count) * 100 : 0;
                            return (
                                <div key={star} className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 w-8 text-xs font-bold text-gray-600">
                                        {star} <Star size={10} className="fill-gray-400 text-gray-400" />
                                    </div>
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-black rounded-full" style={{ width: `${percentage}%` }}></div>
                                    </div>
                                    <div className="w-8 text-right text-[10px] font-bold text-gray-400">{count}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Reviews List */}
                <div className="flex-1">
                    {isAuthenticated && isMongoId(productId) && (
                        <div className="mb-8">
                            {eligibleDeliveredOrderId ? (
                                <ReviewForm
                                    productId={productId}
                                    onSubmit={handleSubmitReview}
                                />
                            ) : (
                                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-medium text-gray-500 text-center">
                                    Reviews are only available after this product has been delivered to you.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900">
                            {reviews.length > 0 ? `${reviews.length} Reviews` : 'No Reviews Yet'}
                        </h3>
                        <div className="relative">
                            <button 
                                onClick={() => setIsSortOpen(!isSortOpen)}
                                onBlur={() => setTimeout(() => setIsSortOpen(false), 200)}
                                className="flex items-center gap-2 bg-gray-50 border border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-700 py-2.5 px-4 rounded-xl outline-none cursor-pointer hover:bg-gray-100 transition-colors shadow-sm"
                            >
                                {selectedSortLabel}
                                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isSortOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {sortOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => {
                                                setSortBy(option.value);
                                                if (productId) {
                                                    setReviews(sortReviews(productId, option.value));
                                                }
                                                setIsSortOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider transition-colors hover:bg-gray-50"
                                        >
                                            <span className={sortBy === option.value ? 'text-black' : 'text-gray-500'}>
                                                {option.label}
                                            </span>
                                            {sortBy === option.value && (
                                                <Check size={14} className="text-black" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {reviews.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
                            <MessageSquare size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Be the first to review this product</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {reviews.map((review) => (
                                <div key={review.id} className="pb-6 border-b border-gray-50 last:border-0">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-400 uppercase">
                                                {review.user?.charAt(0) || 'U'}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-900">{review.user || 'Anonymous'}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className="flex gap-0.5">
                                                        {[1, 2, 3, 4, 5].map(star => (
                                                            <Star key={star} size={10} className={star <= review.rating ? "fill-[#D4AF37] text-black" : "fill-gray-200 text-gray-200"} />
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-medium">
                                                        {new Date(review.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {review.comment && (
                                        <p className="text-sm text-gray-600 leading-relaxed mb-4">{review.comment}</p>
                                    )}

                                    {review.images && review.images.length > 0 && (
                                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                            {review.images.map((img, idx) => (
                                                <img key={idx} src={img} alt="Review attachment" className="w-16 h-16 object-cover rounded-lg border border-gray-100" />
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={() => handleVoteHelpful(review.id)}
                                            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase transition-colors ${hasVoted(productId, review.id) ? 'text-black' : 'text-gray-400 hover:text-gray-900'}`}
                                        >
                                            <ThumbsUp size={12} className={hasVoted(productId, review.id) ? 'fill-black' : ''} />
                                            Helpful ({review.helpfulCount || 0})
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductReviews;
