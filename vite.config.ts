import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 静态版（VITE_STATIC=1）用于 GitHub Pages 之类没有后端的托管：
// 用相对 base，仓库部署在子路径下也能正确加载资源。
const isStatic = process.env.VITE_STATIC === '1';

export default defineConfig({
  base: isStatic ? './' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
});
