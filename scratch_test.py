import xml.etree.ElementTree as ET
from uno_q_pipeline.gcode_compiler import GCodeCompiler

svg_string = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 775 1065" width="100%" style="display:block;">
  <style>path { fill: none; stroke-width: 0.5mm; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }</style>
  <g id="layer_bed_frame">
    <rect x="0" y="0" width="775" height="1065" fill="none" stroke="#FF00FF" stroke-width="0.5"/>
  </g>
  <g id="thru_cut">
    <path d="M 354.563,615.350 L 353.012,612.638 L 354.563,520.413" fill="none" stroke="#3b82f6" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g id="score">
    <path d="M 309.613,611.087 L 309.613,516.150" fill="none" stroke="#ef4444" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <g id="crease">
    <path d="M 416.175,658.750 L 321.625,658.750" fill="none" stroke="#22c55e" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>"""

compiler = GCodeCompiler()
gcode, path_count = compiler.compile(svg_string)

print(f"Paths extracted: {path_count}")
print(gcode)
