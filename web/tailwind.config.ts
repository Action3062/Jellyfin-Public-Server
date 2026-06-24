import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        surface: "var(--surface)",
        elevated: "var(--elevated)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)"
      },
      borderRadius: {
        token: "var(--radius)",
        tokenLg: "var(--radius-lg)"
      },
      fontFamily: {
        sans: ["var(--font)"]
      }
    }
  },
  plugins: []
};

export default config;
