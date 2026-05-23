/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#171717',
        'surface-2': '#262626',
        text: '#fafafa',
        muted: '#737373',
        accent: '#1db954',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
