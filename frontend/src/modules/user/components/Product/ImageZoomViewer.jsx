import React, { useState, useRef, useCallback, useEffect, Component } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Full-screen product image viewer.
 * - Swipe / arrow-click between images
 * - Pinch-to-zoom and drag-to-pan on touch devices
 * - Double-tap / double-click to zoom in and out
 * - Scroll wheel zoom on desktop
 */
const ImageZoomViewer = ({ images, startIndex = 0, onClose, productName = 'Product' }) => {
    const [index, setIndex] = useState(startIndex);
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const containerRef = useRef(null);
    const lastTapRef = useRef(0);
    const pinchRef = useRef(null); // { startDist, startScale }
    const dragRef = useRef(null); // { startX, startY, originX, originY }
    const swipeRef = useRef(null); // { startX, startY } for switching images when not zoomed

    const resetTransform = () => setTransform({ scale: 1, x: 0, y: 0 });

    const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

    const goTo = useCallback((next) => {
        if (!images.length) return;
        const clamped = (next + images.length) % images.length;
        setIndex(clamped);
        resetTransform();
    }, [images.length]);

    // Indexed access, not array destructuring: TouchList doesn't reliably support the
    // iterator protocol across browsers/webviews, so `const [a, b] = touches` throws
    // "touches is not iterable" the moment a second finger touches down — exactly the
    // pinch gesture this is for.
    const distanceBetween = (touches) => {
        const a = touches[0];
        const b = touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    // A gesture bug here must degrade to "zoom doesn't respond" — never to a thrown
    // error that trips the app's ErrorBoundary and blanks the whole page.
    const handleTouchStart = (e) => {
        try {
            if (e.touches.length === 2) {
                pinchRef.current = { startDist: distanceBetween(e.touches), startScale: transform.scale };
                dragRef.current = null;
                swipeRef.current = null;
            } else if (e.touches.length === 1) {
                const touch = e.touches[0];
                if (transform.scale > 1.01) {
                    dragRef.current = {
                        startX: touch.clientX,
                        startY: touch.clientY,
                        originX: transform.x,
                        originY: transform.y,
                    };
                } else {
                    swipeRef.current = { startX: touch.clientX, startY: touch.clientY };
                }
            }
        } catch (err) {
            console.warn('[ImageZoomViewer] touchstart handler failed:', err);
        }
    };

    // Both only touch refs and functional state updaters (no direct closure over
    // `transform`/`isDragging`), so they can be memoized once and safely called from a
    // listener that is attached only on mount.
    const handleTouchMove = useCallback((e) => {
        if (e.touches.length === 2 && pinchRef.current) {
            const dist = distanceBetween(e.touches);
            const ratio = pinchRef.current.startDist > 0 ? dist / pinchRef.current.startDist : 1;
            setTransform((t) => ({ ...t, scale: clampScale(pinchRef.current.startScale * ratio) }));
        } else if (e.touches.length === 1 && dragRef.current) {
            const touch = e.touches[0];
            setTransform((t) => ({
                ...t,
                x: dragRef.current.originX + (touch.clientX - dragRef.current.startX),
                y: dragRef.current.originY + (touch.clientY - dragRef.current.startY),
            }));
        }
    }, []);

    const handleWheel = useCallback((e) => {
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        setTransform((t) => {
            const nextScale = clampScale(t.scale + delta);
            return nextScale === 1 ? { scale: 1, x: 0, y: 0 } : { ...t, scale: nextScale };
        });
    }, []);

    // Native, explicitly non-passive touchmove/wheel listeners, attached once on mount.
    // Attaching these via JSX (onTouchMove / onWheel) leaves the browser free to treat
    // them as passive — since React 17 that IS the default for these two events — which
    // is exactly the state that makes preventDefault() misbehave: a silent no-op in most
    // desktop browsers, but a thrown TypeError in stricter mobile WebViews. That thrown
    // error is what was reaching the app's error boundary on every pinch gesture.
    // Registering manually with { passive: false } removes the ambiguity entirely.
    useEffect(() => {
        const node = containerRef.current;
        if (!node) return undefined;

        // preventDefault() is wrapped defensively: some mobile WebViews still throw on
        // it under conditions this couldn't be tested against directly (an already-
        // passive listener from an intervening layer, a non-cancelable event, etc).
        // A thrown error here reaches the app's ErrorBoundary and blanks the whole
        // page, which is a far worse failure mode than just skipping the one frame's
        // preventDefault and letting the gesture continue.
        const safePreventDefault = (e) => {
            try {
                if (e.cancelable) e.preventDefault();
            } catch (err) {
                console.warn('[ImageZoomViewer] preventDefault failed, continuing without it:', err);
            }
        };

        const onTouchMoveNative = (e) => {
            if (e.touches.length === 2 || (e.touches.length === 1 && dragRef.current)) {
                safePreventDefault(e);
            }
            try {
                handleTouchMove(e);
            } catch (err) {
                console.warn('[ImageZoomViewer] touchmove handler failed:', err);
            }
        };
        const onWheelNative = (e) => {
            safePreventDefault(e);
            try {
                handleWheel(e);
            } catch (err) {
                console.warn('[ImageZoomViewer] wheel handler failed:', err);
            }
        };

        node.addEventListener('touchmove', onTouchMoveNative, { passive: false });
        node.addEventListener('wheel', onWheelNative, { passive: false });
        return () => {
            node.removeEventListener('touchmove', onTouchMoveNative);
            node.removeEventListener('wheel', onWheelNative);
        };
    }, [handleTouchMove, handleWheel]);

    const handleTouchEnd = (e) => {
        try {
            // Snap back to bounds if zoomed out below 1
            setTransform((t) => (t.scale < MIN_SCALE ? { scale: MIN_SCALE, x: 0, y: 0 } : t));

            // Swipe to change image only when not zoomed and it was a single-finger gesture
            if (swipeRef.current && e.changedTouches.length === 1 && transform.scale <= 1.01) {
                const touch = e.changedTouches[0];
                const dx = touch.clientX - swipeRef.current.startX;
                const dy = touch.clientY - swipeRef.current.startY;
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
                    goTo(dx < 0 ? index + 1 : index - 1);
                }
            }

            // Double-tap to zoom
            if (e.touches.length === 0 && e.changedTouches.length === 1) {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                    setTransform((t) => (t.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }));
                }
                lastTapRef.current = now;
            }
        } catch (err) {
            console.warn('[ImageZoomViewer] touchend handler failed:', err);
        } finally {
            pinchRef.current = null;
            dragRef.current = null;
            swipeRef.current = null;
        }
    };

    const handleDoubleClick = () => {
        setTransform((t) => (t.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }));
    };

    // Desktop mouse drag when zoomed
    const handleMouseDown = (e) => {
        if (transform.scale <= 1.01) return;
        setIsDragging(true);
        dragRef.current = { startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y };
    };
    const handleMouseMove = (e) => {
        if (!isDragging || !dragRef.current) return;
        setTransform((t) => ({
            ...t,
            x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
            y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
        }));
    };
    const handleMouseUp = () => {
        setIsDragging(false);
        dragRef.current = null;
    };

    if (!Array.isArray(images) || images.length === 0) return null;
    const safeIndex = Math.min(index, images.length - 1);

    const content = (
        <div className="fixed inset-0 z-[30000] bg-black/95 backdrop-blur-sm flex flex-col animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 shrink-0 relative z-10">
                <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">
                    {safeIndex + 1} / {images.length}
                </span>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Image stage */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden touch-none select-none"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
            >
                <img
                    src={images[safeIndex]}
                    alt={`${productName} ${safeIndex + 1}`}
                    draggable={false}
                    className={`w-full h-full object-contain mix-blend-normal transition-transform duration-100 ${isDragging ? '' : 'ease-out'} ${transform.scale > 1.01 ? 'cursor-grab' : 'cursor-zoom-in'} ${isDragging ? 'cursor-grabbing' : ''}`}
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                />

                {/* Desktop nav arrows */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={() => goTo(safeIndex - 1)}
                            aria-label="Previous image"
                            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center text-white transition-colors"
                        >
                            <ChevronLeft size={22} />
                        </button>
                        <button
                            onClick={() => goTo(safeIndex + 1)}
                            aria-label="Next image"
                            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center text-white transition-colors"
                        >
                            <ChevronRight size={22} />
                        </button>
                    </>
                )}

                {transform.scale <= 1.01 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white/50 text-[10px] font-bold uppercase tracking-widest pointer-events-none">
                        <ZoomIn size={12} />
                        <span className="md:hidden">Pinch or double-tap to zoom</span>
                        <span className="hidden md:inline">Scroll or double-click to zoom</span>
                    </div>
                )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
                <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar shrink-0">
                    {images.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => goTo(idx)}
                            className={`w-12 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === safeIndex ? 'border-white' : 'border-transparent opacity-50'}`}
                        >
                            <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
};

/**
 * The app has one ErrorBoundary wrapping the entire router, so any uncaught error
 * anywhere — including a gesture edge case here that wasn't anticipated — blanks the
 * whole app to the generic "Oops! Something went wrong" screen. That is a wildly
 * disproportionate failure mode for a zoom viewer: worst case, it should just close.
 * This local boundary contains any such crash to that instead.
 */
class ImageZoomErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ImageZoomViewer] crashed, closing instead of taking down the page:', error, errorInfo);
        // Side effects (including a parent state update via this callback) belong in a
        // commit-phase lifecycle, not in render() — calling onClose() there would mean
        // updating the parent while this component is still rendering its fallback.
        if (this.props.onClose) this.props.onClose();
    }

    componentDidUpdate(prevProps) {
        // A fresh open (new startIndex/image set) after a prior crash should get a
        // clean slate rather than staying stuck in the caught state forever.
        if (this.state.hasError && prevProps.startIndex !== this.props.startIndex) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

const ImageZoomViewerWithBoundary = (props) => (
    <ImageZoomErrorBoundary onClose={props.onClose} startIndex={props.startIndex}>
        <ImageZoomViewer {...props} />
    </ImageZoomErrorBoundary>
);

export default ImageZoomViewerWithBoundary;
