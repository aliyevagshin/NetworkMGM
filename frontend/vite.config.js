import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":   ["react", "react-dom", "react-router-dom"],
          "vendor-flow":    ["reactflow"],
          "vendor-charts":  ["recharts"],
          "vendor-term":    ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"],
          "vendor-ui":      ["lucide-react", "react-hot-toast", "date-fns"],
          "vendor-query":   ["@tanstack/react-query", "@tanstack/react-virtual"],
          "vendor-pdf":     ["html2canvas", "jspdf"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
