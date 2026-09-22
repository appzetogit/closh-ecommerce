import axios from 'axios';
import ApiError from '../utils/ApiError.js';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Get Distance and Duration between two points using Google Distance Matrix API
 * @param {Array} origin - [lng, lat]
 * @param {Array} destination - [lng, lat]
 * @returns {Object} { distance: number (km), duration: string }
 */
export const getDistanceMatrix = async (origin, destination) => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key') {
        // Fallback to simple Haversine if no API key
        return null;
    }

    try {
        const originStr = `${origin[1]},${origin[0]}`; // lat,lng
        const destStr = `${destination[1]},${destination[0]}`; // lat,lng

        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params: {
                origins: originStr,
                destinations: destStr,
                key: GOOGLE_MAPS_API_KEY,
                mode: 'driving',
                units: 'metric'
            }
        });

        const data = response.data;

        if (data.status !== 'OK') {
            throw new Error(`Google Maps API Error: ${data.status}`);
        }

        const element = data.rows[0]?.elements[0];
        if (element.status !== 'OK') {
             console.warn('Google Maps Element Status:', element.status);
             return null;
        }

        return {
            distance: parseFloat((element.distance.value / 1000).toFixed(2)), // in KM
            duration: element.duration.text, // e.g., "12 mins"
            durationValue: element.duration.value // in seconds
        };
    } catch (error) {
        console.error('Distance Matrix Error:', error.message);
        return null;
    }
};

/**
 * Geocode an address to get [longitude, latitude] coordinates
 * @param {String} address - The full address string
 * @returns {Array|null} [longitude, latitude]
 */
/**
 * Keyless geocoder, used when Google is unavailable. OpenStreetMap's Nominatim
 * is the same service the storefront's address picker already proxies through
 * /api/geocode. Their usage policy requires an identifying User-Agent.
 *
 * @param {String} address
 * @returns {Array|null} [longitude, latitude]
 */
const nominatimLookup = async (query) => {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { format: 'json', limit: 1, q: query },
            headers: { 'User-Agent': 'CloshApp/1.0 (support@closh.in)', Accept: 'application/json' },
            timeout: 8000,
        });

        const hit = Array.isArray(response.data) ? response.data[0] : null;
        if (!hit) return null;

        const lng = Number(hit.lon);
        const lat = Number(hit.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return [lng, lat];
    } catch (error) {
        console.error('[Geocoding] Nominatim error:', error.message);
        return null;
    }
};

const geocodeViaNominatim = async (address) => {
    // Nominatim can't resolve shop-level detail ("Shop NO E10, Gaurav Tower
    // Marg, ...") but resolves the locality fine, so drop the most specific
    // segment and retry. Landing on the neighbourhood or pincode centroid is a
    // far better delivery estimate than giving up and pricing off [0, 0].
    const segments = String(address).split(',').map((s) => s.trim()).filter(Boolean);
    const MAX_ATTEMPTS = 4;

    for (let i = 0; i < MAX_ATTEMPTS && segments.length - i >= 2; i++) {
        const query = segments.slice(i).join(', ');
        const hit = await nominatimLookup(query);
        if (hit) {
            if (i > 0) console.log(`[Geocoding] Resolved after dropping ${i} segment(s): "${query}"`);
            return hit;
        }
        // Nominatim asks for at most one request per second.
        if (i < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1100));
    }

    console.warn('[Geocoding] Nominatim found nothing for:', address);
    return null;
};

/**
 * Geocode an address to get [longitude, latitude] coordinates.
 * Tries Google when a key is configured, then falls back to Nominatim, so a
 * missing or rejected key degrades to a slower geocode rather than none — the
 * caller uses the result to price the delivery, and a null answer there means
 * the order is priced off a sentinel coordinate.
 *
 * @param {String} address - The full address string
 * @returns {Array|null} [longitude, latitude]
 */
export const geocodeAddress = async (address) => {
    if (!address || !String(address).trim()) return null;

    const hasGoogleKey = GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key';

    if (hasGoogleKey) {
        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: address,
                    key: GOOGLE_MAPS_API_KEY,
                }
            });

            const data = response.data;
            if (data.status === 'OK' && data.results?.[0]) {
                const location = data.results[0].geometry.location;
                return [location.lng, location.lat];
            }
            console.warn('[Geocoding] Google returned', data.status, 'for:', address, '- falling back to Nominatim.');
        } catch (error) {
            console.error('[Geocoding] Google error:', error.message, '- falling back to Nominatim.');
        }
    } else {
        console.warn('[Geocoding] No Google Maps key configured; using Nominatim.');
    }

    return geocodeViaNominatim(address);
};

/**
 * Get total distance for a sequence of points (e.g. V1 -> V2 -> V3)
 * @param {Array<Array>} coordsArray - Array of [lng, lat] coordinates
 * @param {Function} fallbackCalculator - Fallback function if Google Maps fails (e.g. calculateDistance)
 * @returns {Number} Total distance in km
 */
export const getRouteDistance = async (coordsArray, fallbackCalculator = null) => {
    if (!coordsArray || coordsArray.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 0; i < coordsArray.length - 1; i++) {
        const origin = coordsArray[i];
        const dest = coordsArray[i + 1];
        
        let hopDist = null;
        try {
            const result = await getDistanceMatrix(origin, dest);
            if (result && result.distance !== undefined) {
                hopDist = result.distance;
            }
        } catch (err) {
            console.error(`Google Maps Route Hop Error for ${i}->${i+1}:`, err.message);
        }

        if (hopDist === null && fallbackCalculator) {
            // Fallback to Haversine straight-line distance
            hopDist = fallbackCalculator(origin, dest);
        }
        
        totalDistance += (hopDist || 0);
    }
    
    return parseFloat(totalDistance.toFixed(2));
};
