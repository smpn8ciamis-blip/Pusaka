import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { seoPagesPlugin } from "./vite.seo-pages";

export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), seoPagesPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    // Jangan hapus chunk lama saat build: tab yang masih terbuka dengan versi lama tetap bisa memuat halaman.
    // File lama dibersihkan oleh langkah deploy (lebih dari 14 hari).
    emptyOutDir: false,
    assetsDir: "assets",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "chart-vendor": ["recharts"],
          "ui-vendor": ["framer-motion", "lucide-react"],
        },
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
    include: ["pdfjs-dist"],
  },
}));
