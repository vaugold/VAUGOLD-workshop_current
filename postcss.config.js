// postcss.config.js
// ИСПРАВЛЕНО 2026-06-27: PostCSS pipeline для Tailwind (заменили CDN на сборку).
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};