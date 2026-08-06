import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 无尽探索扩充 E2E（endless-expansion）。
 * 回归点：① 归档折叠区（军事/外交/天体：计数 + 默认折叠 + 展开明细 + 周目标记）；
 * ② 探索结算直接创建军事目标（data-conquest 动态 id）；③ 保底锁定占位仅 infinite；
 * ④ ended 档隔离（无扩展内容）。全部 data-* 断言（AGENTS.md 铁律，禁类名断言）。
 */

/** 构造 infinite 档（v11：经迁移链自动补 v12 generatedTargets/archivedRounds 默认值） */
function buildInfiniteSave(now: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 11,
    seed: 42,
    rngCounters: { event: 0, conquest: 0, explore: 0, generate: 0 },
    phase: 'infinite',
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
    megastructureChoice: null,
    fleet: { count: 0 },
    autoExplore: { enabled: false, escort: false },
    bugEscalation: 1,
    endless: { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0 },
    achievements: {},
    stats: { totalMineralEarned: 50_000_000, explorations: 0 },
    resources: { mineral: 50_000_000, energy: 10_000_000, tech: 1_000_000, military: 100_000 },
    buildings: { miner: 500, solar: 100, lab: 20, militaryPort: 10 },
    upgrades: {},
    techLevels: { planetDrill: 1, deepSpaceNav: 1 },
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
    log: [{ id: 1, time: now, type: 'system' as const, text: 'endless-expansion 测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
    ...overrides,
  }
}

/** 打开星域页军事二级 tab（fleet.spec openFleetTab 同构） */
async function openMilitaryTab(page: Page): Promise<void> {
  await page.locator('[data-nav="sector"]').click()
  await page.locator('[data-tab="military"]').click()
}

/** 打开星域页外交二级 tab */
async function openDiplomacyTab(page: Page): Promise<void> {
  await page.locator('[data-nav="sector"]').click()
  await page.locator('[data-tab="diplomacy"]').click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('军事归档折叠：已肃清目标计数 + 默认折叠 + 点击展开明细（名称/徽标/周目）', async ({ page }) => {
  const now = Date.now()
  await seedSave(page, buildInfiniteSave(now, { archivedRounds: { outpost: 0 } }))
  await lockSaveStore(page)
  await dismissTutorial(page)
  await openMilitaryTab(page)

  const fold = page.locator('[data-archived-collapse="conquest"]')
  await expect(fold).toBeVisible()
  await expect(fold).toContainText('已完成军事目标（1.00）')
  // 默认折叠：明细隐藏
  await expect(page.locator('[data-archived-list="conquest"]')).toBeHidden()
  // 展开
  await page.locator('[data-archived-toggle="conquest"]').click()
  await expect(page.locator('[data-archived-list="conquest"]')).toBeVisible()
  const row = page.locator('[data-archived-row="outpost"]')
  await expect(row).toBeVisible()
  await expect(row).toContainText('已肃清')
  await expect(row).toContainText('第 0.00 周目')
  // 未归档静态区域仍在主列表
  await expect(page.locator('[data-conquest="wreckage"]')).toBeVisible()
})

test('外交归档折叠：已结盟派系移入折叠区，主列表只留未结盟', async ({ page }) => {
  const now = Date.now()
  const save = buildInfiniteSave(now)
  // 4 家主线全部结盟归档（本周目语义）
  save.archivedRounds = { ferro: 0, lumen: 0, cygnus: 0, vox: 0 }
  await seedSave(page, save)
  await lockSaveStore(page)
  await dismissTutorial(page)
  await openDiplomacyTab(page)

  const fold = page.locator('[data-archived-collapse="diplomacy"]')
  await expect(fold).toBeVisible()
  await expect(fold).toContainText('已完成外交对象（4.00）')
  await page.locator('[data-archived-toggle="diplomacy"]').click()
  await expect(page.locator('[data-archived-row="ferro"]')).toContainText('已结盟')
  // 主列表不再渲染已结盟派系（data-faction 语义钩子）
  await expect(page.locator('[data-faction="ferro"]')).toHaveCount(0)
})

test('探索结算直接创建军事目标：动态目标出现在军事列表（data-conquest 动态 id）', async ({ page }) => {
  const now = Date.now()
  const save = buildInfiniteSave(now, {
    // 已到期派遣：探索结算直接创建手写保底军事目标「掠夺者舰队」
    expeditions: [
      {
        id: 1,
        startedAt: now - 3_600_000,
        finishAt: now - 1,
        cost: { mineral: 3000, energy: 1000, military: 40 },
        result: { kind: 'conquest', targetId: 'endless:warband' },
        resolved: false,
        escort: false,
      },
    ],
  })
  await seedSave(page, save)
  await lockSaveStore(page)
  await dismissTutorial(page)
  await openMilitaryTab(page)

  // 派遣到期 → 结算创建 → 动态目标可发起（data-conquest="endless:warband"）
  await expect(page.locator('[data-conquest="endless:warband"]')).toBeVisible({ timeout: 10_000 })
  // 同时出现在归档折叠计数之外的主列表（未归档前）
  await expect(page.locator('[data-archived-collapse="conquest"]')).toContainText('已完成军事目标（4.00）')
})

test('保底锁定占位：仅 infinite 档显示（batch 2 天体未解锁提示）', async ({ page }) => {
  const now = Date.now()
  await seedSave(page, buildInfiniteSave(now)) // explorations=0 → batch 2 未解锁
  await lockSaveStore(page)
  await dismissTutorial(page)
  await page.locator('[data-nav="explore"]').click()
  await expect(page.locator('[data-explore-locked="planet"]')).toBeVisible()
  await expect(page.locator('[data-explore-locked="planet"]')).toContainText('15 次探索')
})

test('ended 档隔离：无保底锁定占位、无扩展内容', async ({ page }) => {
  const now = Date.now()
  const save = buildInfiniteSave(now, { phase: 'ended', archivedRounds: { outpost: 0 } })
  await seedSave(page, save)
  await lockSaveStore(page)
  await dismissTutorial(page)
  // 探索页无锁定占位
  await page.locator('[data-nav="explore"]').click()
  await expect(page.locator('[data-explore-locked]')).toHaveCount(0)
  // 军事 tab：归档折叠仍生效（不可交互目标折叠为全模式需求），但无扩展内容
  await openMilitaryTab(page)
  await expect(page.locator('[data-archived-collapse="conquest"]')).toBeVisible()
  await expect(page.locator('[data-explore-locked="conquest"]')).toHaveCount(0)
})
