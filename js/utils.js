/**
 * Aviation Weather Dashboard - Utility Functions
 */

const Utils = {
    /**
     * Convert degrees to radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    },

    /**
     * Convert radians to degrees
     */
    toDegrees(radians) {
        return radians * (180 / Math.PI);
    },

    /**
     * Format time in Zulu
     */
    formatZulu(date) {
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}Z`;
    },

    /**
     * Format time in local
     */
    formatLocal(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes} Local`;
    },

    /**
     * Calculate minutes since a given time
     */
    minutesSince(date) {
        const now = new Date();
        const diffMs = now - date;
        return Math.floor(diffMs / 60000);
    },

    /**
     * Parse METAR observation time (DDHHMM format)
     */
    parseMetarTime(timeStr) {
        const now = new Date();
        const day = parseInt(timeStr.substring(0, 2));
        const hour = parseInt(timeStr.substring(2, 4));
        const minute = parseInt(timeStr.substring(4, 6));

        const obsTime = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            day,
            hour,
            minute
        ));

        // Handle month rollover
        if (obsTime > now) {
            obsTime.setUTCMonth(obsTime.getUTCMonth() - 1);
        }

        return obsTime;
    },

    /**
     * Determine flight category based on ceiling and visibility
     */
    getFlightCategory(ceilingFt, visibilitySm) {
        // LIFR: Ceiling < 500 ft OR Visibility < 1 sm
        if (ceilingFt < 500 || visibilitySm < 1) {
            return 'LIFR';
        }
        // IFR: Ceiling 500-999 ft OR Visibility 1-2.99 sm
        if (ceilingFt < 1000 || visibilitySm < 3) {
            return 'IFR';
        }
        // MVFR: Ceiling 1000-2999 ft OR Visibility 3-4.99 sm
        if (ceilingFt < 3000 || visibilitySm < 5) {
            return 'MVFR';
        }
        // VFR: Ceiling >= 3000 ft AND Visibility >= 5 sm
        return 'VFR';
    },

    /**
     * Get color for flight category
     */
    getCategoryColor(category) {
        const colors = {
            'VFR': '#00C853',
            'MVFR': '#2196F3',
            'IFR': '#F44336',
            'LIFR': '#E040FB'
        };
        return colors[category] || '#FFFFFF';
    },

    /**
     * Calculate density altitude
     */
    calculateDensityAltitude(fieldElevationFt, altimeterInHg, tempC) {
        // Calculate pressure altitude
        const pressureAlt = fieldElevationFt + ((29.92 - altimeterInHg) * 1000);

        // Standard temperature at pressure altitude
        const stdTempC = 15 - (pressureAlt * 0.00198);

        // Density altitude = Pressure Altitude + (120 × (OAT - ISA Temp))
        const densityAlt = pressureAlt + (120 * (tempC - stdTempC));

        return Math.round(densityAlt);
    },

    /**
     * Convert visibility fractions to decimal
     */
    parseVisibility(visStr) {
        if (!visStr) return 10;

        // Remove SM suffix
        visStr = visStr.replace('SM', '').trim();

        // Check for 10+ visibility
        if (visStr === 'P6' || visStr === '10' || visStr.includes('10')) {
            return 10;
        }

        // Check for fractions
        if (visStr.includes('/')) {
            const parts = visStr.split(' ');
            let total = 0;

            for (const part of parts) {
                if (part.includes('/')) {
                    const [num, den] = part.split('/').map(Number);
                    total += num / den;
                } else {
                    total += parseFloat(part) || 0;
                }
            }
            return total;
        }

        return parseFloat(visStr) || 10;
    },

    /**
     * Decode cloud layer abbreviation
     */
    decodeCloudType(type) {
        const types = {
            'SKC': 'Sky Clear',
            'CLR': 'Clear',
            'FEW': 'Few',
            'SCT': 'Scattered',
            'BKN': 'Broken',
            'OVC': 'Overcast',
            'VV': 'Vertical Visibility'
        };
        return types[type] || type;
    },

    /**
     * Decode weather phenomena
     */
    decodeWeather(wx) {
        const phenomena = {
            // Intensity
            '-': 'Light',
            '+': 'Heavy',
            'VC': 'Vicinity',

            // Descriptor
            'MI': 'Shallow',
            'PR': 'Partial',
            'BC': 'Patches',
            'DR': 'Drifting',
            'BL': 'Blowing',
            'SH': 'Showers',
            'TS': 'Thunderstorm',
            'FZ': 'Freezing',

            // Precipitation
            'DZ': 'Drizzle',
            'RA': 'Rain',
            'SN': 'Snow',
            'SG': 'Snow Grains',
            'IC': 'Ice Crystals',
            'PL': 'Ice Pellets',
            'GR': 'Hail',
            'GS': 'Small Hail',
            'UP': 'Unknown Precip',

            // Obscuration
            'BR': 'Mist',
            'FG': 'Fog',
            'FU': 'Smoke',
            'VA': 'Volcanic Ash',
            'DU': 'Dust',
            'SA': 'Sand',
            'HZ': 'Haze',
            'PY': 'Spray',

            // Other
            'PO': 'Dust Devils',
            'SQ': 'Squalls',
            'FC': 'Funnel Cloud',
            'SS': 'Sandstorm',
            'DS': 'Duststorm'
        };

        if (!wx) return 'Clear';

        let decoded = wx;
        for (const [abbr, meaning] of Object.entries(phenomena)) {
            decoded = decoded.replace(new RegExp(abbr, 'g'), meaning + ' ');
        }
        return decoded.trim();
    },

    /**
     * Format altimeter setting
     */
    formatAltimeter(value) {
        if (typeof value === 'number') {
            return value.toFixed(2);
        }
        return value;
    },

    /**
     * Normalize wind direction (handle variable)
     */
    normalizeWindDirection(dir) {
        if (dir === 'VRB' || dir === 'Variable') {
            return null;
        }
        return parseInt(dir) || 0;
    },

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Log with timestamp
     */
    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
        console.log(`${prefix} ${message}`);
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
