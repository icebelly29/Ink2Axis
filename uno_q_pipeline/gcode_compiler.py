"""
gcode_compiler.py - Standard G-code Compiler for Ink2Axis CNC Controller
Parses SVG XML strings from the Ink2Axis frontend.
Extracts vector paths from layers (thru_cut, score, crease) and outputs G0/G1 G-code.
"""

import xml.etree.ElementTree as ET
import re

class GCodeCompiler:
    def __init__(self, safe_z=5.0, home_on_complete=True):
        self.safe_z = safe_z
        self.home_on_complete = home_on_complete
        
        # Operation configurations (Z depth in mm, Feed rate in mm/min)
        self.config = {
            'thru_cut': {'z_depth': -2.0, 'feed_rate': 500, 'plunge_rate': 300, 'desc': 'Thru Cut (Blue/Black Ink)'},
            'score':    {'z_depth': -0.5, 'feed_rate': 800, 'plunge_rate': 400, 'desc': 'Score Line (Red Ink)'},
            'crease':   {'z_depth': -0.2, 'feed_rate': 1000, 'plunge_rate': 500, 'desc': 'Crease Line (Green Ink)'}
        }

    def _parse_path_d(self, d_string):
        """Parse SVG path 'd' attribute into a list of (x, y) coordinate tuples."""
        # A simple parser for 'M x y L x y L x y' format
        tokens = re.findall(r'([MLZmlz])|([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)', d_string)
        
        points = []
        current_cmd = None
        coords = []
        
        for token in tokens:
            cmd, num = token
            if cmd:
                current_cmd = cmd.upper()
            elif num:
                coords.append(float(num))
                if len(coords) == 2:
                    points.append((coords[0], coords[1]))
                    coords = []
        return points

    def compile(self, svg_string):
        """
        Compiles an SVG string into standard G-code.
        """
        # Register namespace if it exists in SVG
        ET.register_namespace('', "http://www.w3.org/2000/svg")
        
        try:
            root = ET.fromstring(svg_string)
        except ET.ParseError:
            return "; Error parsing SVG string", 0

        # Handle namespaces generically
        ns_map = {'svg': 'http://www.w3.org/2000/svg'}
        
        # Extract SVG height to invert Y axis for CNC coordinates (SVG is top-left origin, CNC is bottom-left origin)
        max_y = 1000.0 # Fallback
        view_box = root.attrib.get('viewBox', '')
        if view_box:
            try:
                parts = view_box.split()
                if len(parts) >= 4:
                    max_y = float(parts[3])
            except ValueError:
                pass
        else:
            height_attr = root.attrib.get('height', '')
            if height_attr:
                try:
                    # Remove 'mm' or 'px' if present
                    max_y = float(''.join(c for c in height_attr if c.isdigit() or c == '.'))
                except ValueError:
                    pass
        
        # Find groups by their ID
        layers = {}
        # Iterate over all <g> elements to match IDs
        for g in root.iter():
            tag = g.tag.split('}')[-1] # Remove namespace
            if tag == 'g':
                layer_id = g.attrib.get('id', '')
                # Handle both 'layer_name' and 'name' formats
                key = layer_id.replace('layer_', '')
                if key in ['thru_cut', 'score', 'crease']:
                    if key not in layers:
                        layers[key] = []
                    
                    # Extract paths inside this group
                    for path in g.iter():
                        path_tag = path.tag.split('}')[-1]
                        if path_tag == 'path' or path_tag == 'polyline':
                            d = path.attrib.get('d', '')
                            if path_tag == 'polyline':
                                # Construct a basic M.. L.. string from polyline points
                                pts = path.attrib.get('points', '').split()
                                if len(pts) > 0:
                                    d = f"M {pts[0]} " + " ".join([f"L {p}" for p in pts[1:]])
                            if d:
                                parsed_points = self._parse_path_d(d)
                                if len(parsed_points) >= 2:
                                    layers[key].append(parsed_points)


        lines = []
        
        # 1. G-code Header
        lines.append("; ==================================================")
        lines.append("; Ink2Axis CNC G-code Output for Arduino UNO Q")
        lines.append("; Units: Millimeters | Coordinate Mode: Absolute")
        lines.append("; ==================================================")
        lines.append("G21 ; Set units to millimeters")
        lines.append("G90 ; Set positioning to absolute")
        lines.append("G17 ; Select XY plane")
        lines.append(f"G0 Z{self.safe_z:.2f} ; Raise Z to safe height")
        lines.append("")

        total_paths = 0

        # 2. Process Each Layer
        tool_index = 1
        for layer_name in ['thru_cut', 'score', 'crease']:
            paths = layers.get(layer_name, [])
            if not paths:
                continue

            cfg = self.config.get(layer_name, self.config['thru_cut'])
            lines.append(f"; --- Layer: {layer_name.upper()} ({cfg['desc']}) ---")
            lines.append(f"T{tool_index} M6 ; Select tool for {layer_name.upper()}")
            lines.append("M0 ; PAUSE FOR TOOL CHANGE - Press Resume/Start to continue")
            tool_index += 1
            
            for path in paths:
                if len(path) < 2:
                    continue

                total_paths += 1
                start_x = path[0][0]
                start_y = max_y - path[0][1] # Invert Y axis

                # Rapid move to start point above material
                lines.append(f"G0 X{start_x:.2f} Y{start_y:.2f} Z{self.safe_z:.2f}")

                # Plunge tool into material
                lines.append(f"G1 Z{cfg['z_depth']:.2f} F{cfg['plunge_rate']}")

                # Linear cut along path points
                for pt in path[1:]:
                    pt_x = pt[0]
                    pt_y = max_y - pt[1] # Invert Y axis
                    lines.append(f"G1 X{pt_x:.2f} Y{pt_y:.2f} F{cfg['feed_rate']}")

                # Retract tool to safe Z height
                lines.append(f"G0 Z{self.safe_z:.2f}")
                lines.append("")

        # 3. G-code Footer
        lines.append("; --- End of Program ---")
        lines.append(f"G0 Z{self.safe_z + 5.0:.2f} ; Retract Z clear of workpiece")
        if self.home_on_complete:
            lines.append("G0 X0.00 Y0.00 ; Return to home origin")
        lines.append("M30 ; Program end")

        return "\n".join(lines), total_paths
