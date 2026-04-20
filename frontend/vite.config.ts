import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

// Build-time bundle visualiser. Off by default to keep `npm run build`
// fast and silent; flip on with `ANALYZE=1 npm run build` to get a
// treemap at `dist/stats.html`. Use this before shipping a UI feature
// that pulls in a heavy dependency to make the cost visible.
const analyze = process.env.ANALYZE === "1";

export default defineConfig({
  plugins: [
    react(),
    analyze &&
      (visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false,
      }) as PluginOption),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
