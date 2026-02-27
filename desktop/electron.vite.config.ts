import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@": path.resolve("src/renderer/src"),
        "@sloth-voice/shared": path.resolve("../packages/shared/src"),
        // Anchor axios to desktop's node_modules so files in packages/shared/ resolve it correctly
        axios: path.resolve("node_modules/axios"),
      },
    },
    css: {
      postcss: {
        plugins: [
          tailwindcss({ config: path.resolve("tailwind.config.js") }),
          autoprefixer(),
        ],
      },
    },
    plugins: [react()],
  },
});
