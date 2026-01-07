/**
 * Aviation Weather Dashboard - METAR Parser
 * Parses raw METAR strings into structured data
 */

const MetarParser = {
    /**
     * Parse a raw METAR string
     */
    parse(rawMetar) {
        if (!rawMetar || typeof rawMetar !== 'string') {
            return null;
        }

        const metar = {
            raw: rawMetar.trim(),
            station: null,
            time: null,
            isAuto: false,
            wind: {
                direction: null,
                speed: null,
                gust: null,
                variable: false,
                variableFrom: null,
                variableTo: null
            },
            visibility: null,
            visibilityMeters: null,
            rvr: [],
            weather: [],
            clouds: [],
            temperature: null,
            dewpoint: null,
            altimeter: null,
            remarks: null,
            flightCategory: 'VFR',
            ceiling: Infinity
        };

        const parts = rawMetar.trim().split(/\s+/);
        let i = 0;

        // Station identifier
        if (parts[i] && /^[A-Z]{4}$/.test(parts[i])) {
            metar.station = parts[i];
            i++;
        }

        // Observation time (DDHHMM)Z
        if (parts[i] && /^\d{6}Z$/.test(parts[i])) {
            metar.time = parts[i].replace('Z', '');
            metar.observationTime = Utils.parseMetarTime(metar.time);
            i++;
        }

        // AUTO indicator
        if (parts[i] === 'AUTO') {
            metar.isAuto = true;
            i++;
        }

        // Wind
        const windRegex = /^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/;
        if (parts[i] && windRegex.test(parts[i])) {
            const match = parts[i].match(windRegex);
            metar.wind.direction = match[1] === 'VRB' ? 'VRB' : parseInt(match[1]);
            metar.wind.speed = parseInt(match[2]);
            metar.wind.gust = match[4] ? parseInt(match[4]) : null;
            metar.wind.variable = match[1] === 'VRB';
            i++;
        }

        // Variable wind direction (e.g., 180V240)
        const variableWindRegex = /^(\d{3})V(\d{3})$/;
        if (parts[i] && variableWindRegex.test(parts[i])) {
            const match = parts[i].match(variableWindRegex);
            metar.wind.variableFrom = parseInt(match[1]);
            metar.wind.variableTo = parseInt(match[2]);
            i++;
        }

        // Visibility
        // US format: SM (statute miles)
        const visRegex = /^(\d+)?\s*((\d+)\/(\d+))?SM$/;
        const visSimpleRegex = /^(\d+)SM$/;
        const visPlusRegex = /^P6SM$/;

        if (parts[i] === 'P6SM' || parts[i] === '10SM') {
            metar.visibility = 10;
            i++;
        } else if (parts[i] && visSimpleRegex.test(parts[i])) {
            const match = parts[i].match(visSimpleRegex);
            metar.visibility = parseInt(match[1]);
            i++;
        } else if (parts[i] && parts[i + 1] && /^\d+$/.test(parts[i]) && /^\d+\/\d+SM$/.test(parts[i + 1])) {
            // Mixed number visibility (e.g., "1 1/2SM")
            const whole = parseInt(parts[i]);
            const fracMatch = parts[i + 1].match(/(\d+)\/(\d+)SM/);
            metar.visibility = whole + (parseInt(fracMatch[1]) / parseInt(fracMatch[2]));
            i += 2;
        } else if (parts[i] && /^\d+\/\d+SM$/.test(parts[i])) {
            const match = parts[i].match(/(\d+)\/(\d+)SM/);
            metar.visibility = parseInt(match[1]) / parseInt(match[2]);
            i++;
        }

        // RVR (Runway Visual Range)
        while (parts[i] && /^R\d+/.test(parts[i])) {
            metar.rvr.push(parts[i]);
            i++;
        }

        // Weather phenomena
        const wxRegex = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;
        while (parts[i] && wxRegex.test(parts[i])) {
            metar.weather.push(parts[i]);
            i++;
        }

        // Cloud layers
        const cloudRegex = /^(SKC|CLR|FEW|SCT|BKN|OVC|VV)(\d{3})?(CB|TCU)?$/;
        while (parts[i] && cloudRegex.test(parts[i])) {
            const match = parts[i].match(cloudRegex);
            const cloud = {
                type: match[1],
                altitude: match[2] ? parseInt(match[2]) * 100 : null,
                modifier: match[3] || null
            };
            metar.clouds.push(cloud);

            // Calculate ceiling (lowest BKN, OVC, or VV)
            if ((match[1] === 'BKN' || match[1] === 'OVC' || match[1] === 'VV') && cloud.altitude !== null) {
                if (cloud.altitude < metar.ceiling) {
                    metar.ceiling = cloud.altitude;
                }
            }
            i++;
        }

        // If no ceiling found, set to infinity (unlimited)
        if (metar.ceiling === Infinity) {
            metar.ceiling = 99999;
        }

        // Temperature/Dewpoint
        const tempRegex = /^(M?\d{2})\/(M?\d{2})$/;
        if (parts[i] && tempRegex.test(parts[i])) {
            const match = parts[i].match(tempRegex);
            metar.temperature = this.parseTemp(match[1]);
            metar.dewpoint = this.parseTemp(match[2]);
            i++;
        }

        // Altimeter
        const altRegex = /^A(\d{4})$/;
        if (parts[i] && altRegex.test(parts[i])) {
            const match = parts[i].match(altRegex);
            metar.altimeter = parseInt(match[1]) / 100;
            i++;
        }

        // Remarks
        const remarksIndex = rawMetar.indexOf('RMK');
        if (remarksIndex !== -1) {
            metar.remarks = rawMetar.substring(remarksIndex + 4).trim();
        }

        // Calculate flight category
        metar.flightCategory = Utils.getFlightCategory(metar.ceiling, metar.visibility || 10);

        return metar;
    },

    /**
     * Parse temperature string (handles M prefix for negative)
     */
    parseTemp(tempStr) {
        if (!tempStr) return null;
        const isNegative = tempStr.startsWith('M');
        const value = parseInt(tempStr.replace('M', ''));
        return isNegative ? -value : value;
    },

    /**
     * Parse METAR from API JSON response
     */
    parseFromJson(json) {
        if (!json || !json.rawOb) {
            return null;
        }

        // Parse the raw METAR string
        const metar = this.parse(json.rawOb);

        // Enhance with API data if available
        if (metar && json) {
            if (json.temp !== undefined) metar.temperature = json.temp;
            if (json.dewp !== undefined) metar.dewpoint = json.dewp;
            if (json.wdir !== undefined) metar.wind.direction = json.wdir;
            if (json.wspd !== undefined) metar.wind.speed = json.wspd;
            if (json.wgst !== undefined) metar.wind.gust = json.wgst;
            if (json.visib !== undefined) metar.visibility = json.visib;
            if (json.altim !== undefined) metar.altimeter = json.altim;
            if (json.fltcat !== undefined) metar.flightCategory = json.fltcat;
        }

        return metar;
    },

    /**
     * Format wind for display
     */
    formatWind(wind) {
        if (!wind || wind.speed === null) {
            return 'Calm';
        }

        if (wind.speed === 0) {
            return 'Calm';
        }

        const dir = wind.variable ? 'VRB' : String(wind.direction).padStart(3, '0');
        let result = `${dir}° @ ${wind.speed}`;

        if (wind.gust) {
            result += `G${wind.gust}`;
        }

        return result;
    },

    /**
     * Get ceiling description
     */
    getCeilingDescription(metar) {
        if (!metar.clouds || metar.clouds.length === 0) {
            return 'Clear';
        }

        const ceilingLayer = metar.clouds.find(c =>
            c.type === 'BKN' || c.type === 'OVC' || c.type === 'VV'
        );

        if (!ceilingLayer) {
            return 'Clear';
        }

        return `${Utils.decodeCloudType(ceilingLayer.type)} ${ceilingLayer.altitude}`;
    },

    /**
     * Get weather description
     */
    getWeatherDescription(metar) {
        if (!metar.weather || metar.weather.length === 0) {
            if (metar.clouds.length === 0 || metar.clouds[0].type === 'CLR' || metar.clouds[0].type === 'SKC') {
                return 'Clear';
            }
            return 'No Significant Weather';
        }

        return metar.weather.map(wx => Utils.decodeWeather(wx)).join(', ');
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetarParser;
}
