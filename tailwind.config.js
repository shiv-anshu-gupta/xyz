/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./comtrade-combiner/**/*.{html,js}",
  ],
  darkMode: "selector",
  theme: {
    extend: {
      colors: {
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        border: "var(--border-color)",
        accent: "var(--accent-primary)",
      },
      borderRadius: {
        DEFAULT: "var(--border-radius)",
        sm: "var(--border-radius-sm)",
      },
    },
  },
};
