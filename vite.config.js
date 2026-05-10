import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function makeProxy(target, prefix) {
  return {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(new RegExp(`^/${prefix}`), ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        // Strip Origin/Referer — Yahoo Finance 429s cross-origin-looking requests
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('referer')
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        proxyReq.setHeader('Accept', 'application/json')
        proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9')
      })
    },
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/yf': makeProxy('https://query2.finance.yahoo.com', 'yf'),
      '/yf1': makeProxy('https://query1.finance.yahoo.com', 'yf1'),
    },
  },
})
