import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    User,
    MapPin,
    ShoppingBag,
    Tag,
    Calendar,
    Users,
    LogOut,
    ChevronRight,
    MessageSquare,
    Trash2,
    Wallet,
    Gift
} from 'lucide-react';
import toast from 'react-hot-toast';

const ProfileSidebar = () => {
    const { logout, deleteAccount } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleDeleteAccount = async () => {
        if (window.confirm('Are you sure you want to delete your account? This action is permanent and cannot be undone.')) {
            try {
                await deleteAccount();
                toast.success('Account deleted successfully');
                navigate('/');
            } catch (error) {
                toast.error('Failed to delete account');
            }
        }
    };

    const sidebarLinks = [
        { id: 'profile', label: 'Profile', path: '/profile', icon: <User size={18} /> },
        { id: 'addresses', label: 'Addresses', path: '/addresses', icon: <MapPin size={18} /> },
        { id: 'orders', label: 'My Orders', path: '/orders', icon: <ShoppingBag size={18} /> },
        { id: 'wallet', label: 'CLOSH Wallet', path: '/wallet', icon: <Wallet size={18} /> },
        { id: 'refer', label: 'Refer & Earn', path: '/refer', icon: <Gift size={18} /> },
        { id: 'support', label: 'Live Support', path: '/support', icon: <MessageSquare size={18} /> },
        { id: 'offers', label: 'My Offers', path: '/offers', icon: <Tag size={18} /> },
        { id: 'contact', label: 'Contact Us', path: '/contact', type: 'link' },
        { id: 'about', label: 'About Us', path: '/about', type: 'link' },
        { id: 'terms', label: 'Terms And Conditions', path: '/terms', type: 'link' },
        { id: 'privacy', label: 'Privacy Policy', path: '/privacy', type: 'link' },
        { id: 'refund', label: 'Refund Policy', path: '/refund', type: 'link' },
        { id: 'return', label: 'Return & Exchange Policy', path: '/return', type: 'link' },
        { id: 'shipping', label: 'Shipping Policy', path: '/shipping', type: 'link' },
    ];

    const isActive = (path) => location.pathname === path;

    return (
        <aside className="w-full lg:w-[320px] shrink-0">
            <div className="bg-gray-50 rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <nav className="flex flex-col">
                    {sidebarLinks.map((link) => (
                        <button
                            key={link.id}
                            onClick={() => link.path && navigate(link.path)}
                            className={`flex items-center justify-between px-6 py-4 transition-all border-b border-gray-100 last:border-0 ${isActive(link.path)
                                ? 'bg-black text-white shadow-[0_4px_20px_rgba(212,175,55,0.2)]'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                {link.icon && (
                                    <span className={`p-2 rounded-lg ${isActive(link.path) ? 'bg-black/10' : 'bg-gray-50 text-black'}`}>
                                        {link.icon}
                                    </span>
                                )}
                                <span className="font-semibold text-[15px]">{link.label}</span>
                            </div>
                            {!isActive(link.path) && <ChevronRight size={16} className="text-gray-400" />}
                        </button>
                    ))}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-4 px-6 py-6 text-gray-400 font-bold hover:text-red-500 transition-colors hover:bg-gray-50"
                    >
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                    <button
                        onClick={handleDeleteAccount}
                        className="flex items-center gap-4 px-6 py-6 text-gray-400 font-bold hover:text-red-600 transition-colors hover:bg-red-50/50"
                    >
                        <Trash2 size={18} />
                        <span>Delete Account</span>
                    </button>
                </nav>
            </div>
        </aside>
    );
};

export default ProfileSidebar;
