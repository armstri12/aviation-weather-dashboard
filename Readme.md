# Aviation Weather Dashboard

A real-time aviation weather display optimized for Raspberry Pi, designed for VFR pilots flying out of KUGN (Waukegan National Airport).

![Dashboard Preview](docs/preview.png)

## Features

- **Real-time METAR display** with flight category (VFR/MVFR/IFR/LIFR)
- **Interactive airport diagram** with wind visualization
- **Crosswind calculator** for both runways (05/23 and 14/32)
- **TAF timeline** showing 24-hour forecast
- **Weather radar and satellite imagery**
- **VFR minimums check** for Class D airspace
- **Density altitude calculator**
- **Quick links** to aviation weather resources

## Hardware Requirements

- Raspberry Pi Zero W (or any Pi model)
- 4K Monitor (3840 x 2160 recommended)
- HDMI cable
- Power supply
- Internet connection (WiFi)

## Quick Start

### Option 1: Simple HTTP Server

```bash
# Clone the repository
git clone https://github.com/yourusername/aviation-weather-dashboard.git
cd aviation-weather-dashboard

# Start a simple HTTP server
python3 -m http.server 8080

# Open in browser: http://localhost:8080
```

### Option 2: Raspberry Pi Kiosk Mode

```bash
# Clone the repository
cd ~
git clone https://github.com/yourusername/aviation-weather-dashboard.git
cd aviation-weather-dashboard

# Run the installer
chmod +x scripts/*.sh
./scripts/install.sh

# Reboot to start in kiosk mode
sudo reboot
```

## Configuration

### Airport Settings

Edit `config/airport.json` to customize:
- Airport ICAO code
- Runway information
- VFR minimums
- Aircraft crosswind limits

### Refresh Intervals

Edit `js/api.js` to adjust:
```javascript
config: {
    metarRefreshInterval: 10 * 60 * 1000, // 10 minutes
    tafRefreshInterval: 30 * 60 * 1000,   // 30 minutes
    imageRefreshInterval: 5 * 60 * 1000,  // 5 minutes
}
```

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  KUGN           [  VFR  ]              12:45Z   00:00:00Z  │
├──────────────┬────────────────────┬─────────────────────────┤
│              │                    │                         │
│   AIRPORT    │  CURRENT           │   WEATHER               │
│   DIAGRAM    │  CONDITIONS        │   MAPS                  │
│   + WIND     │                    │                         │
│   + XWIND    │  Ceiling: 4500 ft  │   [Radar]               │
│              │  Visibility: 10 SM │   [Satellite]           │
│              │  Wind: 270° @ 12   │   [Surface]             │
│              │                    │                         │
├──────────────┴────────────────────┴─────────────────────────┤
│  TAF FORECAST TIMELINE (24 hours)                           │
│  [VFR][VFR][MVFR][IFR][IFR][MVFR][VFR][VFR][VFR]...        │
├─────────────────────────────────────────────────────────────┤
│  [GFA] [Prog Charts] [SIGMETs] [Winds] [TFRs] [NOTAMs]     │
└─────────────────────────────────────────────────────────────┘
```

## Flight Category Colors

| Category | Ceiling | Visibility | Color |
|----------|---------|------------|-------|
| VFR | > 3000 ft | > 5 sm | Green |
| MVFR | 1000-3000 ft | 3-5 sm | Blue |
| IFR | 500-1000 ft | 1-3 sm | Red |
| LIFR | < 500 ft | < 1 sm | Magenta |

## Crosswind Limits (Cessna 172S)

- **Green (✓)**: < 10 kt - Safe for students
- **Yellow (⚠)**: 10-15 kt - Max demonstrated
- **Red (✗)**: > 15 kt - Exceeds limits

## Data Sources

- **METAR/TAF**: [Aviation Weather Center](https://aviationweather.gov)
- **Radar**: [NWS Radar](https://radar.weather.gov)
- **Satellite**: [GOES-16](https://www.star.nesdis.noaa.gov)

## Troubleshooting

### CORS Errors

The dashboard uses a CORS proxy for API requests. If you experience issues:

1. Check if the proxy is accessible
2. Consider running your own proxy server
3. Use a browser extension to disable CORS (development only)

### Display Issues on Pi

```bash
# Check display resolution
tvservice -s

# Force 4K output
sudo nano /boot/config.txt
# Add: hdmi_group=2, hdmi_mode=82

# Restart
sudo reboot
```

### Chromium Crashes

```bash
# Clear Chromium cache
rm -rf ~/.config/chromium

# Restart kiosk
./scripts/stop-kiosk.sh
./scripts/start-kiosk.sh
```

## Development

### File Structure

```
aviation-weather-dashboard/
├── index.html              # Main page
├── css/
│   ├── colors.css          # Color variables
│   ├── main.css            # Layout styles
│   ├── components.css      # Component styles
│   └── animations.css      # Animations
├── js/
│   ├── app.js              # Main application
│   ├── api.js              # API handler
│   ├── metar-parser.js     # METAR parsing
│   ├── taf-parser.js       # TAF parsing
│   ├── crosswind.js        # Crosswind calculator
│   ├── airport-diagram.js  # SVG diagram
│   ├── timeline.js         # TAF chart
│   └── utils.js            # Utilities
├── config/
│   └── airport.json        # Airport configuration
└── scripts/
    ├── install.sh          # Installation script
    ├── start-kiosk.sh      # Start kiosk mode
    └── stop-kiosk.sh       # Stop kiosk mode
```

### Adding Another Airport

1. Copy and modify `config/airport.json`
2. Update runway SVG in `index.html`
3. Adjust `CrosswindCalculator.runways` in `crosswind.js`
4. Update `WeatherAPI.config.station` in `api.js`

## License

MIT License - See LICENSE file

## Acknowledgments

- Weather data from [NOAA Aviation Weather Center](https://aviationweather.gov)
- Built for the aviation community

---

**Fly safe!** ✈️
