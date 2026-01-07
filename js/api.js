/**
 * Aviation Weather Dashboard - API Handler
 * Fetches weather data from aviationweather.gov
 */

const WeatherAPI = {
    // Base URL for Aviation Weather Center API
    baseUrl: 'https://aviationweather.gov/api/data',

    // CORS proxy (needed for browser requests)
    // In production, you'd want your own proxy or server
    corsProxy: 'https://corsproxy.io/?',

    // Cache for storing responses
    cache: {
        metar: null,
        taf: null,
        lastMetarFetch: null,
        lastTafFetch: null
    },

    // Configuration
    config: {
        station: 'KUGN',
        metarRefreshInterval: 10 * 60 * 1000, // 10 minutes
        tafRefreshInterval: 30 * 60 * 1000,   // 30 minutes
        imageRefreshInterval: 5 * 60 * 1000,  // 5 minutes
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
        const url = `${this.corsProxy}${encodeURIComponent(`${this.baseUrl}/metar?ids=${station}&format=json`)}`;

        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();

            if (data && data.length > 0) {
                this.cache.metar = data[0];
                this.cache.lastMetarFetch = new Date();
                Utils.log(`METAR fetched for ${station}`, 'info');
                return data[0];
            }

            throw new Error('No METAR data returned');
        } catch (error) {
            Utils.log(`Failed to fetch METAR: ${error.message}`, 'error');

            // Return cached data if available
            if (this.cache.metar) {
                Utils.log('Using cached METAR data', 'warn');
                return this.cache.metar;
            }

            throw error;
        }
    },

    /**
     * Fetch TAF
     */
    async fetchTaf(station = this.config.station) {
        const url = `${this.corsProxy}${encodeURIComponent(`${this.baseUrl}/taf?ids=${station}&format=json`)}`;

        try {
            const response = await this.fetchWithRetry(url);
            const data = await response.json();

            if (data && data.length > 0) {
                this.cache.taf = data[0];
                this.cache.lastTafFetch = new Date();
                Utils.log(`TAF fetched for ${station}`, 'info');
                return data[0];
            }

            throw new Error('No TAF data returned');
        } catch (error) {
            Utils.log(`Failed to fetch TAF: ${error.message}`, 'error');

            // Return cached data if available
            if (this.cache.taf) {
                Utils.log('Using cached TAF data', 'warn');
                return this.cache.taf;
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
        return `https://aviationweather.gov/data/products/progs/F006_wpc_sfc.gif?t=${timestamp}`;
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
