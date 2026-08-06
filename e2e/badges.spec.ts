import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 事件/成就角标 E2E（ui-restructure ticket 04）。
 * 语义：UI 层差值派生（seen 快照，不进存档）——
 *   事件角标 = pendingEvents.length - seenEventCount（读即已读：进星域页清零）
 *   成就角标 = 本周目解锁数 - seenAchievementCount（进档案页清零）
 *   新事件与成就解锁后显示角标，进入对应页面后清零。
 */

/** v5 档：seed=42 + 近期事件（2s 后触发 meteor，见 fixed-rng.spec 的确定性） */
function buildV5Save(now: number, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 5,
    seed: 42,
    rngCounters: { event: 0, conquest: 0 },
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    permanentBonuses: {},
    conquest: {
      outpost: { status: 'locked' },
      shipyard: { status: 'locked' },
      debris: { status: 'locked' },
      nest: { status: 'locked' },
    },
    stats: { totalMineralEarned: 0 },
    achievements: {},
    resources: { mineral: 5000, energy: 800, tech: 120, military: 0 },
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
      ferro: { favor: 20, allied: false, tradeCount: 0, intimidateCount: 0, threat: 0 },
      lumen: { favor: 25, allied: false, tradeCount: 0, intimidateCount: 0, threat: 0 },
      cygnus: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 0 },
      vox: { favor: 15, allied: false, tradeCount: 0, intimidateCount: 0, threat: 0 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: {},
    tutorialStep: -1,
    log: [],
    nextLogId: 1,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 2_000,
    lastTick: now,
    createdAt: now,
    ...extra,
  }
}

/** 构造一个合法事件实例（注入存档用，结构对齐 createEventInstance 输出） */
function tradeEvent(now: number): Record<string, unknown> {
  return {
    uid: 1,
    defId: 'trade',
    title: '贸易商抵达',
    desc: '一艘挂着陌生旗帜的货船停靠在你的轨道港。',
    payload: { cost: 50, gain: 5 },
    options: [
      { id: 'accept', label: '成交', hint: '-50矿物 +5科技' },
      { id: 'refuse', label: '拒绝' },
    ],
    createdAt: now,
    resolved: false,
  }
}

test('事件角标：新事件到达 → 星域 tab 角标「1」→ 点击星域清零', async ({ page }) => {
  await page.goto('/')
  const schema = await seedSave(page, buildV5Save(Date.now()))
  expect(schema).toBe(5)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  // seed=42 事件 2s 后触发（meteor）→ 角标出现
  const badge = page.locator('[data-nav-badge="sector"]')
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(badge).toHaveText('1')

  // 点击星域 tab（读即已读）→ 角标清零
  await page.locator('[data-nav="sector"]').click()
  await expect(badge).toBeHidden()
})

test('成就角标：成就解锁 → 档案 tab 角标「1」→ 进档案页清零', async ({ page }) => {
  await page.goto('/')
  // storyFlags.firstBuild=true → 首个 tick 的 checkAchievements 解锁「第一块领地」（unlockedInRound=0）
  const save = buildV5Save(Date.now(), { storyFlags: { firstBuild: true } })
  const schema = await seedSave(page, save)
  expect(schema).toBe(5)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  const badge = page.locator('[data-nav-badge="archive"]')
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(badge).toHaveText('1')

  // 进档案页 → 角标清零
  await page.locator('[data-nav="archive"]').click()
  await expect(badge).toBeHidden()
})
