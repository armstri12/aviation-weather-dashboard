#!/bin/bash
#
# Aviation Weather Dashboard - Kiosk Mode Launcher
# Starts Chromium in fullscreen kiosk mode
#
# Usage:
#   ./start-kiosk.sh                  # Standard 4K dashboard (index.html)
#   ./start-kiosk.sh --touchscreen    # FNK0078 800x480 touchscreen (touchscreen.html)
#

DISPLAY_NUM=":0"
TOUCHSCREEN_MODE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --touchscreen)
            TOUCHSCREEN_MODE=true
            ;;
    esac
done

# Set URL based on mode
if [ "$TOUCHSCREEN_MODE" = true ]; then
    DASHBOARD_URL="http://localhost:8080/touchscreen.html"
    echo "Starting in TOUCHSCREEN mode (800x480)"
else
    DASHBOARD_URL="http://localhost:8080"
    echo "Starting in STANDARD mode (4K)"
fi

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

# Build Chromium flags
CHROMIUM_FLAGS=(
    --kiosk
    --noerrdialogs
    --disable-infobars
    --disable-translate
    --disable-features=TranslateUI
    --disable-session-crashed-bubble
    --disable-restore-session-state
    --no-first-run
    --fast
    --fast-start
    --disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies
    --check-for-update-interval=31536000
    --disable-component-update
    --disable-background-networking
    --disable-sync
    --disable-extensions
    --incognito
)

# Add touchscreen-specific flags
if [ "$TOUCHSCREEN_MODE" = true ]; then
    CHROMIUM_FLAGS+=(
        --window-size=800,480
        --window-position=0,0
        --touch-events=enabled
        --enable-touch-drag-drop
        --disable-pinch
        --overscroll-history-navigation=0
    )
fi

# Launch Chromium in kiosk mode
chromium-browser "${CHROMIUM_FLAGS[@]}" "$DASHBOARD_URL" &

echo "Kiosk started at $DASHBOARD_URL"
