/**
 * Aviation Weather Dashboard - Main Application
 * KUGN Weather Display for Raspberry Pi
 */

const App = {
    // Application state
    state: {
        metar: null,
        taf: null,
        aircraftStatus: {},
        lastUpdate: null,
        isLoading: true,
        hasError: false,
        currentMap: 'radar'
    },

    // KUGN Airport Info
    airport: {
        icao: 'KUGN',
        name: 'Waukegan National Airport',
        elevation: 727, // feet MSL
        coordinates: { lat: 42.4222, lon: -87.8679 }
    },

    /**
     * Initialize the application
     */
    async init() {
        Utils.log('Initializing Aviation Weather Dashboard', 'info');

        // Start clock
        this.startClock();

        // Initialize components
        await AirportDiagram.init();
        TafTimeline.init();

        // Set up map tab switching
        this.setupMapTabs();

        // Fetch initial data
        await this.loadWeatherData();
        await this.loadAircraftStatus();

        // Start auto-refresh
        WeatherAPI.startAutoRefresh({
            onMetar: (data) => this.updateMetar(data),
            onTaf: (data) => this.updateTaf(data),
            onAircraftStatus: (data) => this.updateAircraftStatus(data),
            getAircraftTailNumbers: () => this.getTailNumbers(),
            onError: (type, error) => this.handleError(type, error)
        });

        Utils.log('Dashboard initialized successfully', 'info');
    },

    /**
     * Start the clock display
     */
    startClock() {
        const updateClock = () => {
            const now = new Date();

            const zuluEl = document.getElementById('clockZulu');
            const localEl = document.getElementById('clockLocal');

            if (zuluEl) {
                zuluEl.textContent = Utils.formatZulu(now);
            }

            if (localEl) {
                localEl.textContent = Utils.formatLocal(now);
            }
        };

        updateClock();
        setInterval(updateClock, 1000);
    },

    /**
     * Load weather data
     */
    async loadWeatherData() {
        this.setLoading(true);

        try {
            const { metar, taf } = await WeatherAPI.fetchAll();

            this.updateMetar(metar);
            this.updateTaf(taf);

            this.state.lastUpdate = new Date();
            this.state.hasError = false;

        } catch (error) {
            Utils.log(`Failed to load weather data: ${error.message}`, 'error');
            this.handleError('all', error);
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Load aircraft status data
     */
    async loadAircraftStatus() {
        const tailNumbers = this.getTailNumbers();
        if (tailNumbers.length === 0) {
            return;
        }

        try {
            const statusMap = await WeatherAPI.getAircraftStatus(tailNumbers);
            this.updateAircraftStatus(statusMap);
        } catch (error) {
            Utils.log(`Failed to load aircraft status: ${error.message}`, 'error');
            this.handleError('aircraft', error);
        }
    },

    /**
     * Get configured tail numbers from the UI
     */
    getTailNumbers() {
        const rows = document.querySelectorAll('.aircraft-row');
        const tailNumbers = Array.from(rows)
            .map(row => row.dataset.tailNumber?.toUpperCase())
            .filter(Boolean);

        return [...new Set(tailNumbers)];
    },

    /**
     * Update METAR display
     */
    updateMetar(data) {
        if (!data) return;

        // Parse METAR
        const metar = MetarParser.parseFromJson(data);
        if (!metar) return;

        this.state.metar = metar;

        // Update flight category
        this.updateFlightCategory(metar.flightCategory);

        // Update current conditions
        this.updateConditions(metar);

        // Update airport diagram and crosswind
        const windDir = metar.wind.direction;
        const windSpeed = metar.wind.speed || 0;
        const gustSpeed = metar.wind.gust;

        AirportDiagram.updateWind(windDir, windSpeed, gustSpeed);
        AirportDiagram.updateCrosswind(windDir, windSpeed, gustSpeed);

        // Update raw METAR display
        const rawMetarEl = document.getElementById('rawMetar');
        if (rawMetarEl) {
            rawMetarEl.textContent = metar.raw;
        }

        // Update METAR age
        this.updateMetarAge(metar.observationTime);

        // Update last update time
        const updateTimeEl = document.getElementById('updateTime');
        if (updateTimeEl && metar.time) {
            updateTimeEl.textContent = `${metar.time.substring(2, 4)}:${metar.time.substring(4, 6)}Z`;
        }

        Utils.log('METAR display updated', 'info');
    },

    /**
     * Update flight category display
     */
    updateFlightCategory(category) {
        const categoryEl = document.getElementById('flightCategory');
        const labelEl = categoryEl?.querySelector('.category-label');

        if (!categoryEl || !labelEl) return;

        // Update text
        labelEl.textContent = category;

        // Update styling
        categoryEl.className = 'flight-category';
        categoryEl.classList.add(`category-${category.toLowerCase()}`);

        // Add glow effect
        labelEl.className = 'category-label';
        labelEl.classList.add(`glow-${category.toLowerCase()}`);
    },

    /**
     * Update conditions panel
     */
    updateConditions(metar) {
        // Ceiling
        const ceilingEl = document.getElementById('ceiling');
        if (ceilingEl) {
            if (metar.ceiling >= 99999) {
                ceilingEl.textContent = 'CLR';
            } else {
                ceilingEl.textContent = metar.ceiling.toLocaleString();
            }
        }

        // Visibility
        const visEl = document.getElementById('visibility');
        if (visEl) {
            const vis = metar.visibility || 10;
            visEl.textContent = vis >= 10 ? '10+' : vis;
        }

        // Wind
        const windEl = document.getElementById('wind');
        if (windEl) {
            windEl.textContent = MetarParser.formatWind(metar.wind);
        }

        // Gusts
        const gustsEl = document.getElementById('gusts');
        const gustsContainer = document.getElementById('gustsContainer');
        if (gustsEl && gustsContainer) {
            if (metar.wind.gust) {
                gustsEl.textContent = metar.wind.gust;
                gustsContainer.style.display = 'flex';
            } else {
                gustsContainer.style.display = 'none';
            }
        }

        // Altimeter
        const altEl = document.getElementById('altimeter');
        if (altEl && metar.altimeter) {
            altEl.textContent = metar.altimeter.toFixed(2);
        }

        // Temperature
        const tempEl = document.getElementById('temperature');
        if (tempEl && metar.temperature !== null) {
            tempEl.textContent = metar.temperature;
        }

        // Dewpoint
        const dewEl = document.getElementById('dewpoint');
        if (dewEl && metar.dewpoint !== null) {
            dewEl.textContent = metar.dewpoint;
        }

        // Density Altitude
        const densityEl = document.getElementById('densityAlt');
        if (densityEl && metar.altimeter && metar.temperature !== null) {
            const densityAlt = Utils.calculateDensityAltitude(
                this.airport.elevation,
                metar.altimeter,
                metar.temperature
            );
            densityEl.textContent = densityAlt.toLocaleString();
        }

        // Weather
        const weatherEl = document.getElementById('weather');
        if (weatherEl) {
            weatherEl.textContent = MetarParser.getWeatherDescription(metar);
        }

        // VFR Check
        this.updateVfrCheck(metar);
    },

    /**
     * Update VFR minimums check
     */
    updateVfrCheck(metar) {
        const vfrCheckEl = document.getElementById('vfrCheck');
        if (!vfrCheckEl) return;

        const ceiling = metar.ceiling;
        const visibility = metar.visibility || 10;

        // Class D minimums: 1000 ft ceiling, 3 SM visibility
        const meetsCeiling = ceiling >= 1000;
        const meetsVisibility = visibility >= 3;
        const meetsVfr = meetsCeiling && meetsVisibility;

        const iconEl = vfrCheckEl.querySelector('.vfr-icon');
        const textEl = vfrCheckEl.querySelector('.vfr-text');

        if (meetsVfr) {
            vfrCheckEl.classList.remove('not-met');
            if (iconEl) iconEl.textContent = '✓';
            if (textEl) textEl.textContent = 'VFR Minimums Met';
        } else {
            vfrCheckEl.classList.add('not-met');
            if (iconEl) iconEl.textContent = '✗';

            const issues = [];
            if (!meetsCeiling) issues.push(`Ceiling ${ceiling} ft`);
            if (!meetsVisibility) issues.push(`Visibility ${visibility} SM`);
            if (textEl) textEl.textContent = `VFR Minimums NOT Met: ${issues.join(', ')}`;
        }
    },

    /**
     * Update METAR age display
     */
    updateMetarAge(observationTime) {
        const ageEl = document.getElementById('metarAge');
        if (!ageEl || !observationTime) return;

        const updateAge = () => {
            const minutes = Utils.minutesSince(observationTime);
            ageEl.textContent = `${minutes} min ago`;

            // Warn if data is old
            if (minutes > 60) {
                ageEl.classList.add('stale-warning');
            } else {
                ageEl.classList.remove('stale-warning');
            }
        };

        updateAge();
        // Update every minute
        setInterval(updateAge, 60000);
    },

    /**
     * Update TAF display
     */
    updateTaf(data) {
        if (!data) {
            Utils.log('No TAF data provided to updateTaf', 'warn');
            return;
        }

        Utils.log(`Updating TAF display with data from ${data.icaoId || 'unknown'}`, 'info');

        // Parse TAF
        const taf = data.rawTAF ? TafParser.parse(data.rawTAF) : null;
        if (!taf) {
            Utils.log('Failed to parse TAF data', 'error');
            console.error('TAF parsing failed for data:', data);
            return;
        }

        this.state.taf = taf;

        // Update TAF validity with airport info
        const validityEl = document.getElementById('tafValidity');
        if (validityEl && taf.validFrom && taf.validTo) {
            let validityText = `Valid: ${taf.validFrom}Z to ${taf.validTo}Z`;

            // Show nearby airport info if using fallback TAF
            if (data.icaoId && data.icaoId !== this.airport.icao && data.distance) {
                validityText = `${data.icaoId} TAF (${data.distance.toFixed(1)} nm) - ${validityText}`;
                validityEl.style.color = '#FFD700'; // Gold color to indicate nearby TAF
            } else {
                validityEl.style.color = ''; // Reset to default
            }

            validityEl.textContent = validityText;
        }

        // Update timeline
        TafTimeline.update(taf);

        // Update raw TAF
        const rawTafEl = document.getElementById('rawTaf');
        if (rawTafEl) {
            rawTafEl.textContent = taf.raw;
        }

        Utils.log('TAF display updated', 'info');
    },

    /**
     * Update aircraft status display
     */
    updateAircraftStatus(data, options = {}) {
        const rows = document.querySelectorAll('.aircraft-row');
        const emptyStateEl = document.getElementById('aircraftEmptyState');

        if (!rows || rows.length === 0) return;

        const statusMap = data && typeof data === 'object' ? data : {};
        let hasData = false;

        rows.forEach(row => {
            const tailNumber = row.dataset.tailNumber?.toUpperCase();
            const valueEl = row.querySelector('.value');
            if (!valueEl || !tailNumber) return;

            const statusData = statusMap[tailNumber];
            if (statusData) {
                valueEl.textContent = this.formatAircraftStatus(statusData);
                row.classList.remove('status-onground', 'status-inflight', 'status-unknown');
                row.classList.add(this.getAircraftStatusClass(statusData));
                hasData = true;
            } else if (options.unavailable) {
                valueEl.textContent = 'Unavailable';
                row.classList.remove('status-onground', 'status-inflight');
                row.classList.add('status-unknown');
            } else {
                valueEl.textContent = '--';
                row.classList.remove('status-onground', 'status-inflight');
                row.classList.add('status-unknown');
            }
        });

        if (emptyStateEl) {
            if (hasData) {
                emptyStateEl.classList.add('hidden');
            } else {
                emptyStateEl.classList.remove('hidden');
                emptyStateEl.textContent = options.unavailable ? 'Unavailable' : 'No data yet.';
            }
        }

        this.state.aircraftStatus = statusMap;
    },

    /**
     * Format aircraft status details
     */
    formatAircraftStatus(statusData) {
        if (!statusData) {
            return '--';
        }

        const parts = [];
        const onGround = typeof statusData.onGround === 'boolean'
            ? statusData.onGround
            : statusData.status?.toLowerCase().includes('ground');

        if (onGround === true) {
            parts.push('On Ground');
        } else if (onGround === false) {
            parts.push('In Flight');
        } else if (statusData.status) {
            parts.push(statusData.status);
        }

        const lastSeenTime = statusData.lastSeenTime ?? statusData.lastSeenTimestamp;
        if (typeof lastSeenTime === 'number' && lastSeenTime > 0) {
            parts.push(`Seen ${Utils.formatZuluMinutes(new Date(lastSeenTime * 1000))}`);
        } else if (statusData.lastSeen) {
            parts.push(`Seen ${statusData.lastSeen}`);
        } else if (statusData.airportName) {
            parts.push(statusData.airportName);
        }

        const lat = statusData.latitude ?? statusData.lat;
        const lon = statusData.longitude ?? statusData.lon;
        if (typeof lat === 'number' && typeof lon === 'number') {
            parts.push(`${lat.toFixed(2)}, ${lon.toFixed(2)}`);
        }

        return parts.length > 0 ? parts.join(' • ') : 'Unavailable';
    },

    /**
     * Get CSS class for aircraft status
     */
    getAircraftStatusClass(statusData) {
        if (!statusData) {
            return 'status-unknown';
        }

        if (typeof statusData.onGround === 'boolean') {
            return statusData.onGround ? 'status-onground' : 'status-inflight';
        }

        if (statusData.status) {
            const normalized = statusData.status.toLowerCase();
            if (normalized.includes('ground')) {
                return 'status-onground';
            }
            if (normalized.includes('flight') || normalized.includes('air')) {
                return 'status-inflight';
            }
        }

        return 'status-unknown';
    },

    /**
     * Set up map tab switching
     */
    setupMapTabs() {
        const tabs = document.querySelectorAll('.map-tab');
        const maps = {
            'radar': document.getElementById('radarMap'),
            'satellite': document.getElementById('satelliteMap'),
            'surface': document.getElementById('surfaceMap')
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mapType = tab.dataset.map;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show selected map
                Object.entries(maps).forEach(([type, el]) => {
                    if (el) {
                        if (type === mapType) {
                            el.classList.remove('hidden');
                        } else {
                            el.classList.add('hidden');
                        }
                    }
                });

                this.state.currentMap = mapType;
            });
        });
    },

    /**
     * Set loading state
     */
    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        // Could add loading spinners here
    },

    /**
     * Handle errors
     */
    handleError(type, error) {
        Utils.log(`Error (${type}): ${error.message}`, 'error');
        this.state.hasError = true;

        // Show error state in UI
        // For now, just log it. Could show toast notification.
        if (type === 'aircraft') {
            this.updateAircraftStatus(this.state.aircraftStatus, { unavailable: true });
        }
    },

    /**
     * Refresh all data
     */
    async refresh() {
        await this.loadWeatherData();
        await this.loadAircraftStatus();
        WeatherAPI.refreshImages();
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(error => {
        console.error('Failed to initialize dashboard:', error);
    });
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}
