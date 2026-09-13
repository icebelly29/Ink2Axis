# Arduino UNO Q Setup & Contest Deployment Guide

This guide details how to set up and run **Ink2Axis (Urumi Vision App)** on the **Arduino UNO Q** board.

---

## 1. Architecture Overview

- **Linux MPU (Qualcomm QRB2210)**:
  - Runs Debian Linux.
  - Hosts Python vision engine (`uno_q_pipeline/`).
  - Generates standard `G0` and `G1` G-code output.
  - Hosts Flask web application (`uno_q_server/app.py`).
  - Accepts image inputs from:
    1. Wired USB webcam connected directly to UNO Q USB port (`/dev/video0`).
    2. Mobile phone web browser uploads over Wi-Fi / IP.

- **MCU (STM32U585)**:
  - Runs Arduino C++ sketch (`uno_q_mcu/uno_q_mcu.ino`).
  - Reads `G0` / `G1` G-code commands over internal IPC serial (`/dev/ttyRPMSG0`).
  - Drives X and Y axis stepper motors and Z tool actuator (thru_cut, score, crease).

---

## 2. Linux MPU Installation Steps

1. Connect to the Arduino UNO Q via SSH or terminal shell:
   ```bash
   ssh arduino@uno-q.local
   ```

2. Clone or copy this repository to the board:
   ```bash
   cd ~
   git clone <repository_url> Ink2Axis
   cd Ink2Axis
   ```

3. Make the setup script executable and run it:
   ```bash
   chmod +x setup_uno_q.sh
   ./setup_uno_q.sh
   ```

4. Start the Flask server:
   ```bash
   python3 uno_q_server/app.py
   ```
   The server will start on port `5000`.

---

## 3. MCU Firmware Installation Steps

1. Open **Arduino App Lab** or **Arduino IDE**.
2. Select target board: **Arduino UNO Q (MCU / STM32U585)**.
3. Open `uno_q_mcu/uno_q_mcu.ino`.
4. Upload sketch to MCU.

---

## 4. Operational Modes

### Option A: Wired USB Webcam Operation
1. Plug a USB webcam into the Arduino UNO Q USB-A port.
2. Open `http://uno-q.local:5000` in your web browser.
3. Click **Capture USB Webcam**.
4. The system will detect ArUco markers, correct perspective, extract vector layers, generate standard `G0`/`G1` G-code, and display SVG overlay.
5. Click **Send to MCU** to execute G-code cuts on the CNC bed.

### Option B: Mobile Browser Upload Operation
1. Connect mobile phone to the same Wi-Fi network as the Arduino UNO Q.
2. Open `http://<UNO_Q_IP_ADDRESS>:5000` on mobile browser.
3. Tap **Upload Photo** and capture a photo of the 1130x830mm ArUco cutting bed.
4. View generated G-code and click **Send to MCU**.
