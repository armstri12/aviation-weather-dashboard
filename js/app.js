/**
 * Aviation Weather Dashboard - Main Application
 * KUGN Weather Display for Raspberry Pi
 */

const App = {
    // Application state
    state: {
        metar: null,
        taf: null,
        tafStations: [],
        selectedTafStation: null,
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

        // Set up TAF station selector
        await this.setupTafStationSelector();

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
            // Fetch METAR for home airport
            const metar = await WeatherAPI.fetchMetar(this.airport.icao);
            this.updateMetar(metar);

            // Fetch TAF for selected station (if set) or home airport
            if (this.state.selectedTafStation) {
                // TAF already loaded by station selector
                Utils.log(`Using TAF for selected station: ${this.state.selectedTafStation}`, 'info');
            } else {
                const taf = await WeatherAPI.fetchTaf(this.airport.icao);
                this.updateTaf(taf);
            }

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
            const cachedStatus = this.state.aircraftStatus?.[tailNumber];
            const effectiveStatus = statusData || cachedStatus;

            if (effectiveStatus) {
                const formatted = this.formatAircraftStatus({
                    ...effectiveStatus,
                    isStale: !statusData && !!cachedStatus
                });
                valueEl.textContent = formatted;
                row.classList.remove('status-onground', 'status-inflight', 'status-unknown');
                row.classList.add(this.getAircraftStatusClass(effectiveStatus));
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

        if (Object.keys(statusMap).length > 0) {
            this.state.aircraftStatus = statusMap;
        }
    },

    /**
     * Format aircraft status details
     */
    formatAircraftStatus(statusData) {
        if (!statusData) {
            return '--';
        }

        const parts = [];

        // Determine if data is stale (older than 15 minutes)
        // Use timePosition (when position was updated) if available, otherwise fall back to lastContact
        const lastSeenTime = statusData.lastSeenTime ?? statusData.timePosition ?? statusData.lastContact ?? statusData.lastSeenTimestamp;
        const now = Date.now();
        const dataAgeMs = lastSeenTime ? now - (lastSeenTime * 1000) : null;
        const isStale = dataAgeMs && dataAgeMs > 15 * 60 * 1000; // 15 minutes

        // Determine ground status with better heuristics
        let onGround = statusData.onGround;

        // If we have altitude and velocity data, use it to refine ground status
        if (typeof statusData.baroAltitude === 'number' && typeof statusData.velocity === 'number') {
            // If altitude is very low (< 100 feet) and velocity is very low (< 5 m/s ≈ 10 knots), likely on ground
            if (statusData.baroAltitude < 100 && statusData.velocity < 5) {
                onGround = true;
            }
        }

        // Format status label
        let statusLabel;
        if (statusData.status === 'No Signal') {
            statusLabel = 'No Signal';
        } else if (typeof onGround === 'boolean') {
            if (isStale) {
                statusLabel = onGround ? 'Last Known: On Ground' : 'Last Known: In Flight';
            } else {
                statusLabel = onGround ? 'On Ground' : 'In Flight';
            }
        } else {
            statusLabel = statusData.status;
        }

        if (statusLabel) {
            parts.push(statusLabel);
        }

        // Add last seen time
        const seenLabel = isStale ? 'Last seen' : 'Seen';
        if (typeof lastSeenTime === 'number' && lastSeenTime > 0) {
            parts.push(`${seenLabel} ${Utils.formatZuluMinutes(new Date(lastSeenTime * 1000))}`);
        } else if (statusData.lastSeen) {
            parts.push(`${seenLabel} ${statusData.lastSeen}`);
        }

        // Add altitude if available
        const altitude = statusData.baroAltitude ?? statusData.geoAltitude;
        if (typeof altitude === 'number') {
            parts.push(`${Math.round(altitude)} ft`);
        }

        // Add heading/track if available and aircraft is moving
        if (typeof statusData.trueTrack === 'number' && !onGround) {
            parts.push(`HDG ${Math.round(statusData.trueTrack)}°`);
        }

        // Add speed if available and aircraft is moving
        if (typeof statusData.velocity === 'number' && !onGround) {
            const speedKnots = Math.round(statusData.velocity * 1.94384); // m/s to knots
            parts.push(`${speedKnots} kts`);
        }

        // Add location coordinates
        const lat = statusData.latitude ?? statusData.lat;
        const lon = statusData.longitude ?? statusData.lon;
        if (typeof lat === 'number' && typeof lon === 'number') {
            let locationStr = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

            // Add position source indicator for data quality
            if (typeof statusData.positionSource === 'number') {
                const sources = ['ADS-B', 'ASTERIX', 'MLAT', 'FLARM'];
                const source = sources[statusData.positionSource] || 'Unknown';
                locationStr += ` (${source})`;
            }

            parts.push(locationStr);
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

        // Use same logic as formatAircraftStatus for consistency
        let onGround = statusData.onGround;

        // Refine ground status using altitude and velocity
        if (typeof statusData.baroAltitude === 'number' && typeof statusData.velocity === 'number') {
            if (statusData.baroAltitude < 100 && statusData.velocity < 5) {
                onGround = true;
            }
        }

        if (typeof onGround === 'boolean') {
            return onGround ? 'status-onground' : 'status-inflight';
        }

        if (statusData.status) {
            const normalized = statusData.status.toLowerCase();
            if (normalized.includes('ground')) {
                return 'status-onground';
            }
            if (normalized.includes('flight') || normalized.includes('air')) {
                return 'status-inflight';
            }
            if (normalized.includes('no signal')) {
                return 'status-unknown';
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
     * Set up TAF station selector
     */
    async setupTafStationSelector() {
        const selector = document.getElementById('tafStationSelector');
        if (!selector) return;

        // Load saved selection from localStorage
        const savedStation = localStorage.getItem('selectedTafStation');

        try {
            // Try to fetch TAF for home airport first
            const homeTaf = await WeatherAPI.fetchTafForStation(this.airport.icao).catch(() => null);

            // Get nearby TAF stations
            const nearbyStations = await WeatherAPI.findNearestTafs(this.airport.icao, 5);

            // Build list of options
            const options = [];

            // Add home airport if TAF available
            if (homeTaf) {
                options.push({
                    icaoId: this.airport.icao,
                    distance: 0,
                    label: `${this.airport.icao} (Home)`
                });
            }

            // Add nearby stations
            nearbyStations.forEach(station => {
                if (station.icaoId !== this.airport.icao) {
                    options.push({
                        icaoId: station.icaoId,
                        distance: station.distance,
                        label: `${station.icaoId} (${station.distance.toFixed(0)} nm)`
                    });
                }
            });

            this.state.tafStations = options;

            // Populate dropdown
            selector.innerHTML = '';
            options.forEach((option, index) => {
                const optionEl = document.createElement('option');
                optionEl.value = option.icaoId;
                optionEl.textContent = option.label;
                selector.appendChild(optionEl);
            });

            // Set initial selection and load TAF
            let initialStation = null;
            if (savedStation && options.some(opt => opt.icaoId === savedStation)) {
                selector.value = savedStation;
                initialStation = savedStation;
            } else if (options.length > 0) {
                selector.value = options[0].icaoId;
                initialStation = options[0].icaoId;
            }

            if (initialStation) {
                this.state.selectedTafStation = initialStation;
                // Load initial TAF
                await this.handleTafStationChange(initialStation);
            }

            // Add change event listener
            selector.addEventListener('change', async (e) => {
                await this.handleTafStationChange(e.target.value);
            });

            Utils.log(`TAF station selector initialized with ${options.length} options`, 'info');
        } catch (error) {
            Utils.log(`Failed to setup TAF station selector: ${error.message}`, 'error');
            selector.innerHTML = '<option value="">No TAF available</option>';
        }
    },

    /**
     * Handle TAF station selection change
     */
    async handleTafStationChange(station) {
        if (!station) return;

        Utils.log(`Loading TAF for ${station}`, 'info');
        this.state.selectedTafStation = station;

        // Save selection to localStorage
        localStorage.setItem('selectedTafStation', station);

        try {
            // Fetch TAF for selected station
            const tafData = await WeatherAPI.fetchTafForStation(station);

            // Add distance info if not home airport
            if (station !== this.airport.icao) {
                const stationInfo = this.state.tafStations.find(s => s.icaoId === station);
                if (stationInfo && stationInfo.distance) {
                    tafData.distance = stationInfo.distance;
                }
            }

            // Update display
            this.updateTaf(tafData);
        } catch (error) {
            Utils.log(`Failed to fetch TAF for ${station}: ${error.message}`, 'error');
            this.handleError('taf', error);
        }
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
