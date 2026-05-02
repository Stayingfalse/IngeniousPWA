/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ingenious: {
          bg: '#0f0e17',
          surface: '#1a1833',
          border: '#312e6b',
        },
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('portrait', '@media (orientation: portrait)')
      addVariant('landscape', '@media (orientation: landscape)')
    },
  ],
}
