/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
      colors: {
        "surface-lowest": "#050508",
        "surface-low": "#0c0d17",
        "surface-mid": "#111228",
        "surface-high": "#16172c",
        "surface-highest": "#1e1f38",
        "brand-primary": "#7b72f0",
        "brand-hover": "#6058d8",
        "text-normal": "#c9cef0",
        "text-muted": "#4c5280",
        "text-link": "#7b72f0",
        danger: "#e05a5a",
        success: "#3fc87e",
        warning: "#c99440",
      },
    },
  },
  plugins: [],
};
