import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 无限模式手动开启新周目 E2E（infinite-ngplus）。
 * 回归点：① 工具栏「开启新周目」仅 phase==='infinite' 可见（playing 隐藏，保持通关门槛）；
 * ② 确认弹窗双清单披露（将失去/将继承，继承为预览值）；③ 确认后 ngPlusLevel+1、新周目开局
 * （矿物清零、继承科技点）、日志【NG+ 第 N 周目】；④ 取消零状态变化。
 */

/** 构造无限模式存档（ngPlusLevel=1，已含母巢永久加成与图鉴） */
function buildInfiniteSave(now: number) {
  return {
    schemaVersion: 4,
    phase: 'infinite',
    endingTriggered: true,
    ngPlusLevel: 1,
    factionCodex: ['ferro'],
    permanentMult: 1.15,
    permanentBonuses: { production: 0.25 },
    conquest: {
      outpost: { status: 'conquered' },
      shipyard: { status: 'conquered' },
      wreckage: { status: 'conquered' },
      nest: { status: 'conquered' },
    },
    achievements: {},
    stats: { totalMineralEarned: 20_000_000 },
    resources: { mineral: 500_000, energy: 100_000, tech: 50_000, military: 2_000 },
    buildings: { miner: 50, solar: 10, lab: 5 },
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
    log: [{ id: 1, time: now, type: 'system' as const, text: '无限模式测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

async function seedInfinite(page: import('@playwright/test').Page) {
  const schemaVersion = await seedSave(page, buildInfiniteSave(Date.now()))
  expect(schemaVersion).toBe(4)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await expect(page.locator('[data-ngplus]')).toBeVisible()
}

test('无限模式：工具栏「开启新周目」可见', async ({ page }) => {
  await page.goto('/')
  await seedInfinite(page)
  await expect(page.locator('[data-ngplus]')).toContainText('开启新周目')
})

test('playing 存档：工具栏「开启新周目」不可见（保持通关门槛）', async ({ page }) => {
  await page.goto('/')
  const save = buildInfiniteSave(Date.now())
  save.phase = 'playing'
  save.endingTriggered = false
  save.ngPlusLevel = 0
  const schemaVersion = await seedSave(page, save)
  expect(schemaVersion).toBe(4)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await expect(page.locator('[data-ngplus]')).toBeHidden()
})

test('确认弹窗披露双清单 → 确认 → 新周目开局（周目+1/矿物清零/继承科技点/日志）', async ({ page }) => {
  await page.goto('/')
  await seedInfinite(page)

  await page.locator('[data-ngplus]').click()
  const overlay = page.locator('.ngplus-overlay')
  await expect(overlay).toBeVisible()
  const card = page.locator('.ngplus-card')
  await expect(card).toContainText('将失去（本周目）')
  await expect(card).toContainText('采矿机 ×50')
  await expect(card).toContainText('将继承')
  await expect(card).toContainText('4,000') // 继承科技点 2000 × 2
  await expect(card).toContainText('1.30') // 永久产出加成 1 + 0.15 × 2
  await expect(card).toContainText('全产出 +25%') // 母巢永久加成预览
  await expect(card).toContainText('不可逆')

  await page.locator('[data-ngplus-confirm]').click()
  await expect(overlay).toBeHidden()
  // 日志播报新周目（startNewGamePlus 内部 push，稳定）
  await expect(page.locator('.log-area')).toContainText('【NG+ 第 2 周目】')
  // 建筑清零：建造面板采矿机 ×0（成就奖励只加资源不加建筑，稳定）
  await expect(page.locator('[data-panel="build"]')).toContainText('×0')
  // 档案面板周目 +1
  await page.locator('.tab[data-tab="archive"]').click()
  await expect(page.locator('[data-panel="archive"]')).toContainText('NG+ 周目：2')
})

test('取消：弹窗关闭、状态零变化（周目不变/无新周目日志）', async ({ page }) => {
  await page.goto('/')
  await seedInfinite(page)

  await page.locator('[data-ngplus]').click()
  await expect(page.locator('.ngplus-overlay')).toBeVisible()
  await page.locator('[data-ngplus-cancel]').click()
  await expect(page.locator('.ngplus-overlay')).toBeHidden()

  // 周目未变（档案面板仍为 1）、未触发新周目日志
  await page.locator('.tab[data-tab="archive"]').click()
  await expect(page.locator('[data-panel="archive"]')).toContainText('NG+ 周目：1')
  await expect(page.locator('.log-area')).not.toContainText('【NG+ 第 2 周目】')
})
