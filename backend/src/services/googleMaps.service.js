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
export const geocodeAddress = async (address) => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key') {
        console.warn('Geocoding failed: Missing or invalid Google Maps API key.');
        return null;
    }

    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: address,
                key: GOOGLE_MAPS_API_KEY,
            }
        });

        const data = response.data;
        if (data.status !== 'OK' || !data.results?.[0]) {
            console.warn('Geocoding result not OK for:', address, 'Status:', data.status);
            return null;
        }

        const location = data.results[0].geometry.location;
        return [location.lng, location.lat];
    } catch (error) {
        console.error('Geocoding Error:', error.message);
        return null;
    }
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
