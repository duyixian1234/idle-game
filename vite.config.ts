import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import type { ManifestOptions } from 'vite-plugin-pwa'
import { PWA_MANIFEST } from './src/pwa-manifest'

export default defineConfig({
  base: './',
  plugins: [
    // PWA 可安装外壳（ADR-0050）：generateSW 预缓存全部构建产物 + manifest 注入
    VitePWA({
      registerType: 'autoUpdate', // skipWaiting + clientsClaim：新 SW 立即接管，下次自然刷新生效
      injectRegister: false, // 注册走 src/pwa.ts（容错铁律 + 可测），禁插件默认注入防双注册
      manifest: PWA_MANIFEST as ManifestOptions,
      workbox: {
        // 预缓存覆盖全部产物（含自托管 woff2 与图标）；hashed 静态资源默认 CacheFirst
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // HTML network-first（generateSW navigateFallback 走预缓存兜底），保证更新生效
        navigateFallback: 'index.html',
      },
      // devOptions.enabled 默认 false：开发模式不注册 SW
    }),
  ],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
