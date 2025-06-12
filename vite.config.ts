import path from "node:path";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import zip from "vite-plugin-zip-pack";
import manifest from "./manifest.config.js";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { name, version } from "./package.json";

export default defineConfig({
  resolve: {
    alias: {
      "@": `${path.resolve(__dirname, "src")}`,
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
      },
    },
  },
  plugins: [
    react(),
    crx({ manifest }),
    zip({ outDir: "release", outFileName: `crx-${name}-${version}.zip` }),
    nodePolyfills({
      exclude: [],
      globals: {
        global: true,
        process: true,
        Buffer: true,
      },
    }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
