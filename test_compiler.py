import xml.etree.ElementTree as ET
from uno_q_pipeline.gcode_compiler import GCodeCompiler

svg_string = """<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1130.0mm" height="830.0mm" viewBox="0 0 1130.0 830.0" version="1.1">
<g id="layer_bed_frame" stroke="#999999" stroke-width="0.5" fill="none">
<rect x="0" y="0" width="1130.0" height="830.0"/>
</g>
<g id="layer_thru_cut" stroke="#0000FF" stroke-width="1.0" fill="none">
<path d="M 10.0,10.0 L 100.0,10.0 L 100.0,100.0 L 10.0,10.0"/>
</g>
<g id="layer_score" stroke="#FF0000" stroke-width="1.0" fill="none">
<path d="M 20.0,20.0 L 50.0,50.0"/>
<polyline points="30,30 40,40 50,50"/>
</g>
<g id="layer_crease" stroke="#00FF00" stroke-width="1.0" fill="none">
</g>
</svg>"""

compiler = GCodeCompiler()
gcode, path_count = compiler.compile(svg_string)

print(f"Paths extracted: {path_count}")
print(gcode)
