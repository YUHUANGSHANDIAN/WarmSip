import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg", "brand/*.svg", "brand/*.png"],
      manifest: {
        name: "WarmSip · 给 TA 点一杯温暖",
        short_name: "WarmSip",
        lang: "zh-CN",
        description: "让每一份关心，都有温暖的落点。",
        theme_color: "#A33726",
        background_color: "#F8F3EB",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "brand/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "brand/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "brand/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 750, emptyOutDir: false },
});
