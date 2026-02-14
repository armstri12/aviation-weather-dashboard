/**
 * Aviation Weather Dashboard - Touchscreen Controller
 * Adapted for Freenove FNK0078 (800x480 5" touchscreen)
 *
 * Replaces app.js for the touchscreen layout. Reuses all existing
 * parsing, API, and calculation modules.
 */

const TouchApp = {
    state: {
        metar: null,
        taf: null,
        aircraftStatus: {},
        lastUpdate: null,
        isLoading: true,
        hasError: false,
        currentMap: 'radar',
        currentTab: 'conditions'
    },

    airport: {
        icao: 'KUGN',
        name: 'Waukegan National Airport',
        elevation: 727,
        coordinates: { lat: 42.4222, lon: -87.8679 }
    },

    tabs: ['conditions', 'airport', 'weather', 'aircraft', 'forecast'],

    // ==================== Init ====================

    async init() {
        Utils.log('Initializing Touchscreen Dashboard', 'info');

        this.startClock();
        this.setupTabs();
        this.setupSwipe();
        this.setupImageTabs();

        await AirportDiagram.init();
        TafTimeline.init();

        await this.loadWeatherData();
        await this.loadAircraftStatus();

        WeatherAPI.startAutoRefresh({
            onMetar: (data) => this.updateMetar(data),
            onTaf: (data) => this.updateTaf(data),
            onAircraftStatus: (data) => this.updateAircraftStatus(data),
            getAircraftTailNumbers: () => this.getTailNumbers(),
            onError: (type, error) => this.handleError(type, error)
        });

        Utils.log('Touchscreen dashboard initialized', 'info');
    },

    // ==================== Clock ====================

    startClock() {
        const update = () => {
            const now = new Date();
            const zuluEl = document.getElementById('clockZulu');
            const localEl = document.getElementById('clockLocal');

            if (zuluEl) {
                const h = String(now.getUTCHours()).padStart(2, '0');
                const m = String(now.getUTCMinutes()).padStart(2, '0');
                zuluEl.textContent = `${h}:${m}Z`;
            }
            if (localEl) {
                const h = String(now.getHours()).padStart(2, '0');
                const m = String(now.getMinutes()).padStart(2, '0');
                localEl.textContent = `${h}:${m}L`;
            }
        };
        update();
        setInterval(update, 1000);
    },

    // ==================== Tab Navigation ====================

    setupTabs() {
        const buttons = document.querySelectorAll('.ts-tab[data-tab]');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });
    },

    switchTab(tabId) {
        if (tabId === this.state.currentTab) return;

        const oldIndex = this.tabs.indexOf(this.state.currentTab);
        const newIndex = this.tabs.indexOf(tabId);
        const goingRight = newIndex > oldIndex;

        // Update tab bar
        document.querySelectorAll('.ts-tab[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Animate panels
        const oldPanel = document.getElementById(`tab-${this.state.currentTab}`);
        const newPanel = document.getElementById(`tab-${tabId}`);

        if (oldPanel && newPanel) {
            oldPanel.classList.add(goingRight ? 'slide-out-left' : 'slide-out-right');

            setTimeout(() => {
                oldPanel.classList.remove('active', 'slide-out-left', 'slide-out-right');
                newPanel.classList.add('active', goingRight ? 'slide-in-right' : 'slide-in-left');

                setTimeout(() => {
                    newPanel.classList.remove('slide-in-right', 'slide-in-left');
                }, 250);
            }, 200);
        }

        this.state.currentTab = tabId;

        // Trigger chart resize when switching to forecast tab
        if (tabId === 'forecast' && TafTimeline && TafTimeline.chart) {
            setTimeout(() => TafTimeline.chart.resize(), 50);
        }
    },

    // ==================== Swipe Gesture ====================

    setupSwipe() {
        const content = document.querySelector('.ts-content');
        if (!content) return;

        let startX = 0;
        let startY = 0;
        let tracking = false;

        content.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        content.addEventListener('touchend', (e) => {
            if (!tracking) return;
            tracking = false;

            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const dx = endX - startX;
            const dy = endY - startY;

            // Require horizontal swipe > 60px and mostly horizontal
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                const idx = this.tabs.indexOf(this.state.currentTab);
                if (dx < 0 && idx < this.tabs.length - 1) {
                    this.switchTab(this.tabs[idx + 1]);
                } else if (dx > 0 && idx > 0) {
                    this.switchTab(this.tabs[idx - 1]);
                }
            }
        }, { passive: true });
    },

    // ==================== Image Sub-tabs ====================

    setupImageTabs() {
        const tabs = document.querySelectorAll('.ts-img-tab');
        const maps = {
            'radar': document.getElementById('radarMap'),
            'satellite': document.getElementById('satelliteMap'),
            'surface': document.getElementById('surfaceMap')
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mapType = tab.dataset.map;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                Object.entries(maps).forEach(([type, el]) => {
                    if (el) {
                        el.classList.toggle('hidden', type !== mapType);
                    }
                });

                this.state.currentMap = mapType;
            });
        });
    },

    // ==================== Data Loading ====================

    async loadWeatherData() {
        this.state.isLoading = true;
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
            this.state.isLoading = false;
        }
    },

    async loadAircraftStatus() {
        const tailNumbers = this.getTailNumbers();
        if (tailNumbers.length === 0) return;
        try {
            const statusMap = await WeatherAPI.getAircraftStatus(tailNumbers);
            this.updateAircraftStatus(statusMap);
        } catch (error) {
            Utils.log(`Failed to load aircraft status: ${error.message}`, 'error');
            this.handleError('aircraft', error);
        }
    },

    getTailNumbers() {
        // Touchscreen uses ts-aircraft-card elements
        const rows = document.querySelectorAll('.ts-aircraft-card');
        return [...new Set(
            Array.from(rows)
                .map(r => r.dataset.tailNumber?.toUpperCase())
                .filter(Boolean)
        )];
    },

    // ==================== METAR Update ====================

    updateMetar(data) {
        if (!data) return;

        const metar = MetarParser.parseFromJson(data);
        if (!metar) return;

        this.state.metar = metar;
        this.updateFlightCategory(metar.flightCategory);
        this.updateConditions(metar);

        const windDir = metar.wind.direction;
        const windSpeed = metar.wind.speed || 0;
        const gustSpeed = metar.wind.gust;

        AirportDiagram.updateWind(windDir, windSpeed, gustSpeed);
        AirportDiagram.updateCrosswind(windDir, windSpeed, gustSpeed);

        // Update recommended runway display (touchscreen version)
        this.updateRecommendedRunway();

        // Raw METAR
        const rawEl = document.getElementById('rawMetar');
        if (rawEl) rawEl.textContent = metar.raw;

        // Update time
        const updateTimeEl = document.getElementById('updateTime');
        if (updateTimeEl && metar.time) {
            updateTimeEl.textContent = `${metar.time.substring(2, 4)}:${metar.time.substring(4, 6)}Z`;
        }

        // Wind summary
        const windSumEl = document.getElementById('windSummary');
        if (windSumEl) {
            windSumEl.textContent = MetarParser.formatWind(metar.wind) + ' KT';
        }

        Utils.log('Touchscreen METAR updated', 'info');
    },

    updateRecommendedRunway() {
        const recEl = document.getElementById('recommendedRunway');
        // The crosswind module updates the original #recommendedRunway .value element
        // For touchscreen, the element is the value itself
        if (recEl) {
            const valueSpan = recEl.querySelector ? recEl.querySelector('.value') : null;
            if (!valueSpan) {
                // touchscreen layout: the element IS the value
                // AirportDiagram.updateCrosswind already updates the original DOM
                // We need to read it from the crosswind calculator
                const origRec = document.querySelector('.recommended-runway .value');
                if (origRec) {
                    recEl.textContent = origRec.textContent;
                }
            }
        }
    },

    updateFlightCategory(category) {
        // Header badge
        const catEl = document.getElementById('flightCategory');
        const labelEl = catEl?.querySelector('.category-label');
        if (catEl && labelEl) {
            labelEl.textContent = category;
            catEl.className = 'ts-flight-cat';
            catEl.classList.add(`category-${category.toLowerCase()}`);
            labelEl.className = 'category-label';
            labelEl.classList.add(`glow-${category.toLowerCase()}`);
        }

        // Hero card
        const heroEl = document.getElementById('tsCatHero');
        const heroLabel = document.getElementById('tsCatLabel');
        if (heroEl && heroLabel) {
            heroLabel.textContent = category;
            heroEl.className = 'ts-cat-hero';
            heroEl.classList.add(`category-${category.toLowerCase()}`);
            heroLabel.className = 'ts-cat-label';
            heroLabel.classList.add(`glow-${category.toLowerCase()}`);
        }
    },

    updateConditions(metar) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // Ceiling
        if (metar.ceiling >= 99999) {
            set('ceiling', 'CLR');
        } else {
            set('ceiling', metar.ceiling.toLocaleString());
        }

        // Visibility
        const vis = metar.visibility || 10;
        set('visibility', vis >= 10 ? '10+' : vis);

        // Wind
        set('wind', MetarParser.formatWind(metar.wind));

        // Gusts
        const gustsContainer = document.getElementById('gustsContainer');
        if (gustsContainer) {
            if (metar.wind.gust) {
                set('gusts', metar.wind.gust);
                gustsContainer.style.display = '';
            } else {
                gustsContainer.style.display = 'none';
            }
        }

        // Secondary
        if (metar.altimeter) set('altimeter', metar.altimeter.toFixed(2));
        if (metar.temperature !== null) set('temperature', `${metar.temperature}°C`);
        if (metar.dewpoint !== null) set('dewpoint', `${metar.dewpoint}°C`);

        if (metar.altimeter && metar.temperature !== null) {
            const da = Utils.calculateDensityAltitude(
                this.airport.elevation, metar.altimeter, metar.temperature
            );
            set('densityAlt', da.toLocaleString());
        }

        set('weather', MetarParser.getWeatherDescription(metar));

        // VFR Check
        this.updateVfrCheck(metar);
    },

    updateVfrCheck(metar) {
        const el = document.getElementById('vfrCheck');
        if (!el) return;

        const ceiling = metar.ceiling;
        const visibility = metar.visibility || 10;
        const meetsCeiling = ceiling >= 1000;
        const meetsVisibility = visibility >= 3;
        const meetsVfr = meetsCeiling && meetsVisibility;

        const iconEl = el.querySelector('.vfr-icon');
        const textEl = el.querySelector('.vfr-text');

        if (meetsVfr) {
            el.classList.remove('not-met');
            if (iconEl) iconEl.textContent = '✓';
            if (textEl) textEl.textContent = 'VFR Minimums Met';
        } else {
            el.classList.add('not-met');
            if (iconEl) iconEl.textContent = '✗';
            const issues = [];
            if (!meetsCeiling) issues.push(`Ceil ${ceiling}'`);
            if (!meetsVisibility) issues.push(`Vis ${visibility}SM`);
            if (textEl) textEl.textContent = `NOT Met: ${issues.join(', ')}`;
        }
    },

    // ==================== TAF Update ====================

    updateTaf(data) {
        if (!data) return;

        const taf = data.rawTAF ? TafParser.parse(data.rawTAF) : null;
        if (!taf) return;

        this.state.taf = taf;

        const validityEl = document.getElementById('tafValidity');
        if (validityEl && taf.validFrom && taf.validTo) {
            let text = `${taf.validFrom}Z — ${taf.validTo}Z`;
            if (data.icaoId && data.icaoId !== this.airport.icao && data.distance) {
                text = `${data.icaoId} (${data.distance.toFixed(1)}nm) ${text}`;
                validityEl.style.color = '#FFD700';
            } else {
                validityEl.style.color = '';
            }
            validityEl.textContent = text;
        }

        TafTimeline.update(taf);

        const rawEl = document.getElementById('rawTaf');
        if (rawEl) rawEl.textContent = taf.raw;
    },

    // ==================== Aircraft Status ====================

    updateAircraftStatus(data, options = {}) {
        const cards = document.querySelectorAll('.ts-aircraft-card');
        const emptyState = document.getElementById('aircraftEmptyState');
        if (!cards || cards.length === 0) return;

        const statusMap = data && typeof data === 'object' ? data : {};
        let hasData = false;

        cards.forEach(card => {
            const tail = card.dataset.tailNumber?.toUpperCase();
            const valueEl = card.querySelector('.ts-ac-status');
            if (!valueEl || !tail) return;

            const statusData = statusMap[tail];
            const cached = this.state.aircraftStatus?.[tail];
            const effective = statusData || cached;

            if (effective) {
                valueEl.textContent = this.formatAircraftStatus({
                    ...effective,
                    isStale: !statusData && !!cached
                });
                card.classList.remove('status-onground', 'status-inflight', 'status-unknown');
                card.classList.add(this.getAircraftStatusClass(effective));
                hasData = true;
            } else {
                valueEl.textContent = options.unavailable ? 'Unavailable' : '--';
                card.classList.remove('status-onground', 'status-inflight');
                card.classList.add('status-unknown');
            }
        });

        if (emptyState) {
            emptyState.classList.toggle('hidden', hasData);
            if (!hasData) {
                emptyState.textContent = options.unavailable ? 'Unavailable' : 'No data yet.';
            }
        }

        if (Object.keys(statusMap).length > 0) {
            this.state.aircraftStatus = statusMap;
        }
    },

    formatAircraftStatus(statusData) {
        if (!statusData) return '--';

        const parts = [];
        const lastSeenTime = statusData.lastSeenTime ?? statusData.timePosition ?? statusData.lastContact ?? statusData.lastSeenTimestamp;
        const dataAgeMs = lastSeenTime ? Date.now() - (lastSeenTime * 1000) : null;
        const isStale = dataAgeMs && dataAgeMs > 15 * 60 * 1000;

        let onGround = statusData.onGround;
        if (typeof statusData.baroAltitude === 'number' && typeof statusData.velocity === 'number') {
            if (statusData.baroAltitude < 100 && statusData.velocity < 5) onGround = true;
        }

        if (statusData.status === 'No Signal') {
            parts.push('No Sig');
        } else if (typeof onGround === 'boolean') {
            parts.push(onGround ? 'Gnd' : 'Air');
            if (isStale) parts[0] = `Last: ${parts[0]}`;
        }

        const altitude = statusData.baroAltitude ?? statusData.geoAltitude;
        if (typeof altitude === 'number') parts.push(`${Math.round(altitude)}'`);

        if (typeof statusData.velocity === 'number' && !onGround) {
            parts.push(`${Math.round(statusData.velocity * 1.94384)}kt`);
        }

        return parts.length > 0 ? parts.join(' ') : '--';
    },

    getAircraftStatusClass(statusData) {
        if (!statusData) return 'status-unknown';

        let onGround = statusData.onGround;
        if (typeof statusData.baroAltitude === 'number' && typeof statusData.velocity === 'number') {
            if (statusData.baroAltitude < 100 && statusData.velocity < 5) onGround = true;
        }

        if (typeof onGround === 'boolean') {
            return onGround ? 'status-onground' : 'status-inflight';
        }

        if (statusData.status) {
            const s = statusData.status.toLowerCase();
            if (s.includes('ground')) return 'status-onground';
            if (s.includes('flight') || s.includes('air')) return 'status-inflight';
        }

        return 'status-unknown';
    },

    // ==================== Error Handling ====================

    handleError(type, error) {
        Utils.log(`Error (${type}): ${error.message}`, 'error');
        this.state.hasError = true;
        if (type === 'aircraft') {
            this.updateAircraftStatus(this.state.aircraftStatus, { unavailable: true });
        }
    },

    async refresh() {
        await this.loadWeatherData();
        await this.loadAircraftStatus();
        WeatherAPI.refreshImages();
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    TouchApp.init().catch(error => {
        console.error('Failed to initialize touchscreen dashboard:', error);
    });
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TouchApp;
}
