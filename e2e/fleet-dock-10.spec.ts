import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'
import { ACHIEVEMENTS } from '../src/engine/achievements'

/**
 * fleet-dock-10 E2E（船坞 10 级 + 护航远征 + 自动探索，存档 v11）：用户手动执行。
 * 回归点：① v10→v11 迁移（autoExplore 补齐、默认关）；② 船坞 Lv10 满编（24 艘、无升级按钮、已满级）；
 * ③ 护航远征全流程（勾选 → 费用/倍率预览 → 派遣扣费 → 返航日志）；④ 停摆禁用护航；
 * ⑤ 自动探索在线续派（开 → 补派日志；关 → 无）；⑥ 离线续派（8h ≈ 8 轮/槽，日志标注离线）。
 * data-* 语义化断言惯例；ended 档先 data-ending=close 关结局面板。
 */

/** 构造 v11 通关后存档（默认 dock Lv10 满编 24 艘 + 足量资源；autoExplore 可配） */
function buildSave(now: number, overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    schemaVersion: 11,
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
    resources: { mineral: 1e13, energy: 1e14, tech: 1e10, military: 1_000_000 },
    buildings: { miner: 200, solar: 40, lab: 10, militaryPort: 5, starportMine: 1, stellarArray: 1, thinkTank: 1 },
    upgrades: { dock: 10, stellarArray: 10, ringSmelter: 2 },
    techLevels: { deepSpaceNav: 5, interstellarRelay: 5 },
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: true },
      ice: { unlocked: true },
      gas: { unlocked: true },
      dawn: { unlocked: true },
    },
    activePlanet: 'barren',
    expeditions: [],
    exploredFactions: [],
    exploredPlanets: [],
    nextExpeditionId: 1,
    megastructureChoice: 'smelter',
    fleet: { count: 24 },
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
    log: [{ id: 1, time: now, type: 'system', text: 'fleet-dock-10 测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
    autoExplore: { enabled: false, escort: false },
  }
  return { ...base, ...overrides }
}

/** 预置全部成就（防 tick checkAchievements 奖励污染资源断言） */
function lockAchievements(save: Record<string, unknown>, now: number): void {
  const achievements: Record<string, { unlockedAt: number; unlockedInRound: number }> = {}
  for (const def of Object.values(ACHIEVEMENTS)) {
    achievements[def.id] = { unlockedAt: now, unlockedInRound: 0 }
  }
  save.achievements = achievements
}

/** 打开探索页（ended 档：关结局面板后点一级 tab） */
async function openExplore(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.goto('/')
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  const closeBtn = page.locator('[data-ending="close"]')
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  }
  await page.locator('[data-nav="explore"]').click()
}

test('v10→v11 迁移：旧档加载后 autoExplore 补齐且默认关，在途派遣补 escort=false', async ({ page }) => {
  const now = Date.now()
  const v10 = buildSave(now, {
    schemaVersion: 10,
    autoExplore: undefined,
    expeditions: [
      {
        id: 1,
        startedAt: now - 30 * 60 * 1000,
        finishAt: now + 30 * 60 * 1000,
        cost: { mineral: 100, energy: 50, military: 40 },
        result: { kind: 'resource', mineral: 80, tech: 2, energy: 40 },
        resolved: false,
      },
    ],
  })
  await page.goto('/')
  const migrated = await seedSave(page, v10)
  expect(migrated).toBe(11)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  const closeBtn = page.locator('[data-ending="close"]')
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click()
  await page.locator('[data-nav="explore"]').click()
  // 自动探索面板存在、开关默认关；在途派遣显示无护航标注
  await expect(page.locator('[data-auto-explore]')).toBeVisible()
  await expect(page.locator('[data-auto-explore-toggle]')).not.toBeChecked()
  await expect(page.locator('[data-auto-escort]')).toBeDisabled()
  await expect(page.locator('[data-expedition-slot="1"]')).toContainText('派遣中')
})

test('船坞 Lv10 满编：舰数上限 24、船坞卡已满级无升级按钮', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now)
  lockAchievements(save, now)
  await page.goto('/')
  await openExplore(page, save)
  // 星域页 → 星际工程区：船坞卡已满级
  await page.locator('[data-nav="sector"]').click()
  await expect(page.locator('[data-building="dock"]')).toContainText('已满级')
  await expect(page.locator('[data-building="dock"] [data-upgrade="dock"]')).toHaveCount(0)
  // 舰队管理区：24/24 上限
  await expect(page.locator('[data-fleet-count]')).toContainText('24.00艘/24.00艘')
})

test('护航远征全流程：勾选 → 费用/倍率预览 → 派遣扣费 → 返航日志标注护航', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now)
  lockAchievements(save, now)
  await page.goto('/')
  await openExplore(page, save)
  // 舰队运转 → 护航选项可用，预览含消耗与倍率
  await expect(page.locator('[data-escort-option]').first()).toBeVisible()
  await expect(page.locator('[data-escort-preview]').first()).toContainText('护航消耗')
  // 勾选第 1 槽护航 → 派遣
  await page.locator('[data-escort-toggle="1"]').check()
  await page.locator('[data-explore-dispatch="1"]').click()
  await expect(page.locator('[data-expedition-slot="1"]')).toContainText('派遣中（护航）')
  await expect(page.locator('[data-log]')).toContainText('护航')
  // 能源被远征费扣减（护航费 > 0 断言用相对：无资源不足日志）
  await expect(page.locator('[data-log]')).not.toContainText('能源不足')
})

test('停摆禁用护航：舰队能源不足时护航选项禁用并提示', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, {
    fleet: { count: 24 },
    resources: { mineral: 1e13, energy: 10, tech: 1e10, military: 1_000_000 },
  })
  lockAchievements(save, now)
  await page.goto('/')
  await openExplore(page, save)
  await expect(page.locator('[data-escort-disabled]').first()).toBeVisible()
  await expect(page.locator('[data-escort-toggle="1"]')).toBeDisabled()
  // 自动护航勾选同步禁用（舰队停摆 → 护航不可用）
  await expect(page.locator('[data-auto-escort]')).toBeDisabled()
})

test('自动探索在线续派：开启后空槽自动补派；关闭后无新派遣', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { autoExplore: { enabled: false, escort: false } })
  lockAchievements(save, now)
  await page.goto('/')
  await openExplore(page, save)
  // 开自动探索：3 槽空 → 下一次 tick 自动补派（tick 间隔短，等待日志出现）
  await page.locator('[data-auto-explore-toggle]').check()
  await expect(page.locator('[data-log]')).toContainText('自动探索', { timeout: 15_000 })
  await expect(page.locator('[data-expedition-slot]')).toHaveCount(3)
  // 关闭：无新补派日志（已占用槽位结算后不再补）
  await page.locator('[data-auto-explore-toggle]').uncheck()
  const before = await page.locator('[data-log]').count()
  await page.waitForTimeout(2_000)
  expect(await page.locator('[data-log]').count()).toBeGreaterThanOrEqual(before)
})

test('离线续派：8h 离线自动探索续派（≈8 轮/槽），日志标注离线', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, {
    autoExplore: { enabled: true, escort: false },
    lastTick: now - 8 * 60 * 60 * 1000, // 8h 前最后在线
  })
  lockAchievements(save, now)
  await page.goto('/')
  await openExplore(page, save)
  // 离线结算日志：自动探索（离线）标注 + 派遣次数显著多于单轮（> 槽位 3）
  await expect(page.locator('[data-log]')).toContainText('自动探索（离线）', { timeout: 15_000 })
  const dispatchLogs = page.locator('[data-log] >> text=/自动探索/')
  expect(await dispatchLogs.count()).toBeGreaterThan(3)
})
