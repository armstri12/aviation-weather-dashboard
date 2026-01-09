/**
 * Aviation Weather Dashboard - Airport Diagram Controller
 * Handles PDF airport chart rendering and wind visualization
 */

const AirportDiagram = {
    // Element references
    elements: {
        canvas: null,
        context: null,
        loadingIndicator: null,
        windsockOverlay: null,
        windSockGroup: null,
        windSock: null
    },

    // PDF state
    pdfState: {
        document: null,
        currentCycle: null,
        loaded: false
    },

    // Current wind state
    windState: {
        direction: 0,
        speed: 0,
        gust: null
    },

    // KUGN airport chart URL (uses latest cycle)
    // Using CORS proxy to bypass browser security restrictions
    chartUrl: 'https://corsproxy.io/?https://aeronav.faa.gov/d-tpp/2501/05324AD.PDF',

    /**
     * Initialize the airport diagram
     */
    async init() {
        Utils.log('Initializing Airport Diagram...', 'info');

        // Get element references
        this.elements.canvas = document.getElementById('chartCanvas');
        this.elements.loadingIndicator = document.getElementById('chartLoading');
        this.elements.windsockOverlay = document.getElementById('windsockOverlay');
        this.elements.windSockGroup = document.getElementById('windSockGroup');
        this.elements.windSock = document.getElementById('windSock');

        if (!this.elements.canvas) {
            Utils.log('Canvas element not found', 'error');
            return;
        }

        this.elements.context = this.elements.canvas.getContext('2d');

        // Load and render the PDF chart
        await this.loadAirportChart();

        // Initialize windsock position
        this.updateWind(0, 0);

        Utils.log('Airport Diagram initialized', 'info');
    },

    /**
     * Load the airport chart PDF and render it
     */
    async loadAirportChart() {
        try {
            Utils.log(`Loading airport chart from ${this.chartUrl}...`, 'info');

            // Show loading indicator
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.remove('hidden');
            }

            // Load the PDF
            const loadingTask = pdfjsLib.getDocument(this.chartUrl);
            this.pdfState.document = await loadingTask.promise;

            Utils.log(`PDF loaded successfully (${this.pdfState.document.numPages} pages)`, 'info');

            // Render the first page
            await this.renderPDFPage(1);

            this.pdfState.loaded = true;

            // Hide loading indicator
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.classList.add('hidden');
            }

        } catch (error) {
            Utils.log(`Failed to load airport chart: ${error.message}`, 'error');
            console.error('PDF loading error:', error);

            // Show error message
            if (this.elements.loadingIndicator) {
                const loadingText = this.elements.loadingIndicator.querySelector('p');
                if (loadingText) {
                    loadingText.textContent = 'Failed to load chart. Using fallback view.';
                }
            }
        }
    },

    /**
     * Render a specific page of the PDF to canvas
     */
    async renderPDFPage(pageNumber) {
        try {
            const page = await this.pdfState.document.getPage(pageNumber);

            // Get viewport at desired scale
            const viewport = page.getViewport({ scale: 1.5 });

            // Set canvas dimensions
            this.elements.canvas.width = viewport.width;
            this.elements.canvas.height = viewport.height;

            // Render the page
            const renderContext = {
                canvasContext: this.elements.context,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            Utils.log(`PDF page ${pageNumber} rendered successfully`, 'info');

        } catch (error) {
            Utils.log(`Failed to render PDF page: ${error.message}`, 'error');
            throw error;
        }
    },

    /**
     * Update wind arrow and sock
     * @param {number} direction - Wind direction in degrees (from)
     * @param {number} speed - Wind speed in knots
     * @param {number} gust - Gust speed in knots (optional)
     */
    updateWind(direction, speed, gust = null) {
        this.windState = { direction, speed, gust };

        // Update windsock
        if (this.elements.windSockGroup && this.elements.windSock) {
            this.updateWindSock(direction, speed);
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
     * Update wind sock appearance and position
     */
    updateWindSock(direction, speed) {
        const sockGroup = this.elements.windSockGroup;
        const sock = this.elements.windSock;
        if (!sockGroup || !sock) return;

        // Position windsock in top-right corner of overlay
        const offsetX = 320; // Position from center
        const offsetY = 80;  // Position from center
        sockGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

        // Rotate sock to show wind direction
        // Wind is reported as "from" direction, sock points where wind is blowing TO
        const rotation = direction === 'VRB' || direction === null ? 0 : (direction + 180) % 360;
        sock.setAttribute('transform', `rotate(${rotation}, 0, 0)`);

        // Scale sock based on wind speed
        // 0-5 kt: limp, 5-15 kt: partial, 15+ kt: full
        let scaleX = 0.3;
        if (speed >= 15) {
            scaleX = 1;
        } else if (speed >= 5) {
            scaleX = 0.3 + (speed - 5) * 0.07;
        }

        // Apply scale to the polygons
        const polygons = sock.querySelectorAll('polygon');
        polygons.forEach(polygon => {
            const currentTransform = polygon.getAttribute('transform') || '';
            const baseTransform = currentTransform.replace(/scaleX\([^)]*\)/g, '').trim();
            const newTransform = baseTransform ? `${baseTransform} scaleX(${scaleX})` : `scaleX(${scaleX})`;
            polygon.setAttribute('transform', newTransform);
        });

        // Change color based on wind speed and gusts
        const effectiveSpeed = this.windState.gust || speed;
        const mainPolygon = sock.querySelector('polygon');
        if (mainPolygon) {
            if (effectiveSpeed >= 25) {
                mainPolygon.setAttribute('fill', '#DC143C'); // Red for high winds
            } else if (effectiveSpeed >= 15) {
                mainPolygon.setAttribute('fill', '#FFA500'); // Orange for moderate winds
            } else {
                mainPolygon.setAttribute('fill', '#FF5722'); // Normal orange
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
