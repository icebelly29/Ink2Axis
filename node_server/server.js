const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createCanvas, loadImage, ImageData } = require('canvas');

// Set up JSDOM to mock browser globals required by opencv.js and svg-skeletonization
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
global.window = dom.window;
global.document = window.document;
global.self = { 
    location: { search: '' },
    cv: require('opencv.js')
};
global.ImageData = ImageData;

// The UMD bundle exported the classes to window/self/global
const SvgSkeletonization = require('../svg-skeletonization/dist/svg-skeletonization.umd.js');
// Access WarpEngine and InkExtractor from the UMD module
// The UMD module might export an object or bind to `global.SvgSkeletonization`
const WarpEngine = SvgSkeletonization.WarpEngine || global.SvgSkeletonization?.WarpEngine || global.WarpEngine;
const InkExtractor = SvgSkeletonization.InkExtractor || global.SvgSkeletonization?.InkExtractor || global.InkExtractor;
const SvgGenerator = SvgSkeletonization.SvgGenerator || global.SvgSkeletonization?.SvgGenerator || global.SvgGenerator;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // For large base64 payloads

const upload = multer({ storage: multer.memoryStorage() });

const OUTPUT_WIDTH = 2000;
const colorProfiles = {
    thru_cut: { layer: 'thru_cut', color: '#3b82f6' },
    score: { layer: 'score', color: '#ef4444' },
    crease: { layer: 'crease', color: '#22c55e' }
};

let warpEngine, inkExtractor;

app.post('/api/warp', upload.single('image'), async (req, res) => {
    try {
        if (!warpEngine) warpEngine = new WarpEngine(OUTPUT_WIDTH);
        
        // Load image into canvas
        const img = await loadImage(req.file.buffer);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Emulate HTMLCanvasElement for the processor (it might just expect width/height and getContext)
        // Wait, WarpEngine expects a canvas to draw onto. Node-canvas implements standard canvas API.
        const outputCanvas = createCanvas(OUTPUT_WIDTH, OUTPUT_WIDTH); // Size gets resized
        const success = warpEngine.process(canvas, outputCanvas);
        
        if (!success) {
            return res.status(400).json({ error: "Could not find ArUco markers." });
        }
        
        // Return the flattened image as base64
        const dataUrl = outputCanvas.toDataURL('image/jpeg');
        res.json({ image: dataUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vectorize', async (req, res) => {
    try {
        if (!inkExtractor) inkExtractor = new InkExtractor(colorProfiles);
        
        const { imageBase64, maskBase64 } = req.body;
        
        // Load image
        const img = await loadImage(imageBase64);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Load mask (if any)
        let maskCanvas = null;
        if (maskBase64) {
            const maskImg = await loadImage(maskBase64);
            maskCanvas = createCanvas(maskImg.width, maskImg.height);
            maskCanvas.getContext('2d').drawImage(maskImg, 0, 0);
        }
        
        // Extract ink
        const layers = inkExtractor.extract(canvas, maskCanvas);
        
        // Vectorize and generate SVG
        // svg-skeletonization's SvgGenerator isn't standard, it might just be the UI layer generating it.
        // Let's assume there's a generateSvg function or we create it.
        // Wait, the UMD exports SvgGenerator.
        let svg = '';
        if (SvgGenerator) {
            svg = SvgGenerator.generate(layers, canvas.width, canvas.height);
        } else {
            // Fallback simplistic SVG generation if not exposed
            svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="100%">`;
            svg += `<style>path { fill: none; stroke-width: 0.5mm; stroke-linejoin: round; stroke-linecap: round; }</style>`;
            svg += `<g id="layer_bed_frame"><rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="none" stroke="#FF00FF" stroke-width="0.5"/></g>`;
            
            for (const profile in layers) {
                const paths = layers[profile];
                const color = colorProfiles[profile].color;
                svg += `\n<g id="${profile}">`;
                for (const path of paths) {
                    if (path.length > 1) {
                        svg += `\n<path d="M ${path[0][0]},${path[0][1]}`;
                        for (let i = 1; i < path.length; i++) {
                            svg += ` L ${path[i][0]},${path[i][1]}`;
                        }
                        svg += `" stroke="${color}"/>`;
                    }
                }
                svg += `\n</g>`;
            }
            svg += `\n</svg>`;
        }
        
        res.json({ svg });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node Vision Backend running on port ${PORT}`);
});
