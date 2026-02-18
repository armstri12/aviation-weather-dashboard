/**
 * Aviation Weather Dashboard — Main Application
 * Multi-screen UI optimized for Raspberry Pi 800×480 touchscreen
 */

const App = {

    // ── State ──────────────────────────────────────────────
    state: {
        metar: null,
        taf: null,
        aircraftStatus: {},
        lastUpdate: null,
        currentScreen: 'metar',
        currentRadar: 'radar',
        aircraftMapInit: false
    },

    // Runtime airport info (populated from ConfigManager)
    airport: {
        icao: 'KUGN',
        name: 'Waukegan National Airport',
        elevation: 727,
        coordinates: { lat: 42.4222, lon: -87.8679 }
    },

    // Leaflet map instance + markers for aircraft screen
    aircraftMap: null,
    aircraftMarkers: {},

    // ── Initialization ─────────────────────────────────────
    async init() {
        Utils.log('Initializing dashboard (800×480)', 'info');

        // Load persisted config and apply to API
        const cfg = ConfigManager.get();
        this.applyConfig(cfg);

        // Build dynamic aircraft rows from config
        this.buildAircraftRows(cfg.tailNumbers);

        // Update header with ICAO from config
        this.updateHeaderIcao(cfg.icao);

        // Wire up navigation
        this.setupNav();
        this.setupRadarTabs();
        this.setupConfigForm();

        // Start clock
        this.startClock();

        // Initialize weather visualization modules (SVG diagram + chart)
        try {
            await AirportDiagram.init();
        } catch (e) {
            Utils.log('AirportDiagram.init failed (non-fatal): ' + e.message, 'warn');
        }

        TafTimeline.init();

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

        Utils.log('Dashboard ready', 'info');
    },

    // ── Config ─────────────────────────────────────────────

    applyConfig(cfg) {
        // Apply to airport info
        if (cfg.icao) this.airport.icao = cfg.icao.toUpperCase();
        if (cfg.airportName) this.airport.name = cfg.airportName;
        if (cfg.elevation) this.airport.elevation = cfg.elevation;
        if (cfg.coordinates) this.airport.coordinates = cfg.coordinates;

        // Apply to WeatherAPI
        WeatherAPI.configure(cfg);
    },

    updateHeaderIcao(icao) {
        const el = document.getElementById('headerIcao');
        if (el && icao) el.textContent = icao.toUpperCase();

        // Also update SVG text inside diagram
        const svgEl = document.getElementById('svgIcao');
        if (svgEl && icao) svgEl.textContent = icao.toUpperCase();
    },

    // ── Aircraft Rows ──────────────────────────────────────

    buildAircraftRows(tailNumbers) {
        const list = document.getElementById('aircraft-list');
        if (!list || !tailNumbers || tailNumbers.length === 0) return;

        list.innerHTML = tailNumbers.map(tail => `
            <div class="aircraft-row" id="aircraft-${tail}" data-tail-number="${tail}">
                <span class="ac-tail">${tail}</span>
                <span class="ac-status value">--</span>
            </div>
        `).join('');

        // Wire up tap-to-center-map
        list.querySelectorAll('.aircraft-row').forEach(row => {
            row.addEventListener('click', () => {
                const tail = row.dataset.tailNumber;
                this.centerMapOnAircraft(tail);
            });
        });
    },

    getTailNumbers() {
        const rows = document.querySelectorAll('.aircraft-row');
        return Array.from(rows)
            .map(r => r.dataset.tailNumber?.toUpperCase())
            .filter(Boolean);
    },

    // ── Navigation ─────────────────────────────────────────

    setupNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showScreen(btn.dataset.screen);
            });
        });
    },

    showScreen(name) {
        if (!name) return;

        // Update screens
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById('screen-' + name);
        if (target) target.classList.add('active');

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.screen === name);
        });

        this.state.currentScreen = name;

        // Lazy-init aircraft map on first visit
        if (name === 'aircraft' && !this.state.aircraftMapInit) {
            this.state.aircraftMapInit = true;
            setTimeout(() => this.initAircraftMap(), 50);
        }

        // Populate config form when config screen shown
        if (name === 'config') {
            this.populateConfigForm();
        }
    },

    // ── Radar Tab Switching ────────────────────────────────

    setupRadarTabs() {
        document.querySelectorAll('.radar-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const type = tab.dataset.radar;

                document.querySelectorAll('.radar-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.radar-frame').forEach(f => f.classList.remove('active'));
                const frame = document.getElementById(type + 'Frame');
                if (frame) frame.classList.add('active');

                this.state.currentRadar = type;
            });
        });
    },

    // ── Clock ──────────────────────────────────────────────

    startClock() {
        const tick = () => {
            const now = new Date();
            const zuluEl = document.getElementById('clockZulu');
            if (zuluEl) zuluEl.textContent = Utils.formatZulu(now);
        };
        tick();
        setInterval(tick, 1000);
    },

    // ── Data Loading ───────────────────────────────────────

    async loadWeatherData() {
        try {
            const { metar, taf } = await WeatherAPI.fetchAll();
            this.updateMetar(metar);
            this.updateTaf(taf);
            this.state.lastUpdate = new Date();
        } catch (error) {
            Utils.log('Failed to load weather data: ' + error.message, 'error');
            this.handleError('all', error);
        }
    },

    async loadAircraftStatus() {
        const tails = this.getTailNumbers();
        if (tails.length === 0) return;
        try {
            const statusMap = await WeatherAPI.getAircraftStatus(tails);
            this.updateAircraftStatus(statusMap);
        } catch (error) {
            Utils.log('Failed to load aircraft status: ' + error.message, 'error');
            this.handleError('aircraft', error);
        }
    },

    // ── METAR Updates ──────────────────────────────────────

    updateMetar(data) {
        if (!data) return;

        const metar = MetarParser.parseFromJson(data);
        if (!metar) return;

        this.state.metar = metar;

        this.updateFlightCategory(metar.flightCategory);
        this.updateConditions(metar);

        const windDir = metar.wind.direction;
        const windSpeed = metar.wind.speed || 0;
        const gust = metar.wind.gust;

        // Update SVG wind arrow
        try {
            AirportDiagram.updateWind(windDir, windSpeed, gust);
            AirportDiagram.updateCrosswind(windDir, windSpeed, gust);
        } catch (e) {
            Utils.log('AirportDiagram update failed: ' + e.message, 'warn');
        }

        const rawEl = document.getElementById('rawMetar');
        if (rawEl) rawEl.textContent = metar.raw;

        this.updateMetarAge(metar.observationTime);

        const updateEl = document.getElementById('updateTime');
        if (updateEl && metar.time) {
            updateEl.textContent = `${metar.time.substring(2, 4)}:${metar.time.substring(4, 6)}Z`;
        }

        Utils.log('METAR updated', 'info');
    },

    updateFlightCategory(category) {
        const el = document.getElementById('flightCategory');
        const labelEl = el?.querySelector('.category-label');
        if (!el || !labelEl) return;

        labelEl.textContent = category;
        el.className = 'flight-category';
        el.classList.add('category-' + category.toLowerCase());
        labelEl.className = 'category-label';
        labelEl.classList.add('glow-' + category.toLowerCase());
    },

    updateConditions(metar) {
        // Ceiling
        const ceilEl = document.getElementById('ceiling');
        if (ceilEl) {
            ceilEl.textContent = metar.ceiling >= 99999 ? 'CLR' : metar.ceiling.toLocaleString();
        }

        // Visibility
        const visEl = document.getElementById('visibility');
        if (visEl) {
            const v = metar.visibility || 10;
            visEl.textContent = v >= 10 ? '10+' : String(v);
        }

        // Wind
        const windEl = document.getElementById('wind');
        if (windEl) windEl.textContent = MetarParser.formatWind(metar.wind);

        // Gusts
        const gustEl = document.getElementById('gusts');
        const gustContainer = document.getElementById('gustsContainer');
        if (gustEl && gustContainer) {
            if (metar.wind.gust) {
                gustEl.textContent = metar.wind.gust;
                gustContainer.style.opacity = '1';
            } else {
                gustEl.textContent = '--';
                gustContainer.style.opacity = '0.4';
            }
        }

        // Altimeter
        const altEl = document.getElementById('altimeter');
        if (altEl && metar.altimeter) altEl.textContent = metar.altimeter.toFixed(2);

        // Temp / Dew
        const tempEl = document.getElementById('temperature');
        const dewEl = document.getElementById('dewpoint');
        if (tempEl && metar.temperature !== null) tempEl.textContent = metar.temperature;
        if (dewEl && metar.dewpoint !== null) dewEl.textContent = metar.dewpoint;

        // Density altitude
        const densEl = document.getElementById('densityAlt');
        if (densEl && metar.altimeter && metar.temperature !== null) {
            const da = Utils.calculateDensityAltitude(
                this.airport.elevation,
                metar.altimeter,
                metar.temperature
            );
            densEl.textContent = da.toLocaleString();
        }

        // Weather phenomena
        const wxEl = document.getElementById('weather');
        if (wxEl) wxEl.textContent = MetarParser.getWeatherDescription(metar) || 'CLR';

        // VFR check
        this.updateVfrCheck(metar);
    },

    updateVfrCheck(metar) {
        const el = document.getElementById('vfrCheck');
        if (!el) return;

        const ceiling = metar.ceiling;
        const vis = metar.visibility || 10;
        const okCeil = ceiling >= 1000;
        const okVis  = vis >= 3;
        const ok = okCeil && okVis;

        const icon = el.querySelector('.vfr-icon');
        const text = el.querySelector('.vfr-text');

        el.classList.toggle('not-met', !ok);

        if (ok) {
            if (icon) icon.textContent = '✓';
            if (text) text.textContent = 'VFR Minimums Met';
        } else {
            if (icon) icon.textContent = '✗';
            const issues = [];
            if (!okCeil) issues.push(`Ceiling ${ceiling} ft`);
            if (!okVis)  issues.push(`Vis ${vis} SM`);
            if (text) text.textContent = 'NOT Met: ' + issues.join(', ');
        }
    },

    updateMetarAge(observationTime) {
        const el = document.getElementById('metarAge');
        if (!el || !observationTime) return;

        const refresh = () => {
            const mins = Utils.minutesSince(observationTime);
            el.textContent = `${mins} min ago`;
            el.classList.toggle('stale-warning', mins > 60);
        };

        refresh();
        setInterval(refresh, 60000);
    },

    // ── TAF Updates ────────────────────────────────────────

    updateTaf(data) {
        if (!data) return;

        const taf = data.rawTAF ? TafParser.parse(data.rawTAF) : null;
        if (!taf) return;

        this.state.taf = taf;

        // Validity line
        const validEl = document.getElementById('tafValidity');
        if (validEl && taf.validFrom && taf.validTo) {
            let txt = `Valid: ${taf.validFrom}Z to ${taf.validTo}Z`;
            if (data.icaoId && data.icaoId !== this.airport.icao && data.distance) {
                txt = `${data.icaoId} (${data.distance.toFixed(1)} nm) — ${txt}`;
                validEl.style.color = '#FFD700';
            } else {
                validEl.style.color = '';
            }
            validEl.textContent = txt;
        }

        // Chart
        TafTimeline.update(taf);

        // Raw TAF
        const rawEl = document.getElementById('rawTaf');
        if (rawEl) rawEl.textContent = taf.raw;

        Utils.log('TAF updated', 'info');
    },

    // ── Aircraft Status Updates ────────────────────────────

    updateAircraftStatus(data, options = {}) {
        const statusMap = (data && typeof data === 'object') ? data : {};

        // Update list rows
        let hasData = false;
        document.querySelectorAll('.aircraft-row').forEach(row => {
            const tail = row.dataset.tailNumber?.toUpperCase();
            const statusEl = row.querySelector('.ac-status');
            if (!tail || !statusEl) return;

            const status = statusMap[tail] || this.state.aircraftStatus?.[tail];

            if (status) {
                const isStale = !statusMap[tail] && !!this.state.aircraftStatus?.[tail];
                statusEl.textContent = this.formatAircraftStatus({ ...status, isStale });
                row.className = 'aircraft-row ' + this.getAircraftStatusClass(status);
                hasData = true;
            } else {
                statusEl.textContent = options.unavailable ? 'Unavailable' : '--';
                row.className = 'aircraft-row status-unknown';
            }
        });

        const emptyEl = document.getElementById('aircraftEmptyState');
        if (emptyEl) {
            emptyEl.style.display = hasData ? 'none' : 'block';
        }

        // Cache status map
        if (Object.keys(statusMap).length > 0) {
            this.state.aircraftStatus = statusMap;
        }

        // Update map markers if map is initialized
        if (this.aircraftMap) {
            this.updateAircraftMapMarkers(statusMap);
        }
    },

    formatAircraftStatus(s) {
        if (!s) return '--';

        const parts = [];
        const lastSeen = s.lastSeenTime ?? s.timePosition ?? s.lastContact ?? s.lastSeenTimestamp;
        const ageMs = lastSeen ? (Date.now() - lastSeen * 1000) : null;
        const stale = ageMs && ageMs > 15 * 60 * 1000;

        let onGround = s.onGround;
        if (typeof s.baroAltitude === 'number' && typeof s.velocity === 'number') {
            if (s.baroAltitude < 100 && s.velocity < 5) onGround = true;
        }

        if (s.status === 'No Signal') {
            parts.push('No Signal');
        } else if (typeof onGround === 'boolean') {
            parts.push(stale
                ? (onGround ? 'Last: Ground' : 'Last: In Flight')
                : (onGround ? 'On Ground' : 'In Flight'));
        } else if (s.status) {
            parts.push(s.status);
        }

        if (typeof lastSeen === 'number' && lastSeen > 0) {
            parts.push(Utils.formatZuluMinutes(new Date(lastSeen * 1000)));
        }

        const alt = s.baroAltitude ?? s.geoAltitude;
        if (typeof alt === 'number') parts.push(Math.round(alt) + ' ft');

        if (typeof s.trueTrack === 'number' && !onGround) {
            parts.push('HDG ' + Math.round(s.trueTrack) + '°');
        }

        if (typeof s.velocity === 'number' && !onGround) {
            parts.push(Math.round(s.velocity * 1.94384) + ' kts');
        }

        return parts.join(' · ') || 'Unavailable';
    },

    getAircraftStatusClass(s) {
        if (!s) return 'status-unknown';

        let onGround = s.onGround;
        if (typeof s.baroAltitude === 'number' && typeof s.velocity === 'number') {
            if (s.baroAltitude < 100 && s.velocity < 5) onGround = true;
        }

        if (typeof onGround === 'boolean') return onGround ? 'status-onground' : 'status-inflight';

        if (s.status) {
            const n = s.status.toLowerCase();
            if (n.includes('ground'))            return 'status-onground';
            if (n.includes('flight') || n.includes('air')) return 'status-inflight';
        }

        return 'status-unknown';
    },

    // ── Aircraft Map (Leaflet) ─────────────────────────────

    initAircraftMap() {
        const mapEl = document.getElementById('aircraft-map');
        if (!mapEl || this.aircraftMap) return;

        const cfg = ConfigManager.get();
        const center = [cfg.coordinates.lat, cfg.coordinates.lon];

        this.aircraftMap = L.map('aircraft-map', {
            center,
            zoom: 9,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            opacity: 0.7
        }).addTo(this.aircraftMap);

        // Add home airport marker
        L.circleMarker(center, {
            radius: 6,
            color: '#00D4FF',
            fillColor: '#00D4FF',
            fillOpacity: 0.4,
            weight: 2
        }).bindPopup(cfg.icao).addTo(this.aircraftMap);

        // If we have cached aircraft data, place markers immediately
        if (Object.keys(this.state.aircraftStatus).length > 0) {
            this.updateAircraftMapMarkers(this.state.aircraftStatus);
        }

        // Force redraw (needed when container was hidden)
        setTimeout(() => this.aircraftMap.invalidateSize(), 100);
    },

    updateAircraftMapMarkers(statusMap) {
        if (!this.aircraftMap) return;

        Object.entries(statusMap).forEach(([tail, s]) => {
            if (!s) return;

            const lat = s.latitude ?? s.lat;
            const lon = s.longitude ?? s.lon;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;

            const cls = this.getAircraftStatusClass(s);
            const markerClass = cls === 'status-onground' ? 'onground'
                              : cls === 'status-inflight' ? 'inflight'
                              : 'unknown';

            const icon = L.divIcon({
                html: `<div class="ac-map-marker ${markerClass}">${tail}</div>`,
                className: '',
                iconSize: [52, 22],
                iconAnchor: [26, 11]
            });

            if (this.aircraftMarkers[tail]) {
                this.aircraftMarkers[tail].setLatLng([lat, lon]);
                this.aircraftMarkers[tail].setIcon(icon);
            } else {
                this.aircraftMarkers[tail] = L.marker([lat, lon], { icon })
                    .addTo(this.aircraftMap)
                    .bindPopup(this.formatAircraftStatus(s));
            }
        });
    },

    centerMapOnAircraft(tail) {
        if (!this.aircraftMap) return;

        const status = this.state.aircraftStatus?.[tail];
        if (!status) return;

        const lat = status.latitude ?? status.lat;
        const lon = status.longitude ?? status.lon;
        if (typeof lat === 'number' && typeof lon === 'number') {
            this.aircraftMap.flyTo([lat, lon], 11, { duration: 0.8 });
        }
    },

    // ── Config Screen ──────────────────────────────────────

    setupConfigForm() {
        document.getElementById('configSaveBtn')?.addEventListener('click', () => {
            this.saveConfig();
        });

        document.getElementById('configResetBtn')?.addEventListener('click', () => {
            if (confirm('Reset all settings to defaults?')) {
                ConfigManager.reset();
                location.reload();
            }
        });
    },

    populateConfigForm() {
        const cfg = ConfigManager.get();

        const icaoEl = document.getElementById('cfg-icao');
        if (icaoEl) icaoEl.value = cfg.icao || '';

        const tailsEl = document.getElementById('cfg-tails');
        if (tailsEl) tailsEl.value = (cfg.tailNumbers || []).join('\n');

        const workerEl = document.getElementById('cfg-worker');
        if (workerEl) workerEl.value = cfg.workerUrl || '';

        const acUrlEl = document.getElementById('cfg-aircraft-url');
        if (acUrlEl) acUrlEl.value = cfg.aircraftStatusEndpoint || '';

        this.setSelectValue('cfg-metar-interval', cfg.metarRefreshInterval);
        this.setSelectValue('cfg-taf-interval', cfg.tafRefreshInterval);
        this.setSelectValue('cfg-aircraft-interval', cfg.aircraftRefreshInterval);
    },

    setSelectValue(id, val) {
        const el = document.getElementById(id);
        if (!el || val === undefined) return;
        const str = String(val);
        for (const opt of el.options) {
            if (opt.value === str) { opt.selected = true; return; }
        }
    },

    saveConfig() {
        const icao = document.getElementById('cfg-icao')?.value.trim().toUpperCase();
        const tailsRaw = document.getElementById('cfg-tails')?.value || '';
        const tailNumbers = tailsRaw.split('\n')
            .map(t => t.trim().toUpperCase())
            .filter(t => t.length > 0);

        const workerUrl = document.getElementById('cfg-worker')?.value.trim();
        const aircraftStatusEndpoint = document.getElementById('cfg-aircraft-url')?.value.trim();

        const metarRefreshInterval = parseInt(document.getElementById('cfg-metar-interval')?.value || '10');
        const tafRefreshInterval   = parseInt(document.getElementById('cfg-taf-interval')?.value  || '30');
        const aircraftRefreshInterval = parseInt(document.getElementById('cfg-aircraft-interval')?.value || '2');

        const newCfg = {
            icao:                   icao                   || ConfigManager.defaults.icao,
            tailNumbers:            tailNumbers.length > 0  ? tailNumbers : ConfigManager.defaults.tailNumbers,
            workerUrl:              workerUrl              || ConfigManager.defaults.workerUrl,
            aircraftStatusEndpoint: aircraftStatusEndpoint || ConfigManager.defaults.aircraftStatusEndpoint,
            metarRefreshInterval,
            tafRefreshInterval,
            aircraftRefreshInterval
        };

        ConfigManager.save(newCfg);
        location.reload();
    },

    // ── Image Refresh ──────────────────────────────────────

    refreshImages() {
        const ts = Date.now();

        const radarImg = document.getElementById('radarImg');
        if (radarImg) radarImg.src = WeatherAPI.getRadarUrl();

        const satImg = document.getElementById('satelliteImg');
        if (satImg) satImg.src = WeatherAPI.getSatelliteUrl();

        const surfImg = document.getElementById('surfaceImg');
        if (surfImg) surfImg.src = WeatherAPI.getSurfaceUrl();

        const ind = document.getElementById('radarRefreshIndicator');
        if (ind) {
            const now = new Date();
            ind.textContent = `Updated ${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')}Z`;
        }
    },

    // ── Error Handling ─────────────────────────────────────

    handleError(type, error) {
        Utils.log(`Error (${type}): ${error.message}`, 'error');
        if (type === 'aircraft') {
            this.updateAircraftStatus(this.state.aircraftStatus, { unavailable: true });
        }
    },

    async refresh() {
        await this.loadWeatherData();
        await this.loadAircraftStatus();
        this.refreshImages();
    }
};

// ── Startup ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Load radar images immediately
    const cfg = ConfigManager.get();
    const ts = Date.now();
    const radarImg = document.getElementById('radarImg');
    if (radarImg) radarImg.src = `https://radar.weather.gov/ridge/standard/KLOT_loop.gif?t=${ts}`;
    const satImg = document.getElementById('satelliteImg');
    if (satImg) satImg.src = `https://cdn.star.nesdis.noaa.gov/GOES16/ABI/SECTOR/umv/GEOCOLOR/600x600.jpg?t=${ts}`;
    const surfImg = document.getElementById('surfaceImg');
    if (surfImg) surfImg.src = `https://www.wpc.ncep.noaa.gov/sfc/namussfcwbg.gif?t=${ts}`;

    App.init().catch(err => {
        console.error('Dashboard init failed:', err);
    });
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}
