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
        // bug-00047 A 案：完整回归实测可达 5 分钟，代理超时必须大于前端 benchmarkClient 的 300s，避免代理先于前端掐断
        proxyTimeout: 600_000,
        // 契约 §3 Base 为 /dev/benchmark，去前缀转发
        rewrite: (path) => path.replace(/^\/sango-bench/, ''),
      },
    },
  },
})
