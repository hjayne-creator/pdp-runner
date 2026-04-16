/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#e0eaff",
          200: "#c7d7fe",
          300: "#a5bcfd",
          400: "#8198f9",
          500: "#6272f3",
          600: "#4d52e7",
          700: "#4040cc",
          800: "#3535a4",
          900: "#303082",
          950: "#1d1c4d",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
}
