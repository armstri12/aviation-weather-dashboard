/**
 * Aviation Weather Dashboard - Crosswind Calculator
 * Calculates crosswind and headwind components for runways
 */

const CrosswindCalculator = {
    // KUGN Runway Configuration
    runways: {
        '05/23': {
            name: '05/23',
            heading05: 54,
            heading23: 234,
            length: 8002,
            hasILS: true,
            primary: true
        },
        '14/32': {
            name: '14/32',
            heading14: 144,
            heading32: 324,
            length: 4000,
            hasILS: false,
            primary: false
        }
    },

    // Aircraft limitations (Cessna 172S)
    aircraft: {
        name: 'Cessna 172S',
        maxDemonstratedCrosswind: 15, // knots
        maxHeadwind: 30, // for reference
        studentLimit: 10 // recommended for students
    },

    /**
     * Calculate crosswind and headwind components
     * @param {number} windDirection - Wind direction in degrees
     * @param {number} windSpeed - Wind speed in knots
     * @param {number} runwayHeading - Runway heading in degrees
     * @returns {object} Components with crosswind and headwind values
     */
    calculate(windDirection, windSpeed, runwayHeading) {
        if (windDirection === null || windDirection === 'VRB' || windSpeed === 0) {
            return {
                crosswind: 0,
                headwind: 0,
                tailwind: 0,
                angle: 0,
                favorable: true
            };
        }

        // Calculate the angle between wind and runway
        let angle = windDirection - runwayHeading;

        // Normalize angle to -180 to 180
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;

        const angleRad = Utils.toRadians(Math.abs(angle));

        // Calculate components
        const crosswind = Math.abs(windSpeed * Math.sin(angleRad));
        const headwindComponent = windSpeed * Math.cos(angleRad);

        return {
            crosswind: Math.round(crosswind),
            headwind: headwindComponent > 0 ? Math.round(headwindComponent) : 0,
            tailwind: headwindComponent < 0 ? Math.round(Math.abs(headwindComponent)) : 0,
            angle: Math.round(angle),
            favorable: headwindComponent >= 0 // Headwind is favorable
        };
    },

    /**
     * Calculate components for all runways at KUGN
     * @param {number} windDirection - Wind direction in degrees
     * @param {number} windSpeed - Wind speed in knots
     * @param {number} gustSpeed - Gust speed in knots (optional)
     * @returns {object} Components for each runway end
     */
    calculateAll(windDirection, windSpeed, gustSpeed = null) {
        const effectiveSpeed = gustSpeed || windSpeed;
        const results = {};

        for (const [name, runway] of Object.entries(this.runways)) {
            // Calculate for both directions of each runway
            const headings = [
                { end: name.split('/')[0], heading: runway[`heading${name.split('/')[0]}`] },
                { end: name.split('/')[1], heading: runway[`heading${name.split('/')[1]}`] }
            ];

            results[name] = {
                runwayName: name,
                length: runway.length,
                hasILS: runway.hasILS,
                primary: runway.primary,
                ends: {}
            };

            for (const { end, heading } of headings) {
                const components = this.calculate(windDirection, effectiveSpeed, heading);
                results[name].ends[end] = {
                    heading,
                    ...components,
                    status: this.getStatus(components.crosswind, gustSpeed),
                    statusClass: this.getStatusClass(components.crosswind, gustSpeed)
                };
            }

            // Determine best end (one with headwind)
            const ends = Object.entries(results[name].ends);
            const bestEnd = ends.reduce((best, [endName, data]) => {
                if (data.headwind > 0 && data.tailwind === 0) {
                    if (!best || data.crosswind < results[name].ends[best].crosswind) {
                        return endName;
                    }
                }
                return best;
            }, null);

            results[name].bestEnd = bestEnd;
            results[name].bestCrosswind = bestEnd ? results[name].ends[bestEnd].crosswind :
                Math.min(...Object.values(results[name].ends).map(e => e.crosswind));
        }

        return results;
    },

    /**
     * Get recommended runway based on wind
     * @param {number} windDirection - Wind direction in degrees
     * @param {number} windSpeed - Wind speed in knots
     * @param {number} gustSpeed - Gust speed in knots (optional)
     * @returns {object} Recommended runway information
     */
    getRecommended(windDirection, windSpeed, gustSpeed = null) {
        if (windDirection === null || windDirection === 'VRB' || windSpeed === 0) {
            return {
                runway: '05', // Default to ILS runway
                reason: 'Calm winds - ILS runway recommended',
                crosswind: 0,
                safe: true
            };
        }

        const allComponents = this.calculateAll(windDirection, windSpeed, gustSpeed);
        let bestOption = null;

        for (const [name, runway] of Object.entries(allComponents)) {
            for (const [end, data] of Object.entries(runway.ends)) {
                if (data.headwind > 0 || data.tailwind === 0) {
                    if (!bestOption || data.crosswind < bestOption.crosswind) {
                        bestOption = {
                            runway: end,
                            runwayPair: name,
                            crosswind: data.crosswind,
                            headwind: data.headwind,
                            hasILS: runway.hasILS && end === '23',
                            data
                        };
                    }
                }
            }
        }

        if (!bestOption) {
            // All options have tailwind, pick lowest crosswind
            for (const [name, runway] of Object.entries(allComponents)) {
                for (const [end, data] of Object.entries(runway.ends)) {
                    if (!bestOption || data.crosswind < bestOption.crosswind) {
                        bestOption = {
                            runway: end,
                            runwayPair: name,
                            crosswind: data.crosswind,
                            tailwind: data.tailwind,
                            data
                        };
                    }
                }
            }
        }

        const effectiveSpeed = gustSpeed || windSpeed;
        const safe = bestOption.crosswind <= this.aircraft.maxDemonstratedCrosswind;
        const studentSafe = bestOption.crosswind <= this.aircraft.studentLimit;

        return {
            ...bestOption,
            safe,
            studentSafe,
            reason: this.getRecommendationReason(bestOption, effectiveSpeed)
        };
    },

    /**
     * Get human-readable recommendation reason
     */
    getRecommendationReason(option, windSpeed) {
        const parts = [];

        if (option.headwind > 0) {
            parts.push(`${option.headwind} kt headwind`);
        }
        if (option.tailwind > 0) {
            parts.push(`${option.tailwind} kt tailwind`);
        }
        if (option.crosswind > 0) {
            parts.push(`${option.crosswind} kt crosswind`);
        }
        if (option.hasILS) {
            parts.push('ILS available');
        }

        return parts.join(', ');
    },

    /**
     * Get status text for crosswind value
     */
    getStatus(crosswind, gustSpeed = null) {
        const effectiveCrosswind = crosswind;

        if (effectiveCrosswind <= this.aircraft.studentLimit) {
            return '✓';
        } else if (effectiveCrosswind <= this.aircraft.maxDemonstratedCrosswind) {
            return '⚠';
        } else {
            return '✗';
        }
    },

    /**
     * Get CSS class for status
     */
    getStatusClass(crosswind, gustSpeed = null) {
        if (crosswind <= this.aircraft.studentLimit) {
            return 'safe';
        } else if (crosswind <= this.aircraft.maxDemonstratedCrosswind) {
            return 'caution';
        } else {
            return 'danger';
        }
    },

    /**
     * Get bar fill percentage (0-100) based on crosswind
     */
    getBarPercentage(crosswind) {
        const maxDisplay = 25; // Max crosswind to display on bar
        return Math.min((crosswind / maxDisplay) * 100, 100);
    },

    /**
     * Get bar color based on crosswind
     */
    getBarColor(crosswind) {
        if (crosswind <= this.aircraft.studentLimit) {
            return 'var(--success)';
        } else if (crosswind <= this.aircraft.maxDemonstratedCrosswind) {
            return 'var(--warning)';
        } else {
            return 'var(--danger)';
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CrosswindCalculator;
}
