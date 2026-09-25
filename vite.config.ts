import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 8001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // feat-A015：sango 本地 dev 评测接口（SANGO_DEV_HTTP_PORT=8787 时由 sango 进程提供）
      '/sango-bench': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        // 契约 §3 Base 为 /dev/benchmark，去前缀转发
        rewrite: (path) => path.replace(/^\/sango-bench/, ''),
      },
    },
  },
})
