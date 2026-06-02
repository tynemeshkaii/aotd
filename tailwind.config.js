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
        display: ['Archivo_800ExtraBold'],
        'display-semibold': ['Archivo_600SemiBold'],
        mono: ['SpaceMono_400Regular'],
        'mono-bold': ['SpaceMono_700Bold'],
        prose: ['SpaceGrotesk_400Regular'],
        'prose-medium': ['SpaceGrotesk_500Medium'],
        'prose-bold': ['SpaceGrotesk_700Bold'],
      },
    },
  },
  plugins: [],
};
