/**
 * Aviation Weather Dashboard - Airport Diagram Controller
 * Handles GeoPDF airport chart rendering, map overlay, and wind visualization
 */

const AirportDiagram = {
    // Element references
    elements: {
        mapContainer: null,
        loadingIndicator: null,
        windsockOverlay: null,
        windSockGroup: null,
        windSock: null,
        windDirectionArrow: null,
        windSpeedText: null,
        windDirText: null
    },

    // PDF state
    pdfState: {
        document: null,
        currentCycle: null,
        loaded: false
    },

    // Map state
    mapState: {
        map: null,
        baseLayer: null,
        chartLayer: null,
        chartBounds: null
    },

    // Current wind state
    windState: {
        direction: 0,
        speed: 0,
        gust: null
    },

    // Diagram configuration
    diagramConfig: {
        airportId: 'KUGN',
        // FAA GeoPDF chart URL (via proxy for CORS)
        chartUrl: 'https://chart-proxy.ian-284.workers.dev/chart/KUGN',
        vectorSource: 'osm',
        vectorDataUrl: 'https://overpass-api.de/api/interpreter',
        vectorCanvasSize: 900,
        // Approximate georeferenced bounds for KUGN airport diagram
        chartBounds: [
            [42.4324, -87.8836],
            [42.4122, -87.8532]
        ],
        runwayHeading: 50,
        orientation: 'north-up',
        mapMode: 'georeferenced', // chart-only or georeferenced
        chartOpacity: 0.95,
        mapPadding: [20, 20],
        baseMapUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        baseMapAttribution: '&copy; OpenStreetMap contributors'
    },

    /**
     * Initialize the airport diagram
     */
    async init() {
        Utils.log('Initializing Airport Diagram...', 'info');

        // Get element references
        this.elements.mapContainer = document.getElementById('chartMap');
        this.elements.loadingIndicator = document.getElementById('chartLoading');
        this.elements.windsockOverlay = document.getElementById('windsockOverlay');
        this.elements.windSockGroup = document.getElementById('windSockGroup');
        this.elements.windSock = document.getElementById('windSock');
        this.elements.windDirectionArrow = document.getElementById('windDirectionArrow');
        this.elements.windSpeedText = document.getElementById('windSpeedText');
        this.elements.windDirText = document.getElementById('windDirText');

        if (!this.elements.mapContainer) {
            Utils.log('Map container not found', 'error');
            return;
        }

        this.initializeMap();

        // Load and render the georeferenced chart (or fallback if chartUrl is null)
        if (this.diagramConfig.chartUrl) {
            await this.loadAirportChart();
        } else {
            this.loadFallbackDiagram();
        }

        // Initialize windsock position
        this.updateWind(0, 0);

        Utils.log('Airport Diagram initialized', 'info');
    },

    /**
     * Initialize Leaflet map
     */
    initializeMap() {
        if (!this.elements.mapContainer || typeof L === 'undefined') {
            Utils.log('Leaflet is not available', 'error');
            return;
        }

        const isGeoreferenced = this.diagramConfig.mapMode === 'georeferenced';
        const mapOptions = {
            zoomControl: false,
            attributionControl: isGeoreferenced,
            preferCanvas: true
        };

        if (!isGeoreferenced) {
            mapOptions.crs = L.CRS.Simple;
        }

        this.mapState.map = L.map(this.elements.mapContainer, mapOptions);

        if (isGeoreferenced) {
            const bounds = L.latLngBounds(this.diagramConfig.chartBounds);
            this.mapState.chartBounds = bounds;
            this.mapState.map.fitBounds(bounds, { padding: this.diagramConfig.mapPadding });
            this.mapState.baseLayer = L.tileLayer(this.diagramConfig.baseMapUrl, {
                attribution: this.diagramConfig.baseMapAttribution,
                maxZoom: 19
            }).addTo(this.mapState.map);
        }
    },

    /**
     * Load the airport chart PDF and render it
     */
    async loadAirportChart() {
        try {
            Utils.log(`Loading airport chart from ${this.diagramConfig.chartUrl}...`, 'info');

            // Show loading indicator
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.remove('hidden');
            }

            if (!this.mapState.map) {
                this.initializeMap();
            }

            const chartCanvas = await this.renderPDFPage(1);
            const rotatedCanvas = this.applyDiagramOrientation(chartCanvas);
            const chartImageUrl = rotatedCanvas.toDataURL('image/png');
            const chartSize = { width: rotatedCanvas.width, height: rotatedCanvas.height };

            this.addChartOverlay(chartImageUrl, chartSize);

            this.pdfState.loaded = true;

            // Hide loading indicator
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.add('hidden');
            }

        } catch (error) {
            Utils.log(`Chart unavailable, using windsock overlay only: ${error.message}`, 'warn');

            // Hide loading indicator completely - windsock will still work
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.add('hidden');
            }

            // Draw vector geometry or simple background grid on map as fallback
            this.loadFallbackDiagram();
        }
    },

    /**
     * Draw fallback background when PDF cannot load
     */
    loadFallbackDiagram() {
        this.loadVectorDiagram().then((rendered) => {
            if (rendered) return;

            const fallbackCanvas = this.createFallbackCanvas();
            if (!fallbackCanvas) return;

            const chartImageUrl = fallbackCanvas.toDataURL('image/png');
            const chartSize = { width: fallbackCanvas.width, height: fallbackCanvas.height };
            this.addChartOverlay(chartImageUrl, chartSize);
        }).catch((error) => {
            Utils.log(`Vector rendering failed, using fallback grid: ${error.message}`, 'warn');
            const fallbackCanvas = this.createFallbackCanvas();
            if (!fallbackCanvas) return;

            const chartImageUrl = fallbackCanvas.toDataURL('image/png');
            const chartSize = { width: fallbackCanvas.width, height: fallbackCanvas.height };
            this.addChartOverlay(chartImageUrl, chartSize);
        });
    },

    /**
     * Load and render vector geometry from OpenStreetMap
     */
    async loadVectorDiagram() {
        if (this.diagramConfig.vectorSource !== 'osm') return false;
        if (typeof L === 'undefined') {
            Utils.log('Leaflet is not available for vector rendering', 'error');
            return false;
        }

        try {
            Utils.log('Loading vector geometry from OpenStreetMap...', 'info');

            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.remove('hidden');
            }

            if (!this.mapState.map) {
                this.initializeMap();
            }

            const vectorData = await this.fetchOsmVectorData();
            const geometries = this.extractOsmGeometries(vectorData);
            if (!geometries.length) {
                Utils.log('No runway or taxiway geometry found in OSM response', 'warn');
                if (this.elements.loadingIndicator) {
                    this.elements.loadingIndicator.classList.add('hidden');
                }
                return false;
            }

            const vectorCanvas = this.renderVectorDiagram(geometries);
            if (!vectorCanvas) return false;

            const chartImageUrl = vectorCanvas.toDataURL('image/png');
            const chartSize = { width: vectorCanvas.width, height: vectorCanvas.height };
            this.addChartOverlay(chartImageUrl, chartSize);

            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.add('hidden');
            }

            return true;
        } catch (error) {
            Utils.log(`Failed to load vector geometry: ${error.message}`, 'warn');
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.add('hidden');
            }
            return false;
        }
    },

    /**
     * Fetch runway/taxiway geometry from Overpass API
     */
    async fetchOsmVectorData() {
        const airportId = this.diagramConfig.airportId;
        const overpassQuery = `
            [out:json][timeout:25];
            area["aeroway"="aerodrome"]["icao"="${airportId}"]->.searchArea;
            (
              way["aeroway"~"runway|taxiway|taxiway_centerline"](area.searchArea);
            );
            out geom;
        `;

        const requestUrl = `${this.diagramConfig.vectorDataUrl}?data=${encodeURIComponent(overpassQuery)}`;
        const response = await fetch(requestUrl);
        if (!response.ok) {
            throw new Error(`Overpass request failed (${response.status})`);
        }

        return response.json();
    },

    /**
     * Extract runway/taxiway geometry from Overpass response
     */
    extractOsmGeometries(data) {
        if (!data || !Array.isArray(data.elements)) {
            return [];
        }

        return data.elements
            .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
            .map((element) => ({
                type: element.tags?.aeroway || 'unknown',
                surface: element.tags?.surface || 'unknown',
                name: element.tags?.ref || element.tags?.name || null,
                coords: element.geometry.map((point) => [point.lat, point.lon])
            }));
    },

    /**
     * Render vector geometry to a canvas and set map bounds
     */
    renderVectorDiagram(geometries) {
        const allCoords = geometries.flatMap((feature) => feature.coords);
        if (!allCoords.length) return null;

        const bounds = L.latLngBounds(allCoords.map((coord) => L.latLng(coord[0], coord[1])));
        this.mapState.chartBounds = bounds;

        const projected = allCoords.map((coord) => L.Projection.SphericalMercator.project(L.latLng(coord[0], coord[1])));
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        projected.forEach((point) => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });

        const padding = 0.05;
        const xSpan = maxX - minX;
        const ySpan = maxY - minY;
        minX -= xSpan * padding;
        maxX += xSpan * padding;
        minY -= ySpan * padding;
        maxY += ySpan * padding;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const baseSize = this.diagramConfig.vectorCanvasSize;
        const aspectRatio = (maxX - minX) / (maxY - minY || 1);
        canvas.width = baseSize;
        canvas.height = Math.max(450, Math.round(baseSize / aspectRatio));

        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const projectToCanvas = (lat, lon) => {
            const point = L.Projection.SphericalMercator.project(L.latLng(lat, lon));
            const x = (point.x - minX) / (maxX - minX);
            const y = (point.y - minY) / (maxY - minY);
            return {
                x: x * canvas.width,
                y: canvas.height - y * canvas.height
            };
        };

        geometries.forEach((feature) => {
            const coords = feature.coords;
            if (coords.length < 2) return;

            ctx.beginPath();
            coords.forEach((coord, index) => {
                const point = projectToCanvas(coord[0], coord[1]);
                if (index === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });

            if (feature.type === 'runway') {
                ctx.strokeStyle = '#4f4f4f';
                ctx.lineWidth = 16;
                ctx.lineCap = 'round';
            } else if (feature.type === 'taxiway') {
                ctx.strokeStyle = '#3a3f4a';
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
            } else {
                ctx.strokeStyle = '#4b5c76';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
            }

            ctx.stroke();

            if (feature.type === 'runway') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 2;
                ctx.setLineDash([14, 10]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        Utils.log('Vector diagram rendered', 'info');
        return canvas;
    },

    /**
     * Create fallback background when PDF cannot load
     */
    createFallbackCanvas() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const width = 600;
        const height = 600;

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Dark background
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(30, 58, 95, 0.3)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= width; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = 0; y <= height; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw simple runway representation
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.save();

        // Runway 05/23 (primary) - 50 degrees
        ctx.translate(centerX, centerY);
        ctx.rotate((50 * Math.PI) / 180);

        ctx.fillStyle = '#2a2a2a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.fillRect(-20, -180, 40, 360);
        ctx.strokeRect(-20, -180, 40, 360);

        // Centerline
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 10]);
        ctx.beginPath();
        ctx.moveTo(0, -170);
        ctx.lineTo(0, 170);
        ctx.stroke();
        ctx.setLineDash([]);

        // Runway numbers
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('23', 0, -145);
        ctx.fillText('05', 0, 190);

        ctx.restore();

        // Runway 14/32 - 140 degrees
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((140 * Math.PI) / 180);

        ctx.fillStyle = '#2a2a2a';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.fillRect(-15, -100, 30, 200);
        ctx.strokeRect(-15, -100, 30, 200);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([15, 8]);
        ctx.beginPath();
        ctx.moveTo(0, -90);
        ctx.lineTo(0, 90);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 18px Orbitron, monospace';
        ctx.fillText('32', 0, -75);
        ctx.fillText('14', 0, 105);

        ctx.restore();

        // Airport label
        ctx.fillStyle = '#00D4FF';
        ctx.font = 'bold 28px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('KUGN', centerX, 50);

        ctx.fillStyle = '#6b8cae';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Waukegan National Airport', centerX, 75);

        Utils.log('Fallback diagram drawn', 'info');
        return canvas;
    },

    /**
     * Render a specific page of the PDF to canvas
     */
    async renderPDFPage(pageNumber) {
        try {
            const loadingTask = pdfjsLib.getDocument(this.diagramConfig.chartUrl);
            this.pdfState.document = await loadingTask.promise;

            Utils.log(`PDF loaded successfully (${this.pdfState.document.numPages} pages)`, 'info');

            const page = await this.pdfState.document.getPage(pageNumber);

            // Get viewport at better scale for quality
            const viewport = page.getViewport({ scale: 0.55 });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get canvas context for chart rendering');
            }

            // Set canvas dimensions
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render the page
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            Utils.log(`PDF page ${pageNumber} rendered successfully`, 'info');
            return canvas;

        } catch (error) {
            Utils.log(`Failed to render PDF page: ${error.message}`, 'error');
            throw error;
        }
    },

    /**
     * Apply orientation rotation to the diagram canvas
     */
    applyDiagramOrientation(canvas) {
        if (!canvas) return canvas;

        const rotation = this.getDiagramRotation();
        if (rotation === 0) {
            return canvas;
        }

        return this.rotateCanvas(canvas, rotation);
    },

    /**
     * Calculate rotation based on orientation preference
     */
    getDiagramRotation() {
        if (this.diagramConfig.orientation === 'runway-heading') {
            return -this.diagramConfig.runwayHeading;
        }

        return 0;
    },

    /**
     * Rotate a canvas to a new canvas with bounding box expansion
     */
    rotateCanvas(canvas, rotationDegrees) {
        const radians = (rotationDegrees * Math.PI) / 180;
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));

        const newWidth = Math.ceil(canvas.width * cos + canvas.height * sin);
        const newHeight = Math.ceil(canvas.width * sin + canvas.height * cos);

        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = newWidth;
        rotatedCanvas.height = newHeight;

        const ctx = rotatedCanvas.getContext('2d');
        if (!ctx) return canvas;

        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(radians);
        ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

        return rotatedCanvas;
    },

    /**
     * Add the chart overlay to the map
     */
    addChartOverlay(chartImageUrl, chartSize) {
        if (!this.mapState.map) return;

        if (this.mapState.chartLayer) {
            this.mapState.map.removeLayer(this.mapState.chartLayer);
        }

        const isGeoreferenced = this.diagramConfig.mapMode === 'georeferenced';
        if (!isGeoreferenced && chartSize) {
            const bounds = L.latLngBounds(
                [0, 0],
                [chartSize.height, chartSize.width]
            );
            this.mapState.chartBounds = bounds;
            this.mapState.map.setMaxBounds(bounds);
            this.mapState.map.fitBounds(bounds, { padding: this.diagramConfig.mapPadding });
            this.mapState.map.setMinZoom(this.mapState.map.getZoom());
        }

        const bounds = this.mapState.chartBounds;
        if (!bounds) return;

        this.mapState.chartLayer = L.imageOverlay(chartImageUrl, bounds, {
            opacity: this.diagramConfig.chartOpacity,
            className: 'chart-overlay'
        }).addTo(this.mapState.map);

        this.mapState.map.fitBounds(bounds, { padding: this.diagramConfig.mapPadding });
    },

    /**
     * Update wind arrow and sock
     * @param {number} direction - Wind direction in degrees (from)
     * @param {number} speed - Wind speed in knots
     * @param {number} gust - Gust speed in knots (optional)
     */
    updateWind(direction, speed, gust = null) {
        this.windState = { direction, speed, gust };

        // Update windsock and wind arrow
        if (this.elements.windSockGroup && this.elements.windSock) {
            this.updateWindSock(direction, speed);
        }

        if (this.elements.windDirectionArrow) {
            this.updateWindArrow(direction, speed, gust);
        }

        if (this.elements.windSpeedText) {
            const displaySpeed = gust ? `${speed}G${gust}` : `${speed}`;
            this.elements.windSpeedText.textContent = speed === 0 ? 'CALM' : `${displaySpeed} KT`;
        }

        // Update wind summary text
        const summaryEl = document.getElementById('windSummary');
        if (summaryEl) {
            if (speed === 0) {
                summaryEl.textContent = 'Calm';
            } else if (direction === 'VRB' || direction === null) {
                summaryEl.textContent = `VRB @ ${speed} KT`;
            } else {
                let text = `${String(direction).padStart(3, '0')}° @ ${speed} KT`;
                if (gust) {
                    text = `${String(direction).padStart(3, '0')}° @ ${speed}G${gust} KT`;
                }
                summaryEl.textContent = text;
            }
        }
    },

    /**
     * Update wind direction arrow in center
     */
    updateWindArrow(direction, speed, gust = null) {
        const arrow = this.elements.windDirectionArrow;
        if (!arrow) return;

        if (direction === 'VRB' || direction === null || speed === 0) {
            arrow.style.opacity = '0.3';
            if (this.elements.windDirText) {
                this.elements.windDirText.textContent = 'CALM';
            }
        } else {
            arrow.style.opacity = '1';
            // Rotate arrow to point in wind direction (where it's blowing TO)
            const rotation = (direction + 180) % 360;
            arrow.setAttribute('transform', `rotate(${rotation}, 350, 350)`);

            if (this.elements.windDirText) {
                this.elements.windDirText.textContent = `${String(direction).padStart(3, '0')}°`;
            }
        }
    },

    /**
     * Update wind sock appearance and position
     */
    updateWindSock(direction, speed) {
        const sockGroup = this.elements.windSockGroup;
        const sock = this.elements.windSock;
        if (!sockGroup || !sock) return;

        // Position windsock in top-left corner, out of the way
        const offsetX = 50;  // Left side
        const offsetY = 50;  // Top
        sockGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

        // Rotate sock to show wind direction
        // Wind is reported as "from" direction, sock points where wind is blowing TO
        const rotation = direction === 'VRB' || direction === null ? 0 : (direction + 180) % 360;
        sock.setAttribute('transform', `rotate(${rotation}, 0, 0)`);

        // Scale sock based on wind speed - BIGGER scaling
        let scaleX = 0.3;
        if (speed === 0) {
            scaleX = 0.2; // Very limp for calm
        } else if (speed >= 15) {
            scaleX = 1.2; // Extended even more for high winds
        } else if (speed >= 5) {
            scaleX = 0.4 + (speed - 5) * 0.08;
        }

        // Apply scale to the polygons using proper SVG syntax
        const polygons = sock.querySelectorAll('polygon');
        polygons.forEach(polygon => {
            polygon.setAttribute('transform', `scale(${scaleX}, 1)`);
        });

        // Change color based on wind speed and gusts
        const effectiveSpeed = this.windState.gust || speed;
        const mainPolygon = sock.querySelector('polygon');
        if (mainPolygon) {
            if (effectiveSpeed >= 25) {
                mainPolygon.setAttribute('fill', '#DC143C'); // Red for high winds
                mainPolygon.setAttribute('stroke', '#8B0000'); // Dark red outline
            } else if (effectiveSpeed >= 15) {
                mainPolygon.setAttribute('fill', '#FFA500'); // Orange for moderate winds
                mainPolygon.setAttribute('stroke', '#FF6B00');
            } else {
                mainPolygon.setAttribute('fill', '#FF5722'); // Normal orange
                mainPolygon.setAttribute('stroke', '#FF0000');
            }
        }

        // Add pulsing animation for gusts
        if (this.windState.gust && this.windState.gust > speed) {
            sockGroup.style.animation = 'windSockPulse 1s ease-in-out infinite';
        } else {
            sockGroup.style.animation = 'windSockWave 1.5s ease-in-out infinite';
        }
    },

    /**
     * Update crosswind display
     */
    updateCrosswind(windDirection, windSpeed, gustSpeed = null) {
        const allComponents = CrosswindCalculator.calculateAll(windDirection, windSpeed, gustSpeed);
        const recommended = CrosswindCalculator.getRecommended(windDirection, windSpeed, gustSpeed);

        // Update runway 05/23 display
        this.updateRunwayDisplay('05', allComponents['05/23']);

        // Update runway 14/32 display
        this.updateRunwayDisplay('14', allComponents['14/32']);

        // Update recommended runway
        const recommendedEl = document.getElementById('recommendedRunway');
        if (recommendedEl) {
            const valueEl = recommendedEl.querySelector('.value');
            if (valueEl) {
                valueEl.textContent = `RWY ${recommended.runway}`;

                if (!recommended.studentSafe) {
                    valueEl.style.color = 'var(--warning)';
                } else if (!recommended.safe) {
                    valueEl.style.color = 'var(--danger)';
                } else {
                    valueEl.style.color = 'var(--success)';
                }
            }
        }
    },

    /**
     * Update a single runway crosswind display
     */
    updateRunwayDisplay(runwayEnd, runwayData) {
        const rowId = runwayEnd === '05' ? 'crosswind-05-23' : 'crosswind-14-32';

        // Get the best end for this runway pair
        const bestEnd = runwayData.bestEnd;
        const crosswind = runwayData.bestCrosswind;

        // Update bar
        const barId = runwayEnd === '05' ? 'xwind-bar-05' : 'xwind-bar-14';
        const barEl = document.getElementById(barId);
        if (barEl) {
            barEl.style.width = `${CrosswindCalculator.getBarPercentage(crosswind)}%`;
            barEl.style.backgroundColor = CrosswindCalculator.getBarColor(crosswind);
        }

        // Update value
        const valueId = runwayEnd === '05' ? 'xwind-05' : 'xwind-14';
        const valueEl = document.getElementById(valueId);
        if (valueEl) {
            valueEl.textContent = `${crosswind} KT`;
        }

        // Update status
        const statusId = runwayEnd === '05' ? 'xwind-status-05' : 'xwind-status-14';
        const statusEl = document.getElementById(statusId);
        if (statusEl) {
            const status = CrosswindCalculator.getStatus(crosswind);
            statusEl.textContent = status;
            statusEl.className = 'crosswind-status';

            if (status === '✓') {
                statusEl.style.color = 'var(--success)';
            } else if (status === '⚠') {
                statusEl.style.color = 'var(--warning)';
            } else {
                statusEl.style.color = 'var(--danger)';
            }
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AirportDiagram;
}
