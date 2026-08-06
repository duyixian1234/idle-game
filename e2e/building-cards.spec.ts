import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'
import { ACHIEVEMENTS } from '../src/engine/achievements'

/**
 * 卡片化建造项 + SVG 图标 E2E（building-cards，存档 v8）：用户手动执行。
 * 回归点：① 卡片主体点击建造×1（资源扣减 + 徽标变化）；② 卡片主体点击升级×1；
 * ③ megastructure 卡片点击走终局抉择弹窗；④ 锁定卡折叠展开/收起（每区 >3 张）；
 * ⑤ 移动端网格单列审计（复用 mobile.spec 审计断言模式：无溢出/按钮不越界 + 单列）。
 * 注入技巧：seedSave + lockSaveStore；playing 档派系未统一（防 tick 转 ended 遮罩拦截点击）。
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
  buildings?: Record<string, number>
  upgrades?: Record<string, number>
  resources?: Record<string, number>
  planets?: Record<string, { unlocked: boolean }>
  megastructureChoice?: 'smelter' | 'jumpgate' | null
  storyFlags?: Record<string, boolean>
}

/** 构造 v8 存档（默认 playing + 派系未统一 + 全星球解锁可配）；megastructure 用例用 infinite（无结局面板遮挡） */
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
    resources: { mineral: 1_000_000, energy: 500_000, tech: 100_000, military: 50_000 },
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
    log: [{ id: 1, time: now, type: 'system', text: 'building-cards 测试存档' }],
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
  if (overrides.planets) merged.planets = { ...(base.planets as Record<string, { unlocked: boolean }>), ...overrides.planets }
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

/** 注入存档并进入星域页（playing/infinite 档无结局面板；infinite 无遮罩） */
async function openSector(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.goto('/')
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  await page.locator('[data-nav="sector"]').click()
}

/** 读取资源条数值（formatNumber 千分位逗号 → 纯数字） */
async function readResource(page: Page, key: string): Promise<number> {
  const text = await page.locator(`[data-resource="${key}"] [data-res-value]`).textContent()
  return Number((text ?? '0').replace(/,/g, ''))
}

test('卡片主体点击建造×1：资源扣减 + 徽标变化 + 日志（miner 未建）', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now)
  save.buildings = {}
  await openSector(page, save)

  // 卡片契约：data-build-card 存在、图标 use 引用 sprite、未建徽标 ×0
  const card = page.locator('[data-build-card="miner"]')
  await expect(card).toBeVisible()
  await expect(card.locator('use')).toHaveAttribute('href', '#ic-miner')
  await expect(card).toContainText('×0')

  const mineralBefore = await readResource(page, 'mineral')
  // 点击卡片主体（data-build-card 挂卡片根节点，几何中心落在信息区非按钮区）
  await card.click()
  await expect(page.locator('[data-log]')).toContainText('建造了 采矿机')
  await expect(card).toContainText('×1')
  const mineralAfter = await readResource(page, 'mineral')
  expect(mineralBefore - mineralAfter).toBeGreaterThanOrEqual(10)
})

test('卡片主体点击升级×1：已建建筑升级（资源扣减 + Lv 徽标）', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, { buildings: { miner: 2 }, resources: { mineral: 100_000, energy: 500_000, tech: 100_000, military: 50_000 } })
  await openSector(page, save)

  const card = page.locator('[data-build-card="miner"]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('×2')
  await expect(card.locator('[data-upgrade="miner"]')).toBeVisible()

  const mineralBefore = await readResource(page, 'mineral')
  await card.click()
  await expect(page.locator('[data-log]')).toContainText('采矿机 升级至 Lv.1')
  await expect(card).toContainText('Lv.1')
  const mineralAfter = await readResource(page, 'mineral')
  expect(mineralBefore - mineralAfter).toBeGreaterThan(0)
})

test('megastructure 卡片点击 → 终局抉择确认弹窗（infinite 档无遮罩）', async ({ page }) => {
  const now = Date.now()
  const save = buildSave(now, {
    phase: 'infinite',
    buildings: { starportMine: 1, stellarArray: 1, thinkTank: 1 },
    upgrades: { deepDrill: 10, starportMine: 1, stellarArray: 1, thinkTank: 1 },
    resources: { mineral: 10_000_000_000, energy: 1_000_000_000, tech: 1_000_000_000, military: 50_000 },
  })
  save.endingTriggered = true
  await openSector(page, save)

  const card = page.locator('[data-build-card="ringSmelter"]')
  await expect(card).toBeVisible()
  // 未建终局抉择建筑：点击卡片主体 → 弹确认弹窗（不直接建造，互斥知情决策）
  await card.click()
  await expect(page.locator('[data-overlay="megastructure"]')).toBeVisible()
  await expect(page.locator('[data-megastructure-modal]')).toContainText('终局抉择')
  await expect(page.locator('[data-megastructure-confirm="ringSmelter"]')).toBeVisible()
  await page.locator('[data-megastructure-cancel]').click()
  await expect(page.locator('[data-overlay="megastructure"]')).toBeHidden()
})

test('锁定卡折叠：>3 张折叠行 → 点击展开全显 → 再点收起（星际工程区）', async ({ page }) => {
  const now = Date.now()
  // playing 档 + 母星/深钻满级 → 星港解锁 → 星际工程其余 5 个锁定 → 折叠
  const save = buildSave(now, {
    buildings: { miner: 5 },
    upgrades: { deepDrill: 10 },
    resources: { mineral: 100_000_000, energy: 10_000_000, tech: 5_000_000, military: 50_000 },
  })
  await openSector(page, save)

  const section = page.locator('[data-interstellar]')
  const collapse = section.locator('[data-locked-collapse]')
  await expect(collapse).toBeVisible()
  await expect(collapse).toContainText('还有 2 项未解锁')
  await expect(section.locator('[data-build-card][data-locked]')).toHaveCount(3)

  // 展开：全显（5 张锁定卡）
  await collapse.click()
  await expect(section.locator('[data-build-card][data-locked]')).toHaveCount(5)
  await expect(section.locator('[data-locked-collapse]')).toContainText('收起锁定项')

  // 再点收起：回折叠态
  await section.locator('[data-locked-collapse]').click()
  await expect(section.locator('[data-build-card][data-locked]')).toHaveCount(3)
  await expect(section.locator('[data-locked-collapse]')).toContainText('还有 2 项未解锁')
})

test.describe('移动端网格单列审计（复用 mobile.spec 审计模式）', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

  test('建造面板单列网格、无溢出/重叠/越界，卡片按钮可点击', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const now = Date.now()
    const save = buildSave(now, {
      buildings: { miner: 20, solar: 10, lab: 5, refinery: 3, deepDrill: 2 },
      upgrades: { miner: 3, solar: 2, lab: 1 },
      techLevels: { planetDrill: 1, deepDrill: 1 },
      resources: { mineral: 10_000_000, energy: 5_000_000, tech: 1_000_000, military: 50_000 },
    })
    await page.goto('/')
    await seedSave(page, save)
    await lockSaveStore(page)
    await page.reload()
    await dismissTutorial(page)
    await page.locator('[data-nav="sector"]').click()
    await page.waitForTimeout(400)

    // 页面级 + 容器级水平溢出
    const audit = await page.evaluate(() => {
      const issues: string[] = []
      const vw = window.innerWidth
      if (document.documentElement.scrollWidth > vw + 1) {
        issues.push(`页面 scrollWidth=${document.documentElement.scrollWidth} > 视口 ${vw}`)
      }
      for (const sel of ['.panel-body', '[data-log]', '.resource-bar', '.planet-bar']) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          if (el.scrollWidth > el.clientWidth + 1) issues.push(`${sel} 横向溢出 ${el.scrollWidth}/${el.clientWidth}`)
        }
      }
      // 可见按钮不越出视口
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
        if (b.closest('[data-overlay], .tutorial')) return false
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && b.offsetParent !== null
      })
      for (const b of buttons) {
        const r = b.getBoundingClientRect()
        if (r.left < -1 || r.right > vw + 1) issues.push(`按钮越界：${(b.dataset.build || b.dataset.upgrade || b.className)} x=[${Math.round(r.left)},${Math.round(r.right)}]`)
      }
      // 同组按钮重叠
      for (const c of Array.from(document.querySelectorAll<HTMLElement>('.build-actions'))) {
        const btns = Array.from(c.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
          const r = b.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        for (let i = 0; i < btns.length; i++) {
          for (let j = i + 1; j < btns.length; j++) {
            const a = btns[i].getBoundingClientRect()
            const b = btns[j].getBoundingClientRect()
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (w > 1 && h > 1) issues.push(`按钮重叠：${btns[i].textContent?.trim().slice(0, 8)} × ${btns[j].textContent?.trim().slice(0, 8)}`)
          }
        }
      }
      // 网格列数（≤480px 单列铁律；data-build-grid 语义化容器引用）
      const grid = document.querySelector('[data-build-grid]')
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
      return { issues, cols }
    })

    expect(audit.issues, `移动端 360px 布局问题：\n${audit.issues.join('\n')}`).toEqual([])
    expect(audit.cols, '≤480px 建造网格应为单列').toBe(1)

    // 关键按钮可点击（升级按钮真实可点 → 确认弹窗 → Esc 关闭）
    await page.locator('[data-upgrade="miner"]').click()
    await expect(page.locator('[data-log]')).toContainText('升级至')

    await page.waitForTimeout(400)
    expect(pageErrors, '存在未捕获异常').toEqual([])
  })
})
