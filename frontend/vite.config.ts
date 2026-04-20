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
    // Split the three big vendor surfaces into named chunks so app-code
    // revisions don't invalidate long-lived library caches, and the
    // browser can fetch them in parallel on cold load. Everything else
    // is left to Rollup's auto-chunking — a catch-all "vendor" bucket
    // here creates a cycle with the react bucket via transitively-shared
    // deps (``use-sync-external-store`` etc.), which hurts cache shape.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("html5-qrcode") || id.includes("qrcode")) {
            return "vendor-qrcode";
          }
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("scheduler")
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
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
