/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  // ИСПРАВЛЕНО 2026-06-27: кастомные классы из index.html (@layer utilities)
  // Vite + PostCSS их скомпилирует.
  plugins: []
};