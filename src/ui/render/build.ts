// ui/render/build.ts — 建造面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderBuildPanel + 内部 helper（升级预览/购买预览/已解锁卡/锁定卡）。
// 跨域共享项（formatCost/BuildPanelRenderOptions/jumpgateEffectText()）从 shared 引入。

import { t } from '../../i18n'
import type { GameState } from '../../engine/types'
import {BUILDINGS, RESOURCE_META, RESOURCE_KEYS, TECHS, defName, defDesc} from '../../engine/data'
import type { BuildingDef } from '../../engine/data'
import {buildingCost, buildingLockReason, canAffordBuilding, canAffordUpgrade, isBuildingUnlocked, upgradeCost} from '../../engine/buildings'
import {formatMultiplier, formatNumber, formatPercent, formatRate, formatTimeToSave, timeToSave} from '../../engine/format'
import {netProduction, simulateProductionDelta, smelterGlobalMult} from '../../engine/production'
import {JUMPGATE_HARVEST_PCT_PER_LEVEL, WORMHOLE_CAP_PER_LEVEL} from '../../engine/balance'
import {JUMPGATE_SLOT_TABLE} from '../../engine/exploration'
import {iconUse} from '../icons'
import {escapeHtml} from '../helpers'
import {formatCost, jumpgateEffectText, wormholeEffectText, type BuildPanelRenderOptions} from './shared'

/** 升级预览（仅 unique 大件）：含全部加成（科技/星球机制/NG+/能源折减）的真实产出提升。
 * 普通建筑无升级（ADR-0036 机制二分），不渲染升级预览。 */
function upgradePreviewText(state: GameState, def: BuildingDef): string {
  const count = state.buildings[def.id] ?? 0
  if (count <= 0) return ''
  if (def.unique) {
    if (def.id === 'ringSmelter') {
      const cur = smelterGlobalMult(state)
      return t('ui.build.0', { a0: formatMultiplier(cur), a1: formatMultiplier(cur * 2) })
    }
    if (def.id === 'jumpgate') {
      // ADR-0038：枢纽 10 级化 → 升级预览显示当前→下一级（槽位/收获倍率），满级回退能力描述
      const lv = state.upgrades.jumpgate ?? 0
      if (lv <= 0 || lv >= 10) return jumpgateEffectText()
      const cur = 1 + JUMPGATE_HARVEST_PCT_PER_LEVEL * lv
      const next = 1 + JUMPGATE_HARVEST_PCT_PER_LEVEL * (lv + 1)
      return t('ui.build.1', { a0: formatNumber(lv + 1), a1: formatNumber(5 + JUMPGATE_SLOT_TABLE[lv + 1]), a2: formatMultiplier(cur), a3: formatMultiplier(next) })
    }
    if (def.id === 'wormhole') {
      // wormhole-empire：虫洞机制流 → 升级预览显示下一级新增效果（槽位/能源/权重/上限），满级回退能力描述
      const lv = state.upgrades.wormhole ?? 0
      if (lv <= 0 || lv >= 10) return wormholeEffectText()
      return t('ui.build.2', { a0: formatNumber(lv + 1), a1: formatPercent(5), a2: formatPercent(10), a3: formatNumber(1), a4: formatPercent(WORMHOLE_CAP_PER_LEVEL * 100) })
    }
    const up = simulateProductionDelta(state, { buildingId: def.id, levelDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = up.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
    }
    return t('ui.build.3', { a0: formatMultiplier(2), a1: parts.join('，') })
  }
  return ''
}

/** 购买预览：购买 1 台后的真实产出提升（即每台净贡献，含能源消耗提示）。
 * 唯一大件：建造预览（机制建筑用效果文案；产出建筑用 delta，count 0→1 有效） */
function buyPreviewText(state: GameState, def: BuildingDef): string {
  if (def.unique) {
    if (def.id === 'ringSmelter') return t('ui.build.14', { a0: formatMultiplier(2) })
    if (def.id === 'jumpgate') return jumpgateEffectText()
    if (def.id === 'wormhole') return wormholeEffectText()
    const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = buy.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
    }
    return t('ui.build.4', { a0: parts.join('，') || t('ui.build.12') })
  }
  const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const d = buy.delta[k]
    if (d === 0) continue
    parts.push(`${RESOURCE_META[k].symbol} ${formatRate(d)}`)
  }
  const consumes = (def.consumes && RESOURCE_KEYS.some((k) => (def.consumes![k] ?? 0) > 0))
    ? t('ui.build.15', { a0: RESOURCE_KEYS.filter((k) => (def.consumes![k] ?? 0) > 0).map((k) => `${RESOURCE_META[k].symbol}${formatRate(def.consumes![k] ?? 0, false)}`).join(' ') })
    : ''
  return t('ui.build.5', { a0: formatNumber(1), a1: parts.join('，') || t('ui.build.12'), a2: consumes })
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
        ${escapeHtml(defName(def))}
        ${unique ? `<span class="build-count unique-badge">${t('ui.build.8')}</span>` : `<span class="build-count">×${formatNumber(count)}</span>`}
        ${level > 0 ? `<span class="build-level">Lv.${formatNumber(level)}</span>` : ''}
      </div>
      <div class="build-desc">${escapeHtml(defDesc(def))}</div>
    </div>`

  const buyCost = buildingCost(state, def.id)
  const canBuy = canAffordBuilding(state, def.id)
  const upCost = upgradeCost(state, def.id)
  const canUp = canAffordUpgrade(state, def.id)
  // unique 建筑按 maxLevel 封顶：满级后升级按钮替换为「已满级」提示（如船坞 Lv3）
  const maxed = unique && def.maxLevel != null && level >= def.maxLevel
  // 唯一大件：已建造后隐藏购买入口（count 恒 1），只保留单级升级；普通建筑无升级（ADR-0036）
  const showBuy = !unique || count <= 0
  // cost-softcap Q10：买入成本相对当前净产出的「≈N 秒产出」（瓶颈资源口径；无成本/产出全 0 时省略）
  const costTime = showBuy
    ? timeToSave(buyCost, netProduction(state))
    : null
  const costTimeRow = costTime != null && !unique
    ? `<div class="build-cost-time" data-cost-time="${def.id}">${t('ui.build.22', { a0: formatTimeToSave(costTime) })}</div>`
    : ''
  const buyBtn = showBuy
    ? `<button type="button" class="build-btn" data-build="${def.id}" ${canBuy ? '' : 'disabled'} title="${unique ? t('ui.build.20', { a0: formatMultiplier(2) }) : t('ui.build.21')}">
        ${unique ? `${t('ui.build.21')} ` : ''}${formatCost(buyCost)}
      </button>`
    : ''
  // 升级按钮组（仅 unique 大件；跃迁枢纽 10 级化 ADR-0038 后纳入升级；maxLevel 满级后替换为「已满级」提示）
  const upgradeBtns = unique && count > 0
    ? maxed
      ? `        <div class="build-lock"><span class="lock-hint researched-hint">${t('ui.build.10', { a0: formatNumber(def.maxLevel ?? 0) })}</span></div>`
      : `        <button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="升级：产出 ${formatMultiplier(2)}（${formatCost(upCost)}）">
          升级 ${formatCost(upCost)}
        </button>`
    : ''
  // 隐藏入口（hidden-buildings）：从面板隐藏此建造物（恢复走头部「已隐藏」抽屉）
  const hideBtn = `<button type="button" class="build-btn build-hide-btn" data-hide-building="${def.id}" title="从建造面板隐藏此建筑（可在「已隐藏」抽屉恢复）">${t('ui.build.11')}</button>`
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      ${info}
      <div class="build-preview">
        ${unique && count > 0 ? `<div class="build-upgrade-preview">升级：${upgradePreviewText(state, def)}</div>` : ''}
        ${showBuy ? `<div class="build-buy-preview">${buyPreviewText(state, def)}</div>` : ''}
        ${costTimeRow}
      </div>
    </div>
    <div class="build-actions">${buyBtn}${upgradeBtns}${hideBtn}</div>`
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
        ...(def.requires ?? []).map((r) => t('ui.build.16', { a0: BUILDINGS[r] ? defName(BUILDINGS[r]) : r })),
        ...(def.requiresTech ?? []).map((tid) => t('ui.build.17', { a0: TECHS[tid] ? defName(TECHS[tid]) : tid })),
      ]
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(defName(def))}
          ${unique ? `<span class="build-count unique-badge">${t('ui.build.8')}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(defDesc(def))}</div>
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
 * `data-build`/`data-upgrade` 按钮、锁定文案（buildingLockReason）。
 * ⚠️ ADR-0036/0037：普通建筑无升级按钮/预览（升级仅 unique）、无 +10/+100 批量按钮（单次操作统一为 1）。
 */
export function renderBuildPanel(el: HTMLElement, state: GameState, defs: Record<string, BuildingDef>, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  const defList = Object.values(defs)
  // 隐藏抽屉分区键（ADR-0043）：hiddenDrawerZone 与 zoneId 解耦——军事区独立抽屉键但不启用锁定卡折叠；
  // 缺省回退 zoneId，再回退 'build'（无 zone 调用兜底）
  const drawerZone = opts.hiddenDrawerZone ?? opts.zoneId ?? 'build'
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
    toggle.setAttribute('data-show-hidden-buildings', drawerZone)
    toggle.textContent = t('ui.build.6', { a0: hiddenDefs.length })
    bar.appendChild(toggle)
    el.appendChild(bar)
    if (opts.hiddenBuildingsOpen?.[drawerZone]) {
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
        name.textContent = defName(def)
        const restore = document.createElement('button')
        restore.type = 'button'
        restore.className = 'build-hidden-restore'
        restore.setAttribute('data-unhide-building', def.id)
        restore.textContent = t('ui.build.7')
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

  // 锁定卡折叠：启用折叠（显式传 zoneId）且 >3 张 → 只展示前 3 张 + 折叠行；否则全部展示。
  // 注意与隐藏抽屉的 zoneId 区分：此处用 opts.zoneId 原文（未传 = 不折叠，军事 tab 仅 2 建筑）
  const collapseZone = opts.zoneId
  const expanded = collapseZone ? Boolean(opts.lockedExpanded?.[collapseZone]) : false
  const showAllLocked = !collapseZone || expanded || lockedDefs.length <= 3
  const shownLocked = showAllLocked ? lockedDefs : lockedDefs.slice(0, 3)
  for (const def of shownLocked) {
    grid.appendChild(renderLockedCard(state, def))
  }
  el.appendChild(grid)

  if (collapseZone && lockedDefs.length > 3) {
    const collapse = document.createElement('button')
    collapse.type = 'button'
    collapse.className = 'locked-collapse'
    collapse.setAttribute('data-locked-collapse', collapseZone)
    collapse.setAttribute('data-expanded', expanded ? 'true' : 'false')
    collapse.textContent = expanded ? t('ui.build.18') : t('ui.build.19', { a0: lockedDefs.length - 3 })
    el.appendChild(collapse)
  }
}