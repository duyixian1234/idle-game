import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'
import { ACHIEVEMENTS } from '../src/engine/achievements'

/**
 * 建筑成本软上限 E2E（cost-softcap，存档 v11）：用户手动执行（铁律不代跑）。
 * 回归点：① 建造卡片相对价格行（data-cost-time）可见且内容正确；
 * ② 相对秒数随资源产出变化；③ 多资源瓶颈口径（矿够能不够 → 显示能源秒数）；
 * ④ 科技净产 0 场景不出现 NaN/Infinity；⑤ 移动端不溢出。
 * 注入技巧：seedSave + lockSaveStore；playing 档派系未统一（防 tick 转 ended 遮罩拦截点击）。
 */

interface SaveOverrides {
  phase?: 'playing' | 'ended' | 'infinite'
  buildings?: Record<string, number>
  upgrades?: Record<string, number>
  resources?: Record<string, number>
  planets?: Record<string, { unlocked: boolean }>
  techLevels?: Record<string, number>
}

/** 构造 v11 存档（默认 playing + 派系未统一 + 全星球解锁可配） */
function buildSave(now: number, overrides: SaveOverrides = {}) {
  const base: Record<string, unknown> = {
    schemaVersion: 11,
    seed: 42,
    rngCounters: { event: 0, conquest: 0, explore: 0 },
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    permanentBonuses: {},
    conquest: {
      outpost: { status: 'locked' },
      shipyard: { status: 'locked' },
      wreckage: { status: 'locked' },
      nest: { status: 'locked' },
    },
    achievements: {},
    stats: { totalMineralEarned: 20_000_000, explorations: 0 },
    resources: { mineral: 5_000_000, energy: 500_000, tech: 100_000, military: 50_000 },
    buildings: {},
    upgrades: {},
    techLevels: {},
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
    megastructureChoice: null,
    fleet: { count: 0 },
    factions: {
      ferro: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 70 },
      lumen: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 40 },
      cygnus: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 30 },
      vox: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 20 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: { firstBuild: true },
    tutorialStep: -1,
    log: [{ id: 1, time: now, type: 'system', text: 'cost-softcap 测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 300_000,
    lastTick: now + 3_600_000, // 冻结生产时钟，防等待期间产出抵消断言
    createdAt: now,
  }
  const merged = { ...base, ...overrides }
  if (overrides.resources) merged.resources = { ...(base.resources as Record<string, number>), ...overrides.resources }
  if (overrides.planets) merged.planets = { ...(base.planets as Record<string, { unlocked: boolean }>), ...overrides.planets }
  if (overrides.techLevels) merged.techLevels = { ...(base.techLevels as Record<string, number>), ...overrides.techLevels }
  return merged
}

/** 预置全部成就已解锁（避免 tick checkAchievements 发放奖励污染资源断言） */
function lockAchievements(save: Record<string, unknown>, now: number): void {
  const achievements: Record<string, { unlockedAt: number; unlockedInRound: number }> = {}
  for (const def of Object.values(ACHIEVEMENTS)) {
    achievements[def.id] = { unlockedAt: now, unlockedInRound: 0 }
  }
  save.achievements = achievements
}

/** 注入存档并进入星域页建造 tab（playing 档无结局面板） */
async function openBuild(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.goto('/')
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await page.locator('[data-nav="sector"]').click()
  await page.locator('[data-tab="build"]').click()
}

test('建造卡片显示相对价格行（data-cost-time），内容随数量与产出变化', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { buildings: { miner: 5 }, resources: { mineral: 5_000_000, energy: 500_000, tech: 100_000, military: 50_000 } })
  lockAchievements(save, now)
  await openBuild(page, save)

  const costTime = page.locator('[data-cost-time="miner"]')
  await expect(costTime).toBeVisible()
  // miner ×5：买入第 6 台成本 = floor(10×6^0.46) = 22；净产出矿物 = 5×1 = 5/s → ≈5 秒产出
  await expect(costTime).toContainText('买入 ≈5 秒产出')

  // 增加矿机数量 → 成本与产出同涨，秒数变化（×25：第 26 台 = floor(10×26^0.46) ≈ 42；产出 25/s → ≈2 秒）
  // 通过刷新注入新档验证数量敏感
  const save2 = buildSave(now, { buildings: { miner: 25 }, resources: { mineral: 5_000_000, energy: 500_000, tech: 100_000, military: 50_000 } })
  lockAchievements(save2, now)
  await openBuild(page, save2)
  const costTime2 = page.locator('[data-cost-time="miner"]')
  await expect(costTime2).toContainText('买入 ≈2 秒产出')
})

test('多资源建筑（实验室）取瓶颈资源口径', async ({ page }) => {
  const now = Date.now()
  // lab ×1：买入第 2 台 = (floor(60×2^0.615)=91 矿, floor(10×2^0.615)=15 能)
  // 净产出 = 矿 1/s（1 台 miner）、能 0/s → 能源瓶颈：15/0 无意义 → 跳过能源，只按矿物 91s
  const save = buildSave(now, { buildings: { miner: 1, lab: 1 }, resources: { mineral: 5_000_000, energy: 0, tech: 100_000, military: 50_000 } })
  lockAchievements(save, now)
  await openBuild(page, save)

  const costTime = page.locator('[data-cost-time="lab"]')
  await expect(costTime).toBeVisible()
  // 能源净产 0（无太阳能）→ 跳过，瓶颈 = 矿物 91 / 1 = 91 秒
  await expect(costTime).toContainText('买入 ≈91 秒产出')
})

test('科技净产为 0 的军事建筑（军港）不出现 NaN/Infinity', async ({ page }) => {
  const now = Date.now()
  // militaryPort ×1：买入第 2 台 = (floor(20000×2^0.81)=35064 矿, floor(500×2^0.81)=877 科技)
  // 净产出：矿 1/s、科技 0/s（无 lab）→ 科技项跳过；军港不产资源 → 只按矿物 35064s
  const save = buildSave(now, { buildings: { miner: 1, militaryPort: 1 }, resources: { mineral: 5_000_000, energy: 500_000, tech: 0, military: 50_000 } })
  lockAchievements(save, now)
  await openBuild(page, save)

  const costTime = page.locator('[data-cost-time="militaryPort"]')
  await expect(costTime).toBeVisible()
  const text = (await costTime.textContent()) ?? ''
  expect(text).not.toContain('NaN')
  expect(text).not.toContain('Infinity')
  expect(text).toContain('买入 ≈')
})

test('相对价格行不显示于唯一大件（星港）', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { buildings: { miner: 1, starportMine: 1 }, resources: { mineral: 5_000_000, energy: 500_000, tech: 100_000, military: 50_000 } })
  lockAchievements(save, now)
  await openBuild(page, save)

  await expect(page.locator('[data-cost-time="starportMine"]')).toHaveCount(0)
})

test('移动端（≤480px）建造卡片相对价格行不溢出视口', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { buildings: { miner: 5 }, resources: { mineral: 5_000_000, energy: 500_000, tech: 100_000, military: 50_000 } })
  lockAchievements(save, now)
  await page.setViewportSize({ width: 375, height: 720 })
  await openBuild(page, save)

  const card = page.locator('[data-build-card="miner"]')
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  expect(box).not.toBeNull()
  // 卡片与相对价格行均不超出视口右缘（无横向溢出）
  if (box) expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
  const costTime = page.locator('[data-cost-time="miner"]')
  const timeBox = await costTime.boundingBox()
  expect(timeBox).not.toBeNull()
  if (timeBox) expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(375 + 1)
})
