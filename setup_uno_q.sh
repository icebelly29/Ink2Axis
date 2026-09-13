#!/bin/bash
# setup_uno_q.sh - Installation script for Arduino UNO Q (Debian Linux MPU)

echo "=================================================="
echo "Installing Ink2Axis Vision Engine on Arduino UNO Q"
echo "=================================================="

# Update package list and install system dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-opencv libgl1-mesa-glx v4l-utils

# Install Python requirements
pip3 install flask opencv-python numpy pyserial

echo "=================================================="
echo "Installation complete!"
echo "To start server: python3 uno_q_server/app.py"
echo "=================================================="
