import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0b0c",
        panel: "#141416",
        line: "#26262a",
        accent: "#7c5cff",
      },
    },
  },
  plugins: [],
} satisfies Config;
