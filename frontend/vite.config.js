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
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react") || id.includes("react-dom") || id.includes("react-router") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("reactflow") || id.includes("@reactflow")) return "vendor-flow";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-")) return "vendor-charts";
          if (id.includes("@xterm")) return "vendor-term";
          if (id.includes("html2canvas") || id.includes("jspdf")) return "vendor-pdf";
          if (id.includes("@tanstack")) return "vendor-query";
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
