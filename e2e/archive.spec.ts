import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 档案面板 E2E：v4 存档（已达成成就）→ 档案 tab 可点击 → 声望与成就显示。
 * 回归点：① 档案 tab 开局即开放（无 disabled）；② 回溯解锁的成就显示已解锁；
 * ③ 声望派生显示正确；④ 移动端无溢出由 mobile.spec 覆盖。
 */

/** 构造 v4 存档：已满足多个成就条件（回溯解锁路径） */
function buildV4Save(now: number) {
  return {
    schemaVersion: 4,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    permanentBonuses: {},
    conquest: {
      outpost: { status: 'conquered' },
      shipyard: { status: 'locked' },
      wreckage: { status: 'locked' },
      nest: { status: 'locked' },
    },
    achievements: {},
    stats: { totalMineralEarned: 2_000_000 },
    resources: { mineral: 500_000, energy: 100_000, tech: 50_000, military: 1_000 },
    buildings: { miner: 50, solar: 10, lab: 5 },
    upgrades: {},
    techLevels: { planetDrill: 1 },
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: true },
      ice: { unlocked: true },
      gas: { unlocked: false },
      dawn: { unlocked: false },
    },
    activePlanet: 'barren',
    factions: {
      ferro: { favor: 30, allied: true, tradeCount: 20, intimidateCount: 3, threat: 55 },
      lumen: { favor: 40, allied: true, tradeCount: 15, intimidateCount: 1, threat: 40 },
      cygnus: { favor: 50, allied: true, tradeCount: 12, intimidateCount: 0, threat: 50 },
      vox: { favor: 25, allied: false, tradeCount: 8, intimidateCount: 0, threat: 60 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: { firstBuild: true, firstTech: true, firstAlliance: true, orbitalUnlocked: true },
    tutorialStep: -1,
    log: [{ id: 1, time: now, type: 'system' as const, text: '档案面板测试存档' }],
    nextLogId: 2,
    playSeconds: 3600,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

test('档案面板：v4 存档回溯解锁成就、声望正确显示', async ({ page }) => {
  await page.goto('/')
  const schemaVersion = await seedSave(page, buildV4Save(Date.now()))
  expect(schemaVersion).toBe(4)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  // 档案 tab 开局即开放
  const archiveTab = page.locator('.tab[data-tab="archive"]')
  await expect(archiveTab).toBeVisible()
  await expect(archiveTab).toBeEnabled()
  await archiveTab.click()

  // 回溯解锁：叙事成就（firstBuild/firstTech/firstAlliance/orbitalUnlocked）已解锁
  // + 收集类（mineral1M：矿物 200 万）+ 结盟 3 派系（allies3）
  await expect(page.locator('[data-panel="archive"]')).toContainText('第一块领地')
  await expect(page.locator('[data-panel="archive"]')).toContainText('✓ 第一块领地')
  await expect(page.locator('[data-panel="archive"]')).toContainText('亿万矿藏')
  await expect(page.locator('[data-panel="archive"]')).toContainText('✓ 亿万矿藏')
  await expect(page.locator('[data-panel="archive"]')).toContainText('三方会盟')

  // 声望：叙事 10（firstBuild2+firstTech2+orbitalUnlocked3+firstAlliance3）
  // + 收集 11（mineral1M3+trades50 4+allies3 4）+ federationPending 4（3/4 结盟 tick 触发）= 25
  await expect(page.locator('[data-panel="archive"]')).toContainText('25 / 100')
  // 生效加成：声望 25 ≥ 20 → 20 档贸易折扣 5%
  await expect(page.locator('[data-panel="archive"]')).toContainText('贸易折扣 5%')

  // 本周目统计
  await expect(page.locator('[data-panel="archive"]')).toContainText('NG+ 周目：0')
})
