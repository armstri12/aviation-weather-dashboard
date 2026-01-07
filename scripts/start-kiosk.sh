#!/bin/bash
#
# Aviation Weather Dashboard - Kiosk Mode Launcher
# Starts Chromium in fullscreen kiosk mode
#

DASHBOARD_URL="http://localhost:8080"
DISPLAY_NUM=":0"

# Set display
export DISPLAY=$DISPLAY_NUM

# Wait for X server
sleep 5

# Disable screen blanking and power management
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Hide mouse cursor after inactivity
unclutter -idle 3 -root &

# Kill any existing Chromium instances
pkill -f chromium-browser || true
sleep 2

# Clear Chromium crash flags (prevents "restore session" prompts)
CHROMIUM_DIR="/home/pi/.config/chromium"
if [ -d "$CHROMIUM_DIR/Default" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null || true
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null || true
fi

# Launch Chromium in kiosk mode
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --no-first-run \
    --fast \
    --fast-start \
    --disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies \
    --check-for-update-interval=31536000 \
    --disable-component-update \
    --disable-background-networking \
    --disable-sync \
    --disable-extensions \
    --incognito \
    "$DASHBOARD_URL" &

echo "Kiosk started at $DASHBOARD_URL"
