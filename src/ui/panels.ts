import type { GameState, ResourceKey } from '../engine/types'
import { ALL_FACTIONS, BUILDINGS, CONQUESTS, EXPLORE_PLANETS, INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef, ConquestDef, FactionDef } from '../engine/data'
import { ACHIEVEMENTS } from '../engine/achievements'
import { reputation, reputationBonuses } from '../engine/reputation'
import type { ReputationBonuses } from '../engine/reputation'
import { formatMultiplier, formatNumber, formatPercent, formatPlayTime, formatRate, formatTimeToSave, timeToSave } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { isConquestAvailable, conquestState } from '../engine/conquest'
import { ALLIANCE_COST, ALLIANCE_FAVOR_THRESHOLD, CONQUEST_DURATION_MS, JUMPGATE_HARVEST_MULT, JUMPGATE_OFFLINE_EXTRA_SECONDS, JUMPGATE_SLOT_BONUS, OFFLINE_CAP_SECONDS, TECH_SHARE_COST, TECH_MAX_LEVEL, TECH_EXCHANGE_RATE } from '../engine/balance'
import { buildingCost, buildingLockReason, canAffordBuilding, canAffordUpgrade, canResearchTech, canTechUpgrade, canUpgradeTech, isBuildingUnlocked, isTechResearched, techCost, techLevel, techRequirementsMet, upgradeCost, megastructurePrereqsMet } from '../engine/engine'
import { simulateProductionDelta, techMultiplier, militaryCap, smelterGlobalMult, netProduction } from '../engine/production'
import { dockLevel, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipCap } from '../engine/fleet'
import { escortHarvestMult } from '../engine/exploration'
import { FLEET_HARVEST_PCT_PER_SHIP } from '../engine/balance'
import { iconUse } from './icons'
import { canFactionAlliance, canFactionIntimidate, canFactionTechShare, canFactionTrade, factionsVisible, federationProgress, intimidateCost, tradeCost } from '../engine/diplomacy'
import type { LogDirection } from './log'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '\"': return '&quot;'
      default: return '&#39;'
    }
  })
}

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
}

/** 卡片主体点击的判定结果（building-cards ticket 03）：升级×1 / 建造×1 / 终局抉择弹窗 */
export type BuildCardAction = { kind: 'upgrade' | 'buy' | 'megastructure' }

/**
 * 卡片主体点击的纯函数判定（main.ts 委托调用；可测 seam）：
 * - 未解锁 / 满级 / 资源不足 / jumpgate 已建（无升级效果）→ null（无副作用）
 * - 终局抉择建筑（megastructureValue）未建造 → megastructure（走确认弹窗）
 * - count>0 且未满级 → upgrade；否则（未拥有）→ buy
 */
export function buildCardAction(state: GameState, id: string): BuildCardAction | null {
  const def = BUILDINGS[id]
  if (!def || !isBuildingUnlocked(state, id)) return null
  const count = state.buildings[id] ?? 0
  if (def.megastructureValue && count <= 0) return { kind: 'megastructure' }
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
  // 锁定原因优先取引擎判定（通关/星球/满级科技/互斥/链式前置），缺省回退 requires 拼接
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

/** 渲染科技面板 */
export function renderTechPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(TECHS)) {
    // 军械科技线（unlockByConquest）由军事面板管理：未攻占不研发、不在科技面板出现
    if (def.unlockByConquest) continue
    const level = techLevel(state, def.id)
    const researched = isTechResearched(state, def.id)
    const met = techRequirementsMet(state, def.id)
    const cost = techCost(state, def.id)
    const upgradable = canTechUpgrade(def, level)
    const canUp = canUpgradeTech(state, def.id)
    const affordable = canResearchTech(state, def.id)
    const item = document.createElement('div')
    item.className = 'build-item tech-item'
    item.setAttribute('data-tech', def.id)

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）；探索类显示槽位解锁
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
      effectText = `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
    } else if (def.effect.kind === 'exploration') {
      effectText = level >= 1 ? '探索信道已解锁' : '解锁第 2/3 探索信道'
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

    if (!researched) {
      if (!met) {
        const names = def.requires!.map((t) => escapeHtml(TECHS[t]?.name ?? t)).join('、')
        item.innerHTML = `${info}
          <div class="build-lock"><span class="lock-hint">需先研发：${names}</span></div>`
        el.appendChild(item)
        continue
      }
      item.innerHTML = `${info}
        <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁该科技（${formatCost(cost)}）">
          研发 ${formatCost(cost)}
        </button>`
      el.appendChild(item)
      continue
    }

    if (!upgradable) {
      item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>`
      el.appendChild(item)
      continue
    }

    // 可升级：显示升级按钮与下一级成本（语义明确为「单击升级」）
    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：产出系数 +${formatNumber(0.5)}（Lv.${formatNumber(level)} → Lv.${formatNumber(level + 1)}）">
        升级 ▶ ${formatCost(cost)}
      </button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:10" ${canUp ? '' : 'disabled'}>+10</button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:100" ${canUp ? '' : 'disabled'}>+100</button>`
    el.appendChild(item)
  }

  // 底部兑换区块：矿物 → 科技点（固定 100:1，单向）
  const canConvert = state.resources.mineral >= TECH_EXCHANGE_RATE
  const exchange = document.createElement('div')
  exchange.className = 'tech-exchange'
  exchange.innerHTML = `
    <div class="exchange-hint">矿物兑换科技点（${formatNumber(100)} 矿物 → ${formatNumber(1)} 科技点）</div>
    <div class="exchange-row">
      <input type="number" class="exchange-input" data-exchange-input min="0" step="100" placeholder="矿物数量" />
      <button type="button" class="build-btn tech-btn" data-convert-tech ${canConvert ? '' : 'disabled'}>兑换</button>
      <button type="button" class="build-btn tech-btn" data-convert-max ${canConvert ? '' : 'disabled'}>最大</button>
    </div>`
  el.appendChild(exchange)
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

/** 渲染外交面板：遍历运行时全部已发现势力（初始 4 家 + 探索发现的势力；未发现的探索势力不渲染） */
export function renderDiplomacyPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  if (!factionsVisible(state)) {
    el.innerHTML = `<div class="diplo-empty">星域中尚未探测到其他文明信号。解锁「轨道工厂站·奥伯斯」后，派系将进入舞台。</div>`
    return
  }
  const prog = federationProgress(state)
  const header = document.createElement('div')
  header.className = 'diplo-header'
  header.textContent = `星系统一联邦：${formatNumber(prog.satisfied)}/${formatNumber(prog.total)} 派系达成统一条件`
  el.appendChild(header)

  for (const def of Object.values(ALL_FACTIONS)) {
    const f = state.factions[def.id]
    if (!f) continue // 探索势力未发现前不渲染（发现即创建 state → 自动登场）
    const tradeC = tradeCost(state, def.id)
    const intC = intimidateCost(state, def.id)
    const shareC = TECH_SHARE_COST
    const canTrade = canFactionTrade(state, def.id)
    const canAlliance = canFactionAlliance(state, def.id)
    const canIntimidate = canFactionIntimidate(state, def.id)
    const canShare = canFactionTechShare(state, def.id)
    const perks = factionPerkLabels(def)

    const item = document.createElement('div')
    item.className = 'build-item faction-item'
    item.setAttribute('data-faction', def.id)
    item.innerHTML = `
      <div class="build-info faction-info">
        <div class="build-name">
          ${iconUse(def.id, 'faction-badge')}${escapeHtml(def.name)}
          ${f.allied ? '<span class="build-count allied-badge">已结盟</span>' : ''}
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
      <div class="build-actions faction-actions">
        ${f.allied ? '' : `
          <button type="button" class="build-btn diplo-btn" data-diplomacy="${def.id}:trade" ${canTrade ? '' : 'disabled'} title="花费矿物提升好感">
            贸易 ${formatCost(tradeC)}
          </button>
          <button type="button" class="build-btn diplo-btn" data-diplomacy-limit="${def.id}:trade:10" ${canTrade ? '' : 'disabled'}>+10</button>
          <button type="button" class="build-btn diplo-btn" data-diplomacy-limit="${def.id}:trade:100" ${canTrade ? '' : 'disabled'}>+100</button>
          <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy="${def.id}:techshare" ${canShare ? '' : 'disabled'} title="分享技术情报，花费科技点直接提升好感">
            技术共享 ${formatCost(shareC)}
          </button>
          <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy-limit="${def.id}:techshare:10" ${canShare ? '' : 'disabled'}>+10</button>
          <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy-limit="${def.id}:techshare:100" ${canShare ? '' : 'disabled'}>+100</button>
          <button type="button" class="build-btn diplo-btn alliance-btn" data-diplomacy="${def.id}:alliance" ${canAlliance ? '' : 'disabled'} title="好感 ≥${formatNumber(ALLIANCE_FAVOR_THRESHOLD)} 后可结盟（消耗大量资源）">
            结盟 ${formatCost(ALLIANCE_COST)}
          </button>
          <button type="button" class="build-btn diplo-btn intimidate-btn" data-diplomacy="${def.id}:intimidate" ${canIntimidate ? '' : 'disabled'} title="消耗资源降低对方军力，但好感下降">
            威慑 ${formatCost(intC)}
          </button>
        `}
      </div>`
    el.appendChild(item)
  }
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

/** 攻占区域单行（守卫/奖励/状态/发起控件） */
function renderConquestRow(def: ConquestDef, state: GameState): HTMLElement {
  const row = document.createElement('div')
  row.className = 'build-item conquest-item'
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
  if (conquered) {
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint conquered-hint">✓ 已肃清</span></div>`
    return row
  }
  if (ongoing) {
    const remainMs = Math.max(0, (cs.finishAt ?? 0) - Date.now())
    const ratio = 1 - remainMs / CONQUEST_DURATION_MS
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint" data-conquest-progress>${renderAsciiBar(ratio, 16)}<span class="conquest-meta">⏳ 结算倒计时 ${formatDuration(Math.ceil(remainMs / 1000))} · 已投入 ${formatNumber(cs.invested ?? 0)}⚔</span></span></div>`
    return row
  }
  if (!available) {
    const reason = state.planets[def.unlockPlanet]?.unlocked
      ? def.afterEnding && state.phase === 'playing'
        ? '通关后开放'
        : '不可攻占'
      : `需解锁「${PLANETS[def.unlockPlanet]?.name ?? def.unlockPlanet}」`
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(reason)}</span></div>`
    return row
  }
  // 可发起：投入军力输入框（建议值 = 足额所需或当前军力）+ 攻占按钮
  const maxInvest = Math.floor(state.resources.military)
  const suggest = Math.max(1, Math.min(def.guard, maxInvest))
  row.innerHTML = `${info}
    <div class="build-actions conquest-actions">
      <input type="number" class="conquest-input" data-conquest-input="${def.id}" min="1" max="${maxInvest}" value="${suggest}" aria-label="投入军力" />
      <button type="button" class="build-btn conquest-btn" data-conquest="${def.id}" ${maxInvest >= 1 ? '' : 'disabled'} title="投入军力发起攻占，60 分钟后结算；投入达到守卫强度必成，不足则按比例成功率">
        攻占 ⚔
      </button>
    </div>`
  return row
}

/** 军械科技区（攻占「虫群前哨」解锁，军事线科技；data-tech 契约与科技面板行式同构）：
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
  const item = document.createElement('div')
  item.className = 'build-item tech-item'
  item.setAttribute('data-tech', def.id)
  const mult = def.effect.kind === 'production' ? techMultiplier(def.effect, Math.max(1, level)) : 1
  const nextMult = def.effect.kind === 'production' ? techMultiplier(def.effect, level + 1) : 1
  const effectText = `军力产出 ${formatMultiplier(mult)}${level >= 1 ? `（Lv.${formatNumber(level)}${upgradable ? ` → ${formatMultiplier(nextMult)}` : ''}）` : ''}`
  const info = `
    <div class="build-info">
      <div class="build-name">${escapeHtml(def.name)}${researched ? `<span class="build-count researched-badge">${level >= def.maxLevel! ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}</div>
      <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
    </div>`
  // 未攻占且未研发 → 锁定文案；已研发（含测试预置）直接进入研发/升级分支
  if (!conquered && !researched) {
    item.innerHTML = `${info}
      <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(def.desc)}</span></div>`
  } else if (!researched) {
    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁军械科技（${formatCost(techCost(state, def.id))}）">
        研发 ${formatCost(techCost(state, def.id))}
      </button>`
  } else if (!upgradable) {
    item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>`
  } else {
    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：军力产出 +${formatNumber(0.5)}（Lv.${formatNumber(level)} → Lv.${formatNumber(level + 1)}）">
        升级 ▶ ${formatCost(techCost(state, def.id))}
      </button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:10" ${canUp ? '' : 'disabled'}>+10</button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech-limit="${def.id}:100" ${canUp ? '' : 'disabled'}>+100</button>`
  }
  section.appendChild(item)
  el.appendChild(section)
}

/** 渲染军事面板：军事建筑 / 攻占列表 / 军械科技 / 舰队管理区（星际工程大件已移至建造页）。 */
export function renderMilitaryPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  // 段 1：军事建筑（兵营/军港，含升级与 buy-max；卡片化，与民用同构；军事 tab 不启用锁定卡折叠）
  const buildSection = document.createElement('div')
  buildSection.className = 'military-section'
  renderBuildPanel(buildSection, state, MILITARY_BUILDINGS, opts)
  el.appendChild(buildSection)
  // 段 2：攻占列表（肃清进度 x/4）
  const conquestSection = document.createElement('div')
  conquestSection.className = 'military-section'
  const defs = Object.values(CONQUESTS)
  const conqueredCount = defs.filter((d) => conquestState(state, d.id).status === 'conquered').length
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = `肃清进度：${formatNumber(conqueredCount)}/${formatNumber(defs.length)}`
  conquestSection.appendChild(header)
  for (const def of defs) conquestSection.appendChild(renderConquestRow(def, state))
  el.appendChild(conquestSection)
  // 段 3：军械科技（攻占「虫群前哨」解锁；行式，未攻占显示锁定文案）
  renderMilitaryTechSection(el, state)
  // 段 4：舰队管理区（船坞大件卡片在建造页·星际工程；舰队区块保留在此）
  renderFleetSection(el, state)
}

// ---- 星系间工程 / 终局抉择（interstellar-buildings） ----

/** 跃迁枢纽效果文案单一真源（从 balance 常量拼装：改平衡只动 balance.ts，UI 文案自动联动） */
export const JUMPGATE_EFFECT_TEXT = `派遣槽 +${formatNumber(JUMPGATE_SLOT_BONUS)} · 天体收获倍率上限 ${formatMultiplier(2 * JUMPGATE_HARVEST_MULT)} · 离线封顶 ${(OFFLINE_CAP_SECONDS + JUMPGATE_OFFLINE_EXTRA_SECONDS) / 3600}h`

/** 建造页「星际工程」分组：唯一大件建筑列表（锁定卡片显示引擎判定原因）+ 终局抉择区块。 */
export function renderInterstellarPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-interstellar', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '星际工程'
  section.appendChild(header)
  renderBuildPanel(section, state, INTERSTELLAR_BUILDINGS, { ...opts, zoneId: 'interstellar' })
  // 终局抉择区块（冶炼场 vs 跃迁枢纽互斥二选一）：星际工程分组内最后一段（还原 f6d3cd5 前挂点）
  renderMegastructureSection(section, state)
  el.appendChild(section)
}

/**
 * 舰队管理区（星域页星际工程分组内，data-fleet 契约）：
 * 当前舰数 X/Y、建造按钮（含第 n 艘成本预览）、总维护费与战力预览（-X 能源/s）、运转/停摆状态。
 * 船坞未建 → 锁定原因（星港前置）；船坞 Lv0 → 提示升级解锁；满编 → 按钮禁用；停摆 → 警示语。
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
    lock.className = 'build-item'
    lock.setAttribute('data-fleet-locked', '')
    lock.innerHTML = `
      <div class="build-info">
        <div class="build-name">护卫舰队</div>
        <div class="build-desc">斥资打造常备舰队：自动迎击派系骚扰，代价是持续能源维护费。</div>
      </div>
      <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(buildingLockReason(state, 'dock') ?? '需先建造船坞')}</span></div>`
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
  body.className = 'build-item'
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
    <div class="build-actions">${buildBtn}</div>`
  section.appendChild(body)
  el.appendChild(section)
}

/** 终局抉择区块（星际工程分组内独立段）：未选择时两卡片并排可点（data-megastructure 弹确认）；
 * 选定后冶炼场高亮、枢纽显示本周目锁定。前置判定复用引擎 megastructurePrereqsMet（通关 + 三星系间各 ≥1），UI 不重写解锁链。 */
export function renderMegastructureSection(el: HTMLElement, state: GameState): void {
  if (!megastructurePrereqsMet(state)) return

  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-megastructure-section', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '终局抉择'
  section.appendChild(header)
  const desc = document.createElement('div')
  desc.className = 'megastructure-desc'
  desc.textContent = '文明之路在此分岔：你选择铸成星环，还是推开星门？（只能选一个，本周目不可更改；NG+ 重开可重新选择）'
  section.appendChild(desc)

  const cards = document.createElement('div')
  cards.className = 'megastructure-cards'
  for (const def of Object.values(MEGASTRUCTURE_BUILDINGS)) {
    const id = def.id
    const value = def.megastructureValue!
    const chosen = state.megastructureChoice === value
    const locked = state.megastructureChoice !== null && state.megastructureChoice !== value
    const card = document.createElement('div')
    card.className = `megastructure-card${chosen ? ' chosen' : ''}${locked ? ' locked' : ''}`
    card.setAttribute('data-megastructure', id)
    if (chosen) card.setAttribute('data-chosen', '')
    if (locked) card.setAttribute('data-locked', '')
    const effectText =
      id === 'ringSmelter'
        ? `全局产出 ${formatMultiplier(2)}^等级（矿/能源/科技全吃）· 耗能 ${formatRate(100, false)} 能源 × 等级`
        : JUMPGATE_EFFECT_TEXT
    const statusText = chosen
      ? '✓ 已选择（本周目生效）'
      : locked
        ? '🔒 本周目已锁定'
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

/** 终局抉择确认弹窗（复用 ending overlay 卡片体系）：效果预览 + 建造消耗 + 互斥警告 + 确认/取消 */
export function renderMegastructureModal(el: HTMLElement, state: GameState, id: string): void {
  const def = BUILDINGS[id]
  if (!def) return
  const effectText =
    id === 'ringSmelter'
      ? `全局产出 ${formatMultiplier(2)}^等级（矿/能源/科技全吃）；耗能 ${formatRate(100, false)} 能源 × 等级（能源不足时按现有结算打折）`
      : JUMPGATE_EFFECT_TEXT
  el.innerHTML = `
    <div class="megastructure-card" data-megastructure-modal>
      <div class="buy-max-title">终局抉择：${escapeHtml(def.name)}</div>
      <div class="buy-max-summary">${escapeHtml(def.desc)}</div>
      <table class="buy-max-table">
        <tr><th>效果</th><td>${escapeHtml(effectText)}</td></tr>
        <tr><th>建造消耗</th><td>${formatCost(buildingCost(state, id)) || formatNumber(0)}</td></tr>
      </table>
      <div class="buy-max-warn" data-megastructure-warn>⚠ 只能选择其一，本周目不可更改；另一个究极建筑将永久锁定。NG+ 重开后可重新选择。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-megastructure-confirm="${def.id}">确认建造</button>
        <button type="button" class="ending-btn ghost" data-megastructure-cancel>取消</button>
      </div>
    </div>`
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

  // 段 2：成就网格（叙事 / 收集 / 终局 三组）
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
    for (const def of defs) {
      const unlocked = Boolean(state.achievements[def.id])
      const item = document.createElement('div')
      item.className = unlocked ? 'ach-item done' : 'ach-item locked'
      const rewardParts: string[] = []
      if (def.rewardMineral) rewardParts.push(`${formatNumber(def.rewardMineral)} 矿物`)
      if (def.rewardTech) rewardParts.push(`${formatNumber(def.rewardTech)} 科技点`)
      const rewardText = rewardParts.length > 0 ? ` · ${rewardParts.join('、')}` : ''
      item.innerHTML = `
        <div class="ach-name">${unlocked ? '✓' : '🔒'} ${escapeHtml(def.name)} <span class="ach-state">+${formatNumber(def.rep)} 声望</span></div>
        <div class="ach-desc">${escapeHtml(def.desc)}</div>
        <div class="ach-reward">奖励：${rewardText || '无'}</div>`
      section.appendChild(item)
    }
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

