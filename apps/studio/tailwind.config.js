/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#14171c",
        "panel-2": "#1b1f26",
        border: "#262b34",
        text: "#e7eaef",
        muted: "#8b929e",
        accent: "#f5a524",
        "accent-2": "#f97316",
        ok: "#22c55e",
        err: "#ef4444",
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
