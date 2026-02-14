#!/bin/bash
#
# Aviation Weather Dashboard - Touchscreen Installation Script
# For Raspberry Pi with Freenove FNK0078 5" Touchscreen (800x480)
#

set -e

echo "=========================================="
echo "Aviation Weather Dashboard"
echo "Touchscreen Installer (FNK0078 800x480)"
echo "=========================================="
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    echo "Continuing anyway..."
fi

# Update system
echo "[1/7] Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install required packages
echo "[2/7] Installing required packages..."
sudo apt-get install -y \
    chromium-browser \
    unclutter \
    xdotool \
    python3 \
    python3-pip \
    git \
    nginx \
    xinput

# Create application directory
echo "[3/7] Setting up application directory..."
INSTALL_DIR="/home/pi/aviation-weather-dashboard"

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory exists, backing up..."
    mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi

mkdir -p "$INSTALL_DIR"

# Copy files
echo "[4/7] Copying application files..."
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"

# Set permissions
chown -R pi:pi "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/scripts/"*.sh

# Configure display for FNK0078 (800x480)
echo "[5/7] Configuring display for FNK0078 touchscreen..."

# Add FNK0078 display config to /boot/config.txt if not already present
CONFIG_FILE="/boot/config.txt"
if [ -f "/boot/firmware/config.txt" ]; then
    CONFIG_FILE="/boot/firmware/config.txt"
fi

if ! grep -q "# FNK0078 Touchscreen Config" "$CONFIG_FILE" 2>/dev/null; then
    sudo tee -a "$CONFIG_FILE" > /dev/null <<EOF

# FNK0078 Touchscreen Config
hdmi_group=2
hdmi_mode=87
hdmi_cvt=800 480 60 6 0 0 0
hdmi_drive=1
display_rotate=0
EOF
    echo "Display configuration added to $CONFIG_FILE"
else
    echo "Display configuration already present"
fi

# Configure nginx
echo "[6/7] Configuring web server..."
sudo tee /etc/nginx/sites-available/weather-dashboard > /dev/null <<EOF
server {
    listen 8080;
    server_name localhost;

    root $INSTALL_DIR;
    index touchscreen.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/weather-dashboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Configure autostart with touchscreen kiosk
echo "[7/7] Configuring autostart..."
mkdir -p /home/pi/.config/lxsession/LXDE-pi

tee /home/pi/.config/lxsession/LXDE-pi/autostart > /dev/null <<EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 3
@/home/pi/aviation-weather-dashboard/scripts/start-kiosk.sh --touchscreen
EOF

chown -R pi:pi /home/pi/.config

echo ""
echo "=========================================="
echo "Touchscreen Installation Complete!"
echo "=========================================="
echo ""
echo "Display: Freenove FNK0078 (800x480)"
echo "Entry point: touchscreen.html"
echo ""
echo "The dashboard will start automatically on next boot."
echo "To start now: ./scripts/start-kiosk.sh --touchscreen"
echo ""
echo "Access the dashboard at: http://localhost:8080"
echo ""
echo "Reboot recommended: sudo reboot"
echo ""
