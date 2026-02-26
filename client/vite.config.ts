import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/relay": {
        target: "http://localhost:5000",
        rewrite: (path) => path.replace(/^\/relay/, ""),
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          mediasoup: ["mediasoup-client"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
});
