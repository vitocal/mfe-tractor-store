import { defineConfig } from "vite";

import preact from "@preact/preset-vite";
import vue from "@vitejs/plugin-vue";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  appType: "mpa",
  plugins: [
    preact({ reactAliasesEnabled: true }),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.includes("-"),
        },
      },
    }),
    svelte({ compilerOptions: { customElement: true } }),
  ],
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
