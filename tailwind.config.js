/** @type {import('tailwindcss').Config} */
const colors = require('./theme/colors');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
