import { createPortal } from 'react-dom';

// A bar pinned to the bottom of the screen, just above the rider app's bottom nav.
//
// It is rendered into document.body on purpose: the page transition wrapper keeps
// `will-change: transform` on every page, and a transformed ancestor makes `position: fixed`
// stick to THAT element instead of the viewport. Inside it, the Accept/Decline bar landed
// at the bottom of the (taller than the screen) page, below the fold and under the nav -
// riders saw "I have reached vendor" and no way to accept the order they were looking at.
const FixedBottomBar = ({ children, className = '' }) =>
  createPortal(
    <div
      className={`fixed left-0 right-0 ${className}`}
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {children}
    </div>,
    document.body
  );

export default FixedBottomBar;
