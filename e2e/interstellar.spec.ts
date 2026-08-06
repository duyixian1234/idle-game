import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

/**
 * 星系间工程 + 终局抉择 E2E（interstellar-buildings，存档 v7）。
 * 回归点：① 星港解锁链（dawn 星球 + 深层钻机升级满级）与唯一大件建造/升级/禁 bulk；
 * ② 通关后恒星/智库链式解锁与维护费硬扣；③ 终局抉择确认弹窗与互斥双向锁定；
 * ④ 星际工程分组内建造按钮强制走确认；⑤ 跃迁枢纽 5 槽探索页渲染；⑥ v6 旧档迁移 v7；⑦ NG+ 重置重选。
 */

interface FactionLike {
  favor: number
  allied: boolean
  tradeCount: number
  intimidateCount: number
  threat: number
}

interface SaveOverrides {
  phase?: 'playing' | 'ended' | 'infinite'
  schemaVersion?: number
  buildings?: Record<string, number>
  upgrades?: Record<string, number>
  resources?: Record<string, number>
  planets?: Record<string, { unlocked: boolean; unlockedAt?: number }>
  megastructureChoice?: 'smelter' | 'jumpgate' | null
  storyFlags?: Record<string, boolean>
}

/** 构造 v7 存档（默认 ended + 通关标记 + 干净建筑表，避免存量建筑污染速率断言） */
function buildSave(now: number, overrides: SaveOverrides = {}) {
  const base: Record<string, unknown> = {
    schemaVersion: 7,
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
    log: [{ id: 1, time: now, type: 'system', text: 'interstellar 测试存档' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
  return { ...base, ...overrides }
}

/** 注入存档并进入星域页（ended 档先关结局面板） */
async function openSector(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.goto('/')
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  const closeBtn = page.locator('[data-ending="close"]')
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  }
  await page.locator('[data-nav="sector"]').click()
}

test('星港矿场解锁链：dawn 未解锁 → 深钻未满级 → 满足后建造/升级/禁 bulk（playing 档）', async ({ page }) => {
  const now = Date.now()

  // ① 未到第 5 星球：锁定原因提示星球（mineral 设低防 tick 自动解锁 dawn 破坏断言）
  await page.goto('/')
  const noDawn = buildSave(now, {
    phase: 'playing',
    planets: { barren: { unlocked: true }, orbital: { unlocked: true }, ice: { unlocked: true }, gas: { unlocked: true } },
    resources: { mineral: 1_000_000, energy: 10_000_000, tech: 5_000_000, military: 50_000 },
    storyFlags: { firstBuild: true },
  })
  noDawn.endingTriggered = false
  for (const f of Object.values(noDawn.factions as Record<string, FactionLike>)) {
    f.favor = 30
    f.allied = false
  }
  await openSector(page, noDawn)
  const mine = page.locator('[data-building="starportMine"]')
  await expect(mine).toBeVisible()
  await expect(mine).toContainText('母星')
  await expect(mine.locator('[data-build="starportMine"]')).toHaveCount(0)

  // ② 第 5 星球已解锁但深钻未满级：提示深层钻机升级满级
  await page.goto('/')
  const noDrill = buildSave(now, {
    phase: 'playing',
    storyFlags: { firstBuild: true },
  })
  noDrill.endingTriggered = false
  for (const f of Object.values(noDrill.factions as Record<string, FactionLike>)) {
    f.favor = 30
    f.allied = false
  }
  await openSector(page, noDrill)
  await expect(page.locator('[data-building="starportMine"]')).toContainText('深层钻机')

  // ③ 满足全部前置：可建造 → 唯一大件（无买满/升满）→ 升级产出 ×2
  await page.goto('/')
  const ready = buildSave(now, {
    phase: 'playing',
    upgrades: { deepDrill: 10 },
    storyFlags: { firstBuild: true },
  })
  ready.endingTriggered = false
  for (const f of Object.values(ready.factions as Record<string, FactionLike>)) {
    f.favor = 30
    f.allied = false
  }
  await openSector(page, ready)
  const mineReady = page.locator('[data-building="starportMine"]')
  await expect(mineReady.locator('[data-build="starportMine"]')).toBeEnabled()
  // unique 建筑：无买满/升满按钮
  await expect(page.locator('[data-buy-max="starportMine"]')).toHaveCount(0)
  await expect(page.locator('[data-upgrade-max="starportMine"]')).toHaveCount(0)

  await mineReady.locator('[data-build="starportMine"]').click()
  await expect(page.locator('[data-log]')).toContainText('建造了 星港矿场')
  // 产出跃迁：星港 500 矿/s（无其他矿产出）
  await expect(page.locator('[data-resource="mineral"]')).toContainText('+500.0/s')

  // 升级 → ×2（1000/s）；重复建造拒绝（唯一大件，建造按钮消失）
  await expect(mineReady.locator('[data-upgrade="starportMine"]')).toBeEnabled()
  await mineReady.locator('[data-upgrade="starportMine"]').click()
  await expect(page.locator('[data-resource="mineral"]')).toContainText('+1000.0/s')
  await expect(page.locator('[data-building="starportMine"] [data-build]')).toHaveCount(0)

  // 通关前：恒星/智库锁定卡片显示「通关后解锁」
  await expect(page.locator('[data-building="stellarArray"]')).toContainText('通关后解锁')
  await expect(page.locator('[data-building="thinkTank"]')).toContainText('通关后解锁')
})

test('通关后链式解锁：恒星需星港 → 智库需恒星；恒星产出 +1000 能源/s 且维护费硬扣', async ({ page }) => {
  const now = Date.now()

  // ① 无星港：恒星锁定（需先建造星港矿场）；智库锁定（需聚变恒星阵列）
  await page.goto('/')
  await openSector(page, buildSave(now))
  await expect(page.locator('[data-building="stellarArray"]')).toContainText('星港矿场')
  await expect(page.locator('[data-building="thinkTank"]')).toContainText('聚变恒星阵列')

  // ② 星港 1 级 → 恒星可建；建恒星 → 能源 +1000.0/s
  await page.goto('/')
  const withStarport = buildSave(now, { buildings: { starportMine: 1 } })
  await openSector(page, withStarport)
  await expect(page.locator('[data-building="stellarArray"] [data-build]')).toBeEnabled()
  await expect(page.locator('[data-building="thinkTank"]')).toContainText('聚变恒星阵列')

  await page.locator('[data-building="stellarArray"] [data-build="stellarArray"]').click()
  await expect(page.locator('[data-log]')).toContainText('建造了 聚变恒星阵列')
  await expect(page.locator('[data-resource="energy"]')).toContainText('+1000.0/s')

  // ③ 维护费硬扣：矿物净增速 = 星港 500 − 恒星维护 20 = 480/s（2s 窗口读余额差值）
  // 资源条文本形如「◆矿物50,000,000,000+480.0/s」——取「矿物」后的数值段
  await page.waitForTimeout(2_000)
  const balanceOf = async (): Promise<number> => {
    const text = await page.locator('[data-resource="mineral"]').textContent()
    return Number((text?.match(/矿物([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''))
  }
  const balance = await balanceOf()
  await page.waitForTimeout(2_000)
  const balance2 = await balanceOf()
  // 2 秒净入账 ≈ 480 × 2 = 960（星港 +500/s、维护 -20/s；tick 250ms 粒度误差 < 500）
  const delta = balance2 - balance
  expect(Math.abs(delta - 960)).toBeLessThanOrEqual(500)

  // ④ 恒星 1 级 → 智库可建
  await expect(page.locator('[data-building="thinkTank"] [data-build]')).toBeEnabled()
  await page.locator('[data-building="thinkTank"] [data-build="thinkTank"]').click()
  await expect(page.locator('[data-log]')).toContainText('建造了 星海智库')
  await expect(page.locator('[data-resource="tech"]')).toContainText('+200.0/s')
})

test('终局抉择：三星系间集齐 → 抉择区块 → 确认弹窗 → 选冶炼场后枢纽锁定', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, {
    buildings: { starportMine: 1, stellarArray: 1, thinkTank: 1 },
  })
  await page.goto('/')
  await openSector(page, save)

  // 抉择区块出现：双卡片并排、均未选择（可点）
  const section = page.locator('[data-megastructure-section]')
  await expect(section).toBeVisible()
  await expect(section.locator('[data-megastructure="ringSmelter"]')).toBeVisible()
  await expect(section.locator('[data-megastructure="jumpgate"]')).toBeVisible()
  await expect(section).toContainText('只能选一个')

  // 点冶炼场卡片 → 确认弹窗（效果/消耗/互斥警告）→ 确认建造
  await section.locator('[data-megastructure="ringSmelter"]').click()
  const overlay = page.locator('[data-overlay="megastructure"]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('只能选择其一')
  await expect(overlay.locator('[data-megastructure-confirm="ringSmelter"]')).toBeEnabled()
  await overlay.locator('[data-megastructure-confirm="ringSmelter"]').click()

  // 建造成功 + 冶炼场高亮 + 枢纽本周目锁定
  await expect(page.locator('[data-log]')).toContainText('终局抉择落定')
  await expect(section.locator('[data-megastructure="ringSmelter"]')).toHaveAttribute('data-chosen', '')
  await expect(section.locator('[data-megastructure="jumpgate"]')).toHaveAttribute('data-locked', '')
  await expect(section).toContainText('本周目已锁定')
})

test('互斥反向：选跃迁枢纽 → 冶炼场锁定；星际分组内建造按钮也强制走确认弹窗', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, {
    buildings: { starportMine: 1, stellarArray: 1, thinkTank: 1 },
  })
  await page.goto('/')
  await openSector(page, save)
  const section = page.locator('[data-megastructure-section]')

  // 星际工程分组内：冶炼场建造按钮存在（unique 未建造时渲染）→ 点击强制走确认弹窗（不直接建造）
  const smelterItem = page.locator('[data-building="ringSmelter"]')
  await expect(smelterItem.locator('[data-build="ringSmelter"]')).toBeEnabled()
  await smelterItem.locator('[data-build="ringSmelter"]').click()
  await expect(page.locator('[data-overlay="megastructure"]')).toBeVisible()
  await expect(page.locator('[data-log]')).not.toContainText('终局抉择落定')
  // 取消 → 未建造
  await page.locator('[data-megastructure-cancel]').click()
  await expect(page.locator('[data-log]')).not.toContainText('终局抉择落定')

  // 选枢纽：确认后枢纽高亮、冶炼场锁定
  await section.locator('[data-megastructure="jumpgate"]').click()
  await expect(page.locator('[data-overlay="megastructure"]')).toBeVisible()
  await page.locator('[data-megastructure-confirm="jumpgate"]').click()
  await expect(page.locator('[data-log]')).toContainText('终局抉择落定')
  await expect(section.locator('[data-megastructure="jumpgate"]')).toHaveAttribute('data-chosen', '')
  await expect(section.locator('[data-megastructure="ringSmelter"]')).toHaveAttribute('data-locked', '')
  // 星际分组内冶炼场：唯一大件已锁定 → 建造入口隐藏、显示互斥锁定原因
  await expect(page.locator('[data-building="ringSmelter"]')).toContainText('本周目已锁定')
})

test('跃迁枢纽：探索页 5 槽全空闲可派（全科技 + 枢纽）；无枢纽显示锁定占位', async ({ page }) => {
  const now = Date.now()

  // ① 全科技 + 枢纽：5 槽全部可派遣（无锁定占位）；军港提 cap 使槽 5 兵力（42×5=210）可负担
  const withHub = buildSave(now, {
    buildings: { jumpgate: 1, militaryPort: 10 },
    upgrades: { jumpgate: 1 },
    megastructureChoice: 'jumpgate',
    techLevels: { deepSpaceNav: 1, interstellarRelay: 1 },
  })
  await page.goto('/')
  await openSector(page, withHub)
  await page.locator('[data-nav="explore"]').click()
  const explore = page.locator('[data-nav-page="explore"]')
  await expect(explore.locator('[data-expedition-locked]')).toHaveCount(0)
  await expect(explore.locator('[data-explore-dispatch]')).toHaveCount(5)
  await expect(explore.locator('[data-explore-dispatch="5"]')).toBeEnabled()

  // ② 无枢纽（全科技）：3 空闲 + 2 锁定（提示跃迁枢纽）
  await page.goto('/')
  const noHub = buildSave(now, { buildings: { militaryPort: 10 }, techLevels: { deepSpaceNav: 1, interstellarRelay: 1 } })
  await openSector(page, noHub)
  await page.locator('[data-nav="explore"]').click()
  await expect(page.locator('[data-nav-page="explore"] [data-explore-dispatch]')).toHaveCount(3)
  await expect(page.locator('[data-nav-page="explore"] [data-expedition-locked]')).toHaveCount(2)
  await expect(page.locator('[data-nav-page="explore"]')).toContainText('跃迁枢纽')
})

test('v6 旧档迁移 v7：无 megastructureChoice 字段 → 正常渲染星际工程分组并游玩', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { schemaVersion: 6, buildings: { starportMine: 1 } })
  delete (save as Record<string, unknown>).megastructureChoice
  await page.goto('/')
  await openSector(page, save)

  // 迁移不崩：星际工程分组渲染、星港 1 级升级按钮可用（megastructureChoice 缺省 null）
  const section = page.locator('[data-interstellar]')
  await expect(section).toBeVisible()
  await expect(page.locator('[data-building="starportMine"] [data-upgrade="starportMine"]')).toBeEnabled()
  // 链式未因迁移错乱：恒星（星港 1 级满足）可建造、智库（恒星 0）锁定
  await expect(page.locator('[data-building="stellarArray"] [data-build="stellarArray"]')).toBeEnabled()
  await expect(page.locator('[data-building="thinkTank"]')).toContainText('聚变恒星阵列')
})

test('NG+ 重置重选：冶炼场选择与等级被清空，重开后抉择区块消失（需重新爬链）', async ({ page }) => {
  const now = Date.now()
  // infinite 档：无结局面板、探索页渲染 NG+ 终局卡（ended 档无此卡）
  const save = buildSave(now, {
    phase: 'infinite',
    buildings: { starportMine: 1, stellarArray: 1, thinkTank: 1, ringSmelter: 1 },
    upgrades: { ringSmelter: 4 },
    megastructureChoice: 'smelter',
  })
  await page.goto('/')
  await openSector(page, save)
  await expect(page.locator('[data-megastructure="ringSmelter"]')).toHaveAttribute('data-chosen', '')

  // 探索页 NG+ 确认弹窗 → 开启新周目
  await page.locator('[data-nav="explore"]').click()
  await page.locator('[data-ngplus]').click()
  await expect(page.locator('[data-overlay="ngplus"]')).toBeVisible()
  await page.locator('[data-ngplus-confirm]').click()
  await expect(page.locator('[data-log]')).toContainText('NG+ 第 1 周目')

  // 重开：建筑/选择全清 → 抉择区块消失（前置不满足），星港回到星球锁定态（dawn 重置）
  await page.locator('[data-nav="sector"]').click()
  await expect(page.locator('[data-megastructure-section]')).toHaveCount(0)
  await expect(page.locator('[data-building="starportMine"]')).toContainText('母星')
})
