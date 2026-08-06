import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 线上异常回归：v1 旧存档（researched boolean，无 techLevels）加载崩溃
 *   Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'planetDrill')
 * 根因：loadGame() 只校验不迁移，v1 存档通过校验后原样返回，导致
 *   netProduction → state.techLevels['planetDrill'] 在 techLevels undefined 时抛错。
 * 本测试：向 IndexedDB 注入合法 v1 存档 → reload → 断言不崩溃且迁移生效（planetDrill = Lv.1）。
 */

/** 构造合法 v1 存档（schemaVersion=1，researched 布尔表，无 techLevels） */
function buildV1Save(now: number) {
  return {
    schemaVersion: 1,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    stats: { totalMineralEarned: 0 },
    resources: { mineral: 5000, energy: 800, tech: 120 },
    buildings: { miner: 12, solar: 4, lab: 2 },
    upgrades: {},
    researched: { planetDrill: true, solarEfficiency: false },
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
    tutorialStep: -1, // 已跳过引导，消除浮层干扰专注迁移路径
    log: [{ id: 1, time: now, type: 'system' as const, text: 'v1 测试存档' }],
    nextLogId: 2,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

test('v1 旧档加载：不崩溃，迁移后 planetDrill 显示 Lv.1', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // 先打开页面建立同源，再注入 v1 存档，reload 走 loadGame 路径
  await page.goto('/')
  const schemaVersion = await seedSave(page, buildV1Save(Date.now()))
  expect(schemaVersion).toBe(1) // 确认 v1 存档真的写入了 IndexedDB
  await lockSaveStore(page) // 拦截 beforeunload 保存，覆盖前已注入的 v1
  await page.reload()

  // 资源条正常渲染（loadGame 后主循环不抛错）
  await expect(page.locator('[data-resource="mineral"]')).toBeVisible()

  // 迁移生效：planetDrill 已研发 → 显示 Lv.1 徽章
  await page.locator('[data-tab="tech"]').click()
  await expect(page.locator('[data-tech="planetDrill"]')).toContainText('Lv.1')

  // 等待若干 tick（渲染/离线结算/事件调度全部跑过）后仍无未捕获异常
  await page.waitForTimeout(1200)
  expect(pageErrors).toEqual([])
})

test('v1 旧档可继续建造（engine 读 techLevels 不崩）', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  const schemaVersion = await seedSave(page, buildV1Save(Date.now()))
  expect(schemaVersion).toBe(1)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)

  // 矿物 5000，可继续买采矿机（事件委托匹配 [data-build] 按钮）
  const minerBtn = page.locator('[data-build="miner"]')
  await expect(minerBtn).toBeVisible()
  await minerBtn.click()
  await expect(page.locator('[data-log]')).toContainText('建造了 采矿机（第 13 台）')

  await page.waitForTimeout(800)
  expect(pageErrors).toEqual([])
})
