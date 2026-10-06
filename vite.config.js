import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",
  plugins: [],
  build: {
    outDir: "dist/",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
    },
  },
});
