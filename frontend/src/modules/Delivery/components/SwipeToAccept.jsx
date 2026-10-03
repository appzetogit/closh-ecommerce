import { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { FiChevronRight, FiCheck } from 'react-icons/fi';

const SwipeToAccept = ({ onAccept, isLoading = false, label = 'Swipe to Accept Request', color = '#6366f1' }) => {
    const [accepted, setAccepted] = useState(false);
    const containerRef = useRef(null);
    const handleRef = useRef(null);
    const x = useMotionValue(0);
    const controls = useAnimation();

    const [rightConstraint, setRightConstraint] = useState(0);

    useEffect(() => {
        if (containerRef.current && handleRef.current) {
            const parentWidth = containerRef.current.offsetWidth;
            const childWidth = handleRef.current.offsetWidth;
            setRightConstraint(parentWidth - childWidth);
        }
    }, []);

    const handleDragEnd = async (event, info) => {
        if (isLoading || accepted || rightConstraint <= 0) return;

        // If swiped more than 70% of the way, trigger accept
        if (info.offset.x > rightConstraint * 0.75) {
            controls.start({ x: rightConstraint, transition: { type: 'spring', stiffness: 400, damping: 30 } });
            setAccepted(true);
            if (onAccept) {
                try {
                    await onAccept();
                } catch {
                    // The accept failed (already reassigned, network, ...). `accepted` used to
                    // stay true forever, leaving the handle stuck at the end where further
                    // swipes are ignored - the rider could not retry without closing the popup.
                    setAccepted(false);
                    controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
                }
            }
        } else {
            // Snap back if didn't swipe far enough
            controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
        }
    };

    const textOpacity = useTransform(x, [0, rightConstraint * 0.4 || 100], [0.8, 0]);
    const textScale = useTransform(x, [0, rightConstraint || 100], [1, 0.9]);

    const bgOpacity = useTransform(x, [0, rightConstraint || 100], [0.05, 0.2]);

    return (
        <div className="relative w-full max-w-[340px] mx-auto">
            <motion.div
                ref={containerRef}
                className={`relative w-full h-[68px] rounded-[34px] overflow-hidden flex items-center p-1.5 transition-all duration-300 ${
                  accepted ? 'border-transparent' : 'bg-slate-100 border-slate-200'
                } border shadow-inner`}
                style={{ backgroundColor: accepted ? color : undefined }}
            >
                {/* Background Progress Fill */}
                <motion.div 
                   style={{ width: x, opacity: accepted ? 0 : 1, backgroundColor: color }}
                   className="absolute inset-y-0 left-0 opacity-10 pointer-events-none"
                />

                <motion.div
                    style={{ opacity: accepted ? 0 : textOpacity, scale: textScale }}
                    className="absolute inset-0 flex items-center justify-center font-black text-slate-400 capitalize text-sm tracking-wide z-0 pointer-events-none"
                >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                         <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                         Processing...
                      </div>
                    ) : label}
                </motion.div>

                <motion.div
                    ref={handleRef}
                    drag={accepted || isLoading ? false : "x"}
                    dragConstraints={{ left: 0, right: rightConstraint }}
                    dragElastic={0.05}
                    dragMomentum={false}
                    onDragEnd={handleDragEnd}
                    animate={controls}
                    style={{ x }}
                    className="relative h-full aspect-square z-10 cursor-grab active:cursor-grabbing group"
                >
                    <div className={`w-full h-full rounded-[28px] flex items-center justify-center shadow-lg transition-all duration-500 ${
                        accepted 
                        ? 'bg-white scale-95' 
                        : 'bg-[#0F172A] text-white'
                    }`}
                    style={{ color: accepted ? color : undefined }}
                    >
                        {accepted ? (
                           <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                              <FiCheck size={28} />
                           </motion.div>
                        ) : (
                           <FiChevronRight size={28} className="group-active:translate-x-1 transition-transform" />
                        )}
                    </div>
                </motion.div>

                <AnimatePresence>
                    {accepted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute inset-0 flex items-center justify-center font-black text-white text-base uppercase tracking-[0.2em] z-0 pointer-events-none"
                        >
                            Assigned!
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default SwipeToAccept;
