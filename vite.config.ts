import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages, en un dominio propio y dentro de la APK.
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono-192.png", "icono-512.png"],
      manifest: {
        name: "AulaMeet",
        short_name: "AulaMeet",
        description: "Videollamadas gratis desde el navegador",
        lang: "es",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#0f1720",
        theme_color: "#0f1720",
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png" },
          { src: "icono-512-mascara.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
