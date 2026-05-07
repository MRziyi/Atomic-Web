import type { Config } from "tailwindcss";

/**
 * Atomic Ideation design tokens.
 * Mirrors Design_v1.md §E.2 (colors) and §E.1 (fonts).
 * Do not introduce new color or font without updating Design_v1.md.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface
        paper: "#FAF8F4",
        "bg-elev": "#FFFEFB",
        // Ink (text hierarchy)
        ink: {
          DEFAULT: "#1B1A17",
          2: "#3A3833",
          3: "#6B6760",
          4: "#A09B92",
        },
        line: "rgba(0,0,0,0.08)",
        // User colors (one per voice)
        user: {
          rose: "#D88B95",
          sage: "#8FB69C",
          ocean: "#7FA0BB",
          amber: "#D9A66A",
          violet: "#A292BF",
          clay: "#C29375",
          you: "#5C6B73", // slate, reserved for self
        },
        // Reaction edge colors (5 types — see Design_v1.md §C.5)
        reaction: {
          support: "#5BA86C",
          challenge: "#C84A3D", // sharper than demo's pink-red
          "build-on": "#5B7FB5",
          question: "#D4A93C",
          cite: "#8B6FB5",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        // Hand-drawn — used ONLY for atom titles (1-3 words), never body
        // See Design_v1.md §E.1 — replaces demo's overuse of Caveat
        hand: ["var(--font-caveat)", "cursive"],
      },
      boxShadow: {
        // Warm, subtle shadows matching paper aesthetic
        "atom-1": "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
        "atom-2": "0 2px 6px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
        "atom-lift": "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)",
      },
      animation: {
        // Floater brownian motion — used by atoms in floater zones
        "brownian-x": "brownian-x 8s ease-in-out infinite",
        "brownian-y": "brownian-y 11s ease-in-out infinite",
        "ai-breathe": "ai-breathe 4s ease-in-out infinite",
        "bubble-pulse": "bubble-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        "brownian-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(2px)" },
        },
        "brownian-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "ai-breathe": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "bubble-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
