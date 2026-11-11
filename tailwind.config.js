/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Themeable palette. Every value is a CSS variable defined in
        // globals.css (:root = dark defaults, html.theme-light = overrides),
        // so existing bg-slate-900 / text-white / border-white/10 classes
        // retheme without touching component JSX. The slate ramp INVERTS in
        // light mode and "white" becomes the ink color, which flips the
        // pervasive white-alpha borders/hover tints the right way too.
        background: "var(--c-bg)",
        card: "var(--c-card)",
        cardHover: "var(--c-card-hover)",
        accentPurple: "#8b5cf6",
        accentPurpleHover: "#a78bfa",
        accentBlue: "#0ea5e9",
        accentBlueHover: "#38bdf8",
        successGreen: "#10b981",
        warningYellow: "#f59e0b",
        dangerRed: "#ef4444",
        mutedText: "var(--c-muted)",
        borderDark: "var(--c-border)",
        borderPurple: "rgba(139, 92, 246, 0.2)",
        borderPurpleHover: "rgba(139, 92, 246, 0.4)",
        white: "var(--c-white)",
        slate: {
          50: "var(--slate-50)",
          100: "var(--slate-100)",
          200: "var(--slate-200)",
          300: "var(--slate-300)",
          400: "var(--slate-400)",
          500: "var(--slate-500)",
          600: "var(--slate-600)",
          700: "var(--slate-700)",
          800: "var(--slate-800)",
          900: "var(--slate-900)",
          950: "var(--slate-950)",
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 2.5s infinite linear",
        "float": "float 3s ease-in-out infinite",
        "slide-down": "slideDown 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.5s ease-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: 0.8, boxShadow: "0 0 15px rgba(139, 92, 246, 0.4)" },
          "50%": { opacity: 1, boxShadow: "0 0 25px rgba(139, 92, 246, 0.8)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "cyber-grid": "radial-gradient(circle, rgba(139, 92, 246, 0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
