/**
 * Aviation Weather Dashboard - Config Manager
 * Persists user settings to localStorage with fallback to hardcoded defaults
 */

const ConfigManager = {
    STORAGE_KEY: 'avwx-config',

    defaults: {
        icao: 'KUGN',
        airportName: 'Waukegan National Airport',
        elevation: 727,
        coordinates: { lat: 42.4222, lon: -87.8679 },
        tailNumbers: ['N172WF', 'N519ER', 'N73753', 'N5232K'],
        workerUrl: 'https://weather-proxy.ian-284.workers.dev',
        aircraftStatusEndpoint: 'https://aircraft-status.ian-284.workers.dev/aircraft-status',
        metarRefreshInterval: 10,    // minutes
        tafRefreshInterval: 30,      // minutes
        aircraftRefreshInterval: 2,  // minutes
        imageRefreshInterval: 5      // minutes
    },

    /**
     * Get current config, merged from defaults + localStorage
     */
    get() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return { ...this.defaults, ...parsed };
            }
        } catch (e) {
            console.warn('ConfigManager: failed to read localStorage', e);
        }
        return { ...this.defaults };
    },

    /**
     * Save config to localStorage
     */
    save(data) {
        try {
            const current = this.get();
            const merged = { ...current, ...data };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
            return true;
        } catch (e) {
            console.warn('ConfigManager: failed to save to localStorage', e);
            return false;
        }
    },

    /**
     * Reset config to defaults
     */
    reset() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('ConfigManager: failed to reset localStorage', e);
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigManager;
}
