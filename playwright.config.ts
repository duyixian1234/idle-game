import { defineConfig } from '@playwright/test'

/**
 * 强制 CI 模式：本地 Windows 非 CI 下 worker 收尾会挂起
 * （"worker-0 process did not exit within 300000ms after stop"，测试结果已出但进程不退出，
 *  退出码异常拖垮 pnpm test:e2e）。CI=1 走标准退出路径，本地/CI 行为一致。
 */
if (!process.env.CI) process.env.CI = '1'

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
