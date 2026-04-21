/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        surface: "#1a1d27",
        accent: "#4f7cff",
        muted: "#8892a4",
        border: "#2a2d3e",
        online: "#22c55e",
        warning: "#f59e0b",
        critical: "#ef4444",
        offline: "#ef4444",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
