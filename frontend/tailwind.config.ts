import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary — deep indigo/violet (trust + modern), replaces the old blue.
        brand: {
          50: "#eef1ff",
          100: "#e0e4ff",
          200: "#c6ccff",
          300: "#a3a9fc",
          400: "#827ef8",
          500: "#6457f0",
          600: "#5340e0",
          700: "#4632c4",
          800: "#392c9e",
          900: "#312a7d",
          950: "#1d1849",
        },
        // Accent — teal, mixed against the indigo for a robust, non-flat feel.
        azure: "#14b8a6",
        accent: {
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.07)",
        lift: "0 12px 32px -10px rgba(16,24,40,0.18), 0 4px 12px -4px rgba(16,24,40,0.10)",
        glow: "0 0 0 1px rgba(100,87,240,0.25), 0 10px 34px -8px rgba(20,184,166,0.40)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateX(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateX(0) scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 6s ease-in-out infinite",
        "toast-in": "toast-in 0.25s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
