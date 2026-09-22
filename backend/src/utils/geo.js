/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param {Array} coords1 - [longitude, latitude]
 * @param {Array} coords2 - [longitude, latitude]
 * @returns {Number} - Distance in kilometers
 */
// How far a rider may be from the pickup and still claim an unassigned
// order. Used both to build the available-orders list and to guard the
// accept call, so the two can't drift apart.
export const MAX_CLAIM_DISTANCE_KM = 8;

export const calculateDistance = (coords1, coords2) => {
    if (!coords1 || !coords2 || coords1.length !== 2 || coords2.length !== 2) {
        return 0;
    }

    const lon1 = coords1[0];
    const lat1 = coords1[1];
    const lon2 = coords2[0];
    const lat2 = coords2[1];

    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return parseFloat(distance.toFixed(2));
};

/**
 * Calculates total Haversine distance along a path of coordinates.
 * @param {Array<Array>} pathCoords - Array of [longitude, latitude] coordinates
 * @returns {Number} - Total distance in kilometers
 */
export const calculatePathDistance = (pathCoords) => {
    if (!pathCoords || pathCoords.length < 2) return 0;
    let totalDist = 0;
    for (let i = 0; i < pathCoords.length - 1; i++) {
        totalDist += calculateDistance(pathCoords[i], pathCoords[i + 1]);
    }
    return parseFloat(totalDist.toFixed(2));
};


/**
 * Calculate earning for a delivery partner based on distance.
 * Default: ₹25 flat for 0-3km, then ₹10/km beyond that.
 * All rates are overridable via the config object (loaded from Settings DB).
 *
 * @param {Number} distanceKm
 * @param {Object} config - Optional dynamic config
 * @param {Number} [config.baseFee=25]   - Flat fee for distances within freeKms
 * @param {Number} [config.perKmFee=10]  - Per-km rate beyond freeKms
 * @param {Number} [config.freeKms=3]    - Distance (km) covered by the flat baseFee
 * @returns {Number} Earning in INR (rounded)
 */
export const getDeliveryEarning = (distanceKm, config = {}) => {
    const BASE_FEE   = config.baseFee  ?? 25;   // flat fee for short trips
    const FREE_KMS   = config.freeKms  ?? 3;    // km covered by base fee
    const PER_KM_FEE = config.perKmFee ?? 10;   // extra per km beyond freeKms
    if (distanceKm <= FREE_KMS) {
        return BASE_FEE;
    }
    return Math.round(BASE_FEE + (distanceKm - FREE_KMS) * PER_KM_FEE);
};

/**
 * Calculate extra earning for multi-vendor FORWARD delivery routing distance.
 * ₹6 per km by default for the distance between vendor stops.
 * Returns 0 if no extra distance.
 *
 * @param {Number} routingDistanceKm - Extra distance covered between vendors
 * @param {Object} config            - Optional dynamic config
 * @param {Number} [config.perVendorStopFee=6] - Per-km fee for vendor routing in INR
 * @returns {Number} Earning in INR (rounded)
 */
export const getVendorPickupFee = (routingDistanceKm, config = {}) => {
    if (!routingDistanceKm || routingDistanceKm <= 0) return 0;
    const RATE_PER_KM = config.perVendorStopFee ?? 6;
    return Math.round(routingDistanceKm * RATE_PER_KM);
};

/**
 * Calculate extra earning for multi-vendor RETURN delivery routing distance.
 * ₹6 per km by default for the distance between vendor dropoffs.
 * Returns 0 if no extra distance.
 *
 * @param {Number} routingDistanceKm - Extra distance covered between vendor dropoffs
 * @param {Object} config            - Optional dynamic config
 * @param {Number} [config.perVendorDropoffFee=6] - Per-km fee for vendor routing in INR
 * @returns {Number} Earning in INR (rounded)
 */
export const getVendorDropoffFee = (routingDistanceKm, config = {}) => {
    if (!routingDistanceKm || routingDistanceKm <= 0) return 0;
    const RATE_PER_KM = config.perVendorDropoffFee ?? 6;
    return Math.round(routingDistanceKm * RATE_PER_KM);
};
