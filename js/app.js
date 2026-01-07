/**
 * Aviation Weather Dashboard - Main Application
 * KUGN Weather Display for Raspberry Pi
 */

const App = {
    // Application state
    state: {
        metar: null,
        taf: null,
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
        AirportDiagram.init();
        TafTimeline.init();

        // Set up map tab switching
        this.setupMapTabs();

        // Fetch initial data
        await this.loadWeatherData();

        // Start auto-refresh
        WeatherAPI.startAutoRefresh({
            onMetar: (data) => this.updateMetar(data),
            onTaf: (data) => this.updateTaf(data),
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
    },

    /**
     * Refresh all data
     */
    async refresh() {
        await this.loadWeatherData();
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
