import { test, expect } from '@playwright/test'
import { lockSaveStore, seedSave } from './helpers'

/**
 * fixed-rng 防 SL 端到端验证：
 * 存档 v5 携带固定随机种子（seed）+ 分域计数器（rngCounters），结果型随机（事件类型）
 * 由 (seed, domain, counter) 精确决定。玩家在保存点反复刷新 = 从同一 counter 重放 →
 * 事件类型与刷新前一致，「读档重抽」失去意义。
 *
 * 会话 A：注入 v5 档（seed=42, counter=0, nextEventAt=now+2s）→ 触发事件 → 记录类型（应为 meteor）
 * 会话 B：reload（IndexedDB 存档保留且 saveGame 被锁）→ 从同一保存点重放 → 事件类型必须一致
 * 对照组：seed=43 同 counter 0 → 事件类型不同（bug），证明类型确实由 seed 决定
 */

/** 构造合法 v5 存档：固定 seed + 零计数 + 近期事件（threat 全 0 → 事件池固定为 trade/meteor/bug，total 9） */
function buildV5Save(now: number, seed: number) {
  return {
    schemaVersion: 5,
    seed,
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
    tutorialStep: -1, // 已跳过引导，消除浮层干扰
    log: [],
    nextLogId: 1,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 2_000,
    lastTick: now,
    createdAt: now,
  }
}

/** 等待事件卡片出现并返回其 data-def（事件类型 id） */
async function waitForEventDef(page: import('@playwright/test').Page): Promise<string> {
  const card = page.locator('[data-event-card]').first()
  await card.waitFor({ state: 'visible', timeout: 20_000 })
  const def = await card.getAttribute('data-def')
  expect(def).toBeTruthy()
  return def ?? ''
}

test('刷新后事件类型一致（防 SL：同一保存点重放同结果）', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  const schema = await seedSave(page, buildV5Save(Date.now(), 42))
  expect(schema).toBe(5) // v5 档已注入
  await lockSaveStore(page) // 拦截 saveGame，保证 IDB 存档保持注入时的 counter=0
  await page.reload()

  // 会话 A：事件触发，类型应为 meteor（seed=42 域盐 event 的首次 roll = 0.640995 × 9 = 5.77 → meteor）
  const defA = await waitForEventDef(page)
  expect(defA).toBe('meteor')

  // 会话 B：刷新（存档仍在保存点：counter=0）→ 从同一保存点重放 → 事件类型必须一致
  await page.reload()
  const defB = await waitForEventDef(page)
  expect(defB).toBe('meteor')
  expect(defB).toBe(defA)

  await page.waitForTimeout(600)
  expect(pageErrors).toEqual([])
})

test('事件类型由 seed 决定（seed=43 同 counter → 不同事件 bug）', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  const schema = await seedSave(page, buildV5Save(Date.now(), 43))
  expect(schema).toBe(5)
  await lockSaveStore(page)
  await page.reload()

  // seed=43 首次 roll = 0.937595 × 9 = 8.44 → bug（与 seed=42 的 meteor 不同）
  const def = await waitForEventDef(page)
  expect(def).toBe('bug')

  await page.waitForTimeout(600)
  expect(pageErrors).toEqual([])
})
