import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'
import { ACHIEVEMENTS } from '../src/engine/achievements'

/**
 * 舰队系统 E2E（fleet，存档 v8）：用户手动执行。
 * 回归点：① v7 旧档迁移 v8（fleet.count 补 0）；② 船坞解锁链（星港前锁定原因）；
 * ③ 造舰至上限（硬约束：资源不足/满编禁点）；④ 自动迎击替代弹窗（事件卡不出现 + 日志出现 + 威胁 −15）；
 * ⑤ 停摆与恢复（data-fleet-idle/warn ↔ data-fleet-powered）。
 * 注入技巧：seedSave + lockSaveStore；playing 档派系未统一（防 tick 转 ended 遮罩拦截点击）。
 * 确定性：seed 42 + rngCounters.event = 1 → 首个事件 roll 0.9376 命中 raid（权重池 11，slot 10.3）。
 */

interface FactionLike {
  favor: number
  allied: boolean
  tradeCount: number
  intimidateCount: number
  threat: number
}

interface SaveOverrides {
  schemaVersion?: number
  buildings?: Record<string, number>
  upgrades?: Record<string, number>
  resources?: Record<string, number>
  fleet?: { count: number }
  rngCounters?: Record<string, number>
  nextEventAt?: number
  energy?: number
  factionThreats?: Record<string, number>
}

/** 构造 v8 存档（默认 playing + 派系未统一 + 星港/船坞可配）；v7 迁移用例降 schemaVersion 并删 fleet */
function buildSave(now: number, overrides: SaveOverrides = {}) {
  const base: Record<string, unknown> = {
    schemaVersion: 8,
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
    resources: { mineral: 50_000_000_000, energy: 10_000_000_000, tech: 5_000_000_000, military: 50_000 },
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
    log: [{ id: 1, time: now, type: 'system', text: 'fleet 测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 300_000,
    lastTick: now,
    createdAt: now,
  }
  const merged = { ...base, ...overrides }
  if (overrides.resources) merged.resources = { ...(base.resources as Record<string, number>), ...overrides.resources }
  if (overrides.factionThreats) {
    const factions = merged.factions as Record<string, FactionLike>
    for (const [id, threat] of Object.entries(overrides.factionThreats)) factions[id].threat = threat
  }
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

/** 注入存档并进入星域页（playing 档无结局面板） */
async function openSector(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.goto('/')
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await page.locator('[data-nav="sector"]').click()
}

test('v7 旧档迁移 v8：加载不崩溃，船坞流程走通且舰队初始 0 艘（fleet.count 补 0）', async ({ page }) => {
  const now = Date.now()
  // v7 档：无 fleet 字段、无船坞（v8 内容），星港已建
  await page.goto('/')
  const v7 = buildSave(now, { schemaVersion: 7, buildings: { starportMine: 1 } }) as Record<string, unknown>
  delete (v7 as Record<string, unknown>).fleet
  await openSector(page, v7)

  // 星港已建 → 船坞可建造（迁移档里船坞从未存在，需新购）
  const dockCard = page.locator('[data-building="dock"]')
  await expect(dockCard).toBeVisible()
  await expect(dockCard.locator('[data-build="dock"]')).toBeEnabled()
  await dockCard.locator('[data-build="dock"]').click()
  await expect(page.locator('[data-log]')).toContainText('建造了 船坞')

  // 船坞 Lv0 → 升级至 Lv1 解锁舰队（迁移补的 fleet.count = 0 → 显示 0/3）
  await dockCard.locator('[data-upgrade="dock"]').click()
  await expect(page.locator('[data-fleet]')).toBeVisible()
  await expect(page.locator('[data-fleet-count]')).toContainText('0/3')
  await expect(page.locator('[data-fleet-build]')).toBeEnabled()
})

test('船坞解锁链：星港 0 级锁定原因显示；星港 ≥1 解锁可建', async ({ page }) => {
  const now = Date.now()

  // ① 星港未建：船坞卡片锁定原因「需先建造：星港矿场」，无建造按钮
  await page.goto('/')
  await openSector(page, buildSave(now))
  await expect(page.locator('[data-building="dock"]')).toContainText('星港矿场')
  await expect(page.locator('[data-building="dock"] [data-build="dock"]')).toHaveCount(0)
  // 舰队管理区同时显示锁定原因
  await expect(page.locator('[data-fleet-locked]')).toContainText('星港矿场')

  // ② 星港 1 级：解锁可建 → 建造 → 升级 Lv1 → 舰队区 0/3
  await page.goto('/')
  const withStarport = buildSave(now, { buildings: { starportMine: 1 } })
  await openSector(page, withStarport)
  await expect(page.locator('[data-building="dock"] [data-build="dock"]')).toBeEnabled()
  await page.locator('[data-building="dock"] [data-build="dock"]').click()
  await expect(page.locator('[data-log]')).toContainText('建造了 船坞')
  await page.locator('[data-building="dock"] [data-upgrade="dock"]').click()
  await expect(page.locator('[data-fleet-count]')).toContainText('0/3')
})

test('造舰至上限（硬约束）：资源不足禁点、满编禁点并提示上限', async ({ page }) => {
  const now = Date.now()

  // ① 资源不足：建造按钮禁用，title 提示矿物不足
  await page.goto('/')
  const poor = buildSave(now, {
    buildings: { starportMine: 1, dock: 1 },
    upgrades: { dock: 1 },
    resources: { mineral: 10, energy: 10 },
    fleet: { count: 0 },
  })
  await openSector(page, poor)
  const poorBtn = page.locator('[data-fleet-build]')
  await expect(poorBtn).toBeDisabled()
  await expect(poorBtn).toHaveAttribute('title', /矿物不足/)

  // ② 满编（2/3 → 造第 3 艘 → 3/3）：按钮禁用提示上限，count 显示 3/3
  await page.goto('/')
  const nearCap = buildSave(now, {
    buildings: { starportMine: 1, dock: 1 },
    upgrades: { dock: 1 },
    fleet: { count: 2 },
  })
  await openSector(page, nearCap)
  await expect(page.locator('[data-fleet-count]')).toContainText('2/3')
  await page.locator('[data-fleet-build]').click()
  await expect(page.locator('[data-log]')).toContainText('护卫舰入列')
  await expect(page.locator('[data-fleet-count]')).toContainText('3/3')
  const cappedBtn = page.locator('[data-fleet-build]')
  await expect(cappedBtn).toBeDisabled()
  await expect(cappedBtn).toHaveAttribute('title', /上限/)
})

test('自动迎击替代弹窗：事件卡不出现 + 日志出现 + 威胁 −15', async ({ page }) => {
  const now = Date.now()
  // 3 艘护卫舰（战力 3,600）+ 能源充足 → 自动迎击铁卫 70（强度 3,500）；
  // rngCounters.event = 1 → 首个事件 roll 0.9376 命中 raid；nextEventAt 提前到 0.5s 后
  const save = buildSave(now, {
    buildings: { starportMine: 1, dock: 1 },
    upgrades: { dock: 1 },
    fleet: { count: 3 },
    rngCounters: { event: 1, conquest: 0, explore: 0 },
    nextEventAt: now + 500,
    factionThreats: { ferro: 70 },
  })
  lockAchievements(save, now)
  await page.goto('/')
  await openSector(page, save)

  // 事件触发窗口内：事件卡不出现，日志出现「护卫舰队迎击」与「威胁 −15」
  await expect(page.locator('[data-log]')).toContainText('护卫舰队迎击', { timeout: 15_000 })
  await expect(page.locator('[data-log]')).toContainText('威胁 −15')
  await expect(page.locator('[data-event-card]')).toHaveCount(0)
  // 舰队保持运转态（未因骚扰扣军力/未停摆）
  await expect(page.locator('[data-fleet-powered]')).toBeVisible()
})

test('停摆与恢复：能源不足警示停摆（自动迎击失效说明），供能恢复后运转', async ({ page }) => {
  const now = Date.now()

  // ① 能源不足（10 < 维护费 142.5/s）：data-fleet-idle + 停摆警示
  await page.goto('/')
  const idle = buildSave(now, {
    buildings: { starportMine: 1, dock: 1 },
    upgrades: { dock: 1 },
    fleet: { count: 3 },
    resources: { energy: 10 },
  })
  lockAchievements(idle, now)
  await openSector(page, idle)
  await expect(page.locator('[data-fleet-idle]')).toBeVisible()
  await expect(page.locator('[data-fleet-warn]')).toContainText('停摆')
  await expect(page.locator('[data-fleet-power]')).toContainText('0')

  // ② 供能充足（1000 万能源）：运转徽标，战力 = 3 × 1200 = 3,600
  await page.goto('/')
  const powered = buildSave(now, {
    buildings: { starportMine: 1, dock: 1 },
    upgrades: { dock: 1 },
    fleet: { count: 3 },
  })
  lockAchievements(powered, now)
  await openSector(page, powered)
  await expect(page.locator('[data-fleet-powered]')).toBeVisible()
  await expect(page.locator('[data-fleet-power]')).toContainText('3,600')
  await expect(page.locator('[data-fleet-idle]')).toHaveCount(0)
})
