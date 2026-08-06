import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 升级科技回归：main.ts 事件委托曾用 attr.slice(5) 读 dataset，
 * 对复合属性 data-upgrade-tech → dataset.upgradeTech（camelCase）读到 undefined，
 * 导致 dispatch 收到空 payload，升级按钮点击静默失效。
 * 本测试：预置 v2 存档（已研发 planetDrill Lv1 + 足够资源）→ 点击升级 → 断言 Lv+1。
 */

/** 构造 v2 存档：已研发 planetDrill=Lv1，资源充足可升级 */
function buildV2Save(now: number) {
  return {
    schemaVersion: 2,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    stats: { totalMineralEarned: 0 },
    resources: { mineral: 100_000, energy: 100_000, tech: 100_000 },
    buildings: { miner: 12, solar: 4, lab: 2 },
    upgrades: {},
    techLevels: { planetDrill: 1 },
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
    tutorialStep: -1, // 已跳过引导
    log: [{ id: 1, time: now, type: 'system' as const, text: 'v2 升级测试存档' }],
    nextLogId: 2,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

/** 打开页面 → 注入存档 → reload → 跳过引导 → 切科技面板 */
async function openTechPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  const schemaVersion = await seedSave(page, buildV2Save(Date.now()))
  expect(schemaVersion).toBe(2)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await page.locator('[data-tab="tech"]').click()
}

test('科技升级：点击升级按钮 Lv.1 → Lv.2，日志与徽章同步', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await openTechPanel(page)

  // 升级按钮可见且可用（资源充足）
  const upgradeBtn = page.locator('[data-upgrade-tech="planetDrill"]')
  await expect(upgradeBtn).toBeVisible()
  await expect(upgradeBtn).not.toBeDisabled()
  // 单击语义：文案含「升级 ▶」，title 注明「单击升级」
  await expect(upgradeBtn).toContainText('升级 ▶')
  expect(await upgradeBtn.getAttribute('title')).toContain('单击升级')

  // 单击升级
  await upgradeBtn.click()

  // 日志反馈（actions.ts upgradeTech.feedback）
  await expect(page.locator('[data-log]')).toContainText('科技「行星钻探」升级至 Lv.2，产出提升。')
  // 徽章从 Lv.1 → Lv.2
  await expect(page.locator('[data-tech="planetDrill"]')).toContainText('Lv.2')

  await page.waitForTimeout(500)
  expect(pageErrors).toEqual([])
})

test('科技升级：连续单击两次 → Lv.3（单次点击 = 升一级，非双击）', async ({ page }) => {
  await openTechPanel(page)

  const upgradeBtn = page.locator('[data-upgrade-tech="planetDrill"]')
  await expect(upgradeBtn).toBeVisible()

  // 两次独立单击
  await upgradeBtn.click()
  await expect(page.locator('[data-tech="planetDrill"]')).toContainText('Lv.2')
  await upgradeBtn.click()
  await expect(page.locator('[data-tech="planetDrill"]')).toContainText('Lv.3')
})
