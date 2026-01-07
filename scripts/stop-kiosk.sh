#!/bin/bash
#
# Aviation Weather Dashboard - Stop Kiosk
#

echo "Stopping Aviation Weather Dashboard..."

# Kill Chromium
pkill -f chromium-browser || true

# Kill unclutter
pkill -f unclutter || true

# Re-enable screen blanking
export DISPLAY=:0
xset s on 2>/dev/null || true
xset +dpms 2>/dev/null || true

echo "Dashboard stopped."
