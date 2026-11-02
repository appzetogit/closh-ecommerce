import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';

const pageVariants = {
  initial: (direction) => ({
    opacity: 0,
    x: direction === 'forward' ? 100 : direction === 'back' ? -100 : 0,
    y: direction === 'forward' || direction === 'back' ? 0 : 20,
  }),
  animate: {
    opacity: 1,
    x: 0,
    y: 0
  }
};

const pageTransition = {
  type: 'tween',
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.2
};

/**
 * Page transition wrapper for smooth route changes with direction-based animations
 * Note: Exit animations removed as they require AnimatePresence at Routes level
 * RouteWrapper handles component remounting via key prop
 */
const PageTransition = ({ children }) => {
  const location = useLocation();
  const [direction, setDirection] = useState('none');
  const [prevPath, setPrevPath] = useState(location.pathname);

  // Determine direction based on path changes
  useEffect(() => {
    const pathDepth = (path) => path.split('/').filter(Boolean).length;
    const currentDepth = pathDepth(location.pathname);
    const previousDepth = pathDepth(prevPath);

    if (currentDepth > previousDepth) {
      setDirection('forward');
    } else if (currentDepth < previousDepth) {
      setDirection('back');
    } else {
      setDirection('none');
    }

    setPrevPath(location.pathname);
  }, [location.pathname, prevPath]);

  // Scrolling on route change (top for new pages, restore on back) lives in
  // ScrollToTop; resetting it here as well would undo the restore.

  // Memoize the unique key to ensure it updates when location changes
  const uniqueKey = useMemo(() => location.pathname + location.search, [location.pathname, location.search]);

  // Use a regular div with key to ensure proper remounting, then wrap with motion
  // This prevents motion.div from interfering with React Router's remounting mechanism
  return (
    <div key={uniqueKey} className="w-full">
      <motion.div
        custom={direction}
        initial="initial"
        animate="animate"
        variants={pageVariants}
        transition={pageTransition}
        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
        className="w-full"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default PageTransition;

