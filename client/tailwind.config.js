/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Discord-like dark palette
        brand: {
          primary: "#5865F2",
          hover: "#4752C4",
        },
        surface: {
          lowest: "#111214",
          low: "#1E1F22",
          mid: "#2B2D31",
          high: "#313338",
          highest: "#383A40",
        },
        text: {
          normal: "#DBDEE1",
          muted: "#949BA4",
          link: "#00AFF4",
        },
        status: {
          online: "#23A55A",
          idle: "#F0B232",
          dnd: "#F23F43",
          offline: "#80848E",
        },
        danger: "#DA373C",
        success: "#23A55A",
      },
      fontFamily: {
        sans: [
          "gg sans",
          "Noto Sans",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
