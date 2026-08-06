import { test, expect } from '@playwright/test'
import { dismissTutorial, lockSaveStore, seedSave } from './helpers'

function buildUiSave(now: number) {
  return {
    schemaVersion: 6,
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
    resources: { mineral: 5_000_000, energy: 1_000_000, tech: 200_000, military: 5_000 },
    buildings: { miner: 1, solar: 1, lab: 1, militaryPort: 1 },
    upgrades: {},
    techLevels: { planetDrill: 1, deepSpaceNav: 1, interstellarRelay: 1 },
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: true },
      ice: { unlocked: true },
      gas: { unlocked: true },
      dawn: { unlocked: true },
    },
    activePlanet: 'barren',
    expeditions: [{
      id: 1,
      startedAt: now - 10 * 60_000,
      finishAt: now + 50 * 60_000,
      cost: { mineral: 90_000, energy: 45_000, military: 40 },
      result: { kind: 'resource', mineral: 67_500, tech: 450, energy: 33_750 },
      resolved: false,
    }],
    exploredFactions: [],
    exploredPlanets: [],
    nextExpeditionId: 2,
    factions: {
      ferro: { favor: 70, allied: false, tradeCount: 0, intimidateCount: 0, threat: 20 },
      lumen: { favor: 45, allied: false, tradeCount: 0, intimidateCount: 0, threat: 15 },
      cygnus: { favor: 30, allied: false, tradeCount: 0, intimidateCount: 0, threat: 10 },
      vox: { favor: 15, allied: false, tradeCount: 0, intimidateCount: 0, threat: 5 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: { firstBuild: true, firstAlliance: true, orbitalUnlocked: true, firstConquest: true, conquestAll: true },
    tutorialStep: -1,
    log: [{ id: 1, time: now, type: 'system' as const, text: 'UI redesign E2E' }],
    nextLogId: 2,
    playSeconds: 7200,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

async function seedUiSave(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  const save = buildUiSave(Date.now())
  await seedSave(page, save)
  await lockSaveStore(page)
  await page.reload()
  await dismissTutorial(page)
  const closeEnding = page.locator('[data-ending="close"]')
  if (await closeEnding.isVisible().catch(() => false)) await closeEnding.click()
}

test('boot 序列首次显示、按键跳过且刷新不重放', async ({ page }) => {
  await page.goto('/')
  const boot = page.locator('[data-boot]')
  await expect(boot).toBeVisible()
  await page.mouse.click(0, 0)
  await expect(boot).toBeHidden()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-boot-seen'))).toBe('1')

  await page.reload()
  await expect(boot).toBeHidden()
})

test('一级导航使用对应 SVG 图标引用', async ({ page }) => {
  await page.goto('/')
  for (const nav of ['sector', 'archive', 'explore', 'settings']) {
    await expect(page.locator(`[data-nav="${nav}"] svg use`)).toHaveAttribute('href', `#ic-nav-${nav}`)
  }
})

test('主操作按钮使用方括号命令皮肤', async ({ page }) => {
  await seedUiSave(page)
  const dispatch = page.locator('[data-explore-dispatch="2"]')
  await page.locator('[data-nav="explore"]').click()
  await expect(dispatch).toBeVisible()
  await expect.poll(() => dispatch.evaluate((el) => getComputedStyle(el, '::before').content)).toContain('[')
})

test('扫描线存在且不拦截交互', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-scanline]')).toBeAttached()
  await expect.poll(() => page.locator('[data-scanline]').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
})

test('好感与派遣进度渲染 ASCII 进度条', async ({ page }) => {
  await seedUiSave(page)

  await page.locator('[data-nav="sector"]').click()
  await page.locator('[data-tab="diplomacy"]').click()
  await expect(page.locator('[data-panel="diplomacy"] [data-progress]').first()).toContainText(/[█░]/)

  await page.locator('[data-nav="explore"]').click()
  await expect(page.locator('[data-expedition-progress] [data-progress]')).toContainText(/[█░]/)
})

test('移动端可见按钮满足 44px 触控目标', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const actionable = '[data-nav], [data-tab], [data-tool], [data-planet], [data-build], [data-upgrade], [data-research], [data-buy-max], [data-upgrade-max], [data-convert-tech], [data-convert-max]'
  const issues = await page.locator(actionable).evaluateAll((buttons) => buttons
    .filter((button) => {
      const rect = button.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && button.offsetParent !== null
    })
    .filter((button) => button.getBoundingClientRect().height < 44)
    .map((button) => button.dataset.nav ?? button.dataset.tab ?? button.dataset.tool ?? 'unlabelled button'))
  expect(issues).toEqual([])
})

test('全局 token 应用终端背景与 JetBrains Mono 字体', async ({ page }) => {
  await page.goto('/')
  const styles = await page.evaluate(() => {
    const computed = getComputedStyle(document.body)
    return { backgroundColor: computed.backgroundColor, fontFamily: computed.fontFamily }
  })
  expect(styles.backgroundColor).toBe('rgb(5, 5, 5)')
  expect(styles.fontFamily).toContain('JetBrains Mono')
})
