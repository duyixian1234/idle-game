import { t } from '../i18n'
import type {
  EventCurveConfig,
  EventCurveInput,
  EventCurveResult,
  EventFormulaPart,
  EventHandlingMode,
  EventInstance,
  EventPriority,
  EventRiskLevel,
  EventSettlement,
  EventTheme,
  GameState,
  RandomEventDef,
  ResourceKey,
} from './types'
import {ALL_FACTIONS, FACTIONS} from './data'
import {MEAN_EVENT_GAP_SECONDS, RAID_BUYOFF_FAVOR_GAIN, RAID_EVENT_WEIGHT, RAID_GAP_SECONDS, RAID_IGNORE_LOSS_PCT, RAID_OFFLINE_LOSS_CAP, RAID_STRENGTH_MULT, RAID_THREAT_LOSS, BUG_ESCALATION_STEP, BUG_ESCALATION_CAP, BUG_STRENGTH_FLEET_RATIO, BUG_REPEL_MIN, BUG_STRENGTH_BASE, TRADE_GAIN_STOCK_PCT, TRADE_COST_STOCK_PCT, TRADE_SOFT_CAP_RATE_SECONDS, } from './balance'
import {netProduction} from './production'
import {fleetPower} from './fleet'
import {raidThreshold} from './reputation'
import {ensureCoercionUnlocked} from './diplomacy'
import {rollDomain, streamFor} from './rng'
import {EVENT_STORIES} from './story'
import {pushLog} from './core'
import {formatNumber, formatPercent} from './format'
import type {
  EventAutomationAudit,
  EventAutomationPolicy,
  EventAutomationRule,
} from './types'
import {ENDLESS_EVENT_POOL, EVENT_CONTRACT_VERSION, EVENT_DEFS} from './events-data'
import {defName} from './data'



export interface AutomationResolution {
  eventUid: number
  status: 'resolved' | 'paused' | 'failed'
  outcome?: EventOutcome
  ruleId?: string
  reason: string
}

const RISK_RANK: Record<EventRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export const DEFAULT_AUTOMATION_FALLBACK: Record<EventTheme, string | undefined> = {
  trade: 'accept',
  disaster: 'collect',
  security: 'ignore',
  exploration: undefined,
  investment: undefined,
}

export const DEFAULT_AUTOMATION_MAX_RISK: Record<EventTheme, EventRiskLevel | undefined> = {
  trade: 'medium',
  disaster: 'high',
  security: 'high',
  exploration: undefined,
  investment: undefined,
}

/** 类别级自动处理「未显式配置兜底选项」时的智能降级链：
 * 按序取第一个 fallbackGate 允许的选项（负担得起即用）。
 * 仅 security 需要：其默认兜底 ignore 会白丢矿物+升级虫群，故改为 repel→dispatch→jam→ignore
 * 按资源负担能力自动选择（2026-08-09）。其余类别维持 DEFAULT_AUTOMATION_FALLBACK 原兜底
 * （trade=accept、disaster=collect），不设链。显式配置的规则/兜底仍优先且不受降级。 */
export const AUTOMATION_FALLBACK_CHAIN: Record<EventTheme, string[]> = {
  trade: [],
  disaster: [],
  security: ['repel', 'dispatch', 'jam', 'ignore'],
  exploration: [],
  investment: [],
}

export function createDefaultAutomationPolicies(): Record<string, EventAutomationPolicy> {
  return {
    trade: { enabled: false, rules: [] },
    disaster: { enabled: false, rules: [] },
    security: { enabled: false, rules: [] },
    exploration: { enabled: false, rules: [] },
    investment: { enabled: false, rules: [] },
  }
}


/**
 * 派系骚扰（raid）参数族（威胁阈值/强度倍率/损失/封顶）集中见 balance.ts。
 * - 威胁度 ≥ 骚扰阈值 且未结盟的派系会周期性地军事骚扰殖民地
 * - 击退需军力 = 该派系威胁度 × 强度倍率，击退后威胁度 −RAID_THREAT_LOSS（软威慑）
 * - 买平安 = 矿物标定值，好感 +RAID_BUYOFF_FAVOR_GAIN
 * - 无视 = 矿/能各 −RAID_IGNORE_LOSS_PCT%
 * - 离线自动结算：军力足够自动击退，否则按无视规则（叠加离线 30% 封顶）
 */

/** 随机事件均值间隔与首次延迟——数值策略见 balance.ts */

/** 事件处理结果（供调用方写日志） */
export interface EventOutcome {
  logType: 'reward' | 'warning' | 'event' | 'system'
  logText: string
  changed: boolean
  deltas?: Partial<Record<ResourceKey, number>>
  breakdown?: EventFormulaPart[]
  settlement?: EventSettlement
  priority?: EventPriority
  handlingMode?: EventHandlingMode
}

/** 当前威胁度最高的可骚扰派系（threat ≥ 当前骚扰阈值且未结盟；阈值随声望上移，硬上限 65）；无则 null。
 * 遍历 ALL_FACTIONS（初始 + 探索发现，如高威胁的黑曜协议也是天然 raid 源）。 */
export function raidableFaction(state: GameState): { id: string; name: string; threat: number } | null {
  const threshold = raidThreshold(state)
  let best: { id: string; threat: number } | null = null
  for (const def of Object.values(ALL_FACTIONS)) {
    const f = state.factions[def.id]
    if (!f || f.allied) continue
    if (f.threat < threshold) continue
    if (!best || f.threat > best.threat) best = { id: def.id, threat: f.threat }
  }
  if (!best) return null
  return { id: best.id, name: ALL_FACTIONS[best.id] ? defName(ALL_FACTIONS[best.id]) : best.id, threat: best.threat }
}

export function endlessLayer(state: GameState): number {
  return Math.max(0, Math.floor(state.endless?.layer ?? (state.phase === 'infinite' ? state.ngPlusLevel : 0)))
}

/** 推进无尽层数并初始化下一条阶段链，供结算与存档恢复共用。 */
export function advanceEndlessLayer(state: GameState, amount = 1): number {
  state.endless.layer = Math.max(0, state.endless.layer + Math.max(0, Math.floor(amount)))
  state.endless.stage = Math.max(state.endless.stage, state.endless.layer)
  state.endless.chain = { id: `layer-${state.endless.layer}`, step: 0, completed: false }
  return state.endless.layer
}

  /** 当前层数可用的无限事件池（返回副本，调用方可安全组合权重）。 */
export function endlessEventPool(state: GameState): RandomEventDef[] {
    const layer = endlessLayer(state)
    return [...EVENT_DEFS, ...ENDLESS_EVENT_POOL].filter((def) => def.endless && layer >= def.stageEligibility.min && (!def.stageEligibility.max || layer <= def.stageEligibility.max))
  }

  /** 无限事件选择：动态层数权重 + 最近族群衰减 + 连续坏运气保护。 */
export function pickEndlessEventDef(state: GameState, rng?: () => number): RandomEventDef {
    const pool = endlessEventPool(state)
    if (pool.length === 0) return EVENT_DEFS[0]
    const lastFamily = state.endless?.lastFamily
    const badLuck = state.endless?.badLuck ?? 0
    const protectedPool = badLuck >= 3 ? pool.filter((def) => def.riskLevel !== 'low' && def.riskLevel !== 'medium') : pool
    const candidates = protectedPool.length > 0 ? protectedPool : pool
    const weighted = candidates.map((def) => ({
      def,
      weight: def.weight * (def.family === lastFamily ? 0.55 : 1) * (def.isBoss && endlessLayer(state) % 3 !== 0 ? 0.35 : 1),
    }))
    const total = weighted.reduce((sum, item) => sum + item.weight, 0)
    let value = (rng ?? rollDomain(state, 'event'))() * total
    for (const item of weighted) {
      value -= item.weight
      if (value <= 0) {
        if (state.endless) {
          state.endless.lastFamily = item.def.family
          state.endless.badLuck = item.def.riskLevel === 'low' || item.def.riskLevel === 'medium' ? badLuck + 1 : 0
        }
        return item.def
      }
    }
    return weighted[weighted.length - 1].def
}

/**
 * 按权重随机选择事件定义（raid 为动态项：有威胁派系时进入候选；母巢攻占后虫族警报权重归 0）。
 * rng 不传（undefined）→ 结果型随机走 event 域持久化计数器（fixed-rng 防 SL）；
 * 显式传 rng → 测试注入（跳过计数器，行为与现状一致）。
 */
export function pickEventDef(state: GameState, rng?: () => number): RandomEventDef {
  // 叙事闭环：虫群母巢被攻占后，虫族警报事件不再触发（母巢被端、虫灾绝迹）
  const nestConquered = state.conquest.nest?.status === 'conquered'
  const pool = EVENT_DEFS.filter((d) => !(d.id === 'bug' && nestConquered))
  if (raidableFaction(state)) {
    pool.push({
      id: 'raid',
      nameKey: 'event.raid',
      weight: RAID_EVENT_WEIGHT,
      kind: 'raid',
      theme: 'security',
      decisionType: 'defend',
      riskLevel: 'high',
      stage: { min: 0 },
      endless: true,
      curveVersion: EVENT_CONTRACT_VERSION,
      stageEligibility: { min: 0 },
      endlessEligibility: true,
      curve: { baseValue: 0 },
    })
  }
  const total = pool.reduce((sum, d) => sum + d.weight, 0)
  const roll = rng ?? rollDomain(state, 'event')
  let value = roll() * total
  for (const def of pool) {
    value -= def.weight
    if (value <= 0) return def
  }
  return pool[pool.length - 1]
}

function scaledBy(rate: number, min: number, factor: number): number {
  return Math.max(min, Math.floor(rate * factor))
}

/** 统一事件曲线：基础值 × 阶段/层数 × 风险 × 能力修正，并应用软上限。 */
export function evaluateEventCurve(config: EventCurveConfig, input: EventCurveInput = {}): EventCurveResult {
  const stage = Math.max(0, input.stage ?? 0)
  const layer = Math.max(0, input.layer ?? 0)
  const stageMultiplier = Math.pow(config.stageMultiplier ?? 1, stage)
  const layerMultiplier = Math.pow(config.layerMultiplier ?? 1, layer)
  const riskMultiplier = config.riskMultiplier ?? 1
  const capabilityModifier = config.capabilityModifier ?? 1
  const breakdown: EventFormulaPart[] = [
    { name: 'base', value: config.baseValue },
    { name: 'stageLayer', value: stageMultiplier * layerMultiplier, multiplier: stageMultiplier * layerMultiplier },
    { name: 'risk', value: riskMultiplier, multiplier: riskMultiplier },
    { name: 'capability', value: capabilityModifier, multiplier: capabilityModifier },
  ]
  const raw = config.baseValue * stageMultiplier * layerMultiplier * riskMultiplier * capabilityModifier
  const value = config.softCap == null ? raw : Math.min(raw, config.softCap)
  if (config.softCap != null && value !== raw) breakdown.push({ name: 'softCap', value: config.softCap, multiplier: value / raw })
  return { value, breakdown }
}

/** 无尽模式统一曲线：层数在软上限后只产生边际收益，风险与能力仍可解释拆分。 */
export function evaluateEndlessCurve(
  baseValue: number,
  input: { layer?: number; stage?: number; riskMultiplier?: number; abilityModifier?: number; softCap?: number } = {},
): EventCurveResult {
  const layer = Math.max(0, input.layer ?? 0)
  const stage = Math.max(0, input.stage ?? 0)
  const cap = input.softCap ?? Number.POSITIVE_INFINITY
  const linear = 1 + Math.min(layer, 10) * 0.12
  const marginal = layer > 10 ? 1 + 10 * 0.12 + Math.log1p(layer - 10) * 0.08 : linear
  return evaluateEventCurve(
    {
      baseValue: baseValue * marginal,
      stageMultiplier: 1.08,
      riskMultiplier: input.riskMultiplier ?? 1,
      capabilityModifier: input.abilityModifier ?? 1,
      softCap: cap,
    },
    { stage },
  )
}

function eventStage(state: GameState): number {
  return state.phase === 'infinite' ? Math.max(0, Math.floor(state.playSeconds / 3600)) : 0
}

function eventHandling(riskLevel: EventRiskLevel): { priority: EventPriority; handlingMode: EventHandlingMode } {
  if (riskLevel === 'critical') return { priority: 'critical', handlingMode: 'blocking' }
  if (riskLevel === 'high') return { priority: 'urgent', handlingMode: 'blocking' }
  if (riskLevel === 'medium') return { priority: 'urgent', handlingMode: 'alert' }
  return { priority: 'normal', handlingMode: 'queue' }
}

function eventSettlement(deltas: Record<string, number>, base: number, capability = 1): EventSettlement {
  return {
    deltas,
    breakdown: [
      { name: 'base', value: base },
      { name: 'stageLayer', value: 1, multiplier: 1 },
      { name: 'risk', value: 1, multiplier: 1 },
      { name: 'capability', value: capability, multiplier: capability },
    ],
  }
}

/** 贸易事件数值：花费矿物换取科技点，共享统一曲线。
 * 能力修正 = max(速率项, 存量项)（spec 扩展命名输入，2026-08-09）：
 * - 速率项：N 秒当前产出（原有行为）；
 * - 存量项：累计资源的固定比例（解决后期「N 秒产出」相对存量微不足道）；
 * softCap 锚定当前产出速率（≥1e6），避免后期绝对数冻结。 */
export function tradeEventTerms(state: GameState): { cost: number; gain: number; breakdown: EventFormulaPart[] } {
  const prod = netProduction(state)
  const stage = eventStage(state)
  const layerMultiplier = 1 + state.ngPlusLevel * 0.1
  const stageMultiplier = 1 + stage * 0.1
  const costRate = Math.max(1, (prod.mineral * 120) / 500)
  const costStock = Math.max(1, ((state.stats.totalMineralEarned ?? 0) * TRADE_COST_STOCK_PCT) / 500)
  const gainRate = Math.max(1, (prod.tech * 30) / 50)
  const gainStock = Math.max(1, ((state.stats.totalTechEarned ?? 0) * TRADE_GAIN_STOCK_PCT) / 50)
  // softCap 计入存量项等效值：存量主导时不被「3600 秒产出」基准截回（2026-08-09 code-review 修复）
  const costStockValue = (state.stats.totalMineralEarned ?? 0) * TRADE_COST_STOCK_PCT
  const gainStockValue = (state.stats.totalTechEarned ?? 0) * TRADE_GAIN_STOCK_PCT
  const costSoftCap = Math.max(1_000_000, prod.mineral * TRADE_SOFT_CAP_RATE_SECONDS, costStockValue)
  const gainSoftCap = Math.max(1_000_000, prod.tech * TRADE_SOFT_CAP_RATE_SECONDS, gainStockValue)
  const costCurve = evaluateEventCurve({
    baseValue: 500,
    stageMultiplier,
    layerMultiplier,
    capabilityModifier: Math.max(costRate, costStock),
    softCap: costSoftCap,
  }, { stage, layer: state.ngPlusLevel })
  const gainCurve = evaluateEventCurve({
    baseValue: 50,
    stageMultiplier,
    layerMultiplier,
    capabilityModifier: Math.max(gainRate, gainStock),
    softCap: gainSoftCap,
  }, { stage, layer: state.ngPlusLevel })
  return { cost: Math.max(500, Math.floor(costCurve.value)), gain: Math.max(50, Math.floor(gainCurve.value)), breakdown: [...costCurve.breakdown, ...gainCurve.breakdown] }
}

/** 随机事件叙事（rng 可选一条） */
export function eventStory(defId: string, rng: () => number = Math.random): string {
  const pool = EVENT_STORIES[defId]
  if (!pool || pool.length === 0) return ''
  return t(pool[Math.floor(rng() * pool.length)])
}

/** 生成事件实例（交互类事件），数值固化进 payload 保证提示与结算一致 */
export function createEventInstance(state: GameState, defId: string, rng: () => number = Math.random): EventInstance {
  const uid = state.nextEventId
  state.nextEventId += 1
  const def = [...EVENT_DEFS, ...ENDLESS_EVENT_POOL, { id: 'raid', nameKey: 'event.raid', weight: RAID_EVENT_WEIGHT, kind: 'raid' as const, theme: 'security' as const, decisionType: 'defend' as const, riskLevel: 'high' as const, stage: { min: 0 }, endless: true, curveVersion: EVENT_CONTRACT_VERSION, stageEligibility: { min: 0 }, endlessEligibility: true, curve: { baseValue: 0 } } as RandomEventDef]
    .find((candidate) => candidate.id === defId)
  const base: EventInstance = {
    uid,
    defId,
    title: '',
    desc: '',
    options: [],
    createdAt: state.lastTick,
    resolved: false,
    contractVersion: EVENT_CONTRACT_VERSION,
    theme: def?.theme ?? 'trade',
    decisionType: def?.decisionType ?? 'exchange',
    riskLevel: def?.riskLevel ?? 'low',
    stageEligibility: def?.stageEligibility ?? { min: 0 },
    endlessEligibility: def?.endlessEligibility ?? true,
    curveVersion: def?.curveVersion ?? EVENT_CONTRACT_VERSION,
    family: def?.family,
    variantId: def?.variantId,
    tags: def?.tags,
    isBoss: def?.isBoss,
    chain: def?.chain ? { ...def.chain } : undefined,
    priority: def?.priority ?? eventHandling(def?.riskLevel ?? 'low').priority,
    handlingMode: def?.handlingMode ?? eventHandling(def?.riskLevel ?? 'low').handlingMode,
  }

  if (defId === 'raid') return createRaidInstance(state, base, rng)
  if (def?.kind === 'boss') {
    const curve = evaluateEndlessCurve(def.curve.baseValue, {
      layer: endlessLayer(state),
      stage: state.endless?.stage ?? 0,
      riskMultiplier: 1.5,
      abilityModifier: Math.max(1, netProduction(state).military / 100),
      softCap: def.curve.softCap,
    })
    const cost = Math.max(100, Math.floor(curve.value))
    return {
      ...base,
      title: defName(def),
      desc: t('log.events.0'),
      payload: { cost, reward: Math.floor(cost * 1.4), curveVersion: EVENT_CONTRACT_VERSION },
      settlement: { deltas: {}, breakdown: curve.breakdown },
      options: [
        { id: 'confront', label: t('evopt.0'), hint: t('evopt.1', { a0: formatNumber(cost) }) },
        { id: 'retreat', label: t('evopt.2') },
      ],
    }
  }

  if (defId === 'trade' || def?.kind === 'trade') {
    const terms = tradeEventTerms(state)
    const { cost, gain } = terms
    const story = eventStory('trade', rng)
    return {
      ...base,
      title: t('log.events.1'),
      desc: story || t('log.events.2'),
      payload: { cost, gain, curveVersion: EVENT_CONTRACT_VERSION },
      settlement: { deltas: {}, breakdown: terms.breakdown },
      options: [
        { id: 'accept', label: t('evopt.3'), hint: t('evopt.4', { a0: formatNumber(cost), a1: formatNumber(gain) }) },
        { id: 'refuse', label: t('evopt.5') },
      ],
    }
  }
  if (defId === 'meteor' || def?.kind === 'meteor') {
    const curve = evaluateEndlessCurve(def?.curve.baseValue ?? 300, {
      layer: endlessLayer(state),
      stage: state.endless?.stage ?? 0,
      riskMultiplier: def?.riskLevel === 'high' ? 1.4 : 1,
      softCap: def?.curve.softCap,
    })
    const factor = curve.value / 300
    const gain = Math.max(1, Math.floor(scaledBy(netProduction(state).mineral, 300, 60) * factor))
    const shieldCost = Math.max(1, Math.floor(scaledBy(netProduction(state).tech, 200, 60) * factor))
    const story = eventStory('meteor', rng)
    return {
      ...base,
      title: t('log.events.3'),
      desc: story || t('log.events.4'),
      payload: { gain, shieldCost, curveVersion: EVENT_CONTRACT_VERSION },
      settlement: { deltas: {}, breakdown: curve.breakdown },
      options: [
        { id: 'collect', label: t('evopt.6'), hint: t('evopt.7', { a0: formatNumber(gain) }) },
        { id: 'shield', label: t('evopt.8'), hint: t('evopt.9', { a0: formatNumber(shieldCost), a1: formatNumber(gain * 2) }) },
      ],
    }
  }
  // bug / void-swarm
  const terms = bugTerms(state, def!)
  const curve = evaluateEndlessCurve(def?.curve.baseValue ?? 800, {
    layer: endlessLayer(state),
    stage: state.endless?.stage ?? 0,
    riskMultiplier: def?.riskLevel === 'critical' ? 1.8 : 1,
    softCap: def?.curve.softCap,
  })
  const factor = curve.value / 800
  const cost = Math.max(1, Math.floor(scaledBy(netProduction(state).mineral, 800, 200) * factor))
  const jamCost = Math.max(1, Math.floor(scaledBy(netProduction(state).tech, 150, 50) * factor))
  const story = eventStory('bug', rng)
  return {
    ...base,
    title: t('log.events.5'),
    desc: story || t('log.events.6'),
    payload: { cost, jamCost, strength: terms.strength, repelCost: terms.repelCost, curveVersion: EVENT_CONTRACT_VERSION },
    settlement: { deltas: {}, breakdown: curve.breakdown },
    options: [
      { id: 'repel', label: t('evopt.10'), hint: t('evopt.11', { a0: formatNumber(terms.repelCost) }) },
      { id: 'dispatch', label: t('evopt.12'), hint: t('evopt.13', { a0: formatNumber(cost) }) },
      { id: 'jam', label: t('evopt.14'), hint: t('evopt.15', { a0: formatNumber(jamCost) }) },
      { id: 'ignore', label: t('evopt.16') },
    ],
  }

}

/** 虫群事件固化的强度与军力击退成本，事件卡、结算和自动迎击共用。
 * 强度 = max(2200 × min(强度×曲线, 封顶), 舰队战力×0.8)：
 * - escalation × curveFactor 合并封顶 BUG_ESCALATION_CAP：状态膨胀与无尽曲线放大
 *   都不能把强度顶破满配舰队战力天花板（自动迎击永不失效）；
 * - 下限锚定舰队战力：强舰队时强度保持对抗但 repel 最低成本可用。 */
export function bugTerms(state: GameState, def: RandomEventDef): { strength: number; repelCost: number; curveFactor: number } {
  const curve = evaluateEndlessCurve(def.curve.baseValue, {
    layer: endlessLayer(state),
    stage: state.endless?.stage ?? 0,
    riskMultiplier: def.riskLevel === 'critical' ? 1.8 : 1,
    softCap: def.curve.softCap,
  })
  const curveFactor = curve.value / 800
  const escalation = Math.max(1, state.bugEscalation ?? 1)
  const fleetPowerValue = fleetPower(state)
  // 基线项把 escalation × curveFactor 合并封顶在 CAP：无尽深层 curveFactor（marginal × 1.08^stage）
  // 不再把强度顶破满配舰队战力天花板（2026-08-09 code-review 修复）。
  const strength = Math.max(
    BUG_REPEL_MIN,
    Math.floor(Math.max(
      BUG_STRENGTH_BASE * Math.min(escalation * curveFactor, BUG_ESCALATION_CAP),
      fleetPowerValue * BUG_STRENGTH_FLEET_RATIO,
    )),
  )
  return { strength, repelCost: Math.max(BUG_REPEL_MIN, strength - fleetPowerValue), curveFactor }
}

/** 骚扰事件的选项与数值（供 createEventInstance 与离线结算共用，保证口径一致） */
export function raidTerms(state: GameState, factionId: string): { strength: number; buyoff: number; threat: number } {
  const threat = state.factions[factionId]?.threat ?? 0
  return {
    strength: Math.max(50, Math.floor(threat * RAID_STRENGTH_MULT)),
    buyoff: scaledBy(netProduction(state).mineral, 5_000, 30),
    threat,
  }
}

/** 生成骚扰事件实例（针对威胁度最高的未结盟派系）。
 * 舰队战力削减「军力击退」所需强度：repelCost = max(50, strength − fleetPower)，
 * 固化进 payload 保证 hint 与结算一致（与 terms 同源，防双实现漂移）。 */
function createRaidInstance(state: GameState, base: EventInstance, rng: () => number): EventInstance {
  const raider = raidableFaction(state)
  const factionId = raider?.id ?? 'unknown'
  const terms = raidTerms(state, factionId)
  const repelCost = Math.max(50, terms.strength - fleetPower(state))
  const story = eventStory('raid', rng)
  return {
    ...base,
    title: t('log.events.7', { a0: raider?.name ?? '未知势力' }),
    desc: story || t('log.events.8', { a0: raider?.name ?? '未知势力' }),
    payload: { factionId, ...terms, repelCost },
    options: [
      { id: 'repel', label: t('evopt.10'), hint: t('evopt.17', { a0: formatNumber(repelCost), a1: formatNumber(RAID_THREAT_LOSS) }) },
      { id: 'buyoff', label: t('evopt.18'), hint: t('evopt.19', { a0: formatNumber(terms.buyoff), a1: formatNumber(RAID_BUYOFF_FAVOR_GAIN) }) },
      { id: 'ignore', label: '无视', hint: `矿/能各 -${formatPercent(RAID_IGNORE_LOSS_PCT * 100)}` },
    ],
  }
}

/** 处理事件：变更资源并返回日志内容 */
export function applyEvent(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const defId = instance.defId
  const prod = netProduction(state)

  if (instance.isBoss || defId === 'endless-overseer') {
    const cost = Number(instance.payload?.cost ?? 0)
    if (optionId === 'confront') {
      if (state.resources.military < cost) return { logType: 'warning', logText: t('log.events.9', { a0: formatNumber(cost) }), changed: false }
      state.resources.military -= cost
      const reward = Number(instance.payload?.reward ?? Math.floor(cost * 1.4))
      state.resources.mineral += reward
      state.endless.stage += 1
      state.endless.bossDefeated += 1
      const previousChain = state.endless.chain
      advanceEndlessLayer(state)
      state.endless.chain = {
        ...(previousChain ?? { id: `layer-${state.endless.layer}`, step: 0 }),
        step: (previousChain?.step ?? 0) + 1,
        completed: true,
        result: 'victory',
      }
      const settlement = eventSettlement({ military: -cost, mineral: reward }, cost)
      return { logType: 'reward', logText: t('log.events.10', { a0: formatNumber(cost), a1: formatNumber(reward) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
    }
    return { logType: 'warning', logText: t('log.events.11'), changed: false }
  }

  if (defId === 'trade' || defId === 'trade-frontier') {
    // 优先用实例固化数值，保证与提示一致
    const terms = tradeEventTerms(state)
    const cost = Number(instance.payload?.cost ?? terms.cost)
    const gain = Number(instance.payload?.gain ?? terms.gain)
    if (optionId === 'accept') {
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: t('log.events.12'), changed: false }
      }

      state.resources.mineral -= cost
      state.resources.tech += gain
      return { logType: 'reward', logText: t('log.events.13', { a0: formatNumber(cost), a1: formatNumber(gain) }), changed: true, deltas: { mineral: -cost, tech: gain }, breakdown: instance.settlement?.breakdown ?? terms.breakdown }
    }
    return { logType: 'system', logText: t('log.events.14'), changed: false }
  }

  if (defId === 'meteor' || defId === 'storm-surge') {
    const gain = Number(instance.payload?.gain ?? scaledBy(prod.mineral, 300, 60))
    const shieldCost = Number(instance.payload?.shieldCost ?? scaledBy(prod.tech, 200, 60))
    if (optionId === 'shield') {
      if (state.resources.tech < shieldCost) {
        return { logType: 'warning', logText: t('log.events.15'), changed: false }
      }
      state.resources.tech -= shieldCost
      state.resources.mineral += gain * 2
      const settlement = eventSettlement({ tech: -shieldCost, mineral: gain * 2 }, gain * 2, 2)
      return { logType: 'reward', logText: t('log.events.16', { a0: formatNumber(shieldCost), a1: formatNumber(gain * 2) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
    }
    // collect（默认）
    state.resources.mineral += gain
    const settlement = eventSettlement({ mineral: gain }, gain)
    return { logType: 'reward', logText: t('log.events.17', { a0: formatNumber(gain) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
  }

  if (defId === 'bug' || defId === 'void-swarm') {
    const escalation = Math.max(1, state.bugEscalation ?? 1)
    const def = [...EVENT_DEFS, ...ENDLESS_EVENT_POOL].find((candidate) => candidate.id === defId)
    if (optionId === 'repel') {
      const cost = Number(instance.payload?.repelCost ?? (def ? bugTerms(state, def).repelCost : BUG_REPEL_MIN))
      if (state.resources.military < cost) return { logType: 'warning', logText: t('log.events.18', { a0: formatNumber(cost) }), changed: false }
      state.resources.military -= cost
      state.bugEscalation = 1
      const settlement = eventSettlement({ military: -cost }, cost)
      return { logType: 'system', logText: t('log.events.19', { a0: formatNumber(cost) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
    }
    if (optionId === 'dispatch') {
      const cost = Number(instance.payload?.cost ?? scaledBy(prod.mineral, 800, 200))
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: t('log.events.20'), changed: false }
      }
      state.resources.mineral -= cost
      state.bugEscalation = 1
      const settlement = eventSettlement({ mineral: -cost }, cost)
      return { logType: 'system', logText: t('log.events.21', { a0: formatNumber(cost) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
    }
    if (optionId === 'jam') {
      const jamCost = Number(instance.payload?.jamCost ?? scaledBy(prod.tech, 150, 50))
      if (state.resources.tech < jamCost) {
        return { logType: 'warning', logText: t('log.events.22'), changed: false }
      }
      state.resources.tech -= jamCost
      state.bugEscalation = 1
      const settlement = eventSettlement({ tech: -jamCost }, jamCost)
      return { logType: 'system', logText: t('log.events.23', { a0: formatNumber(jamCost) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
    }
    // ignore：扣减当前矿物 10%
    const loss = Math.floor(state.resources.mineral * 0.1)
    state.resources.mineral -= loss
    state.bugEscalation = Math.min(BUG_ESCALATION_CAP, Math.round(escalation * BUG_ESCALATION_STEP * 10) / 10)
    const settlement = eventSettlement({ mineral: -loss }, loss)
    return { logType: 'warning', logText: t('log.events.24', { a0: formatNumber(loss), a1: state.bugEscalation }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
  }

  if (defId === 'raid') return applyRaid(state, instance, optionId)

  return { logType: 'system', logText: t('log.events.25'), changed: false }
}

function optionCost(instance: EventInstance, optionId: string): Partial<Record<ResourceKey, number>> {
  const payload = instance.payload ?? {}
  if (instance.family === 'trade' && optionId === 'accept') return { mineral: Number(payload.cost ?? 0) }
  if (instance.family === 'disaster' && optionId === 'shield') return { tech: Number(payload.shieldCost ?? 0) }
  if (instance.family === 'security' && optionId === 'dispatch') return { mineral: Number(payload.cost ?? 0) }
  if (instance.family === 'security' && optionId === 'jam') return { tech: Number(payload.jamCost ?? 0) }
  if (instance.family === 'security' && instance.defId !== 'raid' && optionId === 'repel') return { military: Number(payload.repelCost ?? 0) }
  if (instance.defId === 'raid' && optionId === 'repel') return { military: Number(payload.repelCost ?? 0) }
  if (instance.defId === 'raid' && optionId === 'buyoff') return { mineral: Number(payload.buyoff ?? 0) }
  return {}
}

function ruleEligible(state: GameState, instance: EventInstance, rule: EventAutomationRule, nowMs = state.lastTick): boolean {
  if (!instance.options.some((option) => option.id === rule.optionId)) return false
  if (rule.maxRiskLevel && RISK_RANK[instance.riskLevel ?? 'low'] > RISK_RANK[rule.maxRiskLevel]) return false
  const policyRisk = state.automationPolicies[instance.theme ?? instance.defId]?.maxRiskLevel
  if (policyRisk && RISK_RANK[instance.riskLevel ?? 'low'] > RISK_RANK[policyRisk]) return false
  const costs = optionCost(instance, rule.optionId)
  for (const [key, amount] of Object.entries(costs) as [ResourceKey, number][]) {
    if (state.resources[key] < amount) return false
    if (rule.resourceBudget?.[key] != null && amount > rule.resourceBudget[key]!) return false
  }
  const policy = state.automationPolicies[instance.theme ?? instance.defId]
  for (const [key, amount] of Object.entries(costs) as [ResourceKey, number][]) {
    if (policy?.resourceBudget?.[key] != null && amount > policy.resourceBudget[key]!) return false
  }
  if (rule.minReward != null && optionReward(state, instance, rule.optionId) < rule.minReward) return false
  const last = [...state.automationHistory].reverse().find((audit) => audit.ruleId === rule.id && audit.status === 'resolved')
  if (last && rule.cooldownMs != null && nowMs - last.time < rule.cooldownMs) return false
  if (last && policy?.cooldownMs != null && nowMs - last.time < policy.cooldownMs) return false
  return true
}

export interface FallbackGateResult {
  allowed: boolean
  reason?: string
}

/** 类别级 fallback 的纯策略门；规则路径仍由 ruleEligible 保持原有语义。 */
export function fallbackGate(
  state: GameState,
  instance: EventInstance,
  optionId: string,
  policy: EventAutomationPolicy,
  nowMs = state.lastTick,
): FallbackGateResult {
  if (!instance.options.some((option) => option.id === optionId)) {
    return { allowed: false, reason: t('log.events.26', { a0: optionId }) }
  }
  const risk = instance.riskLevel ?? 'low'
  if (policy.maxRiskLevel && RISK_RANK[risk] > RISK_RANK[policy.maxRiskLevel]) {
    return { allowed: false, reason: t('log.events.27', { a0: risk, a1: policy.maxRiskLevel }) }
  }
  const costs = optionCost(instance, optionId)
  for (const [key, amount] of Object.entries(costs) as [ResourceKey, number][]) {
    if ((state.resources[key] ?? 0) < amount) return { allowed: false, reason: t('log.events.28', { a0: key }) }
    if (policy.resourceBudget?.[key] != null && amount > policy.resourceBudget[key]!) {
      return { allowed: false, reason: t('log.events.29') }
    }
  }
  const category = instance.theme ?? instance.defId
  const last = [...state.automationHistory].reverse().find((audit) =>
    audit.category === category && audit.source === 'automation' && audit.status === 'resolved')
  if (last && policy.cooldownMs != null && nowMs - last.time < policy.cooldownMs) {
    return { allowed: false, reason: t('log.events.30') }
  }
  return { allowed: true }
}

/** 预览选项的统一结算产出，不把预览结果写入游戏状态。 */
function optionReward(state: GameState, instance: EventInstance, optionId: string): number {
  const snapshot = JSON.stringify(state)
  const resourceKeys = new Set(Object.keys(state.resources))
  const outcome = applyEvent(state, instance, optionId)
  const reward = Object.entries(outcome.deltas ?? {}).reduce((sum, [key, value]) => {
    return sum + (value > 0 && resourceKeys.has(key) ? value : 0)
  }, 0)
  Object.assign(state, JSON.parse(snapshot) as GameState)
  return reward
}

function recordAutomation(
  state: GameState,
  instance: EventInstance,
  audit: Omit<EventAutomationAudit, 'eventUid' | 'category' | 'time'>,
  nowMs: number,
): void {
  state.automationHistory.push({ ...audit, eventUid: instance.uid, category: instance.theme ?? instance.defId, time: nowMs })
}

/** 按事件类别选择规则并复用 resolveEvent 结算；无可用策略时保留事件并暂停通知。 */
export function autoResolvePendingEvents(state: GameState, nowMs = state.lastTick): AutomationResolution[] {
  const results: AutomationResolution[] = []
  for (const instance of [...state.pendingEvents]) {
    const category = instance.theme ?? instance.defId
    const policy = state.automationPolicies[category]
    if (!policy?.enabled) continue
    const rules = [...policy.rules].sort((a, b) => b.priority - a.priority)
    const eligible = rules.filter((candidate) => ruleEligible(state, instance, candidate, nowMs))
    const topPriority = eligible.length > 0 ? eligible[0].priority : undefined
    const top = topPriority == null ? [] : eligible.filter((candidate) => candidate.priority === topPriority)
    const conflicting = top.length > 1 && new Set(top.map((candidate) => candidate.optionId)).size > 1
    const rule = conflicting ? undefined : top[0]
    const defaultFallback = DEFAULT_AUTOMATION_FALLBACK[category as EventTheme]
    const chain = AUTOMATION_FALLBACK_CHAIN[category as EventTheme] ?? []
    let optionId: string | undefined
    if (!conflicting) {
      if (rule?.optionId) {
        optionId = rule.optionId
      } else if (policy.fallbackOptionId) {
        optionId = policy.fallbackOptionId
      } else if (chain.length > 0) {
        // 未显式配置：沿降级链取第一个负担得起的选项（智能选择，防默认 ignore 白损）
        const chainPolicy = { ...policy, maxRiskLevel: policy.maxRiskLevel ?? DEFAULT_AUTOMATION_MAX_RISK[category as EventTheme] }
        for (const candidate of chain) {
          if (fallbackGate(state, instance, candidate, chainPolicy, nowMs).allowed) {
            optionId = candidate
            break
          }
        }
      } else {
        optionId = defaultFallback
      }
    }
    const fallbackPolicy = !rule && optionId
      ? { ...policy, maxRiskLevel: policy.maxRiskLevel ?? DEFAULT_AUTOMATION_MAX_RISK[category as EventTheme] }
      : policy
    let fallback = !rule && optionId ? fallbackGate(state, instance, optionId, fallbackPolicy, nowMs) : { allowed: true }
    if (!rule && optionId === 'accept' && category === 'trade' && !fallback.allowed && instance.options.some((option) => option.id === 'refuse')) {
      const refusal = fallbackGate(state, instance, 'refuse', fallbackPolicy, nowMs)
      if (refusal.allowed) {
        optionId = 'refuse'
        fallback = refusal
      }
    }
    if (!rule && optionId && !fallback.allowed) {
      recordAutomation(state, instance, { source: 'automation', status: 'paused', reason: fallback.reason!, failureReason: fallback.reason }, nowMs)
      pushLog(state, 'warning', t('evlog.0', { a0: instance.title || instance.defId, a1: fallback.reason ?? '' }))
      results.push({ eventUid: instance.uid, status: 'paused', reason: fallback.reason! })
      continue
    }
    if (!optionId) {
      const reason = conflicting
        ? t('evlog.1')
        : t('evlog.2')
      recordAutomation(state, instance, { source: 'automation', status: 'paused', reason, failureReason: reason }, nowMs)
      pushLog(state, 'warning', t('evlog.0', { a0: instance.title || instance.defId, a1: reason ?? '' }))
      results.push({ eventUid: instance.uid, status: 'paused', reason })
      continue
    }
    const reason = rule?.reason ?? t('evlog.3')
    const outcome = resolveEvent(state, instance.uid, optionId, { source: 'automation', ruleId: rule?.id, reason, nowMs })
    const status = outcome.changed || !rule ? 'resolved' : 'failed'
    if (status === 'failed') {
      const audit = state.automationHistory[state.automationHistory.length - 1]
      if (audit) audit.failureReason = outcome.logText
    }
    results.push({ eventUid: instance.uid, status, outcome, ruleId: rule?.id, reason })
  }
  return results
}

/** 骚扰事件结算：三选项（击退/买平安/无视），数值以实例固化 payload 为准；
 * 军力击退按残余强度（strength − 舰队战力，下限 50）——舰队已代劳的部分无需重复军力。 */
function applyRaid(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const factionId = String(instance.payload?.factionId ?? 'unknown')
  const f = state.factions[factionId]
  const factionName = FACTIONS[factionId] ? defName(FACTIONS[factionId]) : t('evlog.4')
  // raid 遭遇解锁胁迫外交（diplomacy-coercion；处理 raid 即"遭遇"；军力达标为另一通道）
  ensureCoercionUnlocked(state, 'raid')
  const strength = Number(instance.payload?.strength ?? raidTerms(state, factionId).strength)
  const buyoff = Number(instance.payload?.buyoff ?? raidTerms(state, factionId).buyoff)
  if (optionId === 'repel') {
    const repelCost = Number(instance.payload?.repelCost ?? Math.max(50, strength - fleetPower(state)))
    if (state.resources.military < repelCost) {
      return { logType: 'warning', logText: t('log.events.31', { a0: factionName, a1: formatNumber(repelCost), a2: formatNumber(state.resources.military) }), changed: false }
    }
    state.resources.military -= repelCost
    if (f) f.threat = Math.max(0, f.threat - RAID_THREAT_LOSS)
    const settlement = eventSettlement({ military: -repelCost, threat: -RAID_THREAT_LOSS }, repelCost)
    return { logType: 'system', logText: t('log.events.32', { a0: factionName, a1: formatNumber(repelCost), a2: formatNumber(RAID_THREAT_LOSS) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
  }
  if (optionId === 'buyoff') {
    if (state.resources.mineral < buyoff) {
      return { logType: 'warning', logText: t('log.events.33', { a0: factionName }), changed: false }
    }
    state.resources.mineral -= buyoff
    if (f) f.favor = Math.min(100, f.favor + RAID_BUYOFF_FAVOR_GAIN)
    const settlement = eventSettlement({ mineral: -buyoff, favor: RAID_BUYOFF_FAVOR_GAIN }, buyoff)
    return { logType: 'system', logText: t('log.events.34', { a0: factionName, a1: formatNumber(buyoff), a2: formatNumber(RAID_BUYOFF_FAVOR_GAIN) }), changed: true, deltas: settlement.deltas, breakdown: settlement.breakdown, settlement }
  }
  // ignore：矿/能各 -5%
  const lossMineral = Math.floor(state.resources.mineral * RAID_IGNORE_LOSS_PCT)
  const lossEnergy = Math.floor(state.resources.energy * RAID_IGNORE_LOSS_PCT)
  state.resources.mineral -= lossMineral
  state.resources.energy = Math.max(0, state.resources.energy - lossEnergy)
  const settlement = eventSettlement({ mineral: -lossMineral, energy: -lossEnergy }, lossMineral + lossEnergy)
  return {
    logType: 'warning',
    logText: t('log.events.35', { a0: factionName, a1: formatNumber(lossMineral), a2: formatNumber(lossEnergy) }),
    changed: true,
    deltas: settlement.deltas,
    breakdown: settlement.breakdown,
    settlement,
  }
}

export interface RaidSettlement {
  /** 日志文本（main 层 pushLog） */
  logs: string[]
  /** 击退次数（离线自动判定；舰队自动迎击与军力击退合计） */
  repelled: number
  /** 舰队自动迎击次数（离线；够强不扣军力——成本即持续维护费） */
  fleetRepelled: number
  /** 损失封顶后实际扣减的矿物/能源 */
  mineralLost: number
  energyLost: number
  /** 离线骚扰汇总的统一结算结果 */
  settlement: EventSettlement
}

/**
 * 离线骚扰结算：离线时长内每个威胁派系按 RAID_GAP_SECONDS 间隔骚扰若干次，
 * 每次自动判定——① 舰队自动迎击优先（战力 ≥ 强度则舰队代劳：不扣军力、威胁 −15）；
 * ② 军力 ≥ 强度则军力击退（扣军力、威胁 −15）；③ 否则按无视规则扣资源；
 * 总损失封顶离线产出的 RAID_OFFLINE_LOSS_CAP（30%），保证挂机永远是净收益。
 * @param gains 离线产出（用于封顶）
 */
export function settleOfflineRaids(state: GameState, durationSeconds: number, gains: Record<ResourceKey, number>): RaidSettlement {
  const logs: string[] = []
  let totalRepelled = 0
  let totalFleetRepelled = 0
  let totalMineralLost = 0
  let totalEnergyLost = 0
  const raidCount = Math.floor(durationSeconds / RAID_GAP_SECONDS)
  if (raidCount <= 0) {
    return {
      logs,
      repelled: 0,
      fleetRepelled: 0,
      mineralLost: 0,
      energyLost: 0,
      settlement: eventSettlement({}, 0),
    }
  }

  // raid 遭遇解锁胁迫外交（diplomacy-coercion；离线骚扰同样算"遭遇"；军力达标为另一通道）
  for (const def of Object.values(ALL_FACTIONS)) {
    const f = state.factions[def.id]
    if (f && !f.allied && f.threat >= raidThreshold(state)) {
      ensureCoercionUnlocked(state, 'raid')
      break
    }
  }

  for (const def of Object.values(ALL_FACTIONS)) {
    const f = state.factions[def.id]
    if (!f || f.allied || f.threat < raidThreshold(state)) continue
    const terms = raidTerms(state, def.id)
    const cap = Math.max(0, gains.mineral * RAID_OFFLINE_LOSS_CAP)
    let repelled = 0
    let fleetRepelled = 0
    let mineralLost = 0
    let energyLost = 0
    for (let i = 0; i < raidCount; i++) {
      // ① 舰队自动迎击优先：够强不扣军力（舰队战力随停摆/科技动态，每轮重取）
      if (fleetPower(state) >= terms.strength) {
        f.threat = Math.max(0, f.threat - RAID_THREAT_LOSS)
        fleetRepelled += 1
        repelled += 1
        continue
      }
      // ② 军力击退
      if (state.resources.military >= terms.strength) {
        state.resources.military -= terms.strength
        f.threat = Math.max(0, f.threat - RAID_THREAT_LOSS)
        repelled += 1
      } else {
        const lossMin = Math.min(Math.floor(state.resources.mineral * RAID_IGNORE_LOSS_PCT), Math.max(0, cap - mineralLost))
        const lossEne = Math.floor(state.resources.energy * RAID_IGNORE_LOSS_PCT)
        state.resources.mineral -= lossMin
        state.resources.energy = Math.max(0, state.resources.energy - lossEne)
        mineralLost += lossMin
        energyLost += lossEne
      }
    }
    totalRepelled += repelled
    totalFleetRepelled += fleetRepelled
    totalMineralLost += mineralLost
    totalEnergyLost += energyLost
    const fleetText = fleetRepelled > 0 ? t('evlog.5', { a0: formatNumber(fleetRepelled) }) : ''
    const militaryText = repelled - fleetRepelled > 0 ? t('evlog.6', { a0: formatNumber(repelled - fleetRepelled) }) : ''
    logs.push(
      t('evlog.7', { a0: defName(def), a1: formatNumber(raidCount), a2: formatNumber(repelled), a3: fleetText, a4: militaryText, a5: mineralLost > 0 ? t('evlog.8', { a0: formatNumber(mineralLost) }) : '' }),
    )
  }
  return {
    logs,
    repelled: totalRepelled,
    fleetRepelled: totalFleetRepelled,
    mineralLost: totalMineralLost,
    energyLost: totalEnergyLost,
    settlement: eventSettlement(
      {
        mineral: -totalMineralLost,
        energy: -totalEnergyLost,
        threat: -totalRepelled * RAID_THREAT_LOSS,
      },
      totalMineralLost + totalEnergyLost,
    ),
  }
}

/**
 * 舰队自动迎击（在线）：raid 事件被选中后、生成事件卡前判定——
 * 舰队战力 ≥ 骚扰强度则不生成事件实例，直接结算为日志（威胁 −15、不扣军力——舰队代劳，
 * 成本即持续维护费）；战力不足返回 null，事件照常弹窗（repel 强度按舰队战力削减，见 createRaidInstance）。
 */
function tryAutoIntercept(state: GameState, defId = 'raid'): EventOutcome | null {
  if (defId === 'bug' || defId === 'void-swarm') {
    const def = [...EVENT_DEFS, ...ENDLESS_EVENT_POOL].find((candidate) => candidate.id === defId)
    if (!def) return null
    const terms = bugTerms(state, def)
    if (fleetPower(state) < terms.strength) return null
    state.bugEscalation = 1
    return {
      logType: 'system',
      logText: t('log.events.36'),
      changed: true,
      deltas: {},
      priority: 'urgent',
      handlingMode: 'alert',
    }
  }
  const raider = raidableFaction(state)
  if (!raider) return null
  const terms = raidTerms(state, raider.id)
  if (fleetPower(state) < terms.strength) return null
  const f = state.factions[raider.id]
  // raid 遭遇解锁胁迫外交（diplomacy-coercion）：舰队自动迎击同为"遭遇"，
  // 与 applyRaid（事件卡结算）/ settleOfflineRaids（离线结算）口径一致，否则舰队够强时
  // raid 事件卡永不生成、胁迫外交永久锁死（2026-08-07 实测报告）。
  ensureCoercionUnlocked(state, 'raid')
  if (f) f.threat = Math.max(0, f.threat - RAID_THREAT_LOSS)
  const settlement = eventSettlement({ threat: -RAID_THREAT_LOSS }, terms.strength)
  return {
    logType: 'system',
    logText: t('log.events.37', { a0: raider.name, a1: formatNumber(RAID_THREAT_LOSS) }),
    changed: true,
    deltas: settlement.deltas,
    breakdown: settlement.breakdown,
    settlement,
    priority: 'urgent',
    handlingMode: 'alert',
  }
}

/**
 * 触发一次随机事件：trade/bug/meteor/raid 均进入待处理队列（交互事件）。
 * raid 在生成事件卡前先尝试舰队自动迎击（够强不弹窗，直接结算为日志）。
 * 分层（fixed-rng）：rng 不传 → 事件类型走 event 域持久化计数器、事件文案走 seed 派生即时流
 * （计数器只 +1 不 +3）；显式传 rng → 全链注入（测试路径，行为与现状一致）。
 * @returns 非 null = 直接结算日志（当前仅舰队自动迎击），null = 已生成待处理事件实例
 */
export function triggerRandomEvent(state: GameState, rng?: () => number): EventOutcome | null {
  const def = state.phase === 'infinite'
    ? pickEndlessEventDef(state, rng)
    : (rng ? pickEventDef(state, rng) : pickEventDef(state))
  // 舰队自动迎击：raid 被选中且舰队战力足够 → 不生成事件卡，直接结算为日志
  if (def.id === 'raid' || def.id === 'bug' || def.id === 'void-swarm') {
    const intercept = tryAutoIntercept(state, def.id)
    if (intercept) return intercept
  }
  const instance = createEventInstance(state, def.id, rng ?? streamFor(state))
  enqueueEvent(state, instance)
  return null
}

/** 将事件放入队列：高优先级事件置前，同优先级按创建时间保持稳定顺序。 */
export function enqueueEvent(state: GameState, instance: EventInstance): void {
  state.pendingEvents.push(instance)
  const rank: Record<EventPriority, number> = { normal: 0, urgent: 1, critical: 2 }
  state.pendingEvents.sort((a, b) => {
    const priorityDiff = (rank[b.priority ?? 'normal'] ?? 0) - (rank[a.priority ?? 'normal'] ?? 0)
    return priorityDiff || a.createdAt - b.createdAt || a.uid - b.uid
  })
}

/** 安排下次事件触发时间：均值间隔 × (0.5~1.5) 抖动 × 缩放（无限模式更密） */
export function scheduleNextEvent(state: GameState, nowMs: number, rng: () => number = Math.random, scale = 1): void {
  const gap = MEAN_EVENT_GAP_SECONDS * (0.5 + rng()) * scale
  state.nextEventAt = nowMs + gap * 1000
}

/** 解析待处理事件实例 */
export function resolveEvent(
  state: GameState,
  uid: number,
  optionId: string,
  context?: { source: 'manual' | 'automation'; ruleId?: string; reason: string; nowMs?: number },
): EventOutcome {
  const instance = state.pendingEvents.find((e) => e.uid === uid && !e.resolved)
  if (!instance) return { logType: 'system', logText: t('log.events.38'), changed: false }
  const outcome = applyEvent(state, instance, optionId)
  const keepForRetry = context?.source === 'automation' && context.ruleId != null && !outcome.changed
  if (!keepForRetry) {
    instance.resolved = true
    state.pendingEvents = state.pendingEvents.filter((e) => e.uid !== uid)
  }
  if (context?.source === 'automation') {
    recordAutomation(
      state,
      instance,
      {
        source: 'automation',
        status: outcome.changed ? 'resolved' : 'failed',
        optionId,
        ruleId: context.ruleId,
        reason: context.reason,
        deltas: outcome.settlement?.deltas ?? outcome.deltas,
        failureReason: outcome.changed ? undefined : outcome.logText,
      },
      context.nowMs ?? state.lastTick,
    )
  } else if (outcome.changed || !instance.resolved) {
    recordAutomation(
      state,
      instance,
      {
        source: 'manual',
        status: outcome.changed ? 'resolved' : 'failed',
        optionId,
        reason: outcome.changed ? t('evlog.9') : t('evlog.10'),
        deltas: outcome.settlement?.deltas ?? outcome.deltas,
        failureReason: outcome.changed ? undefined : outcome.logText,
      },
      state.lastTick,
    )
  }
  return outcome
}

/** 移除已失效的待处理事件（如超过 10 分钟未处理） */
export function pruneStaleEvents(state: GameState, nowMs: number): void {
  const MAX_AGE_MS = 10 * 60_000
  state.pendingEvents = state.pendingEvents.filter((e) => nowMs - e.createdAt < MAX_AGE_MS)
}
