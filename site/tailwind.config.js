/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#08090c",
        card: "#12141c",
        cardHover: "#1b1e2a",
        accentPurple: "#8b5cf6",
        accentPurpleHover: "#a78bfa",
        accentBlue: "#0ea5e9",
        accentBlueHover: "#38bdf8",
        successGreen: "#10b981",
        warningYellow: "#f59e0b",
        dangerRed: "#ef4444",
        mutedText: "#94a3b8",
        borderDark: "#1f2937",
        borderPurple: "rgba(139, 92, 246, 0.2)",
        borderPurpleHover: "rgba(139, 92, 246, 0.4)",
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
