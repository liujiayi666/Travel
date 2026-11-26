import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    cssCodeSplit: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        entryFileNames: "assets/js/[name]-[hash].js",
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const originalName = assetInfo.names.at(-1) ?? "";
          if (originalName.endsWith(".css")) {
            return "assets/css/[name]-[hash][extname]";
          }
          if (/\.(?:woff2?|ttf|otf)$/.test(originalName)) {
            return "assets/fonts/[name]-[hash][extname]";
          }
          if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(originalName)) {
            return "assets/images/[name]-[hash][extname]";
          }
          return "assets/media/[name]-[hash][extname]";
        },
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](?:@remix-run[\\/]|cookie-es[\\/]|react(?:-dom|-router)?[\\/]|scheduler[\\/])/,
              priority: 30,
              minSize: 0,
            },
            {
              name: "vendor-data",
              test: /node_modules[\\/](?:@tanstack[\\/]|zod[\\/]|zustand[\\/])/,
              priority: 20,
              minSize: 0,
            },
            {
              name: "vendor-misc",
              test: /node_modules[\\/]/,
              priority: 10,
              minSize: 0,
            },
          ],
        },
      },
    },
  },
});
