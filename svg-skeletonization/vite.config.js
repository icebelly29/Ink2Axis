import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'SvgSkeletonization',
      fileName: (format) => `svg-skeletonization.${format}.js`
    },
    worker: {
      format: 'es'
    }
  }
});
