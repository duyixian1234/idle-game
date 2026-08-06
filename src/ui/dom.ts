import type { EventFormulaPart, EventTheme, GameState, LogEntry, ResourceKey } from '../engine/types'
import { ACHIEVEMENTS } from '../engine/achievements'
import { reputation, reputationBonuses } from '../engine/reputation'
import type { ReputationBonuses } from '../engine/reputation'
import { ALL_FACTIONS, BUILDINGS, CONQUESTS, EXPLORE_FACTIONS, EXPLORE_PLANETS, FACTIONS, INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef, ConquestDef, FactionDef, PlanetDef, TechDef } from '../engine/data'
import { PLANET_MECHANICS } from '../engine/mechanics'
import { formatMultiplier, formatNumber, formatPercent, formatPlayTime, formatRate } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { isConquestAvailable, conquestState } from '../engine/conquest'
import { expeditionCost, explorationSlots, isExploreAvailable } from '../engine/exploration'
import { NG_PLUS_TECH_BASE } from '../engine/engine'
import { previewNewGamePlus } from '../engine/ngplus'
import type { NgPlusPreview } from '../engine/ngplus'
import { currentTutorialStep, TUTORIAL_STEPS, tutorialDone } from '../engine/tutorial'
import {
  canFactionAlliance,
  canFactionIntimidate,
  canFactionTechShare,
  canFactionTrade,
  factionsVisible,
  federationProgress,
  intimidateCost,
  tradeCost,
} from '../engine/diplomacy'
import { ALLIANCE_COST, ALLIANCE_FAVOR_THRESHOLD, CONQUEST_DURATION_MS, EXPEDITION_DURATION_MS, JUMPGATE_HARVEST_MULT, JUMPGATE_OFFLINE_EXTRA_SECONDS, JUMPGATE_SLOT_BONUS, OFFLINE_CAP_SECONDS, TECH_SHARE_COST } from '../engine/balance'
import {
  buildingCost,
  buildingLockReason,
  canAffordBuilding,
  canAffordUpgrade,
  canResearchTech,
  canTechUpgrade,
  canUpgradeTech,
  isBuildingUnlocked,
  isPlanetUnlocked,
  isTechResearched,
  megastructurePrereqsMet,
  techCost,
  techLevel,
  techRequirementsMet,
  upgradeCost,
} from '../engine/engine'
import { explorePlanetOutputs, simulateProductionDelta, techMultiplier, militaryCap, smelterGlobalMult } from '../engine/production'
import { dockLevel, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipCap } from '../engine/fleet'
import { TECH_MAX_LEVEL, TECH_EXCHANGE_RATE } from '../engine/balance'
import type { BulkPreview } from '../engine/bulk'
import type { ActionFailure } from '../engine/engine'
import { iconSpriteHtml, iconUse } from './icons'
import { typewriter, type TypedEvents } from './typewriter'

export { buildLayout } from './layout'
export type { AppElements, NavId } from './layout'

export { appendLog, renderLogInto, renderPendingEvents, renderAutoConfigPanel } from './log'
export { DEFAULT_LOG_DIRECTION, LOG_DIR_KEY } from './log'
export type { LogDirection } from './log'
import type { LogDirection } from './log'

/** boot 浮层内容（Q13 定案）：ASCII 标题 + 3 行 SYSTEM INIT；
 *  容器由 buildLayout 一次性构建（非重建元素），显隐由 main 层控制。 */
export function renderBootOverlay(el: HTMLElement, version: string): void {
  el.innerHTML = `
    <pre class="boot-art" aria-hidden="true">  ██╗██████╗ ██╗     ███████╗
  ██║██╔══██╗██║     ██╔════╝
  ██║██║  ██║██║     █████╗
  ██║██║  ██║██║     ██╔══╝
  ██║██████╔╝███████╗███████╗
  ╚═╝╚═════╝ ╚══════╝╚══════╝</pre>
    <div class="boot-title">深空拓荒 · 星系统一联邦 <span class="boot-version">v${escapeHtml(version)}</span></div>
    <div class="boot-line">&gt; SYSTEM INIT...</div>
    <div class="boot-line">&gt; 导航阵列就绪</div>
    <div class="boot-line">&gt; 采矿协议加载</div>
    <div class="boot-skip">[ 任意键跳过 ]</div>`
}

/** 渲染新手引导浮层（未完成时显示） */
export function renderTutorial(el: HTMLElement, state: GameState): void {
  if (tutorialDone(state)) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  const step = currentTutorialStep(state)
  if (!step) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  el.innerHTML = `
    <div class="tutorial-card" data-tutorial-card>
      <div class="tutorial-step">${formatNumber(state.tutorialStep + 1)}/${formatNumber(TUTORIAL_STEPS.length)}</div>
      <div class="tutorial-title">${escapeHtml(step.title)}</div>
      <div class="tutorial-text">${escapeHtml(step.text)}</div>
      <div class="tutorial-actions">
        <button type="button" class="tutorial-btn ghost" data-tutorial="skip">跳过引导</button>
        <button type="button" class="tutorial-btn primary" data-tutorial="next">下一步</button>
      </div>
    </div>`
}

/** 渲染结局面板（含通关统计与无限/NG+ 入口） */
export function renderEndingOverlay(el: HTMLElement, state: GameState, visible: boolean): void {
  if (!visible || state.phase !== 'ended') {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  const codex = state.factionCodex.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  el.innerHTML = `
    <div class="ending-card">
      <h1 class="ending-title">星系统一联邦</h1>
      <p class="ending-stats">
        统一历时 ${formatPlayTime(state.playSeconds)} · 累计采集矿物 ${formatNumber(state.stats.totalMineralEarned)}
      </p>
      <p class="ending-stats">派系图鉴：${escapeHtml(codex)} · NG+ 周目：${formatNumber(state.ngPlusLevel)}</p>
      <div class="ending-actions">
        <button type="button" class="ending-btn primary" data-ending="infinite">进入无限模式</button>
        <button type="button" class="ending-btn" data-ending="ngplus">开启 NG+（继承 ${formatNumber(NG_PLUS_TECH_BASE * (state.ngPlusLevel + 1))} 科技点）</button>
        <button type="button" class="ending-btn ghost" data-ending="close">继续查看</button>
      </div>
    </div>`
}

/** 渲染探索页（一级 tab 内嵌）：
 *  ① NG+ 终局卡：phase==='infinite' 时顶部显示「开启新周目」入口（data-ngplus 契约，与结局面板入口并存）
 *  ② 锁定占位页：phase==='playing'（未通关）显示 🔒 + 解锁条件 + 玩法简介
 *  ③ 派遣面板：深空信道 1/2/3 列表（空闲/派遣中/锁定三态；dispatch 保留 data-explore-dispatch 契约，值 = 槽位号 1|2|3）+
 *     已发现产出型天体的贡献行（data-planet-output，与引擎生产管线同口径） */
export function renderExplorePage(el: HTMLElement, state: GameState, nowMs: number = Date.now()): void {
  el.innerHTML = ''
  const parts: string[] = []
  // ① NG+ 终局卡：infinite 模式顶部常驻入口
  if (state.phase === 'infinite') {
    const p = previewNewGamePlus(state)
    parts.push(`
      <div class="ngplus-terminal">
        <div class="ngplus-terminal-title">第 ${formatNumber(state.ngPlusLevel)} 周目 · 无限模式</div>
        <div class="ngplus-terminal-desc">开启新周目：继承 ${formatNumber(p.carryTech)} 科技点、${formatMultiplier(p.permanentMult)} 永久产出加成、${formatNumber(p.codexFactions.length)} 个派系图鉴（需确认，不可逆）</div>
        <div class="ending-actions">
          <button type="button" class="ending-btn primary" data-ngplus title="开启新周目：携带派系图鉴与永久加成重开（需确认）">开启新周目</button>
        </div>
      </div>`)
  }
  // ② 锁定占位：通关前告知终局玩法存在
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
  // ③ 派遣面板：深空信道列表（槽位数 = explorationSlots，上限 5：1 + 科技 2 + 跃迁枢纽 2）
  const slots = explorationSlots(state)
  const ongoing = state.expeditions.filter((e) => !e.resolved)
  const totalPool = Object.keys(EXPLORE_FACTIONS).length + Object.keys(EXPLORE_PLANETS).length
  const discovered = state.exploredFactions.length + state.exploredPlanets.length
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
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state active">⏳ 派遣中</span></div>
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
    slotCards.push(`
      <div class="explore-slot" data-expedition-slot="${slotNo}">
        <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state idle">空闲</span></div>
        <div class="explore-slot-cost">消耗：${RESOURCE_META.mineral.symbol}${formatNumber(cost.mineral)} · ${RESOURCE_META.energy.symbol}${formatNumber(cost.energy)} · ${RESOURCE_META.military.symbol}${formatNumber(cost.military)} · 时长 60 分钟（离线照常推进）</div>
        <div class="explore-slot-actions">
          <button type="button" class="ending-btn primary" data-explore-dispatch="${slotNo}" ${!affordMineral || !affordEnergy || !affordMilitary ? 'disabled' : ''} title="${escapeHtml(reason)}">${iconUse('dispatch', 'dispatch-icon')} 派遣</button>
        </div>
      </div>`)
  }
  const outputRows = explorePlanetOutputs(state)
    .map((o) => {
      const text = RESOURCE_KEYS.filter((k) => o.values[k] > 0)
        .map((k) => `${RESOURCE_META[k].symbol} ${formatRate(o.values[k])}`)
        .join(' · ')
      return `<div class="explore-planet-output" data-planet-output="${o.planetId}">${iconUse(o.planetId, 'explore-icon')} ${escapeHtml(o.name)}：${text}</div>`
    })
    .join('')
  parts.push(`
    <div class="explore-card">
      <h1 class="ending-title">派遣探索</h1>
      <p class="ending-stats">通关后的新航路：深空信道并行派遣，有概率发现新的派系势力或发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</p>
      <div class="explore-progress">已发现：${formatNumber(discovered)} / ${formatNumber(totalPool)}（势力 ${formatNumber(state.exploredFactions.length)}/${formatNumber(Object.keys(EXPLORE_FACTIONS).length)} · 天体 ${formatNumber(state.exploredPlanets.length)}/${formatNumber(Object.keys(EXPLORE_PLANETS).length)}）</div>
      <div class="explore-slots">${slotCards.join('')}</div>
      ${outputRows ? `<div class="explore-planet-outputs">${outputRows}</div>` : ''}
    </div>`)
  el.innerHTML = parts.join('')
}

/** 渲染星域总览条（锁定/已解锁/当前选中态）；探索天体仅在发现后显示（未发现前隐藏保留惊喜） */
export function renderPlanetBar(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(PLANETS)) {
    el.appendChild(renderPlanetChip(def, state))
  }
  for (const def of Object.values(EXPLORE_PLANETS)) {
    if (!state.planets[def.id]?.unlocked) continue
    el.appendChild(renderPlanetChip(def, state))
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
      <span class="res-rate">${rateText}</span>`
    el.appendChild(item)
  }
}

export { buildCardAction, renderArchivePanel, renderAsciiBar, renderBuildPanel, renderDiplomacyPanel, renderFleetSection, renderInterstellarPanel, renderMegastructureSection, renderMilitaryPanel, renderSettingsPage, renderTechPanel } from './panels'
export type { BuildCardAction, BuildPanelRenderOptions, SettingsStatus } from './panels'
import { renderAsciiBar } from './panels'

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

/** 买满确认弹窗数据（summary 由调用方组装，preview 为引擎预演结果） */export interface BuyMaxModalData {
  title: string
  summary: string
  preview: BulkPreview
}

/** 渲染一键买满确认弹窗（复用 ending overlay 卡片体系） */
export function renderBuyMaxModal(el: HTMLElement, data: BuyMaxModalData): void {
  const { preview } = data
  const spendText = formatCost(preview.spent)
  const remainText = formatCost(preview.remaining) || formatNumber(0)
  const emptyText = preview.emptyWarnings.map((k) => RESOURCE_META[k].name).join('、')
  const energy = preview.energyWarning
  const energyWarn =
    energy && energy.bought > energy.maxDriven
      ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 能源平衡：当前产出 ${formatRate(energy.production)} · 需求 ${formatRate(energy.consumption)} · 最多可驱动 ${formatNumber(energy.maxDriven)} 台 · 本次将买 ${formatNumber(energy.bought)} 台，超出部分无产出。</div>`
      : ''
  const emptyWarn = emptyText
    ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 将清空资源：${escapeHtml(emptyText)}（执行后剩余不足 1）</div>`
    : ''
  el.innerHTML = `
    <div class="buy-max-card">
      <div class="buy-max-title">${escapeHtml(data.title)}</div>
      <div class="buy-max-body">
        <div class="buy-max-summary">${escapeHtml(data.summary)}</div>
        <table class="buy-max-table">
          <tr><th>总花费</th><td>${spendText || '0'}</td></tr>
          <tr><th>执行后剩余</th><td>${remainText}</td></tr>
        </table>
        ${emptyWarn}
        ${energyWarn}
      </div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-buy-max-confirm>确认花光</button>
        <button type="button" class="ending-btn ghost" data-buy-max-cancel>取消</button>
      </div>
    </div>`
}

function formatCost(cost: Record<ResourceKey, number>): string {
  return RESOURCE_KEYS.filter((k) => cost[k] > 0)
    .map((k) => `${RESOURCE_META[k].symbol}${formatNumber(cost[k])}`)
    .join(' ')
}

/** 渲染「开启新周目」确认弹窗（双清单：将失去 / 将继承，继承为预览值） */
export function renderNgPlusModal(el: HTMLElement, state: GameState, preview: NgPlusPreview): void {
  const { lost } = preview
  // 将失去（本周目内清零）
  const resText = lost.resources.map((k) => `${RESOURCE_META[k].symbol}${formatNumber(state.resources[k])}`).join('、') || '无'
  const bldText = lost.buildings.map((id) => `${BUILDINGS[id]?.name ?? id} ×${formatNumber(state.buildings[id] ?? 0)}`).join('、') || '无'
  const techText = lost.techs.map((id) => `${TECHS[id]?.name ?? id} Lv.${formatNumber(state.techLevels[id] ?? 0)}`).join('、') || '无'
  const facText = lost.alliedFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  // 将继承（NG+ 后生效，预览值）
  const codexText = preview.codexFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  const bonusText =
    Object.entries(preview.permanentBonuses)
      .map(([k, v]) => `${k === 'production' ? '全产出' : '军力上限'} +${formatPercent(v * 100)}`)
      .join('、') || '无'
  const achCount = Object.keys(state.achievements).length
  el.innerHTML = `
    <div class="ngplus-card" data-ngplus-card>
      <div class="buy-max-title">开启新周目</div>
      <div class="buy-max-summary">第 ${formatNumber(state.ngPlusLevel)} 周目 → 第 ${formatNumber(preview.nextLevel)} 周目。此操作不可逆。</div>
      <div class="ngplus-section-title">将失去（本周目）</div>
      <table class="buy-max-table">
        <tr><th>资源</th><td>${resText}</td></tr>
        <tr><th>建筑</th><td>${bldText}</td></tr>
        <tr><th>科技</th><td>${techText}</td></tr>
        <tr><th>派系</th><td>${facText}</td></tr>
        <tr><th>攻占</th><td>${formatNumber(lost.conquered)}/${formatNumber(Object.keys(CONQUESTS).length)} 区域</td></tr>
        <tr><th>探索</th><td>${formatNumber(lost.exploredCount)} 个发现物 · ${formatNumber(lost.activeExpeditions)} 支探索队（派遣中，将失去）</td></tr>
        <tr><th>舰队</th><td>${formatNumber(lost.fleetCount)} 艘护卫舰（随星际工程重置）</td></tr>
        <tr><th>声望</th><td>${formatNumber(lost.reputation)}</td></tr>
        <tr><th>统计</th><td>在线 ${formatPlayTime(lost.playSeconds)} · 累计矿物 ${formatNumber(lost.totalMineralEarned)}</td></tr>
      </table>
      <div class="ngplus-section-title">将继承</div>
      <table class="buy-max-table">
        <tr><th>周目</th><td>第 ${formatNumber(preview.nextLevel)} 周目</td></tr>
        <tr><th>产出加成</th><td>${formatMultiplier(preview.permanentMult)}</td></tr>
        <tr><th>科技点</th><td>${formatNumber(preview.carryTech)}</td></tr>
        <tr><th>图鉴派系</th><td>${escapeHtml(codexText)}（初始好感 +${formatNumber(25)}）</td></tr>
        <tr><th>永久加成</th><td>${bonusText}</td></tr>
        <tr><th>成就图鉴</th><td>${formatNumber(achCount)} 个（跨周目保留）</td></tr>
      </table>
      <div class="buy-max-warn">⚠ 确认后无法撤销：本周目资源、建筑、科技、派系好感、攻占进度与声望将全部清零。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-ngplus-confirm>开启新周目</button>
        <button type="button" class="ending-btn ghost" data-ngplus-cancel>取消</button>
      </div>
    </div>`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

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
