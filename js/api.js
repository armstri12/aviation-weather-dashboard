/**
 * Aviation Weather Dashboard - API Handler
 * Fetches weather data from aviationweather.gov
 */

const WeatherAPI = {
    // Cloudflare Worker proxy for CORS-free API access
    workerUrl: 'https://weather-proxy.ian-284.workers.dev',

    // Cache for storing responses
    cache: {
        metar: null,
        taf: null,
        aircraftStatus: null,
        lastMetarFetch: null,
        lastTafFetch: null,
        lastAircraftStatusFetch: null
    },

    // Configuration
    config: {
        station: 'KUGN',
        metarRefreshInterval: 10 * 60 * 1000, // 10 minutes
        tafRefreshInterval: 30 * 60 * 1000,   // 30 minutes
        imageRefreshInterval: 5 * 60 * 1000,  // 5 minutes
        aircraftStatusRefreshInterval: 2 * 60 * 1000, // 2 minutes
        aircraftStatusEndpoint: 'https://aircraft-status.YOUR-USERNAME.workers.dev/aircraft-status',
        maxRetries: 3,
        retryDelay: 2000
    },

    /**
     * Fetch with retry logic
     */
    async fetchWithRetry(url, retries = this.config.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            } catch (error) {
                Utils.log(`Fetch attempt ${i + 1} failed: ${error.message}`, 'warn');
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (i + 1)));
                } else {
                    throw error;
                }
            }
        }
    },

    /**
     * Fetch current METAR
     */
    async fetchMetar(station = this.config.station) {
        const url = `${this.workerUrl}/metar?ids=${station}&format=json`;

        try {
            const response = await this.fetchWithRetry(url);

            // Get response text first to check if it's empty
            const text = await response.text();
            Utils.log(`METAR response text (first 200 chars): ${text.substring(0, 200)}`, 'info');

            let data = null;
            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    Utils.log(`Failed to parse METAR JSON: ${parseError.message}`, 'warn');
                    throw new Error(`JSON parse error: ${parseError.message}`);
                }
            }

            if (data && data.length > 0) {
                this.cache.metar = data[0];
                this.cache.lastMetarFetch = new Date();
                Utils.log(`METAR fetched for ${station}`, 'info');
                return data[0];
            }

            throw new Error('No METAR data returned');
        } catch (error) {
            Utils.log(`Failed to fetch METAR: ${error.message}`, 'error');
            console.error('METAR fetch error details:', error);

            // Return cached data if available
            if (this.cache.metar) {
                Utils.log('Using cached METAR data', 'warn');
                return this.cache.metar;
            }

            throw error;
        }
    },

    /**
     * Calculate distance between two points using Haversine formula
     * Returns distance in nautical miles
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3440.065; // Earth's radius in nautical miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Search for nearest TAF if direct TAF not available
     */
    async findNearestTaf(station = this.config.station) {
        try {
            // First, get the coordinates from the METAR
            const metar = await this.fetchMetar(station);
            if (!metar || !metar.lat || !metar.lon) {
                Utils.log('Cannot search for nearest TAF: no coordinates available', 'warn');
                return null;
            }

            const lat = parseFloat(metar.lat);
            const lon = parseFloat(metar.lon);

            // Try expanding search radii: 50nm, 100nm, 150nm
            const searchRadii = [0.75, 1.5, 2.25]; // degrees (approximately 50, 100, 150 nm)

            for (const radius of searchRadii) {
                Utils.log(`Searching for TAF within ${radius * 66.67} nm...`, 'info');

                const minLat = lat - radius;
                const maxLat = lat + radius;
                const minLon = lon - radius;
                const maxLon = lon + radius;

                const url = `${this.workerUrl}/taf?bbox=${minLat},${minLon},${maxLat},${maxLon}&format=json`;

                try {
                    const response = await this.fetchWithRetry(url);

                    // Get text first to handle empty responses
                    const text = await response.text();
                    let data = null;

                    if (text && text.trim().length > 0) {
                        try {
                            data = JSON.parse(text);
                        } catch (parseError) {
                            Utils.log(`Failed to parse bbox TAF JSON: ${parseError.message}`, 'warn');
                        }
                    }

                    if (data && data.length > 0) {
                        // Filter out the original airport and calculate distances
                        const candidates = data
                            .filter(taf => taf.icaoId !== station && taf.lat && taf.lon)
                            .map(taf => ({
                                ...taf,
                                distance: this.calculateDistance(lat, lon, parseFloat(taf.lat), parseFloat(taf.lon))
                            }))
                            .sort((a, b) => a.distance - b.distance);

                        if (candidates.length > 0) {
                            const nearest = candidates[0];
                            Utils.log(`Found TAF at ${nearest.icaoId} (${nearest.distance.toFixed(1)} nm away)`, 'info');
                            return nearest;
                        }
                    }
                } catch (error) {
                    Utils.log(`Search failed at radius ${radius}: ${error.message}`, 'warn');
                }
            }

            Utils.log('No nearby TAF found within 150 nm', 'warn');
            return null;
        } catch (error) {
            Utils.log(`Failed to find nearest TAF: ${error.message}`, 'error');
            return null;
        }
    },

    /**
     * Fetch TAF with fallback to nearest airport
     */
    async fetchTaf(station = this.config.station) {
        // Try direct TAF first
        const url = `${this.workerUrl}/taf?ids=${station}&format=json`;

        try {
            Utils.log(`Attempting to fetch TAF for ${station}...`, 'info');
            const response = await this.fetchWithRetry(url);

            // Get response text first to check if it's empty
            const text = await response.text();
            Utils.log(`TAF response text (first 200 chars): ${text.substring(0, 200)}`, 'info');

            let data = null;
            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    Utils.log(`Failed to parse TAF JSON: ${parseError.message}`, 'warn');
                }
            }

            if (data && data.length > 0) {
                this.cache.taf = data[0];
                this.cache.lastTafFetch = new Date();
                Utils.log(`TAF fetched for ${station}`, 'info');
                return data[0];
            }

            // No direct TAF available, search for nearest
            Utils.log(`No TAF available for ${station}, searching nearby airports...`, 'warn');
            const nearestTaf = await this.findNearestTaf(station);

            if (nearestTaf) {
                this.cache.taf = nearestTaf;
                this.cache.lastTafFetch = new Date();
                Utils.log(`Using nearby TAF from ${nearestTaf.icaoId}`, 'info');
                return nearestTaf;
            }

            throw new Error('No TAF data available');
        } catch (error) {
            // If error is JSON parse related, try fallback
            if (error.message && error.message.includes('JSON')) {
                Utils.log(`JSON parse error, trying fallback search...`, 'warn');
                try {
                    const nearestTaf = await this.findNearestTaf(station);
                    if (nearestTaf) {
                        this.cache.taf = nearestTaf;
                        this.cache.lastTafFetch = new Date();
                        Utils.log(`Using nearby TAF from ${nearestTaf.icaoId}`, 'info');
                        return nearestTaf;
                    }
                } catch (fallbackError) {
                    Utils.log(`Fallback also failed: ${fallbackError.message}`, 'error');
                }
            }

            Utils.log(`Failed to fetch TAF: ${error.message}`, 'error');
            console.error('TAF fetch error details:', error);

            // Return cached data if available
            if (this.cache.taf) {
                Utils.log('Using cached TAF data', 'warn');
                return this.cache.taf;
            }

            throw error;
        }
    },

    /**
     * Fetch aircraft status for tail numbers
     */
    async fetchAircraftStatus(tailNumbers = []) {
        if (!Array.isArray(tailNumbers) || tailNumbers.length === 0) {
            return {};
        }

        const tailsParam = tailNumbers.map(tail => encodeURIComponent(tail)).join(',');
        const url = `${this.config.aircraftStatusEndpoint}?tails=${tailsParam}`;

        try {
            const response = await this.fetchWithRetry(url);

            const text = await response.text();
            Utils.log(`Aircraft status response text (first 200 chars): ${text.substring(0, 200)}`, 'info');

            let data = null;
            if (text && text.trim().length > 0) {
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    Utils.log(`Failed to parse aircraft status JSON: ${parseError.message}`, 'warn');
                    throw new Error(`JSON parse error: ${parseError.message}`);
                }
            }

            const statusMap = {};
            if (Array.isArray(data)) {
                data.forEach(entry => {
                    if (entry && entry.tailNumber) {
                        statusMap[entry.tailNumber.toUpperCase()] = entry;
                    }
                });
            } else if (data && typeof data === 'object') {
                Object.entries(data).forEach(([tailNumber, entry]) => {
                    if (entry) {
                        statusMap[tailNumber.toUpperCase()] = entry;
                    }
                });
            }

            if (Object.keys(statusMap).length > 0) {
                this.cache.aircraftStatus = statusMap;
                this.cache.lastAircraftStatusFetch = new Date();
                Utils.log('Aircraft status fetched', 'info');
                return statusMap;
            }

            throw new Error('No aircraft status data returned');
        } catch (error) {
            Utils.log(`Failed to fetch aircraft status: ${error.message}`, 'error');
            console.error('Aircraft status fetch error details:', error);

            if (this.cache.aircraftStatus) {
                Utils.log('Using cached aircraft status data', 'warn');
                return this.cache.aircraftStatus;
            }

            throw error;
        }
    },

    /**
     * Fetch both METAR and TAF
     */
    async fetchAll(station = this.config.station) {
        const [metar, taf] = await Promise.all([
            this.fetchMetar(station),
            this.fetchTaf(station)
        ]);

        return { metar, taf };
    },

    /**
     * Check if data is stale
     */
    isDataStale(lastFetch, maxAge) {
        if (!lastFetch) return true;
        return (new Date() - lastFetch) > maxAge;
    },

    /**
     * Get METAR with cache check
     */
    async getMetar(forceRefresh = false) {
        if (!forceRefresh && !this.isDataStale(this.cache.lastMetarFetch, this.config.metarRefreshInterval)) {
            return this.cache.metar;
        }
        return this.fetchMetar();
    },

    /**
     * Get TAF with cache check
     */
    async getTaf(forceRefresh = false) {
        if (!forceRefresh && !this.isDataStale(this.cache.lastTafFetch, this.config.tafRefreshInterval)) {
            return this.cache.taf;
        }
        return this.fetchTaf();
    },

    /**
     * Get aircraft status with cache check
     */
    async getAircraftStatus(tailNumbers = [], forceRefresh = false) {
        if (!forceRefresh && !this.isDataStale(this.cache.lastAircraftStatusFetch, this.config.aircraftStatusRefreshInterval)) {
            return this.cache.aircraftStatus || {};
        }
        return this.fetchAircraftStatus(tailNumbers);
    },

    /**
     * Get radar image URL
     */
    getRadarUrl() {
        // Chicago area radar (KLOT)
        const timestamp = Date.now();
        return `https://radar.weather.gov/ridge/standard/KLOT_loop.gif?t=${timestamp}`;
    },

    /**
     * Get satellite image URL
     */
    getSatelliteUrl() {
        const timestamp = Date.now();
        return `https://cdn.star.nesdis.noaa.gov/GOES16/ABI/SECTOR/umv/GEOCOLOR/600x600.jpg?t=${timestamp}`;
    },

    /**
     * Get surface analysis URL
     */
    getSurfaceUrl() {
        const timestamp = Date.now();
        return `https://www.wpc.ncep.noaa.gov/sfc/namussfcwbg.gif?t=${timestamp}`;
    },

    /**
     * Refresh weather images
     */
    refreshImages() {
        const radarImg = document.getElementById('radarImg');
        const satelliteImg = document.getElementById('satelliteImg');
        const surfaceImg = document.getElementById('surfaceImg');

        if (radarImg) {
            radarImg.classList.add('refreshing');
            radarImg.src = this.getRadarUrl();
            radarImg.onload = () => radarImg.classList.remove('refreshing');
        }

        if (satelliteImg) {
            satelliteImg.classList.add('refreshing');
            satelliteImg.src = this.getSatelliteUrl();
            satelliteImg.onload = () => satelliteImg.classList.remove('refreshing');
        }

        if (surfaceImg) {
            surfaceImg.classList.add('refreshing');
            surfaceImg.src = this.getSurfaceUrl();
            surfaceImg.onload = () => surfaceImg.classList.remove('refreshing');
        }
    },

    /**
     * Start automatic refresh
     */
    startAutoRefresh(callbacks = {}) {
        // METAR refresh
        setInterval(async () => {
            try {
                const metar = await this.fetchMetar();
                if (callbacks.onMetar) callbacks.onMetar(metar);
            } catch (error) {
                if (callbacks.onError) callbacks.onError('metar', error);
            }
        }, this.config.metarRefreshInterval);

        // TAF refresh
        setInterval(async () => {
            try {
                const taf = await this.fetchTaf();
                if (callbacks.onTaf) callbacks.onTaf(taf);
            } catch (error) {
                if (callbacks.onError) callbacks.onError('taf', error);
            }
        }, this.config.tafRefreshInterval);

        // Image refresh
        setInterval(() => {
            this.refreshImages();
        }, this.config.imageRefreshInterval);

        // Aircraft status refresh
        setInterval(async () => {
            const tailNumbers = typeof callbacks.getAircraftTailNumbers === 'function'
                ? callbacks.getAircraftTailNumbers()
                : callbacks.aircraftTailNumbers;

            if (!Array.isArray(tailNumbers) || tailNumbers.length === 0) {
                return;
            }

            try {
                const status = await this.fetchAircraftStatus(tailNumbers);
                if (callbacks.onAircraftStatus) callbacks.onAircraftStatus(status);
            } catch (error) {
                if (callbacks.onError) callbacks.onError('aircraft', error);
            }
        }, this.config.aircraftStatusRefreshInterval);
    },

    /**
     * Parse raw METAR from API response
     */
    parseMetarResponse(data) {
        if (data && data.rawOb) {
            return MetarParser.parseFromJson(data);
        }
        return null;
    },

    /**
     * Parse raw TAF from API response
     */
    parseTafResponse(data) {
        if (data && data.rawTAF) {
            return TafParser.parseFromJson(data);
        }
        return null;
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WeatherAPI;
}
