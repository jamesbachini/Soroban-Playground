import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    // This plugin provides the polyfills for 'fs', 'buffer', etc.
    nodePolyfills({
      // You can specify which modules to polyfill. 
      // 'fs' is the one causing your error.
      include: ['fs'], 
      globals: {
        Buffer: true, // Also common to polyfill Buffer
      },
    }),
  ],
  build: {
    // Build as a library
    lib: {
      entry: 'main.js', // Your library's entry point
      name: 'MyWalletKit', // The global variable name in the browser
      fileName: 'wallet-kit-bundle', // The name of the output file
      formats: ['umd'], // 'umd' is the most compatible format for vanilla JS
    },
    rollupOptions: {
      // Don't bundle stellar-sdk, since you're loading it from a CDN
      external: ['@stellar/stellar-sdk'],
      output: {
        globals: {
          '@stellar/stellar-sdk': 'StellarSdk', // Maps the external import to the global 'StellarSdk'
        },
      },
    },
  },
});