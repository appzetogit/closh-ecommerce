import { useLocation } from 'react-router-dom';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer';
import BottomNav from '../../components/Navigation/BottomNav';
import ServiceAreaBlocker from './ServiceAreaBlocker';
import SuggestionBox from '../../components/Feedback/SuggestionBox';

const UserLayout = ({ children, variant = 'default', showHeader = true, showCategoryBar = true }) => {
    const location = useLocation();
    const isAddressPage = location.pathname.includes('/addresses');
    const isTrackOrderPage = location.pathname.includes('/track-order');
    
    const displayHeader = showHeader && (variant !== 'products' && !location.pathname.startsWith('/products')) && !isAddressPage && !isTrackOrderPage;
    const displayBottomNav = !['checkout', 'payment'].includes(variant || '') && !location.pathname.startsWith('/products') && !isAddressPage && !isTrackOrderPage;

    return (
        <div id="user-layout-root" className="flex flex-col min-h-screen bg-white">
            {displayHeader && <Header variant={variant} showCategoryBar={showCategoryBar} />}
            <div id="user-scroll-container" className="flex-1 flex flex-col scroll-smooth">
                <main className="flex-1">
                    <ServiceAreaBlocker>
                        {children}
                    </ServiceAreaBlocker>
                </main>
                {/* Always rendered, unlike Footer below — the "Suggestions & your
                    thoughts" box should show at the bottom of every page (including
                    product/cart/checkout on mobile, where Footer itself is hidden). */}
                <SuggestionBox />
                <div className={['product', 'account', 'cart', 'checkout', 'products', 'payment'].includes(variant) || isAddressPage || isTrackOrderPage ? "hidden lg:block" : (variant !== 'shop' ? "" : "hidden")}>
                    <Footer />
                </div>
            </div>
            {displayBottomNav && <BottomNav />}
        </div>
    );
};

export default UserLayout;
