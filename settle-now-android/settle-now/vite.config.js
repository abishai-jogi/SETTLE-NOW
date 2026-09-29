import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        // BACKEND_PORT lets the API sit beside the Vite dev server when a
        // managed environment injects its own PORT; default stays 4000.
        target: `http://localhost:${process.env.BACKEND_PORT || 4000}`,
        changeOrigin: true,
      },
    },
  },
});
