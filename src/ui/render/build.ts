// ui/render/build.ts — 建造面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderBuildPanel + 内部 helper（升级预览/购买预览/已解锁卡/锁定卡）。
// 跨域共享项（formatCost/BuildPanelRenderOptions/JUMPGATE_EFFECT_TEXT）从 shared 引入。

import type { GameState } from '../../engine/types'
import { BUILDINGS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../../engine/data'
import type { BuildingDef } from '../../engine/data'
import { buildingCost, buildingLockReason, canAffordBuilding, canAffordUpgrade, isBuildingUnlocked, upgradeCost } from '../../engine/buildings'
import { formatMultiplier, formatNumber, formatPercent, formatRate, formatTimeToSave, timeToSave } from '../../engine/format'
import { militaryCap, netProduction, simulateProductionDelta, smelterGlobalMult } from '../../engine/production'
import { iconUse } from '../icons'
import { escapeHtml } from '../helpers'
import { formatCost, JUMPGATE_EFFECT_TEXT, type BuildPanelRenderOptions } from './shared'

/** 升级预览：含全部加成（科技/星球机制/NG+/能源折减）的真实产出提升。
 * 唯一大件：升级 = 产出 ×2（机制建筑用效果文案），不走「再买一台」的台均折算。 */
function upgradePreviewText(state: GameState, def: BuildingDef): string {
  const count = state.buildings[def.id] ?? 0
  if (count <= 0) return ''
  if (def.id === 'militaryPort') {
    const current = militaryCap(state)
    const sim: GameState = {
      ...state,
      upgrades: { ...state.upgrades, militaryPort: (state.upgrades.militaryPort ?? 0) + 1 },
    }
    return `军力容量 ${formatNumber(current)} → ${formatNumber(militaryCap(sim))}（+${formatNumber(militaryCap(sim) - current)}）`
  }
  if (def.unique) {
    if (def.id === 'ringSmelter') {
      const cur = smelterGlobalMult(state)
      return `全局产出 ${formatMultiplier(cur)} → ${formatMultiplier(cur * 2)}`
    }
    if (def.id === 'jumpgate') return JUMPGATE_EFFECT_TEXT
    const up = simulateProductionDelta(state, { buildingId: def.id, levelDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = up.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
    }
    return `产出 ${formatMultiplier(2)}（${parts.join('，')}）`
  }
  const up = simulateProductionDelta(state, { buildingId: def.id, levelDelta: 1 })
  // 每台当前真实净产出 = 再买一台的总增量（同一加成口径）
  const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const total = up.delta[k]
    if (total === 0) continue
    const perNow = buy.delta[k]
    const perNext = perNow + total / count
    parts.push(`${RESOURCE_META[k].symbol} ${formatRate(perNow)} → ${formatRate(perNext)}/台（总 ${formatRate(total)}）`)
  }
  return parts.join('，') || '无产出变化'
}

/** 购买预览：购买 1 台后的真实产出提升（即每台净贡献，含能源消耗提示）。
 * 唯一大件：建造预览（机制建筑用效果文案；产出建筑用 delta，count 0→1 有效） */
function buyPreviewText(state: GameState, def: BuildingDef): string {
  if (def.unique) {
    if (def.id === 'ringSmelter') return `建造：解锁全局产出乘数 ${formatMultiplier(2)}^等级（需升级激活）`
    if (def.id === 'jumpgate') return JUMPGATE_EFFECT_TEXT
    const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = buy.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
    }
    return `建造：${parts.join('，') || '无产出'}`
  }
  const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const d = buy.delta[k]
    if (d === 0) continue
    parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
  }
  const consumes = (def.consumes && RESOURCE_KEYS.some((k) => (def.consumes![k] ?? 0) > 0))
    ? ` · 耗 ${RESOURCE_KEYS.filter((k) => (def.consumes![k] ?? 0) > 0).map((k) => `${RESOURCE_META[k].symbol}${formatRate(def.consumes![k] ?? 0, false)}`).join(' ')}`
    : ''
  return `购买 ${formatNumber(1)} 台：${parts.join('，') || '无产出'}${consumes}`
}

/** 已解锁建造项卡片（图标 + 信息 + 预览 + 按钮组） */
function renderBuildingCard(state: GameState, def: BuildingDef, flashId: string | null): HTMLElement {
  const unique = def.unique === true
  const count = state.buildings[def.id] ?? 0
  const level = state.upgrades[def.id] ?? 0
  const card = document.createElement('div')
  card.className = `build-card${flashId === def.id ? ' just-upgraded' : ''}`
  card.setAttribute('data-building', def.id)
  card.setAttribute('data-build-card', def.id)
  if (unique) card.setAttribute('data-unique', '')

  const info = `
    <div class="build-info">
      <div class="build-name">
        ${escapeHtml(def.name)}
        ${unique ? '<span class="build-count unique-badge">唯一大件</span>' : `<span class="build-count">×${formatNumber(count)}</span>`}
        ${level > 0 ? `<span class="build-level">Lv.${formatNumber(level)}</span>` : ''}
      </div>
      <div class="build-desc">${escapeHtml(def.desc)}</div>
    </div>`

  const buyCost = buildingCost(state, def.id)
  const canBuy = canAffordBuilding(state, def.id)
  const upCost = upgradeCost(state, def.id)
  const canUp = canAffordUpgrade(state, def.id)
  // unique 建筑按 maxLevel 封顶：满级后升级按钮替换为「已满级」提示（如船坞 Lv3）
  const maxed = unique && def.maxLevel != null && level >= def.maxLevel
  // 唯一大件：已建造后隐藏购买入口（count 恒 1），只保留单级升级；买满/升满按钮一律不渲染（禁 bulk）
  const showBuy = !unique || count <= 0
  // cost-softcap Q10：买入成本相对当前净产出的「≈N 秒产出」（瓶颈资源口径；无成本/产出全 0 时省略）
  const costTime = showBuy
    ? timeToSave(buyCost, netProduction(state))
    : null
  const costTimeRow = costTime != null && !unique
    ? `<div class="build-cost-time" data-cost-time="${def.id}">买入 ${formatTimeToSave(costTime)}</div>`
    : ''
  const buyBtn = showBuy
    ? `<button type="button" class="build-btn" data-build="${def.id}" ${canBuy ? '' : 'disabled'} title="${unique ? `建造（唯一大件，升级产出 ${formatMultiplier(2)}/级）` : '建造'}">
        ${unique ? '建造 ' : ''}${formatCost(buyCost)}
      </button>`
    : ''
  const bulkBuyBtns = !unique
    ? `<button type="button" class="build-btn" data-buy-limit="${def.id}:10" ${canBuy ? '' : 'disabled'}>+10</button>
       <button type="button" class="build-btn" data-buy-limit="${def.id}:100" ${canBuy ? '' : 'disabled'}>+100</button>`
    : ''
  // 升级按钮组：jumpgate 无升级效果（上游 f0458b0 决策）、maxLevel 满级后替换为「已满级」提示（如船坞 Lv3）
  const upgradeBtns = count > 0 && def.id !== 'jumpgate'
    ? maxed
      ? `        <div class="build-lock"><span class="lock-hint researched-hint">✓ 已满级（Lv.${formatNumber(def.maxLevel ?? 0)}）</span></div>`
      : `        <button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="${unique ? `升级：产出 ${formatMultiplier(2)}（${formatCost(upCost)}）` : def.id === 'militaryPort' ? `升级：军力容量 +${formatPercent(50)}` : `升级：产出 +${formatPercent(50)}`}">
          升级 ${formatCost(upCost)}
        </button>
        ${unique ? '' : `        <button type="button" class="build-btn upgrade-btn" data-upgrade-limit="${def.id}:10" ${canUp ? '' : 'disabled'}>+10</button>
        <button type="button" class="build-btn upgrade-btn" data-upgrade-limit="${def.id}:100" ${canUp ? '' : 'disabled'}>+100</button>`}`
    : ''
  // 隐藏入口（hidden-buildings）：从面板隐藏此建造物（恢复走头部「已隐藏」抽屉）
  const hideBtn = `<button type="button" class="build-btn build-hide-btn" data-hide-building="${def.id}" title="从建造面板隐藏此建筑（可在「已隐藏」抽屉恢复）">✕ 隐藏</button>`
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      ${info}
      <div class="build-preview">
        ${count > 0 ? `<div class="build-upgrade-preview">升级：${upgradePreviewText(state, def)}</div>` : ''}
        ${showBuy ? `<div class="build-buy-preview">${buyPreviewText(state, def)}</div>` : ''}
        ${costTimeRow}
      </div>
    </div>
    <div class="build-actions">${buyBtn}${bulkBuyBtns}${upgradeBtns}${hideBtn}</div>`
  return card
}

/** 未解锁建造项卡片（灰化图标 + 解锁条件；data-locked 语义化标记，点击无副作用由委托判定） */
function renderLockedCard(state: GameState, def: BuildingDef): HTMLElement {
  const unique = def.unique === true
  const card = document.createElement('div')
  card.className = 'build-card locked'
  card.setAttribute('data-building', def.id)
  card.setAttribute('data-build-card', def.id)
  card.setAttribute('data-locked', '')
  if (unique) card.setAttribute('data-unique', '')
  // 锁定原因优先取引擎判定（通关/星球/满级科技/链式前置），缺省回退 requires 拼接
  const lockReason = buildingLockReason(state, def.id)
  const reqParts = lockReason
    ? [lockReason]
    : [
        ...(def.requires ?? []).map((r) => `建筑·${BUILDINGS[r]?.name ?? r}`),
        ...(def.requiresTech ?? []).map((t) => `科技·${TECHS[t]?.name ?? t}`),
      ]
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${unique ? '<span class="build-count unique-badge">唯一大件</span>' : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}</div>
      </div>
      <div class="build-lock">
        <span class="lock-hint">${escapeHtml(reqParts.join('、'))}</span>
      </div>
    </div>`
  return card
}

/**
 * 渲染建造面板（卡片网格，building-cards spec）：
 * 每个建造项 = 图标 + 信息区（名称/徽标/描述/预览）+ 按钮组；未解锁建筑渲染锁定卡（灰化图标 + 解锁条件）。
 * 存量契约原样保留：`data-building` 容器、`.build-count` 徽标、`.build-upgrade-preview`/`.build-buy-preview`、
 * `data-build`/`data-upgrade`/`data-buy-limit`/`data-upgrade-limit` 按钮、锁定文案（buildingLockReason）。
 */
export function renderBuildPanel(el: HTMLElement, state: GameState, defs: Record<string, BuildingDef>, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  const defList = Object.values(defs)
  const hiddenSet = new Set(state.hiddenBuildings)
  const unlockedDefs = defList.filter((d) => isBuildingUnlocked(state, d.id) && !hiddenSet.has(d.id))
  const hiddenDefs = defList.filter((d) => isBuildingUnlocked(state, d.id) && hiddenSet.has(d.id))
  const lockedDefs = defList.filter((d) => !isBuildingUnlocked(state, d.id))

  // 已隐藏建造物（hidden-buildings）：面板头部「已隐藏 (N)」按钮 + 展开抽屉（恢复入口）
  if (hiddenDefs.length > 0) {
    const bar = document.createElement('div')
    bar.className = 'build-hidden-bar'
    bar.setAttribute('data-build-hidden-bar', '')
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'build-hidden-toggle'
    toggle.setAttribute('data-show-hidden-buildings', '')
    toggle.textContent = `已隐藏 (${hiddenDefs.length})`
    bar.appendChild(toggle)
    el.appendChild(bar)
    if (opts.hiddenBuildingsOpen) {
      const drawer = document.createElement('div')
      drawer.className = 'build-hidden-drawer'
      drawer.setAttribute('data-build-hidden-drawer', '')
      for (const def of hiddenDefs) {
        const row = document.createElement('div')
        row.className = 'build-hidden-row'
        row.setAttribute('data-hidden-building-row', def.id)
        const icon = document.createElement('span')
        icon.className = 'build-hidden-icon'
        icon.innerHTML = iconUse(def.id)
        const name = document.createElement('span')
        name.className = 'build-hidden-name'
        name.textContent = def.name
        const restore = document.createElement('button')
        restore.type = 'button'
        restore.className = 'build-hidden-restore'
        restore.setAttribute('data-unhide-building', def.id)
        restore.textContent = '恢复'
        row.append(icon, name, restore)
        drawer.appendChild(row)
      }
      el.appendChild(drawer)
    }
  }

  const grid = document.createElement('div')
  grid.className = 'build-grid'
  grid.setAttribute('data-build-grid', '')
  for (const def of unlockedDefs) {
    grid.appendChild(renderBuildingCard(state, def, opts.flashId ?? null))
  }

  // 锁定卡折叠：启用折叠（zoneId）且 >3 张 → 只展示前 3 张 + 折叠行；否则全部展示
  const zoneId = opts.zoneId
  const expanded = zoneId ? Boolean(opts.lockedExpanded?.[zoneId]) : false
  const showAllLocked = !zoneId || expanded || lockedDefs.length <= 3
  const shownLocked = showAllLocked ? lockedDefs : lockedDefs.slice(0, 3)
  for (const def of shownLocked) {
    grid.appendChild(renderLockedCard(state, def))
  }
  el.appendChild(grid)

  if (zoneId && lockedDefs.length > 3) {
    const collapse = document.createElement('button')
    collapse.type = 'button'
    collapse.className = 'locked-collapse'
    collapse.setAttribute('data-locked-collapse', zoneId)
    collapse.setAttribute('data-expanded', expanded ? 'true' : 'false')
    collapse.textContent = expanded ? '收起锁定项 ▴' : `还有 ${lockedDefs.length - 3} 项未解锁 ▾`
    el.appendChild(collapse)
  }
}