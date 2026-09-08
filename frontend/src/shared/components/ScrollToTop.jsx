import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component that scrolls to top on route change
 * Works for both desktop and mobile views
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
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
    setTimeout(() => {
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
  }, [pathname]);

  return null;
};

export default ScrollToTop;

