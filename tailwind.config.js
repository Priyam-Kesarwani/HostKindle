module.exports = {
  darkMode: 'class',
  content: ["./views/**/*.{html,ejs}", "./public/**/*.html"],
  theme: {
    extend: {
      colors: {
        primary: "hsl(var(--primary) / <alpha-value>)",
        secondary: "hsl(var(--secondary) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        neutral: "hsl(var(--neutral) / <alpha-value>)",
        "base-100": "hsl(var(--base-100) / <alpha-value>)",
        "base-200": "hsl(var(--base-200) / <alpha-value>)",
        "base-content": "hsl(var(--base-content) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['"Outfit"', "sans-serif"],
        display: ['"Calistoga"', "serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

