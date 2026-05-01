/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // CSS-variable driven — switch between dark/light via html.light class
        bg:      "rgb(var(--c-bg)      / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        muted:   "rgb(var(--c-muted)   / <alpha-value>)",
        border:  "rgb(var(--c-border)  / <alpha-value>)",
        accent: "#4f7cff",
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
