/**
 * ImageProcessor.js
 * Proxy class that communicates with the pipeline Web Worker.
 */
import PipelineWorker from './pipeline.worker.js?worker&inline';

export class ImageProcessor {
    constructor() {
        this.worker = new PipelineWorker();
        this.isReady = false;
        this.readyCallbacks = [];
        this.msgId = 0;
        this.pending = {};

        this.worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'ready') {
                this.isReady = true;
                this.readyCallbacks.forEach(cb => cb());
                this.readyCallbacks = [];
            } else if (data.type === 'result') {
                if (this.pending[data.id]) {
                    this.pending[data.id].resolve(data.result);
                    delete this.pending[data.id];
                }
            } else if (data.type === 'error') {
                if (this.pending[data.id]) {
                    this.pending[data.id].reject(new Error(data.error));
                    delete this.pending[data.id];
                }
            }
        };
    }

    onReady(callback) {
        if (this.isReady) {
            callback();
        } else {
            this.readyCallbacks.push(callback);
        }
    }

    _post(action, payload, transferables = []) {
        return new Promise((resolve, reject) => {
            const id = ++this.msgId;
            this.pending[id] = { resolve, reject };
            this.worker.postMessage({ id, action, ...payload }, transferables);
        });
    }

    _extractImageData(imageElement) {
        let w = imageElement.width || imageElement.videoWidth;
        let h = imageElement.height || imageElement.videoHeight;
        
        // If it's a canvas, it has width and height attributes directly.
        if (imageElement instanceof HTMLCanvasElement) {
            w = imageElement.width;
            h = imageElement.height;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
    }

    _createCanvasFromImageData(imgData) {
        const canvas = document.createElement('canvas');
        canvas.width = imgData.width;
        canvas.height = imgData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    async flatten(imageElement) {
        const imgData = this._extractImageData(imageElement);
        const result = await this._post('flatten', { imgData }, [imgData.data.buffer]);
        return this._createCanvasFromImageData(result.imgData);
    }

    async processFlattened(flattenedCanvas, maskCanvas = null) {
        const imgData = this._extractImageData(flattenedCanvas);
        let payload = { imgData };
        let transferables = [imgData.data.buffer];

        if (maskCanvas) {
            const maskData = this._extractImageData(maskCanvas);
            payload.maskData = maskData;
            transferables.push(maskData.data.buffer);
        }

        const result = await this._post('processFlattened', payload, transferables);
        
        const canvas = this._createCanvasFromImageData(result.imgData);
        const imageUrl = canvas.toDataURL('image/jpeg', 0.8);

        return {
            svg: result.svg,
            meta: result.meta,
            image: imageUrl
        };
    }

    async process(imageElement, maskCanvas = null) {
        const imgData = this._extractImageData(imageElement);
        let payload = { imgData };
        let transferables = [imgData.data.buffer];

        if (maskCanvas) {
            const maskData = this._extractImageData(maskCanvas);
            payload.maskData = maskData;
            transferables.push(maskData.data.buffer);
        }

        const result = await this._post('process', payload, transferables);
        
        const canvas = this._createCanvasFromImageData(result.imgData);
        const imageUrl = canvas.toDataURL('image/jpeg', 0.8);

        return {
            svg: result.svg,
            meta: result.meta,
            image: imageUrl
        };
    }
}
