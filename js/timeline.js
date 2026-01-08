/**
 * Aviation Weather Dashboard - TAF Timeline Chart
 * Visualizes TAF forecast data using Chart.js
 */

const TafTimeline = {
    chart: null,
    canvas: null,
    tooltipData: [], // Store metadata for tooltips separately

    // Color mapping for flight categories
    categoryColors: {
        'VFR': 'rgba(0, 200, 83, 0.8)',
        'MVFR': 'rgba(33, 150, 243, 0.8)',
        'IFR': 'rgba(244, 67, 54, 0.8)',
        'LIFR': 'rgba(224, 64, 251, 0.8)'
    },

    /**
     * Initialize the timeline chart
     */
    init() {
        this.canvas = document.getElementById('tafTimeline');
        if (!this.canvas) {
            console.error('TAF Timeline canvas not found');
            return;
        }

        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            console.error('Chart.js library not loaded! Cannot create TAF timeline');
            return;
        }

        console.log('TAF Timeline initializing with canvas:', this.canvas);
        console.log('Canvas parent dimensions:', this.canvas.parentElement?.offsetWidth, 'x', this.canvas.parentElement?.offsetHeight);

        // Set up Chart.js defaults for dark theme
        Chart.defaults.color = '#A0AEC0';
        Chart.defaults.borderColor = 'rgba(30, 58, 95, 0.5)';

        this.createChart();
        console.log('TAF Timeline chart created successfully:', !!this.chart);
    },

    // Custom plugin to draw data labels on bars
    dataLabelPlugin: {
        id: 'tafDataLabels',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);

            if (!meta.data || meta.data.length === 0) return;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFFFFF';

            meta.data.forEach((bar, index) => {
                const data = TafTimeline.tooltipData[index];
                if (!data) return;

                const x = bar.x;
                const y = bar.y;
                const barHeight = bar.height;
                const barWidth = bar.width;

                // Only draw labels if bar is wide enough
                if (barWidth < 20) return;

                // Calculate font size based on bar width
                const fontSize = Math.min(10, Math.max(7, barWidth / 4));
                ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;

                // Draw visibility at top of bar
                if (data.visibility !== null && data.visibility !== undefined) {
                    const visStr = data.visibility === 'P6' || data.visibility >= 6 ? '6+' : String(data.visibility);
                    ctx.fillText(visStr + 'SM', x, y + 12);
                }

                // Draw wind in middle
                if (data.wind && data.wind.speed) {
                    const windStr = `${data.wind.speed}${data.wind.gust ? 'G' + data.wind.gust : ''}`;
                    ctx.fillText(windStr, x, y + barHeight / 2);
                }

                // Draw ceiling near bottom (if exists)
                if (data.ceiling) {
                    const ceilStr = data.ceiling >= 10000 ? '10k+' :
                                   data.ceiling >= 1000 ? (data.ceiling / 1000).toFixed(1) + 'k' :
                                   String(data.ceiling);
                    ctx.fillText(ceilStr, x, y + barHeight - 20);
                }

                // Draw weather phenomena at bottom
                if (data.weather && data.weather.length > 0) {
                    const wxStr = data.weather[0].substring(0, 4); // Abbreviate
                    ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
                    ctx.fillStyle = '#FFD700'; // Gold for weather
                    ctx.fillText(wxStr, x, y + barHeight - 6);
                    ctx.fillStyle = '#FFFFFF';
                }
            });

            ctx.restore();
        }
    },

    /**
     * Create the initial chart
     */
    createChart() {
        const ctx = this.canvas.getContext('2d');

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Flight Category',
                    data: [],
                    backgroundColor: [],
                    borderColor: [],
                    borderWidth: 1,
                    barPercentage: 1,
                    categoryPercentage: 1
                }]
            },
            plugins: [this.dataLabelPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'x',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                if (items.length === 0) return '';
                                const item = items[0];
                                return `${item.label}Z`;
                            },
                            label: (item) => {
                                const data = TafTimeline.tooltipData[item.dataIndex];
                                if (data) {
                                    const lines = [
                                        `Category: ${data.category}`,
                                        `Visibility: ${data.visibility || 'P6'} SM`,
                                        `Wind: ${data.windStr || 'Calm'}`
                                    ];
                                    if (data.weather && data.weather.length > 0) {
                                        lines.push(`Weather: ${data.weather.join(', ')}`);
                                    }
                                    if (data.ceiling) {
                                        lines.push(`Ceiling: ${data.ceiling} ft`);
                                    }
                                    return lines;
                                }
                                return '';
                            }
                        },
                        backgroundColor: 'rgba(19, 27, 46, 0.95)',
                        titleColor: '#00D4FF',
                        bodyColor: '#FFFFFF',
                        borderColor: '#1E3A5F',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(30, 58, 95, 0.3)',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'JetBrains Mono', monospace",
                                size: 11
                            },
                            color: '#A0AEC0'
                        }
                    },
                    y: {
                        display: false,
                        min: 0,
                        max: 1
                    }
                },
                animation: {
                    duration: 500
                }
            }
        });
    },

    /**
     * Update the timeline with TAF data
     */
    update(taf) {
        if (!this.chart || !taf) {
            console.error('TAF Timeline update failed:', { hasChart: !!this.chart, hasTaf: !!taf });
            return;
        }

        console.log('TAF Timeline updating with:', taf);
        console.log('TAF forecast array:', taf.forecast);

        const timelineData = this.generateTimelineData(taf);

        console.log('Timeline data generated:', timelineData);

        // Store tooltip data for access in tooltip callbacks
        this.tooltipData = timelineData.tooltipData;

        this.chart.data.labels = timelineData.labels;
        this.chart.data.datasets[0].data = timelineData.values;
        this.chart.data.datasets[0].backgroundColor = timelineData.colors;
        this.chart.data.datasets[0].borderColor = timelineData.borderColors;

        // Force resize to ensure canvas has proper dimensions
        this.chart.resize();
        this.chart.update();
        console.log('TAF Timeline chart updated and resized');
    },

    /**
     * Generate timeline data from TAF
     */
    generateTimelineData(taf) {
        const labels = [];
        const values = [];
        const colors = [];
        const borderColors = [];
        const tooltipData = [];

        if (!taf || !taf.forecast || taf.forecast.length === 0) {
            return { labels, values, colors, borderColors, tooltipData };
        }

        // Generate hourly slots for the next 24 hours
        const now = new Date();
        const currentHour = now.getUTCHours();

        for (let i = 0; i < 24; i++) {
            const hour = (currentHour + i) % 24;
            labels.push(String(hour).padStart(2, '0'));

            // Find applicable forecast for this hour
            const forecastGroup = this.getForecastForHour(taf, hour, i);

            if (forecastGroup) {
                const category = forecastGroup.flightCategory || 'VFR';
                colors.push(this.categoryColors[category]);
                borderColors.push(this.categoryColors[category].replace('0.8', '1'));

                // Simple numeric value for chart
                values.push(1);

                // Store detailed data for tooltip separately
                tooltipData.push({
                    category: category,
                    visibility: forecastGroup.visibility,
                    wind: forecastGroup.wind,
                    windStr: this.formatWind(forecastGroup.wind),
                    weather: forecastGroup.weather,
                    ceiling: this.getCeiling(forecastGroup.clouds),
                    type: forecastGroup.type
                });
            } else {
                // Default to VFR if no forecast
                colors.push(this.categoryColors['VFR']);
                borderColors.push(this.categoryColors['VFR'].replace('0.8', '1'));
                values.push(1);
                tooltipData.push({
                    category: 'VFR',
                    visibility: 'P6',
                    windStr: 'N/A'
                });
            }
        }

        return { labels, values, colors, borderColors, tooltipData };
    },

    /**
     * Get forecast group applicable for a given hour
     */
    getForecastForHour(taf, targetHour, hoursFromNow) {
        if (!taf.forecast || taf.forecast.length === 0) return null;

        const now = new Date();
        const targetTime = new Date(now);
        targetTime.setUTCHours(targetTime.getUTCHours() + hoursFromNow);
        const targetDay = targetTime.getUTCDate();
        targetHour = targetTime.getUTCHours();

        // Find the most applicable forecast group
        let applicableForecast = taf.forecast[0]; // Default to base forecast

        for (const group of taf.forecast) {
            if (group.from) {
                const fromDay = parseInt(group.from.substring(0, 2));
                const fromHour = parseInt(group.from.substring(2, 4));

                // Check if this group has started
                if (this.isTimeAfter(targetDay, targetHour, fromDay, fromHour)) {
                    if (group.to) {
                        const toDay = parseInt(group.to.substring(0, 2));
                        const toHour = parseInt(group.to.substring(2, 4));

                        // Check if this group is still valid
                        if (this.isTimeBefore(targetDay, targetHour, toDay, toHour)) {
                            // TEMPO and BECMG modify but don't replace
                            if (group.type === 'FM' || group.type === 'BASE') {
                                applicableForecast = group;
                            } else if (group.type === 'TEMPO' || group.type === 'BECMG') {
                                // Merge TEMPO/BECMG with base
                                applicableForecast = this.mergeForecast(applicableForecast, group);
                            }
                        }
                    } else {
                        // No end time, valid until end of TAF
                        if (group.type === 'FM') {
                            applicableForecast = group;
                        }
                    }
                }
            }
        }

        return applicableForecast;
    },

    /**
     * Check if time1 is after time2
     */
    isTimeAfter(day1, hour1, day2, hour2) {
        if (day1 > day2) return true;
        if (day1 === day2 && hour1 >= hour2) return true;
        return false;
    },

    /**
     * Check if time1 is before time2
     */
    isTimeBefore(day1, hour1, day2, hour2) {
        if (day1 < day2) return true;
        if (day1 === day2 && hour1 < hour2) return true;
        return false;
    },

    /**
     * Merge TEMPO/BECMG with base forecast
     */
    mergeForecast(base, modifier) {
        return {
            ...base,
            ...modifier,
            type: modifier.type,
            flightCategory: modifier.flightCategory || base.flightCategory,
            wind: modifier.wind.direction !== null ? modifier.wind : base.wind,
            visibility: modifier.visibility !== null ? modifier.visibility : base.visibility,
            clouds: modifier.clouds.length > 0 ? modifier.clouds : base.clouds,
            weather: modifier.weather.length > 0 ? modifier.weather : base.weather
        };
    },

    /**
     * Format wind for display
     */
    formatWind(wind) {
        if (!wind || wind.speed === null || wind.speed === 0) {
            return 'Calm';
        }

        const dir = wind.direction === 'VRB' ? 'VRB' : String(wind.direction).padStart(3, '0');
        let str = `${dir}@${wind.speed}`;

        if (wind.gust) {
            str += `G${wind.gust}`;
        }

        return str + ' KT';
    },

    /**
     * Get ceiling from cloud layers
     */
    getCeiling(clouds) {
        if (!clouds || clouds.length === 0) return null;

        for (const cloud of clouds) {
            if ((cloud.type === 'BKN' || cloud.type === 'OVC' || cloud.type === 'VV') && cloud.altitude) {
                return cloud.altitude;
            }
        }

        return null;
    },

    /**
     * Add "now" marker to chart
     */
    addNowMarker() {
        // This would add a vertical line at the current time
        // Implementation depends on Chart.js annotation plugin
    },

    /**
     * Destroy the chart
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TafTimeline;
}
