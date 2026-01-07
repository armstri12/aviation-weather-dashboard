#!/bin/bash
#
# Aviation Weather Dashboard - Installation Script
# For Raspberry Pi Zero W
#

set -e

echo "=========================================="
echo "Aviation Weather Dashboard Installer"
echo "=========================================="
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    echo "Continuing anyway..."
fi

# Update system
echo "[1/6] Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install required packages
echo "[2/6] Installing required packages..."
sudo apt-get install -y \
    chromium-browser \
    unclutter \
    xdotool \
    python3 \
    python3-pip \
    git \
    nginx

# Create application directory
echo "[3/6] Setting up application directory..."
INSTALL_DIR="/home/pi/aviation-weather-dashboard"

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory exists, backing up..."
    mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi

mkdir -p "$INSTALL_DIR"

# Copy files
echo "[4/6] Copying application files..."
cp -r ../* "$INSTALL_DIR/"

# Set permissions
chown -R pi:pi "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/scripts/"*.sh

# Configure nginx
echo "[5/6] Configuring web server..."
sudo tee /etc/nginx/sites-available/weather-dashboard > /dev/null <<EOF
server {
    listen 8080;
    server_name localhost;

    root $INSTALL_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Cache static assets
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

# Configure autostart
echo "[6/6] Configuring autostart..."
mkdir -p /home/pi/.config/lxsession/LXDE-pi

tee /home/pi/.config/lxsession/LXDE-pi/autostart > /dev/null <<EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 3
@/home/pi/aviation-weather-dashboard/scripts/start-kiosk.sh
EOF

chown -R pi:pi /home/pi/.config

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "The dashboard will start automatically on next boot."
echo "To start now, run: ./scripts/start-kiosk.sh"
echo ""
echo "Access the dashboard at: http://localhost:8080"
echo ""
echo "Reboot recommended: sudo reboot"
echo ""
