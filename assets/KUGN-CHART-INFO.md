# KUGN Airport Chart

## Option A: Download from FAA

1. Visit: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/
2. Search for: **KUGN**
3. Download: **Airport Diagram (APD)**
4. Convert PDF to PNG using online converter or:
   ```bash
   # If you have ImageMagick installed:
   convert KUGN.pdf -density 300 assets/KUGN-chart.png
   ```
5. Save as: `assets/KUGN-chart.png`

## Option B: Use FlightAware

1. Visit: https://www.flightaware.com/resources/airport/KUGN/APD/AIRPORT+DIAGRAM
2. Right-click the chart image
3. Save as: `assets/KUGN-chart.png`

## Update Code

Once you have the image, update `js/airport-diagram.js`:

```javascript
// Replace the chartUrl line with:
chartUrl: 'assets/KUGN-chart.png',

// And modify loadAirportChart() to load an image instead of PDF:
async loadAirportChart() {
    try {
        Utils.log(`Loading airport chart from ${this.chartUrl}...`, 'info');

        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.remove('hidden');
        }

        // Load as image instead of PDF
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = this.chartUrl;
        });

        // Draw image to canvas
        const ctx = this.elements.context;
        this.elements.canvas.width = img.width;
        this.elements.canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        this.pdfState.loaded = true;

        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.add('hidden');
        }

        Utils.log('Airport chart image loaded successfully', 'info');

    } catch (error) {
        Utils.log(`Chart unavailable, using windsock overlay only: ${error.message}`, 'warn');
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.classList.add('hidden');
        }
        this.drawFallbackBackground();
    }
}
```

## Current Cycle

- **Current Chart Cycle**: 2501 (January 2025)
- **Next Update**: ~January 28, 2026 (charts update every 28 days)
