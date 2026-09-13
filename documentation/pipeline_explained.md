# Urumi Vision Pipeline — Step-by-Step Explanation

---

## Step 1 — ArUco Marker Detection
**Module:** `WarpEngine.normalizePerspective()`

The image is first converted to **grayscale**. OpenCV then searches for **ArUco markers** — small black-and-white square fiducial markers printed on the physical cutting frame.

The system uses the `DICT_4X4_50` dictionary. It looks for exactly **4 markers**, one at each corner of the frame (Top-Left, Top-Right, Bottom-Right, Bottom-Left).

The marker IDs tell the system which physical frame size was used:
| ID Range | Frame Size |
|---|---|
| 0–3  | 150 × 230 mm |
| 4–7  | 210 × 290 mm |
| 8–11 | 270 × 350 mm |
| 12–15 | Custom (from URL params) |

If fewer than 4 markers are found, the pipeline stops with an error.

---

## Step 2 — Perspective Warp
**Module:** `WarpEngine.normalizePerspective()`

The phone camera is never held perfectly flat above the frame. The image will always be slightly tilted or rotated. This step **fixes that distortion**.

The system uses the **center points** of the 4 detected ArUco markers as the source coordinates. It maps them to a perfect rectangle at a fixed output width (2000px). OpenCV's `warpPerspective()` applies a **homography transform** — it mathematically projects the skewed image onto a flat, top-down view.

The margins between the ArUco centers and the actual cutting area boundary are subtracted at this point, so the output image shows only the **inner drawing area** at exact physical proportions.

Output: a flat, undistorted canvas image at `2000 × N px` (where N maintains the physical aspect ratio).

---

## Step 3 — Lasso Masking 
**Module:** Lasso Tool in `app.js`

The user draws a freehand polygon or rectangle on the flattened image to select the region of interest. This removes cardboard edges and unwanted ink outside the workpiece boundary.

Internally, the drawn shape is used to generate a **binary mask canvas**:
- Pixels **inside** the selection = white (255)
- Pixels **outside** the selection = black (0)

This mask is passed alongside the flattened image into the next step.

---

## Step 4 — Ink Detection
**Module:** `InkExtractor.extractColorPaths()`

This is the most complex step. It finds all ink strokes on the image and filters out background noise (cardboard texture, shadows, etc.).

### Sub-steps:

**4a. Adaptive Threshold**
The image is blurred with a bilateral filter (preserves edges, removes noise), then `adaptiveThreshold` finds pixels that are **locally darker than their surroundings** — this catches ink lines even under uneven lighting.

**4b. Darkness Gate**
A second pass keeps only pixels with a raw grayscale value below 120. This prevents paper texture from being picked up.

**4c. Colored Ink Detection (HSV)**
The image is converted to **HSV color space** and separate masks are created for red, green, and blue hue ranges. These are combined with the dark-ink mask to capture colored marker strokes that might be too light to pass the darkness gate alone.

**4d. Noise Cleanup**
Morphological open operation (erosion then dilation with a 3×3 ellipse kernel) removes isolated speck noise.

**4e. Lasso Mask Applied**
If the user drew a selection, `bitwise_and` with the white/black mask removes everything outside the selection.

**4f. Border Exclusion**
A thin strip around the image edge is zeroed out — warping artifacts always appear at the periphery.

---

## Step 5 — Vectorization and Skeletonization
**Module:** `InkExtractor._processMaskToPaths()` → `TraceSkeleton`

The binary ink mask is now a set of thick blobs. This step converts those blobs into **thin 1-pixel-wide center lines** (skeletonization), then traces them into **polyline paths**.

### Sub-steps:

**5a. Connected Components Analysis**
OpenCV `connectedComponentsWithStats` finds all separate blobs. Very small blobs (area < 100px, span < 20px) are discarded as noise.

**5b. Geometric Shape Detection**
Before skeletonizing, the system checks each blob's convex hull. If a blob has high **circularity** (roundness > 0.75), it is stored as a perfect `<circle>`. If it has 3–8 vertices after polygon approximation, it is stored as a perfect polygon. This makes circles and rectangles clean.

**5c. Skeletonization**
The remaining irregular paths are fed into `TraceSkeleton.fromBoolArray()` — a fast thinning algorithm that reduces thick strokes to 1px center lines, then outputs them as polylines.

**5d. Path Simplification**
Raw skeletonized paths have hundreds of redundant points. **Douglas-Peucker simplification** reduces them to the minimum number of points that still represent the shape accurately. Small paths use epsilon=1.5px. Large paths use epsilon=3.0px.

---

## Step 6 — Color Classification
**Module:** `InkExtractor.extractColorPaths()` — classification loop

Each path (from Step 5) is sampled at up to 30 evenly-spaced points. At each sample point, the system reads the **original RGB color** from the warped image.

### White Balance Correction (Von Kries)
Cardboard has a warm color bias (R=180, G=140, B=100). Without correction, green ink looks red and dark inks look blue. The system finds a nearby background pixel and scales each channel by `bgAvg / bgChannel` to normalize the local white point before classifying.

### Classification Rules
| Color | Condition | Layer |
|---|---|---|
| Green | `adjG > adjR + 5` AND `bestG > bestB + 2` | `crease` |
| Blue  | `bestB > bestG + 10` AND `bestB > bestR + 5` | `thru_cut` |
| Red   | `adjR > adjG + 15` AND `adjR > adjB + 15` | `score` |
| Other | None of the above | `thru_cut` (default) |

A sliding window majority vote (window=7) smooths out noisy color transitions along a path.

---

## Step 7 — SVG Generation
**Module:** `SvgGenerator.generateLayeredSvg()`

All paths are converted from **pixel coordinates** to **millimeter coordinates** by dividing by `dotsPerMm = 2000 / cropPhysWidth`.

The SVG uses a `viewBox` that matches the physical dimensions of the cutting area in mm. SVG units = mm.

Three named layers are output:
| Layer ID | Stroke Color | Meaning |
|---|---|---|
| `thru_cut` | `#3b82f6` (blue) | Cut all the way through |
| `score` | `#ef4444` (red) | Score/perforate |
| `crease` | `#22c55e` (green) | Fold/crease line |

A magenta bed frame rectangle is also drawn at the exact physical boundary.

---

## Step 8 — Transmission
**Module:** `Communicator.sendPayload()`

The result object `{ svg, image, meta }` is sent to the desktop via a **PeerJS WebRTC data channel** as a JSON message of type `PROCESSING_COMPLETE`.

If the WebRTC connection is not open (standalone/testing mode), the payload is written to `localStorage` under the key `urumi_payload` and immediately deleted. The desktop `test_receiver.html` listens for the `storage` event and picks this up — this is the **local bridge fallback** for same-browser testing.
