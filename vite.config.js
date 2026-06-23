import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import wasm              from 'vite-plugin-wasm';
import topLevelAwait     from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(), 
    nodePolyfills(
      {
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }
    )
  ],

  resolve: {
    dedupe: ['chart.js'],
  },

  optimizeDeps: {
    include: [
      'chart.js',
      'react-chartjs-2',
    ],
    exclude: [
      '@zama-fhe/relayer-sdk',
    ],
  },
  build: {
    target: 'esnext',
    sourcemap: true
  },
  server: {
    allowedHosts: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy':   'same-origin',
    },
  },
});