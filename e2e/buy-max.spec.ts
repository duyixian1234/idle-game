import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 一键买满（buy-max）E2E 冒烟：
 * 1. 买满按钮 → 确认弹窗 → 确认 → 批量结算 + 反馈日志
 * 2. Shift+点击购买按钮 → 弹窗（不直接购买）
 * 3. 取消 → 状态不变
 * 4. 清零警示（能源被清空时红字）
 */

/** 构造 v2 存档（tutorialStep=-1 跳过引导；矿物/能源充足） */
function buildSave(now: number, resources: { mineral: number; energy: number; tech: number }, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    stats: { totalMineralEarned: 0 },
    resources,
    buildings: {},
    upgrades: {},
    techLevels: {},
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: false },
      ice: { unlocked: false },
      gas: { unlocked: false },
      dawn: { unlocked: false },
    },
    activePlanet: 'barren',
    factions: {
      ferro: { favor: 20, allied: false, tradeCount: 0, intimidateCount: 0, threat: 70 },
      lumen: { favor: 25, allied: false, tradeCount: 0, intimidateCount: 0, threat: 40 },
      cygnus: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 50 },
      vox: { favor: 15, allied: false, tradeCount: 0, intimidateCount: 0, threat: 60 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: {},
    tutorialStep: -1,
    log: [{ id: 1, time: now, type: 'system' as const, text: 'buy-max 测试存档' }],
    nextLogId: 2,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
    ...extra,
  }
}

test('买满：确认弹窗展示预演数据，确认后批量结算并写日志', async ({ page }) => {
  await page.goto('/')
  await seedSave(page, buildSave(Date.now(), { mineral: 200, energy: 0, tech: 0 }))
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  // 买满按钮存在（矿物 200 可买满采矿机）
  const maxBtn = page.locator('[data-buy-max="miner"]')
  await expect(maxBtn).toBeVisible()
  await maxBtn.click()

  // 确认弹窗：标题、次数、花费、剩余、确认/取消按钮
  const overlay = page.locator('[data-overlay="buy-max"]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('买满：采矿机')
  await expect(overlay).toContainText('将购买')
  await expect(overlay).toContainText('总花费')
  await expect(overlay).toContainText('执行后剩余')
  await expect(page.locator('[data-buy-max-confirm]')).toBeVisible()

  // 确认 → 弹窗关闭、资源结算、日志写入
  await page.locator('[data-buy-max-confirm]').click()
  await expect(overlay).toBeHidden()
  await expect(page.locator('[data-log]')).toContainText('一键买满「采矿机」：购买')
  // 数量徽章出现 ×N（矿物 200 买满后必然 ≥ 6 台：10+11+13+15+17+20=86 ≤ 200）
  const countText = await page.locator('[data-building="miner"] .build-count').textContent()
  expect(countText).toMatch(/×\d+/)
})

test('Shift+点击购买按钮打开弹窗，不直接购买', async ({ page }) => {
  await page.goto('/')
  await seedSave(page, buildSave(Date.now(), { mineral: 200, energy: 0, tech: 0 }))
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  // 记录初始状态：0 台
  await expect(page.locator('[data-building="miner"] .build-count')).toHaveText('×0')

  // Shift+点击购买按钮 → 弹窗出现而非直接购买
  await page.locator('[data-build="miner"]').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-overlay="buy-max"]')).toBeVisible()
  await expect(page.locator('[data-building="miner"] .build-count')).toHaveText('×0')
})

test('取消弹窗：状态不变', async ({ page }) => {
  await page.goto('/')
  await seedSave(page, buildSave(Date.now(), { mineral: 200, energy: 0, tech: 0 }))
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  await page.locator('[data-buy-max="miner"]').click()
  await expect(page.locator('[data-overlay="buy-max"]')).toBeVisible()
  await page.locator('[data-buy-max-cancel]').click()
  await expect(page.locator('[data-overlay="buy-max"]')).toBeHidden()
  await expect(page.locator('[data-building="miner"] .build-count')).toHaveText('×0')
})

test('清零警示：能源将被清空时弹窗红字提示', async ({ page }) => {
  await page.goto('/')
  // 矿物 1000、能源 97：买满实验室恰好耗尽能源
  await seedSave(page, buildSave(Date.now(), { mineral: 1000, energy: 97, tech: 0 }))
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  await page.locator('[data-buy-max="lab"]').click()
  const overlay = page.locator('[data-overlay="buy-max"]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('买满：实验室')
  await expect(overlay).toContainText('将清空资源：能源')
  await expect(overlay.locator('[data-buy-max-warn]')).toBeVisible()
})
