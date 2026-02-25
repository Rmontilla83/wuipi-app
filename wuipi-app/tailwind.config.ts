import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        wuipi: {
          bg: "#0a0e1a",
          card: "#111827",
          "card-hover": "#1a2235",
          sidebar: "#0d1220",
          border: "#1e293b",
          accent: "#06b6d4",
          "accent-dark": "#0e7490",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
