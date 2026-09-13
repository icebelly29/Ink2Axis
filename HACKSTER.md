# Ink2Axis: Hand-Drawn CNC with Arduino UNO Q

## Project Overview

Ink2Axis turns hand-drawn sketches into CNC machine code (G-code). You do not need CAD software. You draw on a piece of paper. You use different colors for different CNC operations. You take a picture with your smartphone. The system processes the image and sends the G-code to an Arduino UNO Q. The Arduino UNO Q controls the CNC machine.

This project is for the Arduino UNO Q contest. It uses the Linux processor on the UNO Q for a web server, and the STM32 microcontroller for real-time motor control.

## Why It Is Useful

This project makes CNC manufacturing easy for everyone. Normal CNC work requires difficult CAD software. This software is too hard for children, artists, and beginners.

Ink2Axis lets you make a CNC part with only a pen and paper. It is very good for education and quick prototyping. The Arduino UNO Q makes this possible because it has a powerful Linux computer and a real-time controller on one board.

## How It Works

1. **Draw the Design:** You draw your design on paper. You put ArUco markers on the four corners of the paper.
2. **Color Codes:**
   - Blue or Black ink: Thru Cut (Cuts all the way through).
   - Red ink: Score Line (Cuts halfway through).
   - Green ink: Crease Line (Folds the material).
3. **Capture the Image:** You open the web application on your smartphone. You take a picture of the paper.
4. **Process the Image:** The smartphone sends the raw photograph to the Arduino UNO Q over WiFi. A Node.js server on the UNO Q uses OpenCV to do perspective correction, color detection, and skeletonization. It creates an SVG vector file.
5. **Generate G-Code:** A Python server on the UNO Q receives the SVG. It converts the SVG into G-code.
6. **Machine the Part:** The Python server sends the G-code to the STM32 microcontroller on the UNO Q. The microcontroller moves the CNC motors.

## Hardware Components

*   Arduino UNO Q
*   Smartphone (with a web browser and camera)
*   3-axis CNC Machine (or plotter)
*   Paper and colored markers (Blue/Black, Red, Green)
*   Printed ArUco markers

## Software Architecture

### 1. The Mobile Web App (Frontend)
The frontend uses standard HTML and JavaScript. It acts as a user interface and camera terminal. The smartphone captures the image and sends it to the Arduino UNO Q.

### 2. The Edge AI Servers (Node.js & Python)
The Arduino UNO Q has a powerful Linux environment. We run both Node.js and Python servers here to use the board's Edge AI and compute power.

*   **Node.js Vision Server:** Runs the heavy OpenCV computer vision algorithms. It detects the ArUco markers, flattens the image, separates the colors (Warp Engine & Ink Extractor), and generates vector paths.
*   **Python G-Code Server:** It hosts the frontend web application and converts the SVG paths into standard `G0` and `G1` commands.
*   It adds a `M0` pause command and a `M6` tool change command when the color changes.
*   It sends the G-code to the STM32 microcontroller via the internal serial port (`/dev/ttyRPMSG0`).

### 3. The CNC Controller (STM32 MCU)
The STM32 microcontroller runs an Arduino sketch (`uno_q_mcu.ino`). It receives the G-code strings from the Linux processor. It parses the commands and controls the stepper motors.

## Setup Instructions

### Step 1: Install the Software on Arduino UNO Q
1. Connect your Arduino UNO Q to your local network.
2. Open an SSH terminal to the board.
3. Install Python 3, Flask, Node.js, and the image processing libraries:
   ```bash
   sudo apt update
   sudo apt install python3 python3-flask python3-serial nodejs npm
   sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
   ```
4. Copy the Ink2Axis files to the board.

### Step 2: Flash the Microcontroller
1. Open the Arduino IDE.
2. Open the `uno_q_mcu/uno_q_mcu.ino` file.
3. Select the Arduino UNO Q board.
4. Compile and upload the sketch to the board.

### Step 3: Start the Server
1. In your SSH terminal, go to the Ink2Axis folder.
2. Start the Flask server:
   ```bash
   python3 uno_q_server/app.py
   ```
3. The server will start on port 5000.

### Step 4: Use the System
1. Connect your smartphone to the same WiFi network.
2. Open your smartphone browser. Go to `http://<arduino-ip-address>:5000`.
3. Draw a design with the colored markers. Put the ArUco markers on the corners.
4. Use the app to take a picture.
5. Use the lasso tool to select your drawing.
6. Click the button to process the image.
7. Click **Generate & Send G-Code to CNC**.
8. The CNC machine will start cutting.

## Conclusion

Ink2Axis shows the power of the Arduino UNO Q. It combines a Linux environment for high-level tasks (Edge AI vision processing, SVG parsing, Web server) with a real-time microcontroller for hardware control. By doing the image processing on the board using Node.js, we maximize the hardware's compute power and keep the mobile application fast and lightweight.
