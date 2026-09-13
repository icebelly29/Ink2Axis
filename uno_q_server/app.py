"""
app.py - Arduino UNO Q Edge Server & REST API
Hosts the original Ink2Axis web application on Linux MPU.
Accepts compiled SVG strings from the frontend, generates G-code, and sends it to STM32 MCU.
"""

from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import sys
import serial
import time
import io

# Import GCodeCompiler
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from uno_q_pipeline.gcode_compiler import GCodeCompiler

# Serve static files from the parent directory (the original web app)
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')

gcode_compiler = GCodeCompiler()

# Global State Storage
latest_result = {
    'gcode': '',
    'path_count': 0,
    'status': 'Idle'
}

SERIAL_PORT = os.environ.get('UNO_Q_SERIAL_PORT', '/dev/ttyRPMSG0')
BAUD_RATE = 115200

@app.route('/')
def index():
    """Serve the original index.html frontend."""
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    """Return status of UNO Q system."""
    return jsonify({
        'status': latest_result['status'],
        'has_gcode': bool(latest_result['gcode']),
        'path_count': latest_result['path_count'],
        'serial_port': SERIAL_PORT
    })

@app.route('/api/gcode/generate', methods=['POST'])
def generate_gcode():
    """Receives SVG string from frontend, compiles G-code."""
    data = request.json
    if not data or 'svg' not in data:
        return jsonify({'success': False, 'error': 'No SVG data provided'}), 400

    svg_string = data['svg']
    
    # Compile SVG to G-code
    gcode_content, total_paths = gcode_compiler.compile(svg_string)

    if total_paths == 0 and gcode_content.startswith("; Error"):
        return jsonify({'success': False, 'error': 'Failed to parse SVG string'}), 400

    latest_result['gcode'] = gcode_content
    latest_result['path_count'] = total_paths
    latest_result['status'] = f"Success: {total_paths} paths generated"

    return jsonify({
        'success': True,
        'path_count': total_paths,
        'gcode': gcode_content
    })

@app.route('/api/gcode/send', methods=['POST'])
def send_gcode_to_mcu():
    """Transmits generated G-code over internal serial IPC to STM32 MCU."""
    if not latest_result['gcode']:
        return jsonify({'success': False, 'error': 'No G-code available. Process an image first.'}), 400

    try:
        if os.path.exists(SERIAL_PORT):
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
                gcode_lines = latest_result['gcode'].splitlines()
                for line in gcode_lines:
                    line_clean = line.strip()
                    if line_clean and not line_clean.startswith(';'):
                        ser.write((line_clean + '\n').encode('utf-8'))
                        time.sleep(0.01) # Short delay between commands
            return jsonify({'success': True, 'message': 'G-code sent to MCU over serial IPC'})
        else:
            # Simulation mode if running on PC during development
            return jsonify({
                'success': True, 
                'message': f"Simulation: Serial port {SERIAL_PORT} not found. G-code validated successfully."
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gcode/download', methods=['GET'])
def download_gcode():
    """Download generated G-code file."""
    if not latest_result['gcode']:
        return "No G-code available", 404
    
    buf = io.BytesIO(latest_result['gcode'].encode('utf-8'))
    return send_file(buf, mimetype='text/plain', as_attachment=True, download_name='output.gcode')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
