import { test, expect } from '@playwright/test'
import { lockSaveStore, seedSave } from './helpers'

/**
 * 移动端可游玩性验证（spec 决策 21：手机打开正常游玩）。
 * 注入中期存档（多建筑/多按钮/科技升级/外交全按钮/多星球），在手机视口下审计：
 *   1. 页面/容器水平溢出（scrollWidth > clientWidth）
 *   2. 按钮越出视口（x 越界）
 *   3. 同组按钮互相重叠（叠在一起）
 *   4. 按钮被其他元素遮挡（elementsFromPoint 顶层非自身）
 *   5. 关键操作可点击（升级/升满按钮真实可点）
 * 全部问题收集后统一断言，并输出截图证据。
 */

/** 构造 schemaVersion=2 中期存档：资源充足、建筑多、科技已研发可升级、外交全部可见 */
function buildMidSave(now: number) {
  return {
    schemaVersion: 2,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    stats: { totalMineralEarned: 0 },
    resources: { mineral: 1_000_000, energy: 800_000, tech: 200_000 },
    buildings: { miner: 20, solar: 10, lab: 5, refinery: 3, deepDrill: 2 },
    upgrades: { miner: 3, solar: 2, lab: 1 },
    techLevels: { planetDrill: 3, solarEfficiency: 2, computingBoost: 1, deepDrill: 1 },
    planets: {
      barren: { unlocked: true },
      orbital: { unlocked: true },
      ice: { unlocked: true },
      gas: { unlocked: false },
      dawn: { unlocked: false },
    },
    activePlanet: 'orbital',
    factions: {
      ferro: { favor: 60, allied: false, tradeCount: 3, intimidateCount: 0, threat: 40 },
      lumen: { favor: 55, allied: false, tradeCount: 2, intimidateCount: 1, threat: 30 },
      cygnus: { favor: 50, allied: false, tradeCount: 2, intimidateCount: 0, threat: 50 },
      vox: { favor: 45, allied: false, tradeCount: 1, intimidateCount: 2, threat: 60 },
    },
    planetStaySeconds: 0,
    lastStormHarvestAt: now,
    storyFlags: {},
    tutorialStep: -1, // 已跳过引导，消除浮层干扰
    log: [{ id: 1, time: now, type: 'system' as const, text: '移动端验证存档' }],
    nextLogId: 2,
    playSeconds: 0,
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: now + 45_000,
    lastTick: now,
    createdAt: now,
  }
}

interface AuditIssue {
  kind: 'overflow' | 'outOfViewport' | 'overlap' | 'covered'
  detail: string
}

/** 页面内审计：收集所有布局问题（不抛错，交由测试端统一断言） */
function auditLayout(): AuditIssue[] {
  const issues: AuditIssue[] = []
  const vw = window.innerWidth
  const isVisible = (b: HTMLElement): boolean => {
    const r = b.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && b.offsetParent !== null
  }

  // 1) 页面级 + 容器级水平溢出
  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push({ kind: 'overflow', detail: `页面 scrollWidth=${document.documentElement.scrollWidth} > 视口 ${vw}` })
  }
  for (const sel of ['.panel-body', '.log-area', '.mechanic-bar', '.favor-row', '.resource-bar', '.planet-bar', '.panel-tabs', '.event-options', '.exchange-row']) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.scrollWidth > el.clientWidth + 1) {
        issues.push({ kind: 'overflow', detail: `${sel} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}` })
      }
    }
  }

  // 1b) 日志区保底高度：日志流是叙事主体，必须保证 ≥18vh 可见，防面板挤压
  const logArea = document.querySelector('.log-area')
  if (logArea) {
    const lh = logArea.getBoundingClientRect().height
    if (lh < window.innerHeight * 0.18 - 2) {
      issues.push({ kind: 'logHeight', detail: `日志区高度 ${Math.round(lh)}px < 18vh（${Math.round(window.innerHeight * 0.18)}px），被操作面板挤压` })
    }
  }

  // 1c) 星球切换导航必须全部可见可点（横向滚动曾把后 2-3 个星球藏到屏外）
  const planetChips = Array.from(document.querySelectorAll<HTMLElement>('.planet-bar .planet-chip'))
  for (const c of planetChips) {
    const r = c.getBoundingClientRect()
    if (r.left < -1 || r.right > vw + 1) {
      issues.push({ kind: 'outOfViewport', detail: `星球 chip「${c.textContent?.trim()}」x=[${Math.round(r.left)},${Math.round(r.right)}] 越出视口，无法切换区域` })
    }
  }

  // 2) 主流程按钮越出视口（排除浮层 overlay 内部按钮；星球 chip 由 1c 专项检查）
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
    if (b.closest('.ending-overlay, .buy-max-overlay, .tutorial')) return false
    return isVisible(b)
  })
  for (const b of buttons) {
    const r = b.getBoundingClientRect()
    if (r.left < -1 || r.right > vw + 1) {
      const tag = b.dataset.build || b.dataset.upgrade || b.dataset.research || b.dataset.upgradeTech || b.dataset.diplomacy || b.dataset.buyMax || b.dataset.upgradeMax || b.dataset.tab || b.dataset.tool || b.dataset.planet || b.className
      issues.push({ kind: 'outOfViewport', detail: `<button .${b.className.replace(/\s+/g, '.')} ${tag}> x=[${Math.round(r.left)},${Math.round(r.right)}] 视口宽 ${vw}` })
    }
  }

  // 3) 同组按钮互相重叠
  for (const c of Array.from(document.querySelectorAll<HTMLElement>('.build-actions, .faction-actions, .event-options, .exchange-row, .panel-tabs'))) {
    const btns = Array.from(c.querySelectorAll<HTMLButtonElement>('button')).filter(isVisible)
    for (let i = 0; i < btns.length; i++) {
      for (let j = i + 1; j < btns.length; j++) {
        const a = btns[i].getBoundingClientRect()
        const b = btns[j].getBoundingClientRect()
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (w > 1 && h > 1) {
          issues.push({ kind: 'overlap', detail: `容器 ${c.className} 内按钮 i=${i}（${btns[i].textContent?.trim().slice(0, 12)}）与 j=${j}（${btns[j].textContent?.trim().slice(0, 12)}）重叠 ${Math.round(w)}×${Math.round(h)}px` })
        }
      }
    }
  }

  // 4) 按钮中心点被其他元素遮挡
  for (const b of buttons) {
    const r = b.getBoundingClientRect()
    if (r.left < 0 || r.right > vw) continue // 已越界，不重复报
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue
    const top = document.elementsFromPoint(cx, cy).at(-1)
    if (top && top !== b && !b.contains(top) && !top.contains(b)) {
      issues.push({ kind: 'covered', detail: `<button .${b.className}> 中心 (${Math.round(cx)},${Math.round(cy)}) 顶层元素为 <${top.tagName.toLowerCase()} .${(top as HTMLElement).className}>` })
    }
  }

  return issues
}

const VIEWPORTS = [
  { name: 'iphone12-390x844', width: 390, height: 844 },
  { name: 'android-360x740', width: 360, height: 740 },
  { name: 'iphoneSE1-320x568', width: 320, height: 568 },
] as const

for (const vp of VIEWPORTS) {
  test.describe(`移动端 ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true })

    test('三个面板均无溢出/重叠/遮挡，且关键按钮可点击', async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))

      await page.goto('/')
      const schemaVersion = await seedSave(page, buildMidSave(Date.now()))
      expect(schemaVersion).toBe(2)
      await lockSaveStore(page)
      await page.reload()
      await expect(page.locator('[data-resource="mineral"]')).toBeVisible()
      await page.waitForTimeout(400) // 主循环跑几轮，几何稳定

      const allIssues: AuditIssue[] = []
      const screens: string[] = []

      // 建造面板
      const buildIssues = await page.evaluate(auditLayout)
      allIssues.push(...buildIssues)
      screens.push(await page.screenshot({ path: `test-results/mobile-${vp.name}-build.png`, fullPage: false }))

      // 科技面板
      await page.locator('.tab[data-tab="tech"]').click()
      await page.waitForTimeout(400)
      const techIssues = await page.evaluate(auditLayout)
      allIssues.push(...techIssues)
      screens.push(await page.screenshot({ path: `test-results/mobile-${vp.name}-tech.png`, fullPage: false }))

      // 外交面板
      await page.locator('.tab[data-tab="diplomacy"]').click()
      await page.waitForTimeout(400)
      const diploIssues = await page.evaluate(auditLayout)
      allIssues.push(...diploIssues)
      screens.push(await page.screenshot({ path: `test-results/mobile-${vp.name}-diplo.png`, fullPage: false }))

      // 5) 可点击性探测：建造面板升满按钮（若越界则真实点击必然失败）
      await page.locator('.tab[data-tab="build"]').click()
      await page.waitForTimeout(300)
      let upgradeMaxClickable = true
      try {
        await page.locator('[data-upgrade-max="miner"]').click({ timeout: 3_000 })
        // 升满按钮会打开确认弹窗（buy-max 设计行为）→ Esc 关闭，避免遮挡后续点击
        await page.keyboard.press('Escape')
        await expect(page.locator('.buy-max-overlay')).toHaveClass(/hidden/)
      } catch (err) {
        upgradeMaxClickable = false
        allIssues.push({ kind: 'outOfViewport', detail: `点击 [data-upgrade-max="miner"] 失败：${err instanceof Error ? err.message.split('\n')[0] : err}` })
      }

      // 6) 星球切换行为：点击可见的已解锁「冰封星」chip 必须切换成功
      const iceChip = page.locator('[data-planet="ice"]')
      await iceChip.click()
      await expect(page.locator('.planet-chip.active')).toHaveAttribute('data-planet', 'ice')

      await page.waitForTimeout(800)
      expect(pageErrors, '存在未捕获异常').toEqual([])

      const summary = allIssues.length === 0
        ? '✅ 无布局问题'
        : allIssues.map((i) => `[${i.kind}] ${i.detail}`).join('\n')
      const clickNote = upgradeMaxClickable ? '' : '\n[点击] 升满按钮无法点击'
      console.log(`\n===== ${vp.name} 审计结果 =====\n${summary}${clickNote}\n截图：${screens.join(', ')}`)
      expect(allIssues, `移动端 ${vp.name} 布局问题：\n${summary}${clickNote}`).toEqual([])
    })
  })
}
