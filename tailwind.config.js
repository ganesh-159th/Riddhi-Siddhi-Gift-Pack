/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./admin.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#05081a",
          900: "#0a0f2c",
          800: "#0f1639",
          700: "#16204b",
        },
        gold: {
          300: "#f7df8f",
          400: "#eec44f",
          500: "#d4af37",
          600: "#b8912a",
          700: "#8f6f1f",
        },
        wine: {
          500: "#8a1c3c",
          600: "#6e1530",
          700: "#4f0e22",
        },
        whatsapp: "#25D366",
        // Admin panel palette
        cream: "#f6f2ea",
        cream2: "#efe8d8",
        ink: "#221c12",
        agold: {
          300: "#dcc274",
          400: "#c9a94f",
          500: "#b8912a",
          600: "#a37c1f",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "'Times New Roman'", "serif"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(212,175,55,0.45)",
        card: "0 24px 60px -20px rgba(0,0,0,0.6)",
        soft: "0 10px 30px -12px rgba(34,28,18,0.18)",
      },
    },
  },
  plugins: [],
};
