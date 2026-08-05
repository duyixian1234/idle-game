import { test, expect } from '@playwright/test'
import { dismissTutorial } from './helpers'

/**
 * 启动冒烟：页面加载不崩溃、无未捕获异常、核心 DOM 渲染齐全。
 * 覆盖线上「白屏/控制台报错」类回归。
 */

test('新游戏加载：资源条/日志/面板渲染，无未捕获异常', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')

  // 资源条：矿物/能源/科技点三项
  await expect(page.locator('[data-resource="mineral"]')).toBeVisible()
  await expect(page.locator('[data-resource="energy"]')).toBeVisible()
  await expect(page.locator('[data-resource="tech"]')).toBeVisible()

  // 面板 tab 齐全
  await expect(page.locator('.tab[data-tab="build"]')).toBeVisible()
  await expect(page.locator('.tab[data-tab="tech"]')).toBeVisible()

  // 建造面板：采矿机初始可见（成本 10，初始矿物 15 可买）
  const miner = page.locator('[data-building="miner"]')
  await expect(miner).toBeVisible()
  await expect(miner).not.toBeDisabled()

  // 日志区：开局叙事已渲染
  const logCount = await page.locator('.log-area .log-line').count()
  expect(logCount).toBeGreaterThan(0)

  // 稳定片刻后确认无未捕获异常（主循环 tick 不抛错）
  await page.waitForTimeout(1000)
  expect(pageErrors).toEqual([])
})

test('建造操作：购买采矿机后数量与日志更新', async ({ page }) => {
  await page.goto('/')
  await dismissTutorial(page)

  // 点击建造按钮（事件委托根据 [data-build] 匹配）
  await page.locator('[data-build="miner"]').click()

  // 日志出现建造反馈
  await expect(page.locator('.log-area')).toContainText('建造了 采矿机（第 1 台）')
  // 建筑数量徽章 ×1
  await expect(page.locator('[data-building="miner"] .build-count')).toHaveText('×1')
})

test('科技面板：切换 tab 渲染全部科技项', async ({ page }) => {
  await page.goto('/')
  await dismissTutorial(page)

  await page.locator('.tab[data-tab="tech"]').click()

  // 科技面板可见，且 planetDrill / solarEfficiency 两项渲染
  await expect(page.locator('[data-panel="tech"]')).toBeVisible()
  await expect(page.locator('[data-tech="planetDrill"]')).toBeVisible()
  await expect(page.locator('[data-tech="solarEfficiency"]')).toBeVisible()

  // 初始未研发：显示研发按钮（禁用态，因资源不足）
  const researchBtn = page.locator('[data-research="planetDrill"]')
  await expect(researchBtn).toBeDisabled()
})

test('重置入口：__resetGame 可清除存档回到新游戏', async ({ page }) => {
  await page.goto('/')

  await page.evaluate(async () => {
    const win = window as unknown as { __resetGame?: () => Promise<void> }
    if (win.__resetGame) await win.__resetGame()
  })

  // 回到新游戏：日志包含重置提示
  await expect(page.locator('.log-area')).toContainText('档案已抹除')
})
