/**
 * Aviation Weather Dashboard - Airport Diagram Controller
 * Handles SVG runway diagram and wind visualization
 */

const AirportDiagram = {
    // SVG element references
    elements: {
        svg: null,
        windArrowGroup: null,
        windLine: null,
        windSock: null
    },

    // Current wind state
    windState: {
        direction: 0,
        speed: 0,
        gust: null
    },

    /**
     * Initialize the airport diagram
     */
    init() {
        this.elements.svg = document.getElementById('runwaySvg');
        this.elements.windArrowGroup = document.getElementById('windArrowGroup');
        this.elements.windLine = document.getElementById('windLine');
        this.elements.windSock = document.getElementById('windSock');

        // Set initial state
        this.updateWind(0, 0);
    },

    /**
     * Update wind arrow and sock
     * @param {number} direction - Wind direction in degrees (from)
     * @param {number} speed - Wind speed in knots
     * @param {number} gust - Gust speed in knots (optional)
     */
    updateWind(direction, speed, gust = null) {
        this.windState = { direction, speed, gust };

        // Update wind arrow
        if (this.elements.windArrowGroup) {
            if (direction === null || direction === 'VRB') {
                // Variable wind - show spinning indicator
                this.elements.windArrowGroup.style.opacity = '0.5';
                this.animateVariableWind();
            } else {
                this.elements.windArrowGroup.style.opacity = '1';
                // Wind arrow points FROM direction, so rotate to show where wind comes from
                const rotation = direction;
                this.elements.windArrowGroup.style.transform = `rotate(${rotation}deg)`;
                this.elements.windArrowGroup.style.transformOrigin = '200px 200px';
            }
        }

        // Update wind sock
        if (this.elements.windSock) {
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

        // Scale arrow based on wind speed
        this.scaleWindArrow(speed, gust);
    },

    /**
     * Update wind sock appearance
     */
    updateWindSock(direction, speed) {
        const sock = this.elements.windSock;
        if (!sock) return;

        // Rotate sock to show wind direction
        const rotation = direction === 'VRB' || direction === null ? 0 : direction;
        sock.style.transform = `rotate(${rotation}deg)`;
        sock.style.transformOrigin = '0 0';

        // Scale sock based on wind speed
        // 0-5 kt: limp, 5-15 kt: partial, 15+ kt: full
        let scaleX = 0.3;
        if (speed >= 15) {
            scaleX = 1;
        } else if (speed >= 5) {
            scaleX = 0.3 + (speed - 5) * 0.07;
        }

        const polygon = sock.querySelector('polygon');
        if (polygon) {
            polygon.style.transform = `scaleX(${scaleX})`;
            polygon.style.transformOrigin = '0 50%';
        }

        // Adjust animation speed based on wind
        const animationDuration = speed > 0 ? Math.max(0.5, 2 - (speed * 0.05)) : 2;
        sock.style.animationDuration = `${animationDuration}s`;
    },

    /**
     * Scale wind arrow based on speed
     */
    scaleWindArrow(speed, gust = null) {
        if (!this.elements.windLine) return;

        const effectiveSpeed = gust || speed;

        // Scale arrow length: 60-120px based on wind speed
        const minLength = 60;
        const maxLength = 120;
        const length = Math.min(minLength + effectiveSpeed * 3, maxLength);

        const y2 = 200 - length;
        this.elements.windLine.setAttribute('y2', y2);

        // Change color based on speed
        if (effectiveSpeed >= 25) {
            this.elements.windLine.setAttribute('stroke', 'var(--danger)');
        } else if (effectiveSpeed >= 15) {
            this.elements.windLine.setAttribute('stroke', 'var(--warning)');
        } else {
            this.elements.windLine.setAttribute('stroke', 'var(--accent-cyan)');
        }

        // Show gust indicator
        if (gust && gust > speed) {
            this.elements.windLine.setAttribute('stroke-dasharray', '10,5');
        } else {
            this.elements.windLine.removeAttribute('stroke-dasharray');
        }
    },

    /**
     * Animate variable wind indicator
     */
    animateVariableWind() {
        if (!this.elements.windArrowGroup) return;

        let angle = 0;
        const animate = () => {
            if (this.windState.direction === 'VRB' || this.windState.direction === null) {
                angle = (angle + 2) % 360;
                this.elements.windArrowGroup.style.transform = `rotate(${angle}deg)`;
                this.elements.windArrowGroup.style.transformOrigin = '200px 200px';
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
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

        // Highlight best runway on diagram
        this.highlightRunway(recommended.runway);
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
    },

    /**
     * Highlight recommended runway on diagram
     */
    highlightRunway(runwayNumber) {
        // Remove existing highlights
        const allRunways = this.elements.svg.querySelectorAll('.runway rect');
        allRunways.forEach(rect => {
            rect.style.filter = '';
        });

        // Add highlight to recommended runway
        // This is simplified - in reality you'd highlight the specific runway
        const runwayPair = ['05', '23'].includes(runwayNumber) ? '05-23' : '14-32';
        const runwayGroup = this.elements.svg.querySelector(`.runway-${runwayPair}`);
        if (runwayGroup) {
            const rect = runwayGroup.querySelector('rect');
            if (rect) {
                rect.style.filter = 'drop-shadow(0 0 10px var(--success))';
            }
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AirportDiagram;
}
