// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Явно указываем сборщику, какие расширения файлов искать в первую очередь
    extensions: ['.js', '.jsx', '.json']
  },
  esbuild: {
    // Говорим esbuild (внутреннему компилятору Vite), что мы можем использовать JSX и в .js, и в .jsx файлах
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  }
})