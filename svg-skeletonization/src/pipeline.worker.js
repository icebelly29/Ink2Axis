/**
 * pipeline.worker.js
 * Web Worker for heavy image processing (OpenCV + vectorization)
 */

import { WarpEngine } from './WarpEngine.js';
import { InkExtractor } from './InkExtractor.js';
import { SvgGenerator } from './SvgGenerator.js';

// Configuration
const OUTPUT_WIDTH = 2000;
const colorProfiles = {
    thru_cut: { layer: 'thru_cut', color: '#3b82f6' },
    score: { layer: 'score', color: '#ef4444' },
    crease: { layer: 'crease', color: '#22c55e' }
};

const warpEngine = new WarpEngine(OUTPUT_WIDTH);
const inkExtractor = new InkExtractor(colorProfiles);

// We need to load OpenCV manually in the worker context
self.importScripts('https://docs.opencv.org/4.8.0/opencv.js');

self.cv['onRuntimeInitialized'] = () => {
    self.postMessage({ type: 'ready' });
};

// Helper: Convert ImageData to OpenCV Mat (RGBA)
function imageDataToMat(imgData) {
    return self.cv.matFromImageData(imgData);
}

// Helper: Convert OpenCV Mat to ImageData
function matToImageData(mat) {
    // Ensure Mat is RGBA for ImageData compatibility
    let out = new self.cv.Mat();
    if (mat.type() === self.cv.CV_8UC1) {
        self.cv.cvtColor(mat, out, self.cv.COLOR_GRAY2RGBA);
    } else if (mat.type() === self.cv.CV_8UC3) {
        self.cv.cvtColor(mat, out, self.cv.COLOR_RGB2RGBA);
    } else {
        mat.copyTo(out);
    }
    const imgData = new ImageData(new Uint8ClampedArray(out.data), out.cols, out.rows);
    out.delete();
    return imgData;
}

// Helper to convert ImageData to Blob URL (to maintain return types)
async function imageDataToBlobUrl(imgData) {
    if (self.OffscreenCanvas) {
        const oc = new OffscreenCanvas(imgData.width, imgData.height);
        const ctx = oc.getContext('2d');
        ctx.putImageData(imgData, 0, 0);
        const blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        // NOTE: URL.createObjectURL is not always reliable in workers, or the main thread needs it.
        // Returning Blob is safer or just passing ImageData back.
        // But for Blob URL, it's better to pass the ImageData back and let the main thread do it.
    }
    return imgData; 
}


self.onmessage = async (e) => {
    const { id, action, imgData, maskData } = e.data;
    
    if (!self.cv || !self.cv.Mat) {
        self.postMessage({ type: 'error', id, error: "OpenCV is not initialized yet." });
        return;
    }

    try {
        if (action === 'flatten') {
            console.log("[Worker] Flattening Image...");
            let src = imageDataToMat(imgData);
            const warpResult = warpEngine.normalizePerspective(src, null);
            src.delete();

            if (!warpResult || !warpResult.image) {
                throw new Error("Could not detect 4 ArUco markers for bed rectangle.");
            }

            const outImgData = matToImageData(warpResult.image);
            warpResult.image.delete();

            self.postMessage({ type: 'result', id, result: { imgData: outImgData } }, [outImgData.data.buffer]);

        } else if (action === 'processFlattened') {
            console.log("[Worker] Processing Flattened Image...");
            let warpedMat = imageDataToMat(imgData);
            let warpedMask = null;
            if (maskData) {
                warpedMask = imageDataToMat(maskData);
                self.cv.cvtColor(warpedMask, warpedMask, self.cv.COLOR_RGBA2GRAY);
            }

            const layersData = inkExtractor.extractColorPaths(warpedMat, warpEngine.currentFrameConfig, warpEngine.borderSizeMm, warpedMask);
            const resultLayered = SvgGenerator.generateLayeredSvg(layersData, warpedMat.cols, warpedMat.rows, warpEngine.currentFrameConfig);
            
            const outImgData = matToImageData(warpedMat);

            warpedMat.delete();
            if (warpedMask) warpedMask.delete();

            self.postMessage({ 
                type: 'result', 
                id, 
                result: { 
                    svg: resultLayered.svg, 
                    meta: resultLayered.meta,
                    imgData: outImgData
                } 
            }, [outImgData.data.buffer]);

        } else if (action === 'process') {
            console.log("[Worker] Starting Image Processing Pipeline...");
            let src = imageDataToMat(imgData);
            let srcMask = null;
            if (maskData) {
                srcMask = imageDataToMat(maskData);
                self.cv.cvtColor(srcMask, srcMask, self.cv.COLOR_RGBA2GRAY);
            }

            const warpResult = warpEngine.normalizePerspective(src, srcMask);
            if (!warpResult || !warpResult.image) {
                src.delete();
                if (srcMask) srcMask.delete();
                throw new Error("Could not detect 4 ArUco markers for bed rectangle.");
            }

            const warpedMat = warpResult.image;
            const warpedMask = warpResult.mask;

            const layersData = inkExtractor.extractColorPaths(warpedMat, warpEngine.currentFrameConfig, warpEngine.borderSizeMm, warpedMask);
            const resultLayered = SvgGenerator.generateLayeredSvg(layersData, warpedMat.cols, warpedMat.rows, warpEngine.currentFrameConfig);
            
            const outImgData = matToImageData(warpedMat);

            src.delete();
            warpedMat.delete();
            if (srcMask) srcMask.delete();
            if (warpedMask) warpedMask.delete();

            self.postMessage({ 
                type: 'result', 
                id, 
                result: { 
                    svg: resultLayered.svg, 
                    meta: resultLayered.meta,
                    imgData: outImgData
                } 
            }, [outImgData.data.buffer]);
        }
    } catch (err) {
        console.error("[Worker Error]", err);
        self.postMessage({ type: 'error', id, error: err.message });
    }
};
