/**
 * Aviation Weather Dashboard - TAF Parser
 * Parses Terminal Aerodrome Forecasts
 */

const TafParser = {
    /**
     * Parse a raw TAF string
     */
    parse(rawTaf) {
        if (!rawTaf || typeof rawTaf !== 'string') {
            return null;
        }

        const taf = {
            raw: rawTaf.trim(),
            station: null,
            issueTime: null,
            validFrom: null,
            validTo: null,
            forecast: []
        };

        // Clean up the TAF string
        let tafString = rawTaf.replace(/\s+/g, ' ').trim();

        // Remove TAF prefix if present
        if (tafString.startsWith('TAF ')) {
            tafString = tafString.substring(4);
        }

        // Remove AMD (amended) if present
        tafString = tafString.replace(/AMD\s+/, '');

        const parts = tafString.split(' ');
        let i = 0;

        // Station identifier
        if (parts[i] && /^[A-Z]{4}$/.test(parts[i])) {
            taf.station = parts[i];
            i++;
        }

        // Issue time
        if (parts[i] && /^\d{6}Z$/.test(parts[i])) {
            taf.issueTime = parts[i];
            i++;
        }

        // Validity period (DDHH/DDHH)
        if (parts[i] && /^\d{4}\/\d{4}$/.test(parts[i])) {
            const validity = parts[i].split('/');
            taf.validFrom = validity[0];
            taf.validTo = validity[1];
            i++;
        }

        // Parse forecast groups
        let currentGroup = {
            type: 'BASE',
            from: taf.validFrom,
            to: taf.validTo,
            wind: { direction: null, speed: null, gust: null },
            visibility: null,
            weather: [],
            clouds: [],
            flightCategory: 'VFR'
        };

        while (i < parts.length) {
            const part = parts[i];

            // TEMPO or BECMG or FM group
            if (part === 'TEMPO' || part === 'BECMG') {
                // Save current group
                if (currentGroup.wind.direction !== null || currentGroup.visibility !== null) {
                    currentGroup.flightCategory = this.calculateCategory(currentGroup);
                    taf.forecast.push({ ...currentGroup });
                }

                currentGroup = {
                    type: part,
                    from: null,
                    to: null,
                    wind: { direction: null, speed: null, gust: null },
                    visibility: null,
                    weather: [],
                    clouds: [],
                    flightCategory: 'VFR'
                };

                // Get time period
                if (parts[i + 1] && /^\d{4}\/\d{4}$/.test(parts[i + 1])) {
                    const period = parts[i + 1].split('/');
                    currentGroup.from = period[0];
                    currentGroup.to = period[1];
                    i++;
                }
                i++;
                continue;
            }

            // FM (From) group
            if (part.startsWith('FM') && part.length >= 6) {
                // Save current group
                if (currentGroup.wind.direction !== null || currentGroup.visibility !== null) {
                    currentGroup.flightCategory = this.calculateCategory(currentGroup);
                    taf.forecast.push({ ...currentGroup });
                }

                currentGroup = {
                    type: 'FM',
                    from: part.substring(2),
                    to: taf.validTo,
                    wind: { direction: null, speed: null, gust: null },
                    visibility: null,
                    weather: [],
                    clouds: [],
                    flightCategory: 'VFR'
                };
                i++;
                continue;
            }

            // PROB group
            if (part.startsWith('PROB')) {
                currentGroup.probability = parseInt(part.substring(4));
                i++;
                continue;
            }

            // Wind
            const windRegex = /^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/;
            if (windRegex.test(part)) {
                const match = part.match(windRegex);
                currentGroup.wind.direction = match[1] === 'VRB' ? 'VRB' : parseInt(match[1]);
                currentGroup.wind.speed = parseInt(match[2]);
                currentGroup.wind.gust = match[4] ? parseInt(match[4]) : null;
                i++;
                continue;
            }

            // Visibility
            if (part === 'P6SM' || /^\d+SM$/.test(part)) {
                currentGroup.visibility = part === 'P6SM' ? 10 : parseInt(part);
                i++;
                continue;
            }

            // Fractional visibility
            if (/^\d+\/\d+SM$/.test(part)) {
                const match = part.match(/(\d+)\/(\d+)SM/);
                currentGroup.visibility = parseInt(match[1]) / parseInt(match[2]);
                i++;
                continue;
            }

            // Weather phenomena
            const wxRegex = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;
            if (wxRegex.test(part)) {
                currentGroup.weather.push(part);
                i++;
                continue;
            }

            // NSW (No Significant Weather)
            if (part === 'NSW') {
                currentGroup.weather = [];
                i++;
                continue;
            }

            // Cloud layers
            const cloudRegex = /^(SKC|CLR|FEW|SCT|BKN|OVC|VV)(\d{3})?(CB|TCU)?$/;
            if (cloudRegex.test(part)) {
                const match = part.match(cloudRegex);
                currentGroup.clouds.push({
                    type: match[1],
                    altitude: match[2] ? parseInt(match[2]) * 100 : null,
                    modifier: match[3] || null
                });
                i++;
                continue;
            }

            i++;
        }

        // Don't forget the last group
        if (currentGroup.wind.direction !== null || currentGroup.visibility !== null || currentGroup.clouds.length > 0) {
            currentGroup.flightCategory = this.calculateCategory(currentGroup);
            taf.forecast.push(currentGroup);
        }

        return taf;
    },

    /**
     * Calculate flight category for a forecast group
     */
    calculateCategory(group) {
        let ceiling = 99999;

        for (const cloud of group.clouds) {
            if ((cloud.type === 'BKN' || cloud.type === 'OVC' || cloud.type === 'VV') && cloud.altitude !== null) {
                if (cloud.altitude < ceiling) {
                    ceiling = cloud.altitude;
                }
            }
        }

        const visibility = group.visibility || 10;
        return Utils.getFlightCategory(ceiling, visibility);
    },

    /**
     * Parse TAF from API JSON response
     */
    parseFromJson(json) {
        if (!json || !json.rawTAF) {
            return null;
        }
        return this.parse(json.rawTAF);
    },

    /**
     * Get forecast for a specific time
     */
    getForecastForTime(taf, targetTime) {
        if (!taf || !taf.forecast || taf.forecast.length === 0) {
            return null;
        }

        // Find the applicable forecast group
        // This is simplified - a full implementation would parse the time codes
        return taf.forecast[0];
    },

    /**
     * Convert TAF to timeline data for charting
     */
    toTimelineData(taf) {
        if (!taf || !taf.forecast) return [];

        const now = new Date();
        const data = [];

        for (const group of taf.forecast) {
            // Parse from/to times
            const fromTime = this.parseTime(group.from, now);
            const toTime = this.parseTime(group.to, now);

            if (fromTime && toTime) {
                data.push({
                    start: fromTime,
                    end: toTime,
                    type: group.type,
                    category: group.flightCategory,
                    wind: group.wind,
                    visibility: group.visibility,
                    weather: group.weather,
                    clouds: group.clouds,
                    probability: group.probability
                });
            }
        }

        return data;
    },

    /**
     * Parse TAF time code to Date object
     */
    parseTime(timeCode, referenceDate) {
        if (!timeCode) return null;

        const now = referenceDate || new Date();
        let day, hour;

        if (timeCode.length === 4) {
            // DDHH format
            day = parseInt(timeCode.substring(0, 2));
            hour = parseInt(timeCode.substring(2, 4));
        } else if (timeCode.length === 6) {
            // DDHHMM format (FM groups)
            day = parseInt(timeCode.substring(0, 2));
            hour = parseInt(timeCode.substring(2, 4));
        } else {
            return null;
        }

        const result = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            day,
            hour,
            0
        ));

        // Handle month rollover
        if (result < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
            result.setUTCMonth(result.getUTCMonth() + 1);
        }

        return result;
    },

    /**
     * Get summary of worst conditions in TAF
     */
    getWorstConditions(taf) {
        if (!taf || !taf.forecast) return null;

        const categoryRank = { 'LIFR': 0, 'IFR': 1, 'MVFR': 2, 'VFR': 3 };
        let worst = { category: 'VFR', rank: 3 };

        for (const group of taf.forecast) {
            const rank = categoryRank[group.flightCategory] || 3;
            if (rank < worst.rank) {
                worst = {
                    category: group.flightCategory,
                    rank,
                    group
                };
            }
        }

        return worst;
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TafParser;
}
