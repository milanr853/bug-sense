module.exports = {
  content: [
    "./extension/**/*.{js,ts,jsx,tsx,html}",
    "./src/**/*.{html,js,ts,tsx}",
  ],
  safelist: [
    // Explicitly keep your dynamic hex color classes
    {
      pattern: /bg-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/,
    },
    {
      pattern: /hover:bg-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/,
    },
    {
      pattern: /text-(black|white)/,
    },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

