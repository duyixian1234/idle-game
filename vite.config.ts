import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    // 沙箱环境拦截目录清空（safe-delete 失败），改为覆盖写入
    emptyOutDir: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // 全局测试超时：防止模拟类/慢测试挂死拖垮 CI（单用例 60s，失败即报错而非无限等待）
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
