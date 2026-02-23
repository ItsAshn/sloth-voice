/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
        bg: "#0d0d0d",
        surface: "#141414",
        border: "#222",
        muted: "#555",
        dim: "#888",
        text: "#e2e2e2",
        bright: "#ffffff",
      },
    },
  },
  plugins: [],
};
