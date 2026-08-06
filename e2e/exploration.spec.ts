import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 探索系统 E2E（exploration，探索迁入一级 tab 后）。
 * 回归点：① ended 存档探索页显示派遣面板、playing 显示锁定占位；② 面板消耗预览与派遣按钮；
 * ③ 派遣成功生成记录/扣资源/倒计时显示；④ 派遣到期自动入账（结果日志播报，离线语义）。
 */

/** 构造通关后存档（v6：含探索字段），给定 expeditions 与资源 */
function buildEndedSave(now: number, expeditions: unknown[] = [], explored: { factions: string[]; planets: string[] } = { factions: [], planets: [] }) {
  return {
    schemaVersion: 6,
    seed: 42,
    rngCounters: { event: 0, conquest: 0, explore: 0 },
    phase: 'ended',
    endingTriggered: true,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    permanentBonuses: {},
    conquest: {
      outpost: { status: 'conquered' },
      shipyard: { status: 'conquered' },
      wreckage: { status: 'conquered' },
      nest: { status: 'conquered' },
    },
    achievements: {},
    stats: { totalMineralEarned: 20_000_000, explorations: 0 },
    resources: { mineral: 5_000_000, energy: 1_000_000, tech: 200_000, military: 5_000 },
    buildings: { miner: 200, solar: 40, lab: 10, militaryPort: 5 },
    upgrades: {},
    techLevels: { planetDrill: 1 },
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: true },
      ice: { unlocked: true },
      gas: { unlocked: true },
      dawn: { unlocked: true },
    },
    activePlanet: 'barren',
    expeditions,
    exploredFactions: explored.factions,
    exploredPlanets: explored.planets,
    nextExpeditionId: 1,
    factions: {
      ferro: { favor: 100, allied: true, tradeCount: 30, intimidateCount: 0, threat: 20 },
      lumen: { favor: 100, allied: true, tradeCount: 25, intimidateCount: 0, threat: 15 },
      cygnus: { favor: 100, allied: true, tradeCount: 20, intimidateCount: 0, threat: 10 },
      vox: { favor: 100, allied: true, tradeCount: 15, intimidateCount: 0, threat: 5 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: { firstBuild: true, firstAlliance: true, orbitalUnlocked: true, firstConquest: true, conquestAll: true },
    tutorialStep: -1,
    log: [{ id: 1, time: now, type: 'system' as const, text: '探索测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

/** 打开探索页（ended 档：关闭结局面板后点一级 tab） */
async function openExplore(page: import('@playwright/test').Page, save: ReturnType<typeof buildEndedSave>): Promise<void> {
  await page.goto('/')
  const schemaVersion = await seedSave(page, save)
  expect(schemaVersion).toBe(6)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  // 关闭结局面板（ended 档会显示全屏遮罩，拦截导航点击）
  const closeBtn = page.locator('[data-ending="close"]')
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  }
  await page.locator('[data-nav="explore"]').click()
}

test('通关后：探索页显示派遣面板；playing 存档显示锁定占位', async ({ page }) => {
  await page.goto('/')
  await openExplore(page, buildEndedSave(Date.now()))
  await expect(page.locator('[data-nav-page="explore"]')).toContainText('派遣探索')
  await expect(page.locator('[data-explore-dispatch]')).toBeVisible()

  // playing 存档：探索页锁定占位（🔒 + 解锁条件，无派遣按钮）
  await page.goto('/')
  const playing = buildEndedSave(Date.now())
  playing.phase = 'playing'
  playing.endingTriggered = false
  for (const f of Object.values(playing.factions as Record<string, { favor: number; allied: boolean }>)) {
    f.favor = 30
    f.allied = false
  }
  const schemaVersion = await seedSave(page, playing)
  expect(schemaVersion).toBe(6)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await page.locator('[data-nav="explore"]').click()
  await expect(page.locator('[data-nav-page="explore"]')).toContainText('通关后解锁探索')
  await expect(page.locator('[data-explore-dispatch]')).toBeHidden()
})

test('派遣探索：页面消耗预览 → 点击派遣 → 记录生成/资源扣除/倒计时', async ({ page }) => {
  await page.goto('/')
  await openExplore(page, buildEndedSave(Date.now()))

  // 探索页：状态行/消耗预览/派遣按钮可用
  const explorePage = page.locator('[data-nav-page="explore"]')
  await expect(explorePage).toContainText('探索槽空闲')
  await expect(explorePage).toContainText('消耗')
  await expect(explorePage).toContainText('40') // 兵力固定 40
  await expect(explorePage).toContainText('60 分钟')
  const dispatchBtn = page.locator('[data-explore-dispatch]')
  await expect(dispatchBtn).toBeEnabled()

  await dispatchBtn.click()

  // 启程日志 + 页面切到倒计时（单槽，按钮禁用）
  await expect(page.locator('[data-log]')).toContainText('探索队启程')
  await expect(explorePage).toContainText('返航倒计时')
  await expect(dispatchBtn).toBeDisabled()
})

test('派遣到期自动入账：结果日志播报（离线推进语义）', async ({ page }) => {
  const now = Date.now()
  // 注入已到期的派遣（finishAt 近过去，resource 结果）
  const save = buildEndedSave(now, [
    {
      id: 1,
      startedAt: now - 61 * 60_000,
      finishAt: now - 60_000,
      cost: { mineral: 90_000, energy: 45_000, military: 40 },
      result: { kind: 'resource', mineral: 67_500, tech: 450, energy: 33_750 },
      resolved: false,
    },
  ])
  await page.goto('/')
  await openExplore(page, save)

  // tick（250ms 循环）触发 settleExpeditions → 入账日志
  await expect(page.locator('[data-log]')).toContainText('探索队返航', { timeout: 10_000 })
  await expect(page.locator('[data-log]')).toContainText('回收了')
  // 单槽释放：可再次派遣
  await expect(page.locator('[data-explore-dispatch]')).toBeEnabled()
})
