import type { GameState, ResourceKey } from '../engine/types'
import { ENDLESS_PLANETS, EXPLORE_FACTIONS, EXPLORE_PLANETS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { PlanetDef } from '../engine/data'
import { PLANET_MECHANICS } from '../engine/mechanics'
import { formatMultiplier, formatNumber, formatPercent, formatRate } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { canEscort, escortFee, escortHarvestMult, expeditionCost, explorationSlots, isExploreAvailable } from '../engine/exploration'
import { ENDLESS_BATCH_2_EXPLORATIONS, EXPEDITION_DURATION_MS, FLEET_HARVEST_PCT_PER_SHIP } from '../engine/balance'
import { isPlanetUnlocked } from '../engine/engine'
import { explorePlanetOutputs, militaryCap, productionBreakdown } from '../engine/production'
import type { BreakdownRow } from '../engine/production'
import { endlessBatchUnlocked, endlessTargetId } from '../engine/generate'
import type { ActionFailure } from '../engine/engine'
import { iconUse } from './icons'

export { buildLayout } from './layout'
export type { AppElements, NavId } from './layout'

export { appendLog, renderLogInto, renderPendingEvents, renderAutoConfigPanel } from './log'
export { DEFAULT_LOG_DIRECTION, LOG_DIR_KEY } from './log'
export type { LogDirection } from './log'

export { renderBootOverlay, renderEndingOverlay, renderTutorial } from './overlays'

/**
 * 渲染探索页（一级 tab 内嵌）：
 *  ① 锁定占位页：phase==='playing'（未通关）显示 🔒 + 解锁条件 + 玩法简介
 *  ② 自动探索控制面板（data-auto-explore 系列）：全局开关 + 护航勾选 + 能源/轮预览 + 暂停态
 *  ③ 派遣面板：深空信道 1/2/3 列表（空闲/派遣中/锁定三态；dispatch 保留 data-explore-dispatch 契约，值 = 槽位号 1|2|3；
 *     护航勾选 data-escort-toggle + 费用/倍率预览 data-escort-*；停摆禁用并提示）+
 *     已发现产出型天体的贡献行（data-planet-output，与引擎生产管线同口径）
 * @param escortChecked 手动派遣护航勾选状态（main 层跨渲染记忆的 UI 偏好，不污染存档）
 */
export function renderExplorePage(
  el: HTMLElement,
  state: GameState,
  nowMs: number = Date.now(),
  escortChecked: ReadonlySet<number> = new Set(),
  archivedExpanded: Record<string, boolean> = {},
): void {
  el.innerHTML = ''
  const parts: string[] = []
  // ① 锁定占位：通关前告知终局玩法存在
  if (!isExploreAvailable(state)) {
    parts.push(`
      <div class="explore-locked">
        <div class="explore-lock-icon">🔒</div>
        <div class="explore-lock-title">通关后解锁探索</div>
        <div class="explore-lock-desc">多信道派遣探索队（每路 60 分钟 / 离线照常推进，不可取消）：有概率发现新的派系势力、发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</div>
        <div class="explore-lock-hint">解锁条件：完成「星系统一联邦」结局（统一全部派系）</div>
      </div>`)
    el.innerHTML = parts.join('')
    return
  }
  // ② 派遣面板：深空信道列表（槽位数 = explorationSlots，上限 5：1 + 科技 2 + 跃迁枢纽 2）
  const slots = explorationSlots(state)
  const ongoing = state.expeditions.filter((e) => !e.resolved)
  const totalPool = Object.keys(EXPLORE_FACTIONS).length + Object.keys(EXPLORE_PLANETS).length
  const discovered = state.exploredFactions.length + state.exploredPlanets.length
  const fleetReady = canEscort(state)
  const slotCards: string[] = []
  // 展示上限 5 槽（1 基础 + 2 科技 + 跃迁枢纽 +2，与 explorationSlots 上限一致）；未解锁槽保留占位卡片提示解锁需求
  const SLOT_CAP = 5
  for (let i = 0; i < SLOT_CAP; i++) {
    const slotNo = i + 1
    if (i >= slots) {
      const need =
        i === 1
          ? `深空导航阵列 Lv${formatNumber(1)}（科技）`
          : i === 2
            ? `星际通信中继 Lv${formatNumber(1)}（科技）`
            : '跃迁枢纽（终局抉择·探索路线）'
      slotCards.push(`
        <div class="explore-slot" data-expedition-slot="${slotNo}" data-expedition-locked>
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state locked">🔒 未解锁</span></div>
          <div class="explore-slot-hint">解锁需求：${need}</div>
        </div>`)
      continue
    }
    const exp = ongoing[i]
    if (exp) {
      const remain = Math.max(0, exp.finishAt - nowMs)
      const ratio = 1 - remain / EXPEDITION_DURATION_MS
      slotCards.push(`
        <div class="explore-slot" data-expedition-slot="${slotNo}">
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state active">⏳ 派遣中${exp.escort ? '（护航）' : ''}</span></div>
          <div class="explore-slot-timer" data-expedition-timer><span data-expedition-progress>${renderAsciiBar(ratio, 16)}</span>返航倒计时 ${formatDuration(Math.ceil(remain / 1000))}</div>
        </div>`)
      continue
    }
    const cost = expeditionCost(state, i)
    const affordMineral = state.resources.mineral >= cost.mineral
    const affordEnergy = state.resources.energy >= cost.energy
    const affordMilitary = state.resources.military >= cost.military
    let reason = ''
    if (!affordMineral) reason = '矿物不足'
    else if (!affordEnergy) reason = '能源不足'
    else if (!affordMilitary) reason = `军力不足（需 ${formatNumber(cost.military)}⚔）`
    // 手动护航选项：舰队运转才可用（停摆禁用 + 提示）；勾选后显示总远征费与加成倍率预览
    const checked = escortChecked.has(slotNo)
    const escortDisabled = !fleetReady
    const fee = escortFee(state)
    const mult = escortHarvestMult(state)
    const escortBlock = `
      <div class="explore-slot-escort" data-escort-option>
        <label class="escort-toggle-label">
          <input type="checkbox" data-escort-toggle="${slotNo}" ${checked ? 'checked' : ''} ${escortDisabled ? 'disabled' : ''}>
          护航编队（每艘 +${formatPercent(FLEET_HARVEST_PCT_PER_SHIP * 100)} 收获倍率）
        </label>
        ${escortDisabled ? '<span class="escort-warn" data-escort-disabled>舰队能源不足，护航不可用</span>' : ''}
        ${fleetReady ? `<div class="explore-slot-escort-preview" data-escort-preview>护航消耗 ${formatNumber(fee)} 能源/轮 · 当前倍率 ${formatMultiplier(mult)}</div>` : ''}
      </div>`
    slotCards.push(`
      <div class="explore-slot" data-expedition-slot="${slotNo}">
        <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state idle">空闲</span></div>
        <div class="explore-slot-cost">消耗：${RESOURCE_META.mineral.symbol}${formatNumber(cost.mineral)} · ${RESOURCE_META.energy.symbol}${formatNumber(cost.energy)} · ${RESOURCE_META.military.symbol}${formatNumber(cost.military)} · 时长 60 分钟（离线照常推进）</div>
        ${escortBlock}
        <div class="explore-slot-actions">
          <button type="button" class="ending-btn primary" data-explore-dispatch="${slotNo}" ${!affordMineral || !affordEnergy || !affordMilitary ? 'disabled' : ''} title="${escapeHtml(reason)}">${iconUse('dispatch', 'dispatch-icon')} 派遣</button>
        </div>
      </div>`)
  }
  // 自动探索控制面板（data-auto-explore 系列）：全局开关 + 护航勾选（默认关）+ 能源/轮预览 + 暂停态
  const auto = state.autoExplore
  const autoEscortDisabled = !auto.enabled || !fleetReady
  const autoPanel = `
    <div class="explore-auto" data-auto-explore>
      <div class="explore-auto-title">自动探索</div>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-explore-toggle ${auto.enabled ? 'checked' : ''}> 开启（空信道自动续派，离线同样续派）</label>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-escort ${auto.escort ? 'checked' : ''} ${autoEscortDisabled ? 'disabled' : ''}> 自动护航</label>
      <span class="explore-auto-cost" data-auto-escort-cost>自动护航预计消耗 ${formatNumber(escortFee(state))} 能源/轮</span>
      ${auto.pausedAt != null ? '<span class="escort-warn" data-auto-explore-paused>资源不足，自动探索暂停（资源恢复后自动继续）</span>' : ''}
    </div>`
  const outputRows = explorePlanetOutputs(state)
    .map((o) => {
      const text = RESOURCE_KEYS.filter((k) => o.values[k] > 0)
        .map((k) => `${RESOURCE_META[k].symbol} ${formatRate(o.values[k])}`)
        .join(' · ')
      return `<div class="explore-planet-output" data-planet-output="${o.planetId}">${iconUse(o.planetId, 'explore-icon')} ${escapeHtml(o.name)}：${text}</div>`
    })
    .join('')
  // 天体归档折叠区（endless-expansion）：机制型一次性天体探索完 = 不可再交互 → 移列表末尾折叠；
  // 产出型天体保留主列表（持续派遣收割，决策 4 硬约束）；仅 infinite 渲染
  const archivedPlanetRows =
    state.phase === 'infinite'
      ? Object.keys(state.archivedRounds ?? {})
          .filter((id) => state.planets[id]?.unlocked)
          .map((id) => {
            const def = EXPLORE_PLANETS[id] ?? state.generatedTargets.find((t) => t.kind === 'planet' && t.id === id)
            if (!def) return ''
            return `<div class="archive-row" data-archived-row="${id}"><span class="archive-name">${escapeHtml(def.name)}</span><span class="archive-badge">已探索</span><span class="archive-round">第 ${formatNumber(state.archivedRounds[id])} 周目</span></div>`
          })
          .filter(Boolean)
          .join('')
      : ''
  const planetArchivedBlock = archivedPlanetRows
    ? `<div class="archive-collapse" data-archived-collapse="planet">
        <div class="archive-summary" data-archived-toggle="planet" role="button" tabindex="0">已完成探索天体（${formatNumber(archivedPlanetRows.length)}）<span class="archive-chevron">${archivedExpanded['planet'] ? '▾' : '▸'}</span></div>
        <div class="archive-list" data-archived-list="planet" ${archivedExpanded['planet'] ? '' : 'style="display:none"'}>${archivedPlanetRows}</div>
      </div>`
    : ''
  // 保底天体锁定占位（endless-expansion：batch 2 未解锁且未获得）
  const lockedPlanets =
    state.phase === 'infinite'
      ? Object.values(ENDLESS_PLANETS).filter(
          (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
        ).length
      : 0
  const planetLockedBlock =
    lockedPlanets > 0
      ? `<div class="archive-collapse locked" data-explore-locked="planet"><div class="archive-summary">？？？ · 完成 ${formatNumber(ENDLESS_BATCH_2_EXPLORATIONS)} 次探索解锁新天体</div></div>`
      : ''
  parts.push(`
    <div class="explore-card">
      <h1 class="ending-title">派遣探索</h1>
      <p class="ending-stats">通关后的新航路：深空信道并行派遣，有概率发现新的派系势力或发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</p>
      <div class="explore-progress">已发现：${formatNumber(discovered)} / ${formatNumber(totalPool)}（势力 ${formatNumber(state.exploredFactions.length)}/${formatNumber(Object.keys(EXPLORE_FACTIONS).length)} · 天体 ${formatNumber(state.exploredPlanets.length)}/${formatNumber(Object.keys(EXPLORE_PLANETS).length)}）</div>
      ${autoPanel}
      <div class="explore-slots">${slotCards.join('')}</div>
      ${outputRows ? `<div class="explore-planet-outputs">${outputRows}</div>` : ''}
      ${planetArchivedBlock}
      ${planetLockedBlock}
    </div>`)
  // NG+ 终局卡（仅 infinite 周目渲染；data-ngplus 契约，main 层委托开启确认弹窗）
  if (state.phase === 'infinite') {
    parts.push(`
      <div class="ngplus-terminal" data-ngplus-terminal>
        <div class="ngplus-terminal-title">当前周目：第 ${formatNumber(state.ngPlusLevel)} 周目</div>
        <div class="ngplus-terminal-desc">遗产与永久加成已生效。开启新周目将清空本周目进度（建筑/资源/科技/军力），永久加成与探索发现保留；此操作不可撤销。</div>
        <button type="button" class="ending-btn primary" data-ngplus>开启新周目</button>
      </div>`)
  }
  el.innerHTML = parts.join('')
}

/** 渲染星域总览条（锁定/已解锁/当前选中态）；探索天体仅在发现后显示（未发现前隐藏保留惊喜，产出型不参与切换） */
export function renderPlanetBar(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(PLANETS)) {
    if (state.hiddenPlanets.includes(def.id)) continue
    el.appendChild(renderPlanetChip(def, state))
  }
  // 探索产出型天体：发现后以纯展示 chip 出现（不带 data-planet，产出型不参与切换）
  for (const def of Object.values(EXPLORE_PLANETS)) {
    const discovered = state.exploredPlanets.includes(def.id) || state.planets[def.id]?.unlocked === true
    if (!discovered) continue
    const chip = document.createElement('span')
    chip.className = 'planet-chip explore'
    chip.textContent = `◈ ${def.name}`
    el.appendChild(chip)
  }
}

/** 单个星球 chip（解锁态/锁定态） */
function renderPlanetChip(def: PlanetDef, state: GameState): HTMLElement {
  const unlocked = isPlanetUnlocked(state, def.id)
  const active = state.activePlanet === def.id
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `planet-chip${active ? ' active' : ''}`
  btn.setAttribute('data-planet', def.id)
  if (active) btn.setAttribute('data-active', '')
  if (!unlocked) {
    // 未解锁星球可点击：显示解锁条件（悬停 title + 点击日志）
    btn.classList.add('locked')
    btn.title = unlockRequirementText(def, state)
    btn.textContent = `🔒 ${def.name}`
  } else {
    btn.title = active ? '当前星球' : `切换到 ${def.name}`
    btn.textContent = `● ${def.name}`
  }
  return btn
}

/** 生成星球的解锁条件描述（含当前进度） */
export function unlockRequirementText(def: PlanetDef, state: GameState): string {
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const need = def.unlock.resources[k] ?? 0
    if (need > 0) {
      const have = state.resources[k]
      parts.push(`${RESOURCE_META[k].name} ${formatNumber(have)}/${formatNumber(need)}`)
    }
  }
  if (def.unlock.techs && def.unlock.techs.length > 0) {
    parts.push(`科技：${def.unlock.techs.map((t) => TECHS[t]?.name ?? t).join('、')}`)
  }
  return `解锁条件：${parts.length > 0 ? parts.join('，') : '已可解锁'}`
}

/** 渲染当前星球机制状态条（规则与展示文本均来自 mechanics.ts 唯一真源） */
export function renderPlanetMechanic(el: HTMLElement, state: GameState): void {
  const def = PLANETS[state.activePlanet]
  if (!def) {
    el.textContent = ''
    return
  }
  const mech = PLANET_MECHANICS[def.mechanicId] ?? PLANET_MECHANICS.none
  const status = mech.describe(state)
  el.innerHTML = `<span class="mech-name">${escapeHtml(mech.name)}</span><span class="mech-desc">${escapeHtml(mech.desc)}</span>${status ? `<span class="mech-status">${escapeHtml(status)}</span>` : ''}`
}

/** 渲染顶部资源条（带正/负速率标记；军力显示「当前/上限」） */
export function renderResources(el: HTMLElement, state: GameState, netProd: Record<string, number>): void {
  el.innerHTML = ''
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key]
    const value = state.resources[key]
    const rate = netProd[key] ?? 0
    const item = document.createElement('span')
    item.className = 'resource'
    item.setAttribute('data-resource', key)
    const rateText = formatRate(rate)
    const valueText = key === 'military'
      ? `${formatNumber(value)}${meta.symbol}/${formatNumber(militaryCap(state))}${meta.symbol}`
      : formatNumber(value)
    item.innerHTML = `<span class="res-symbol">${meta.symbol}</span>
      <span class="res-name">${meta.name}</span>
      <span class="res-value" data-res-value>${valueText}</span>
      <span class="res-rate">${rateText}</span>
      <button type="button" class="res-breakdown" data-breakdown-trigger data-breakdown-resource="${key}" aria-label="${meta.name}来源分解" title="查看来源分解">?</button>`
    el.appendChild(item)
  }
}

/** 渲染资源速率来源分解面板（问号触发；内容 = productionBreakdown 当前 tick 快照，250ms 重建随 render 实时刷新） */
export function renderBreakdownPanel(el: HTMLElement, state: GameState, resource: ResourceKey): void {
  const bd = productionBreakdown(state)[resource]
  el.classList.remove('hidden')
  const meta = RESOURCE_META[resource]
  const fmt = (v: number): string => `${v > 0 ? '+' : ''}${formatNumber(v)}/秒`
  const pct = (v: number): string => (bd.total !== 0 ? ` ${((v / bd.total) * 100).toFixed(1)}%` : '')
  const rows = (rs: BreakdownRow[]): string =>
    rs
      .map((r) => {
        const name = `${escapeHtml(r.name)}${r.count && r.count > 1 ? ` ×${r.count}` : ''}${r.level ? ` Lv${r.level}` : ''}`
        const mult = r.mult !== undefined && r.mult !== 1 ? `${formatMultiplier(r.mult)} ` : ''
        return `<div class="breakdown-row" data-breakdown-row data-breakdown-kind="${r.kind}"><span class="bd-name">${name}</span><span class="bd-value">${mult}${fmt(r.value)}</span><span class="bd-pct">${pct(r.value)}</span></div>`
      })
      .join('')
  const groups = bd.groups
    .map((g) => (g.rows.length > 0 ? `<section class="breakdown-group" data-breakdown-group="${escapeHtml(g.id)}"><h4>${escapeHtml(g.label)}</h4>${rows(g.rows)}</section>` : ''))
    .join('')
  const consumption =
    bd.consumption && bd.consumption.rows.length > 0
      ? `<details class="breakdown-consumption" data-breakdown-consumption><summary>消耗明细</summary>${rows(bd.consumption.rows)}</details>`
      : ''
  const notes = [bd.capNote, bd.energyNote].filter(Boolean).map((n) => `<div class="breakdown-note" data-breakdown-note>${escapeHtml(n as string)}</div>`).join('')
  el.innerHTML = `<div class="breakdown-head" data-breakdown-head>${meta.symbol} ${escapeHtml(meta.name)} · 速率构成</div>${groups}<div class="breakdown-total" data-breakdown-total>总计 ${fmt(bd.total)}</div>${consumption}${notes}`
}

export { buildCardAction, renderArchivePanel, renderAsciiBar, renderBuildPanel, renderDiplomacyPanel, renderFleetSection, renderInterstellarPanel, renderMegastructureSection, renderMilitaryPanel, renderSettingsPage, renderTechPanel } from './panels'
export type { BuildCardAction, BuildPanelRenderOptions, SettingsStatus } from './panels'
import { renderAsciiBar } from './panels'

export { renderBuyMaxModal, renderMegastructureModal, renderNgPlusModal } from './overlays'
export type { BuyMaxModalData } from './overlays'

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function isActionFailure(r: unknown): r is ActionFailure {
  return typeof r === 'object' && r !== null && (r as ActionFailure).ok === false
}
