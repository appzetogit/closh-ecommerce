import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { storeReferralCode, normalizeReferralCode } from '../../../../shared/utils/referral';
import { useAuthStore } from '../../../../shared/store/authStore';

// /r/:code - a friend's invite link. Remembers the code for the sign-up form, then goes home.
const ReferralLanding = () => {
    const { code } = useParams();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    useEffect(() => {
        const clean = normalizeReferralCode(code);
        if (!clean || isAuthenticated) return;
        storeReferralCode(clean);
        toast.success(`Invite code ${clean} saved. It will be added when you sign up.`, { id: 'referral-saved' });
    }, [code, isAuthenticated]);

    return <Navigate to="/" replace />;
};

export default ReferralLanding;
