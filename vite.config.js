import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import wasm              from 'vite-plugin-wasm';
import topLevelAwait     from 'vite-plugin-top-level-await';


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),           // handles .wasm imports inside @zama-fhe/relayer-sdk/web
    topLevelAwait(), 
  ],

  resolve: {
    dedupe: ['chart.js'],
  },

  optimizeDeps: {
    include: [
      'chart.js',
      'react-chartjs-2',
    ],
    // Exclude the relayer-sdk from pre-bundling — the alias handles it,
    // and WASM packages must not be pre-bundled by Vite
    exclude: [
      '@zama-fhe/relayer-sdk',
    ],
  },
  build: {
    target: 'esnext', // required for top-level await in production build
  },
  server: {
    allowedHosts: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy':   'same-origin',
    },
  },
});