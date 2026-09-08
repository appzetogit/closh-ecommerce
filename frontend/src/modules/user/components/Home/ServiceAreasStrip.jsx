import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import api from '../../../../shared/utils/api';

const titleCase = (s) =>
    String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());

const joinNames = (names) => {
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
};

/**
 * "Now delivering in Jaipur & Indore" — read from the admin-managed service
 * areas so it stays truthful as cities are added. Renders nothing until the
 * list is known (and nothing at all if it's empty).
 */
const ServiceAreasStrip = () => {
    const [cities, setCities] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/service-areas')
            .then((res) => {
                const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                // `name` is the bare city ("Jaipur"); `displayName` carries the state
                // too ("Jaipur, Rajasthan"), which reads clumsily once joined.
                const names = [...new Set(list.map((a) => titleCase(a.name || a.displayName)).filter(Boolean))];
                if (!cancelled) setCities(names);
            })
            .catch(() => { if (!cancelled) setCities([]); });
        return () => { cancelled = true; };
    }, []);

    if (!cities || cities.length === 0) return null;

    return (
        <section className="w-full bg-white py-3 md:py-5">
            <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                <div className="flex items-center gap-3 rounded-xl md:rounded-2xl bg-[#FFF8E1] border border-[#FFC629]/40 px-3.5 py-3 md:px-5 md:py-4">
                    <div className="shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full bg-[#FFC629] text-gray-900 flex items-center justify-center">
                        <MapPin size={18} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[12px] md:text-[15px] font-black text-gray-900 leading-tight">
                            Now delivering in {joinNames(cities)}
                        </p>
                        <p className="text-[10px] md:text-[12px] text-gray-600 font-medium leading-tight mt-0.5">
                            60-minute delivery, Try &amp; Buy at your door. More cities coming soon.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ServiceAreasStrip;
