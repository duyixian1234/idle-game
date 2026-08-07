import type { GameState, ResourceKey } from '../engine/types'
import { BUILDINGS, CONQUESTS, ENDLESS_CONQUESTS, ENDLESS_FACTIONS, EXPLORE_PLANETS, INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef, ConquestDef, FactionDef } from '../engine/data'
import { ACHIEVEMENTS, type AchievementDef } from '../engine/achievements'
import { reputation, reputationBonuses } from '../engine/reputation'
import type { ReputationBonuses } from '../engine/reputation'
import { formatMultiplier, formatNumber, formatPercent, formatPlayTime, formatRate, formatTimeToSave, timeToSave } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { conquestDef, isConquestAvailable, conquestState } from '../engine/conquest'
import { ALLIANCE_COST, ALLIANCE_FAVOR_THRESHOLD, COERCION_UNLOCK_MILITARY_CAP, ENDLESS_BATCH_2_EXPLORATIONS, JUMPGATE_HARVEST_MULT, JUMPGATE_OFFLINE_EXTRA_SECONDS, JUMPGATE_SLOT_BONUS, OFFLINE_CAP_SECONDS, TECH_SHARE_COST, TECH_MAX_LEVEL } from '../engine/balance'
import { buildingCost, buildingLockReason, canAffordBuilding, canAffordUpgrade, isBuildingUnlocked, upgradeCost, megastructurePrereqsMet } from '../engine/buildings'
import { canResearchTech, canTechUpgrade, canUpgradeTech, isTechResearched, techCost, techLevel, techRequirementsMet } from '../engine/tech'
import { simulateProductionDelta, techMultiplier, militaryCap, smelterGlobalMult, netProduction } from '../engine/production'
import { dockLevel, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipCap } from '../engine/fleet'
import { escortHarvestMult } from '../engine/exploration'
import { FLEET_HARVEST_PCT_PER_SHIP } from '../engine/balance'
import { iconUse } from './icons'
import { canFactionAlliance, canFactionAtone, canFactionExtort, canFactionIntimidate, canFactionSubjugate, canFactionTechShare, canFactionTrade, canFactionTreaty, coercionUnlocked, atoneCost, diplomacyOverview, extortCost, factionDef, factionsVisible, intimidateCost, tradeCost, treatyCost } from '../engine/diplomacy'
import { endlessBatchUnlocked, endlessTargetId } from '../engine/generate'
import type { LogDirection } from './log'
import { escapeHtml } from './helpers'

export function formatCost(cost: Record<ResourceKey, number>): string {
  return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCE_META[k as ResourceKey]?.symbol ?? k}${formatNumber(v)}`).join(' · ')
}

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

/** 建造面板渲染选项（building-cards：卡片化 + 锁定卡折叠） */
export interface BuildPanelRenderOptions {
  /** 分区 id：传入时启用锁定卡折叠（每区独立）；不传 = 不折叠（军事 tab 仅 2 建筑） */
  zoneId?: string
  /** 折叠展开态（UI 会话内存，不进存档；key = zoneId，刷新回默认收起） */
  lockedExpanded?: Record<string, boolean>
  /** 刚升级高亮 id（短暂窗口内卡片加 just-upgraded 类触发一次性动画，过期自动消失） */
  flashId?: string | null
  /** 归档折叠展开态（endless-expansion：军事/外交归档区，UI 会话内存不进存档；key = kind） */
  archivedExpanded?: Record<string, boolean>
}

/** 卡片主体点击的判定结果（building-cards ticket 03）：升级×1 / 建造×1 / 终局工程弹窗 */
export type BuildCardAction = { kind: 'upgrade' | 'buy' | 'megastructure' }

/**
 * 卡片主体点击的纯函数判定（main.ts 委托调用；可测 seam）：
 * - 未解锁 / 满级 / 资源不足 / jumpgate 已建（无升级效果）→ null（无副作用）
 * - 终局工程建筑（究极建筑）未建造 → megastructure（走确认弹窗）
 * - count>0 且未满级 → upgrade；否则（未拥有）→ buy
 */
export function buildCardAction(state: GameState, id: string): BuildCardAction | null {
  const def = BUILDINGS[id]
  if (!def || !isBuildingUnlocked(state, id)) return null
  const count = state.buildings[id] ?? 0
  if (MEGASTRUCTURE_BUILDINGS[id] && count <= 0) return { kind: 'megastructure' }
  const level = state.upgrades[id] ?? 0
  const maxed = def.unique === true && def.maxLevel != null && level >= def.maxLevel
  if (count > 0 && def.id !== 'jumpgate' && !maxed) {
    return canAffordUpgrade(state, id) ? { kind: 'upgrade' } : null
  }
  if (count <= 0) {
    return canAffordBuilding(state, id) ? { kind: 'buy' } : null
  }
  return null
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
  const unlockedDefs = defList.filter((d) => isBuildingUnlocked(state, d.id))
  const lockedDefs = defList.filter((d) => !isBuildingUnlocked(state, d.id))

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
    <div class="build-actions">${buyBtn}${bulkBuyBtns}${upgradeBtns}</div>`
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

/** 渲染科技面板（tech-cards：与建造物同构的卡片网格；data-tech 契约与按钮 data-research/data-upgrade-tech(+limit) 原样保留） */
export function renderTechPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'build-grid'
  grid.setAttribute('data-tech-grid', '')
  for (const def of Object.values(TECHS)) {
    // 军械科技线（unlockByConquest）由列表末尾专用分组渲染（renderMilitaryTechSection）：此处跳过防双渲染
    if (def.unlockByConquest) continue
    const level = techLevel(state, def.id)
    const researched = isTechResearched(state, def.id)
    const met = techRequirementsMet(state, def.id)
    const cost = techCost(state, def.id)
    const upgradable = canTechUpgrade(def, level)
    const canUp = canUpgradeTech(state, def.id)
    const affordable = canResearchTech(state, def.id)
    const card = document.createElement('div')
    card.className = 'build-card tech-card'
    card.setAttribute('data-tech', def.id)

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）；探索类显示槽位解锁
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
      effectText = `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
    } else if (def.effect.kind === 'exploration') {
      effectText = level >= 1 ? '探索信道已解锁' : '解锁第 6/7 探索信道'
    } else {
      const cur = techMultiplier(def.effect, Math.max(1, level))
      effectText = `${RESOURCE_META[def.effect.resource].name}产出 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = techMultiplier(def.effect, level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    }

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${researched ? `<span class="build-count researched-badge">${level >= TECH_MAX_LEVEL ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
      </div>`
    const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`

    if (!researched) {
      if (!met) {
        // 前置未满足：锁定卡（灰化 + 解锁条件）
        const names = def.requires!.map((t) => escapeHtml(TECHS[t]?.name ?? t)).join('、')
        card.classList.add('locked')
        card.innerHTML = `${icon}
          <div class="build-card-body">
            ${info}
            <div class="build-lock"><span class="lock-hint">需先研发：${names}</span></div>
          </div>`
        grid.appendChild(card)
        continue
      }
      card.innerHTML = `${icon}
        <div class="build-card-body">${info}</div>
        <div class="build-actions">
          <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁该科技（${formatCost(cost)}）">
            研发 ${formatCost(cost)}
          </button>
        </div>`
      grid.appendChild(card)
      continue
    }

    if (!upgradable) {
      card.innerHTML = `${icon}
        <div class="build-card-body">
          ${info}
          <div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>
        </div>`
      grid.appendChild(card)
      continue
    }

    // 可升级：显示升级按钮与下一级成本（语义明确为「单击升级」）
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：产出系数 +${formatNumber(0.5)}（Lv.${formatNumber(level)} → Lv.${formatNumber(level + 1)}）">
          升级 ▶ ${formatCost(cost)}
        </button>
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:10" ${canUp ? '' : 'disabled'}>+10</button>
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:100" ${canUp ? '' : 'disabled'}>+100</button>
      </div>`
    grid.appendChild(card)
  }
  el.appendChild(grid)

  // 军械科技线（unlockByConquest，攻占「虫群前哨」解锁）：置科技列表末尾
  renderMilitaryTechSection(el, state)
}

/** ASCII 进度条（Q14 定案）：█ 填充 + ░ 空余，纯文本零 DOM 成本；
 *  宿主 data-progress 供 E2E 断言（含 █/░ 字符）。ratio clamp 0~1。 */
export function renderAsciiBar(ratio: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  return `<span class="ascii-bar" data-progress><span class="ascii-filled">${'█'.repeat(filled)}</span><span class="ascii-empty">${'░'.repeat(empty)}</span></span>`
}

/** 好感度横条（收敛到通用 ASCII 进度条组件，行为等价） */
function renderFavorBar(favor: number): string {
  return renderAsciiBar(favor / 100, 10)
}

/** 派系特性徽标文案（探索势力专属特性：贸易折扣/共享半价/威慑折扣；无特性返回空数组不渲染） */
function factionPerkLabels(def: FactionDef): string[] {
  const labels: string[] = []
  if (def.tradeDiscount) labels.push(`贸易折扣 -${formatPercent(def.tradeDiscount * 100)}`)
  if (def.techShareCostMult) labels.push(def.techShareCostMult <= 0.6 ? '共享半价' : `技术共享 ${formatMultiplier(def.techShareCostMult)}`)
  if (def.intimidateCostMult) labels.push(`威慑折扣 -${formatPercent((1 - def.intimidateCostMult) * 100)}`)
  return labels
}

/** 归档折叠区（endless-expansion）：头部计数 + 明细行（名称 + 归档徽标 + 第 N 周目）。
 * 折叠状态走 UI 层会话态（archivedExpanded，main 层持有，不进存档）——与 data-locked-collapse 同构，250ms 重建不重置。 */
function renderArchiveCollapse(el: HTMLElement, kind: string, label: string, rows: string[], expanded: boolean): void {
  if (rows.length === 0) return
  const fold = document.createElement('div')
  fold.className = 'archive-collapse'
  fold.setAttribute('data-archived-collapse', kind)
  fold.innerHTML = `
    <div class="archive-summary" data-archived-toggle="${kind}" role="button" tabindex="0">${escapeHtml(label)}（${formatNumber(rows.length)}）<span class="archive-chevron">${expanded ? '▾' : '▸'}</span></div>
    <div class="archive-list" data-archived-list="${kind}" ${expanded ? '' : 'style="display:none"'}>${rows.join('')}</div>`
  el.appendChild(fold)
}

/** 归档明细行（endless-expansion）：名称 + 归档徽标 + 第 N 周目标记（Q17 方案 B） */
function archiveRow(name: string, badge: string, round: number | undefined, id: string): string {
  return `<div class="archive-row" data-archived-row="${id}"><span class="archive-name">${escapeHtml(name)}</span><span class="archive-badge">${escapeHtml(badge)}</span>${round != null ? `<span class="archive-round">第 ${formatNumber(round)} 周目</span>` : ''}</div>`
}

/** 保底锁定占位（endless-expansion）：batch 2 未解锁且未获得的目标提示（仅 infinite 渲染，「完成 N 次探索解锁」） */
function renderEndlessLockedHint(el: HTMLElement, kind: string, lockedCount: number): void {
  if (lockedCount <= 0) return
  const block = document.createElement('div')
  block.className = 'archive-collapse locked'
  block.setAttribute('data-explore-locked', kind)
  block.innerHTML = `<div class="archive-summary">？？？ · 完成 ${formatNumber(ENDLESS_BATCH_2_EXPLORATIONS)} 次探索解锁新${kind === 'conquest' ? '军事目标' : kind === 'diplomacy' ? '外交对象' : '天体'}</div>`
  el.appendChild(block)
}

/** 渲染外交面板：遍历运行时全部已登场派系（初始 4 家 + 探索发现的势力 + 无尽生成对象；未发现的探索势力不渲染）。
 * 已结盟（archivedRounds 有记录）= 不可再交互 → 移列表末尾归档折叠区（endless-expansion）。 */
export function renderDiplomacyPanel(el: HTMLElement, state: GameState, opts: { archivedExpanded?: Record<string, boolean> } = {}): void {
  el.innerHTML = ''
  if (!factionsVisible(state)) {
    el.innerHTML = `<div class="diplo-empty">星域中尚未探测到其他文明信号。解锁「轨道工厂站·奥伯斯」后，派系将进入舞台。</div>`
    return
  }
  const ov = diplomacyOverview(state)
  const header = document.createElement('div')
  header.className = 'diplo-header'
  header.setAttribute('data-diplo-overview', '')
  header.innerHTML = `
    <div class="diplo-header-row" data-diplo-federation>星系统一联邦：${ov.satisfied}/${ov.total} 派系达成统一条件</div>
    <div class="diplo-header-row" data-diplo-threat>${ov.threatCount === 0 ? '星域安宁，无派系骚扰' : `${ov.threatCount} 家派系构成骚扰威胁`}</div>
    <div class="diplo-header-row" data-diplo-alliance>已结盟 ${ov.allied} / 已登场 ${ov.total}</div>`
  el.appendChild(header)
  // 胁迫外交解锁提示（diplomacy-coercion：军力上限达标或遭遇派系骚扰后解锁，双通道）
  if (!coercionUnlocked(state)) {
    const lockHint = document.createElement('div')
    lockHint.className = 'diplo-coercion-lock'
    lockHint.setAttribute('data-diplo-coercion-lock', '')
    lockHint.textContent = `军力上限达到 ${COERCION_UNLOCK_MILITARY_CAP.toLocaleString('zh-CN')} 或遭遇派系骚扰后，将解锁胁迫手段（勒索 / 进贡条约 / 臣服）。`
    el.appendChild(lockHint)
  }

  const archived = opts.archivedExpanded ?? {}
  const archivedRows: string[] = []
  // 未结盟派系卡网格（faction-grid：复用 .build-grid 断点；已结盟对象不占网格槽，入下方归档折叠区）
  const grid = document.createElement('div')
  grid.className = 'build-grid faction-grid'
  grid.setAttribute('data-faction-grid', '')
  // 运行时派系集合（含无尽生成对象）；def 查不到（异常防御）跳过
  for (const id of Object.keys(state.factions)) {
    const def = factionDef(state, id)
    if (!def) continue
    const f = state.factions[id]
    if (!f) continue
    // 已结盟 = 归档（本周目语义，archivedRounds 记录归档周目；旧档 v11 及以下无 archivedRounds →
    // 按 allied 判定兜底，已完成对象同样折叠，round 缺省不显示周目标记）
    if (state.archivedRounds?.[id] != null || f.allied) {
      archivedRows.push(archiveRow(def.name, '已结盟', state.archivedRounds?.[id], id))
      continue
    }
    const tradeC = tradeCost(state, id)
    const intC = intimidateCost(state, id)
    const shareC = TECH_SHARE_COST
    const canTrade = canFactionTrade(state, id)
    const canAlliance = canFactionAlliance(state, id)
    const canIntimidate = canFactionIntimidate(state, id)
    const canShare = canFactionTechShare(state, id)
    const perks = factionPerkLabels(def)
    // 胁迫按钮组（勒索/条约/臣服/赎罪 + 状态徽标）：独占一整行（faction-coercion-row，grid-column 1/-1）
    const coercionActions = renderCoercionActions(state, id)
    const coercionRowHtml = coercionActions ? `<div class="faction-coercion-row">${coercionActions}</div>` : ''

    const item = document.createElement('div')
    item.className = 'build-card faction-card'
    item.setAttribute('data-faction', id)
    item.innerHTML = `
      <div class="build-card-icon">${iconUse(id)}</div>
      <div class="build-card-body">
        <div class="build-info faction-info">
          <div class="build-name">
            ${escapeHtml(def.name)}
            ${perks.length > 0 ? perks.map((p) => `<span class="faction-perk" data-faction-perk="${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('') : ''}
          </div>
          <div class="build-desc">${escapeHtml(def.desc)}</div>
          <div class="favor-row">
            <span class="favor-label">好感</span>
            ${renderFavorBar(f.favor)}
            <span class="favor-num">${formatNumber(f.favor)}/${formatNumber(100)}</span>
            <span class="favor-label threat-label">威胁</span>
            <span class="threat-num">${formatNumber(f.threat)}</span>
          </div>
        </div>
      </div>
      <div class="build-actions faction-actions">
        <button type="button" class="build-btn diplo-btn" data-diplomacy="${id}:trade" ${canTrade ? '' : 'disabled'} title="花费矿物提升好感">
          贸易 ${formatCost(tradeC)}
        </button>
        <button type="button" class="build-btn diplo-btn" data-diplomacy-limit="${id}:trade:10" ${canTrade ? '' : 'disabled'}>+10</button>
        <button type="button" class="build-btn diplo-btn" data-diplomacy-limit="${id}:trade:100" ${canTrade ? '' : 'disabled'}>+100</button>
        <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy="${id}:techshare" ${canShare ? '' : 'disabled'} title="分享技术情报，花费科技点直接提升好感">
          技术共享 ${formatCost(shareC)}
        </button>
        <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy-limit="${id}:techshare:10" ${canShare ? '' : 'disabled'}>+10</button>
        <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy-limit="${id}:techshare:100" ${canShare ? '' : 'disabled'}>+100</button>
        <button type="button" class="build-btn diplo-btn alliance-btn" data-diplomacy="${id}:alliance" ${canAlliance ? '' : 'disabled'} title="好感 ≥${formatNumber(ALLIANCE_FAVOR_THRESHOLD)} 后可结盟（消耗大量资源）">
          结盟 ${formatCost(ALLIANCE_COST)}
        </button>
        <button type="button" class="build-btn diplo-btn intimidate-btn" data-diplomacy="${id}:intimidate" ${canIntimidate ? '' : 'disabled'} title="消耗资源降低对方军力，但好感下降">
          威慑 ${formatCost(intC)}
        </button>
        ${coercionRowHtml}
      </div>`
    grid.appendChild(item)
  }
  el.appendChild(grid)
  // 归档折叠区（已结盟外交对象）
  renderArchiveCollapse(el, 'diplomacy', '已完成外交对象', archivedRows, Boolean(archived['diplomacy']))
  // 保底锁定占位（endless-expansion：batch 2 未解锁且未获得）
  if (state.phase === 'infinite') {
    const locked = Object.values(ENDLESS_FACTIONS).filter(
      (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
    )
    renderEndlessLockedHint(el, 'diplomacy', locked.length)
  }
}

/** 胁迫外交按钮区（diplomacy-coercion）：未解锁返回空；按派系状态渲染状态徽标与勒索/条约/臣服/赎罪按钮 */
function renderCoercionActions(state: GameState, id: string): string {
  const f = state.factions[id]
  if (!f || !coercionUnlocked(state)) return ''
  const parts: string[] = []
  // 状态徽标（臣服中 / 赎罪期 / 已洗白）
  if (f.subjugated) parts.push('<span class="faction-state-badge subjugated" data-faction-state="subjugated">臣服中 · 锁定军力维持</span>')
  if (f.atoningUntil !== undefined && f.atoningUntil > Date.now()) parts.push('<span class="faction-state-badge atoning" data-faction-state="atoning">赎罪期 · 贸易加成</span>')
  if (f.atoned) parts.push('<span class="faction-state-badge atoned" data-faction-state="atoned">已洗白 · 不可再胁迫</span>')
  const canExtort = canFactionExtort(state, id)
  const canTreaty = canFactionTreaty(state, id)
  const canSubjugate = canFactionSubjugate(state, id)
  const canAtone = canFactionAtone(state, id)
  if (canExtort) {
    parts.push(`<button type="button" class="build-btn diplo-btn extort-btn" data-diplomacy="${id}:extort" title="以军事力量敲诈资源——高收益，代价是好感暴跌与威胁飙升">勒索 ${formatCost(extortCost(state, id))}</button>`)
  }
  if (canTreaty) {
    parts.push(`<button type="button" class="build-btn diplo-btn treaty-btn" data-diplomacy="${id}:treaty" title="12 小时进贡条约：被动矿物税（离线结算），到期威胁反弹">条约 ${formatCost(treatyCost(state, id))}</button>`)
  }
  if (canSubjugate) {
    parts.push(`<button type="button" class="build-btn diplo-btn subjugate-btn" data-diplomacy="${id}:subjugate" title="武力压服：锁定军力维持臣服，双倍贡税；军力不足将叛变">臣服</button>`)
  }
  if (canAtone) {
    parts.push(`<button type="button" class="build-btn diplo-btn atone-btn" data-diplomacy="${id}:atone" title="赔偿洗白：解除臣服/条约并开启赎罪期，赎罪后不可再胁迫">赎罪 ${formatCost(atoneCost(state, id))}</button>`)
  }
  return parts.join('')
}

/** 设置页 UI 状态（由 main 层组装传入，纯展示） */
export interface SettingsStatus {
  isMuted: boolean
  logDirection: LogDirection
  statusText: string
  version: string
  state?: GameState
}

/** 渲染设置页（一级 tab）：音频 / 日志 / 存档管理 / 危险区 / 关于 五组。250ms 重建无 transition 干扰 */
export function renderSettingsPage(el: HTMLElement, status: SettingsStatus): void {
  const state = status.state
  const visiblePlanets = state
    ? [...Object.values(PLANETS), ...Object.values(EXPLORE_PLANETS)].filter((def) => state.planets[def.id]?.unlocked || state.exploredPlanets.includes(def.id))
    : []
  el.innerHTML = `
    <section class="settings-group">
      <h2 class="settings-title">音频</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="mute">${status.isMuted ? '🔇 已静音' : '🔊 静音'}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">日志</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="logdir">${status.logDirection === 'newest-bottom' ? '📜 最新在底' : '📜 最新在顶'}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">存档管理</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="export">导出存档</button>
        <button type="button" class="tool-btn" data-tool="import">导入存档</button>
      </div>
    </section>
    <section class="settings-group danger-zone">
      <h2 class="settings-title">危险区</h2>
      <p class="danger-hint">删除当前存档并重新开始，此操作不可撤销。</p>
      <div class="settings-actions">
        <button type="button" class="tool-btn danger" data-tool="reset">重置存档</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">周目与终局</h2>
      <div class="settings-actions">
        ${state?.phase === 'infinite' ? '<button type="button" class="tool-btn danger" data-setting-action="ngplus">开启新周目</button>' : ''}
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">顶部天体</h2>
      <div class="settings-actions">
        ${visiblePlanets.length > 0 ? visiblePlanets.map((def) => `<button type="button" class="tool-btn planet-visibility-btn" data-planet-visibility="${def.id}">${state?.hiddenPlanets.includes(def.id) ? '显示' : '隐藏'} ${escapeHtml(def.name)}</button>`).join('') : '<span class="settings-empty">暂无可管理天体</span>'}
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">关于</h2>
      <div class="about-version">深空拓荒 · 星系统一联邦 v${escapeHtml(status.version)}</div>
      <div class="about-status">${escapeHtml(status.statusText)}</div>
    </section>`
}

// ---- 军事面板 ----

/** 区域奖励预览文本 */
function conquestRewardText(def: ConquestDef): string {
  const parts: string[] = []
  if (def.rewardMineral) parts.push(`${RESOURCE_META.mineral.symbol}${formatNumber(def.rewardMineral)}`)
  if (def.rewardTech) parts.push(`${RESOURCE_META.tech.symbol}${formatNumber(def.rewardTech)}`)
  if (def.bonus) {
    parts.push(def.bonus.kind === 'production' ? `全产出 +${formatPercent(def.bonus.value * 100)}` : `军力上限 +${formatPercent(def.bonus.value * 100)}`)
  }
  if (def.unlockTech) parts.push('解锁军械科技')
  return parts.join('、') || '无'
}

/** 攻占区域单张卡片（守卫/奖励/状态/发起控件；conquest-cards：与建造物同构卡片，data-conquest 契约原样保留） */
function renderConquestRow(def: ConquestDef, state: GameState): HTMLElement {
  const card = document.createElement('div')
  card.className = 'build-card conquest-card'
  const cs = conquestState(state, def.id)
  const conquered = cs.status === 'conquered'
  const ongoing = cs.startedAt != null
  const available = isConquestAvailable(state, def.id)
  const info = `
    <div class="build-info">
      <div class="build-name">
        ${escapeHtml(def.name)}
        ${conquered ? '<span class="build-count conquered-badge">已占领</span>' : ''}
        ${ongoing ? '<span class="build-count ongoing-badge">攻占中</span>' : ''}
      </div>
      <div class="build-desc">${escapeHtml(def.desc)}</div>
      <div class="conquest-meta">守卫 ${formatNumber(def.guard)}⚔ · 奖励：${escapeHtml(conquestRewardText(def))}</div>
    </div>`
  const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`
  if (conquered) {
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint conquered-hint">✓ 已肃清</span></div>
      </div>`
    return card
  }
  if (ongoing) {
    const remainMs = Math.max(0, (cs.finishAt ?? 0) - Date.now())
    const durMs = Math.max(1, (cs.finishAt ?? Date.now()) - (cs.startedAt ?? Date.now()))
    const ratio = 1 - remainMs / durMs
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint" data-conquest-progress>${renderAsciiBar(ratio, 16)}<span class="conquest-meta">⏳ 结算倒计时 ${formatDuration(Math.ceil(remainMs / 1000))} · 已投入 ${formatNumber(cs.invested ?? 0)}⚔</span></span></div>
      </div>`
    return card
  }
  if (!available) {
    const reason = state.planets[def.unlockPlanet]?.unlocked
      ? def.afterEnding && state.phase === 'playing'
        ? '通关后开放'
        : '不可攻占'
      : `需解锁「${PLANETS[def.unlockPlanet]?.name ?? def.unlockPlanet}」`
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(reason)}</span></div>
      </div>`
    return card
  }
  // 可发起：投入军力输入框（建议值 = 足额所需或当前军力）+ 攻占按钮
  const maxInvest = Math.floor(state.resources.military)
  const suggest = Math.max(1, Math.min(def.guard, maxInvest))
  card.innerHTML = `${icon}
    <div class="build-card-body">${info}</div>
    <div class="build-actions conquest-actions">
      <input type="number" class="conquest-input" data-conquest-input="${def.id}" min="1" max="${maxInvest}" value="${suggest}" aria-label="投入军力" />
      <button type="button" class="build-btn conquest-btn" data-conquest="${def.id}" ${maxInvest >= 1 ? '' : 'disabled'} title="投入军力发起攻占，10~30 分钟后结算；投入达到守卫强度必成，不足则按比例成功率">
        攻占 ⚔
      </button>
    </div>`
  return card
}

/** 军械科技区（攻占「虫群前哨」解锁，军事线科技；data-tech 契约与科技面板卡片同构；
 * 渲染于科技面板列表末尾分组）：
 * 未攻占 → 锁定文案（desc 自带「攻占…后解锁」）；已攻占未研发 → 研发按钮；已研发可升级 → 升级按钮（含 +10/+100）。 */
function renderMilitaryTechSection(el: HTMLElement, state: GameState): void {
  const def = TECHS.militaryTech
  if (!def) return
  const conquered = conquestState(state, def.unlockByConquest!).status === 'conquered'
  const level = techLevel(state, def.id)
  const researched = isTechResearched(state, def.id)
  const upgradable = canTechUpgrade(def, level)
  const canUp = canUpgradeTech(state, def.id)
  const affordable = canResearchTech(state, def.id)

  const section = document.createElement('div')
  section.className = 'military-section'
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '军械科技'
  section.appendChild(header)
  const card = document.createElement('div')
  card.className = 'build-card tech-card'
  card.setAttribute('data-tech', def.id)
  const mult = def.effect.kind === 'production' ? techMultiplier(def.effect, Math.max(1, level)) : 1
  const nextMult = def.effect.kind === 'production' ? techMultiplier(def.effect, level + 1) : 1
  const effectText = `军力产出 ${formatMultiplier(mult)}${level >= 1 ? `（Lv.${formatNumber(level)}${upgradable ? ` → ${formatMultiplier(nextMult)}` : ''}）` : ''}`
  const info = `
    <div class="build-info">
      <div class="build-name">${escapeHtml(def.name)}${researched ? `<span class="build-count researched-badge">${level >= def.maxLevel! ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}</div>
      <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
    </div>`
  const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`
  // 未攻占且未研发 → 锁定文案；已研发（含测试预置）直接进入研发/升级分支
  if (!conquered && !researched) {
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(def.desc)}</span></div>
      </div>`
  } else if (!researched) {
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁军械科技（${formatCost(techCost(state, def.id))}）">
          研发 ${formatCost(techCost(state, def.id))}
        </button>
      </div>`
  } else if (!upgradable) {
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>
      </div>`
  } else {
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：军力产出 +${formatNumber(0.5)}（Lv.${formatNumber(level)} → Lv.${formatNumber(level + 1)}）">
          升级 ▶ ${formatCost(techCost(state, def.id))}
        </button>
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:10" ${canUp ? '' : 'disabled'}>+10</button>
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:100" ${canUp ? '' : 'disabled'}>+100</button>
      </div>`
  }
  section.appendChild(card)
  el.appendChild(section)
}

/** 渲染军事面板：军事建筑 / 舰队管理区 / 攻占列表 / 肃清进度总览（军械科技已移至科技面板）。
 * 攻占列表 = 静态 4 区域 + 无尽生成军事目标（endless-expansion）；已归档（征服）目标移列表末尾折叠区。 */
export function renderMilitaryPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  // 段 1：军事建筑（兵营/军港，含升级与 buy-max；卡片化，与民用同构；军事 tab 不启用锁定卡折叠）
  const buildSection = document.createElement('div')
  buildSection.className = 'military-section'
  renderBuildPanel(buildSection, state, MILITARY_BUILDINGS, opts)
  el.appendChild(buildSection)
  // 段 4：攻占列表（静态 4 区域 + 无尽动态目标；已肃清 → 归档折叠区）——置面板底部（攻占 + 进度总览收束在最下方）
  const conquestSection = document.createElement('div')
  conquestSection.className = 'military-section'
  const staticDefs = Object.values(CONQUESTS)
  const conqueredCount = staticDefs.filter((d) => conquestState(state, d.id).status === 'conquered').length
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '攻占'
  conquestSection.appendChild(header)
  const archived = opts.archivedExpanded ?? {}
  const archivedRows: string[] = []
  // 可发起攻占卡网格（conquest-grid：复用 .build-grid 断点；已肃清对象不占网格槽，入下方归档折叠区）
  const conquestGrid = document.createElement('div')
  conquestGrid.className = 'build-grid'
  conquestGrid.setAttribute('data-conquest-grid', '')
  // 静态 4 区域（旧档 v11 及以下 conquered 无 archivedRounds → 按 status 判定兜底）
  for (const def of staticDefs) {
    if (state.archivedRounds?.[def.id] != null || conquestState(state, def.id).status === 'conquered') {
      archivedRows.push(archiveRow(def.name, '已肃清', state.archivedRounds?.[def.id], def.id))
    } else {
      conquestGrid.appendChild(renderConquestRow(def, state))
    }
  }
  // 无尽生成军事目标（动态）
  for (const t of state.generatedTargets) {
    if (t.kind !== 'conquest') continue
    const def = conquestDef(state, t.id)
    if (!def) continue
    if (state.archivedRounds?.[t.id] != null || conquestState(state, t.id).status === 'conquered') {
      archivedRows.push(archiveRow(t.name, '已肃清', state.archivedRounds?.[t.id], t.id))
    } else {
      conquestGrid.appendChild(renderConquestRow(def, state))
    }
  }
  conquestSection.appendChild(conquestGrid)
  // 归档折叠区（已肃清军事目标）
  renderArchiveCollapse(conquestSection, 'conquest', '已完成军事目标', archivedRows, Boolean(archived['conquest']))
  // 保底锁定占位（endless-expansion：batch 2 未解锁且未获得）
  if (state.phase === 'infinite') {
    const locked = Object.values(ENDLESS_CONQUESTS).filter(
      (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
    )
    renderEndlessLockedHint(conquestSection, 'conquest', locked.length)
  }
  // 段 2：舰队管理区（船坞大件卡片在建造页·星际工程；舰队区块保留在此）
  renderFleetSection(el, state)
  // 段 3：攻占列表（构建于上方，收束在舰队之后）
  el.appendChild(conquestSection)
  // 段 4：肃清进度总览（静态 4 区口径）——置面板底部作收束，攻占列表上方不再占用
  const progress = document.createElement('div')
  progress.className = 'conquest-header'
  progress.setAttribute('data-conquest-progress-header', '')
  progress.textContent = `肃清进度：${formatNumber(conqueredCount)}/${formatNumber(staticDefs.length)}`
  el.appendChild(progress)
}

// ---- 星系间工程 / 终局工程（interstellar-buildings） ----

/** 跃迁枢纽效果文案单一真源（从 balance 常量拼装：改平衡只动 balance.ts，UI 文案自动联动） */
export const JUMPGATE_EFFECT_TEXT = `派遣槽 +${formatNumber(JUMPGATE_SLOT_BONUS)} · 天体收获倍率上限 ${formatMultiplier(2 * JUMPGATE_HARVEST_MULT)} · 离线封顶 ${(OFFLINE_CAP_SECONDS + JUMPGATE_OFFLINE_EXTRA_SECONDS) / 3600}h`

/** 建造页「星际工程」分组：唯一大件建筑列表（锁定卡片显示引擎判定原因）+ 终局工程区块。 */
export function renderInterstellarPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-interstellar', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '星际工程'
  section.appendChild(header)
  renderBuildPanel(section, state, INTERSTELLAR_BUILDINGS, { ...opts, zoneId: 'interstellar' })
  // 终局工程区块（冶炼场/枢纽双轨开放）：星际工程分组内最后一段（还原 f6d3cd5 前挂点）
  renderMegastructureSection(section, state)
  el.appendChild(section)
}

/**
 * 舰队管理区（星域页星际工程分组内，data-fleet 契约；fleet-cards：与建造物同构卡片）：
 * 当前舰数 X/Y、建造按钮（含第 n 艘成本预览）、总维护费与战力预览（-X 能源/s）、运转/停摆状态。
 * 船坞未建 → 锁定卡片（星港前置）；船坞 Lv0 → 提示升级解锁；满编 → 按钮禁用；停摆 → 警示语。
 */
export function renderFleetSection(el: HTMLElement, state: GameState): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-fleet', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '舰队'
  section.appendChild(header)

  // 船坞未建：显示锁定原因（复用引擎判定，UI 不重写解锁链）
  if ((state.buildings.dock ?? 0) <= 0) {
    const lock = document.createElement('div')
    lock.className = 'build-card fleet-card locked'
    lock.setAttribute('data-fleet-locked', '')
    lock.innerHTML = `
      <div class="build-card-icon">${iconUse('ship')}</div>
      <div class="build-card-body">
        <div class="build-info">
          <div class="build-name">护卫舰队</div>
          <div class="build-desc">斥资打造常备舰队：自动迎击派系骚扰，代价是持续能源维护费。</div>
        </div>
        <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(buildingLockReason(state, 'dock') ?? '需先建造船坞')}</span></div>
      </div>`
    section.appendChild(lock)
    el.appendChild(section)
    return
  }

  const level = dockLevel(state)
  const cap = shipCap(state)
  const count = state.fleet.count
  const powered = fleetPowered(state)
  const maint = fleetMaintenance(state)
  const power = fleetPower(state)
  const techLv = state.techLevels.militaryTech ?? 0
  const nextCost = nextShipCost(state)

  // 状态徽标：运转 / 停摆 / 空港（含停摆警示语义说明）
  let statusBadge: string
  if (count === 0) {
    statusBadge = `<span class="build-count">空港</span>`
  } else if (powered) {
    statusBadge = `<span class="build-count" data-fleet-powered>运转中</span>`
  } else {
    statusBadge = `<span class="build-count" data-fleet-idle>⚠ 能源不足，舰队停摆</span>`
  }

  const body = document.createElement('div')
  body.className = 'build-card fleet-card'
  body.setAttribute('data-fleet-status', '')
  // 停摆警示（自动迎击不可用语义说明）
  const idleWarn =
    count > 0 && !powered
      ? `<div class="build-lock" data-fleet-warn><span class="lock-hint">能源不足以支付总维护费：舰队停摆，自动迎击失效、战力归零；恢复供能后自动重启。</span></div>`
      : ''
  // 建造按钮：未满编且资源足够才可点（硬约束，与派遣/威慑同语义）
  const affordMineral = nextCost ? state.resources.mineral >= nextCost.mineral : false
  const affordEnergy = nextCost ? state.resources.energy >= nextCost.energy : false
  let buyHint = ''
  if (nextCost && !affordMineral) buyHint = '矿物不足'
  else if (nextCost && !affordEnergy) buyHint = '能源不足'
  else if (!nextCost && cap > 0) buyHint = `已达船坞舰数上限（${formatNumber(cap)} 艘）`
  const buildBtn = nextCost
    ? `<button type="button" class="build-btn" data-fleet-build ${affordMineral && affordEnergy ? '' : 'disabled'} title="${escapeHtml(buyHint)}">建造护卫舰 ${formatCost({ mineral: nextCost.mineral, energy: nextCost.energy } as Record<ResourceKey, number>)}</button>`
    : `<button type="button" class="build-btn" data-fleet-build disabled title="已达舰数上限">建造护卫舰</button>`
  // 维护费/战力预览：数据语义化 + 科技贡献行（军械科技满级 1.5×）
  const techNote = techLv > 0 ? `（含军械科技 Lv.${formatNumber(techLv)} ${formatMultiplier(1 + 0.1 * techLv)}）` : ''
  // 护航加成说明（fleet-dock-10）：每艘 +1% 探索收获倍率，当前倍率 = 1 + 0.01 × 舰数（探索页护航远征共用）
  const escortNote = count > 0 ? `护航远征加成 ${formatMultiplier(escortHarvestMult(state))}（每艘 +${formatNumber(FLEET_HARVEST_PCT_PER_SHIP * 100)}%）` : ''
  body.innerHTML = `
    <div class="build-card-icon">${iconUse('ship')}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name">
          护卫舰队 ${statusBadge}
          <span class="build-count" data-fleet-count>${formatNumber(count)}艘/${formatNumber(cap)}艘</span>
          <span class="build-count">船坞 Lv.${formatNumber(level)}</span>
        </div>
        <div class="build-desc">自动迎击派系骚扰（战力足够不弹窗，直接结算为日志）；军力击退所需军力按舰队战力削减。船坞升级请前往「建造 · 星际工程」。</div>
        <div class="conquest-meta">
          <span data-fleet-maintenance>维护费 ${formatRate(-maint)} 能源</span>
          ${count > 0 && !powered ? '（停摆中未扣费）' : ''}
          · <span data-fleet-power>战力 ${formatNumber(power)}${techNote}</span>
          ${escortNote ? ` · <span data-fleet-escort>${escortNote}</span>` : ''}
        </div>
      </div>
      ${idleWarn}
    </div>
    <div class="build-actions">${buildBtn}</div>`
  section.appendChild(body)
  el.appendChild(section)
}

/** 终局工程区块（星际工程分组内独立段）：两卡片并排展示（data-megastructure 弹确认），
 * 已建造卡片标 data-built 不可再点。前置判定复用引擎 megastructurePrereqsMet（通关 + 三星系间各 ≥1），UI 不重写解锁链。 */
export function renderMegastructureSection(el: HTMLElement, state: GameState): void {
  if (!megastructurePrereqsMet(state)) return

  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-megastructure-section', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '终局工程'
  section.appendChild(header)
  const desc = document.createElement('div')
  desc.className = 'megastructure-desc'
  desc.textContent = '双轨工程：星环冶炼场与跃迁枢纽皆可铸就，独立建造、互不影响——文明的建设与探索双轨并进。'
  section.appendChild(desc)

  const cards = document.createElement('div')
  cards.className = 'megastructure-cards'
  for (const def of Object.values(MEGASTRUCTURE_BUILDINGS)) {
    const id = def.id
    const built = (state.buildings[id] ?? 0) > 0
    const card = document.createElement('div')
    card.className = `megastructure-card${built ? ' built' : ''}`
    card.setAttribute('data-megastructure', id)
    if (built) card.setAttribute('data-built', '')
    const effectText =
      id === 'ringSmelter'
        ? `全局产出 ${formatMultiplier(2)}^等级（矿/能源/科技全吃）· 耗能 ${formatRate(100, false)} 能源 × 等级`
        : JUMPGATE_EFFECT_TEXT
    const statusText = built
      ? '✓ 已建造（效果生效）'
      : `建造 ${formatCost(buildingCost(state, id))}`
    card.innerHTML = `
      <div class="megastructure-name">${escapeHtml(def.name)}</div>
      <div class="megastructure-effect">${escapeHtml(effectText)}</div>
      <div class="megastructure-status">${escapeHtml(statusText)}</div>`
    cards.appendChild(card)
  }
  section.appendChild(cards)
  el.appendChild(section)
}

/** 当前生效的声望加成文本（无声望时显示解锁提示） */
function reputationBonusText(b: ReputationBonuses): string {
  const parts: string[] = []
  if (b.tradeDiscount > 0) parts.push(`贸易折扣 ${formatPercent(b.tradeDiscount * 100)}`)
  if (b.raidThresholdBonus > 0) parts.push(`骚扰阈值 ${formatPercent(55 + b.raidThresholdBonus)}`)
  if (b.militaryCapBonus > 0) parts.push(`军力上限 +${formatPercent(b.militaryCapBonus * 100)}`)
  if (b.conquestSuccessBonus > 0) parts.push(`攻占成功率 +${formatPercent(b.conquestSuccessBonus * 100)}`)
  if (parts.length === 0) return '未解锁加成（声望 ≥20 解锁贸易折扣）'
  return parts.join(' · ')
}

/** 成就卡（ach-cards：与建造物同构 .build-card 视觉语言）：
 * 图标 + 名称 + 描述（未解锁且有 hint 时优先显示 hint）+ 奖励文本 + 状态（✓/🔒）。
 * 进度条（有 progress 且未解锁）：n/total 显示，n 超 total 时 clamp 到 total；解锁后隐藏（保持一致）。 */
function renderAchievementCard(state: GameState, def: AchievementDef): HTMLElement {
  const unlocked = Boolean(state.achievements[def.id])
  const card = document.createElement('div')
  card.className = `build-card ach-card${unlocked ? '' : ' ach-locked'}`
  card.setAttribute('data-achievement', def.id)
  const rewardParts: string[] = []
  if (def.rewardMineral) rewardParts.push(`${formatNumber(def.rewardMineral)} 矿物`)
  if (def.rewardTech) rewardParts.push(`${formatNumber(def.rewardTech)} 科技点`)
  const rewardText = rewardParts.length > 0 ? `奖励：${rewardParts.join('、')}` : ''
  // 未解锁且有 hint → 显示解锁提示；否则显示 desc
  const displayDesc = !unlocked && def.hint ? def.hint : def.desc
  let progressHtml = ''
  if (def.progress && !unlocked) {
    const [n, total] = def.progress(state)
    const shown = Math.min(n, total)
    progressHtml = `
      <div class="ach-progress" data-ach-progress="${def.id}">
        ${renderAsciiBar(shown / total, 12)}
        <span class="ach-progress-text">${formatNumber(shown)}/${formatNumber(total)}</span>
      </div>`
  }
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.icon)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name ach-name">
          ${unlocked ? '✓' : '🔒'} ${escapeHtml(def.name)}
          <span class="ach-state">+${formatNumber(def.rep)} 声望</span>
        </div>
        <div class="build-desc ach-desc">${escapeHtml(displayDesc)}</div>
      </div>
      <div class="ach-reward">${rewardText || '奖励：无'}</div>
      ${progressHtml}
    </div>`
  return card
}

/** 渲染档案面板（第 5 面板）：星系统一声望 + 成就网格 + 本周目统计。纯展示，无交互按钮 */
export function renderArchivePanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  const rep = reputation(state)
  const bonuses = reputationBonuses(state)

  // 段 1：声望
  const repSection = document.createElement('div')
  repSection.className = 'military-section'
  repSection.innerHTML = `
    <div class="rep-card">
    <div class="rep-title">星系统一声望 <span class="rep-value">${formatNumber(rep)} / ${formatNumber(100)}</span></div>
      <div class="rep-bonuses">${escapeHtml(reputationBonusText(bonuses))}</div>
      <div class="rep-hint">声望由成就解锁驱动，影响外交与军事，不直接改变产出。</div>
    </div>`
  el.appendChild(repSection)

  // 段 2：成就卡片网格（叙事 / 收集 / 终局 三组，各一个 .build-grid；条目 .build-card.ach-card）
  const groups: { key: string; title: string }[] = [
    { key: 'story', title: '叙事里程碑' },
    { key: 'collect', title: '收集目标' },
    { key: 'finale', title: '终局传奇' },
  ]
  for (const g of groups) {
    const defs = Object.values(ACHIEVEMENTS).filter((d) => d.category === g.key)
    if (defs.length === 0) continue
    const section = document.createElement('div')
    section.className = 'military-section'
    const header = document.createElement('div')
    header.className = 'conquest-header'
    const doneCount = defs.filter((d) => state.achievements[d.id]).length
    header.textContent = `${g.title}（${formatNumber(doneCount)}/${formatNumber(defs.length)}）`
    section.appendChild(header)
    const grid = document.createElement('div')
    grid.className = 'build-grid'
    grid.setAttribute('data-ach-grid', g.key)
    for (const def of defs) {
      grid.appendChild(renderAchievementCard(state, def))
    }
    section.appendChild(grid)
    el.appendChild(section)
  }

  // 段 3：本周目统计
  const statSection = document.createElement('div')
  statSection.className = 'military-section'
  const statHeader = document.createElement('div')
  statHeader.className = 'conquest-header'
  statHeader.textContent = '本周目统计'
  statSection.appendChild(statHeader)
  const tradeSum = Object.values(state.factions).reduce((a, f) => a + f.tradeCount, 0)
  const intimiSum = Object.values(state.factions).reduce((a, f) => a + f.intimidateCount, 0)
  const conquered = Object.values(state.conquest).filter((c) => c.status === 'conquered').length
  const stats = document.createElement('div')
  stats.className = 'rep-stats'
  stats.innerHTML = `
    <div>在线时长：${formatPlayTime(state.playSeconds)}</div>
    <div>累计采集矿物：${formatNumber(state.stats.totalMineralEarned)}</div>
    <div>外交贸易：${formatNumber(tradeSum)} 次 · 威慑：${formatNumber(intimiSum)} 次</div>
    <div>星域肃清：${formatNumber(conquered)}/${formatNumber(Object.keys(CONQUESTS).length)}</div>
    <div>NG+ 周目：${formatNumber(state.ngPlusLevel)}</div>`
  statSection.appendChild(stats)
  el.appendChild(statSection)
}

