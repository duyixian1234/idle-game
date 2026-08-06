import { defineConfig } from '@playwright/test'

/**
 * E2E 配置：目标为构建产物（vite preview），与线上部署形态一致。
 * 运行：pnpm build && pnpm test:e2e（webServer 自动拉起 preview）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  // line reporter：每测试单行输出，比 list 紧凑，便于 CI 采集
  reporter: [['line']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
