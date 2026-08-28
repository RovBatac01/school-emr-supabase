/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff8ff', 100: '#dbefff', 200: '#bfe2ff', 300: '#93d0ff',
          400: '#60b3fa', 500: '#3994f0', 600: '#2477d5', 700: '#1d5fac',
          800: '#1d518f', 900: '#1e4677', 950: '#162c4a'
        },
        clinic: { teal: '#0f9f98', cyan: '#21b8d7', navy: '#153858' }
      },
      boxShadow: {
        soft: '0 12px 35px rgba(15, 23, 42, .08)',
        glow: '0 0 40px rgba(57, 148, 240, .18)'
      },
      animation: {
        float: 'float 7s ease-in-out infinite',
        pulseSoft: 'pulseSoft 3s ease-in-out infinite'
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        pulseSoft: { '0%,100%': { opacity: '.65' }, '50%': { opacity: '1' } }
      }
    }
  },
  plugins: []
};
