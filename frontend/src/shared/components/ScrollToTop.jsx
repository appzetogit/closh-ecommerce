import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Scroll offset of every history entry the user has left, keyed by location.key.
const savedPositions = new Map();

// Pages fill in after data loads, so the page may not be tall enough yet when we
// arrive; keep nudging towards the saved offset until it is reachable (or give up).
const restoreScroll = (target) => {
  const startedAt = Date.now();
  let stopped = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    ['wheel', 'touchstart', 'keydown'].forEach((e) => window.removeEventListener(e, stop));
  };
  // The user taking over the scroll always wins.
  ['wheel', 'touchstart', 'keydown'].forEach((e) => window.addEventListener(e, stop, { passive: true }));

  // Content above the target keeps growing as images/sections load, which shifts
  // the viewport (scroll anchoring), so hold the offset until the height settles.
  let lastHeight = -1;
  let stableSince = Date.now();
  const step = () => {
    if (stopped) return;
    const height = document.documentElement.scrollHeight;
    const max = height - window.innerHeight;
    if (height !== lastHeight) {
      lastHeight = height;
      stableSince = Date.now();
    }
    const goal = Math.min(target, Math.max(max, 0));
    if (Math.abs(window.scrollY - goal) > 1) {
      window.scrollTo({ top: goal, left: 0, behavior: 'instant' });
    }
    const settled = max >= target - 2 && Date.now() - stableSince > 600;
    if (settled || Date.now() - startedAt > 4000) {
      stop();
      return;
    }
    timer = setTimeout(step, 50);
  };
  step();
  return stop;
};

/**
 * Scrolls to top when navigating to a new page, but puts the user back where
 * they were when they come back (browser/back button). Works for both desktop
 * and mobile views.
 */
const ScrollToTop = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { pathname } = location;
  const keyRef = useRef(location.key);
  keyRef.current = location.key;

  // We do the restoring ourselves; the browser's own attempt fights ours.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    return () => {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = previous;
    };
  }, []);

  // Remember where the user is on the current history entry.
  useEffect(() => {
    let frame = null;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        savedPositions.set(keyRef.current, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // useLayoutEffect so a new page never paints at the previous page's offset.
  useLayoutEffect(() => {
    const saved = savedPositions.get(location.key);
    if (navigationType === 'POP' && saved > 0) {
      return restoreScroll(saved);
    }

    // Scroll window to top (for desktop and mobile)
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant', // Use 'instant' for immediate scroll, or 'smooth' for animated
    });

    // Handle user module scroll container
    const userScrollContainer = document.getElementById('user-scroll-container');
    if (userScrollContainer) {
      userScrollContainer.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant',
      });
    }

    // Also handle scrollable main containers in admin layouts
    // Use setTimeout to ensure DOM is updated after route change
    const timer = setTimeout(() => {
      // Scroll main elements that have overflow (admin layouts have scrollable main containers)
      const mainElements = document.querySelectorAll('main');
      mainElements.forEach((main) => {
        const styles = window.getComputedStyle(main);
        if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
          main.scrollTo({
            top: 0,
            left: 0,
            behavior: 'instant',
          });
        }
      });

      // Also handle any scrollable containers with data attribute
      const scrollableContainers = document.querySelectorAll('[data-scroll-container]');
      scrollableContainers.forEach((container) => {
        container.scrollTo({
          top: 0,
          left: 0,
          behavior: 'instant',
        });
      });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
};

export default ScrollToTop;
