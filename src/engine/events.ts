import type { EventInstance, GameState, ResourceKey } from './types'
import { FACTIONS } from './data'
import { netProduction } from './production'
import { EVENT_STORIES } from './story'

export interface RandomEventDef {
  id: string
  name: string
  /** 触发权重 */
  weight: number
  kind: 'trade' | 'meteor' | 'bug' | 'raid'
}

/** 随机事件定义表（静态基础事件） */
export const EVENT_DEFS: RandomEventDef[] = [
  { id: 'trade', name: '贸易商', weight: 4, kind: 'trade' },
  { id: 'meteor', name: '陨石雨', weight: 3, kind: 'meteor' },
  { id: 'bug', name: '虫族警报', weight: 2, kind: 'bug' },
]

/**
 * 派系骚扰（raid）参数：
 * - 威胁度 ≥ RAID_THREAT_THRESHOLD 且未结盟的派系会周期性地军事骚扰殖民地
 * - 击退需军力 = 该派系威胁度 × RAID_STRENGTH_MULT，击退后威胁度 −RAID_THREAT_LOSS（软威慑）
 * - 买平安 = 矿物标定值，好感 +RAID_BUYOFF_FAVOR_GAIN
 * - 无视 = 矿/能各 −RAID_IGNORE_LOSS_PCT%
 * - 离线自动结算：军力足够自动击退，否则按无视规则（叠加离线 30% 封顶）
 */
export const RAID_THREAT_THRESHOLD = 55
export const RAID_STRENGTH_MULT = 50
export const RAID_THREAT_LOSS = 15
export const RAID_BUYOFF_FAVOR_GAIN = 5
export const RAID_IGNORE_LOSS_PCT = 0.05
/** 离线骚扰频率间隔（秒）：每离线满该时长结算一次骚扰 */
export const RAID_GAP_SECONDS = 3600
/** 离线骚扰总损失封顶（离线产出的比例） */
export const RAID_OFFLINE_LOSS_CAP = 0.3
/** 骚扰事件在事件表中的触发权重（有威胁派系时） */
export const RAID_EVENT_WEIGHT = 2

/** 随机事件均值间隔（秒） */
export const MEAN_EVENT_GAP_SECONDS = 90
/** 首次触发延迟（秒） */
export const FIRST_EVENT_DELAY_SECONDS = 45

/** 事件处理结果（供调用方写日志） */
export interface EventOutcome {
  logType: 'reward' | 'warning' | 'event' | 'system'
  logText: string
  changed: boolean
}

/** 当前威胁度最高的可骚扰派系（threat ≥ 阈值且未结盟）；无则 null */
export function raidableFaction(state: GameState): { id: string; name: string; threat: number } | null {
  let best: { id: string; threat: number } | null = null
  for (const def of Object.values(FACTIONS)) {
    const f = state.factions[def.id]
    if (!f || f.allied) continue
    if (f.threat < RAID_THREAT_THRESHOLD) continue
    if (!best || f.threat > best.threat) best = { id: def.id, threat: f.threat }
  }
  if (!best) return null
  return { id: best.id, name: FACTIONS[best.id]?.name ?? best.id, threat: best.threat }
}

/** 按权重随机选择事件定义（raid 为动态项：有威胁派系时进入候选；母巢攻占后虫族警报权重归 0） */
export function pickEventDef(state: GameState, rng: () => number = Math.random): RandomEventDef {
  // 叙事闭环：虫群母巢被攻占后，虫族警报事件不再触发（母巢被端、虫灾绝迹）
  const nestConquered = state.conquest.nest?.status === 'conquered'
  const pool = EVENT_DEFS.filter((d) => !(d.id === 'bug' && nestConquered))
  if (raidableFaction(state)) pool.push({ id: 'raid', name: '军事骚扰', weight: RAID_EVENT_WEIGHT, kind: 'raid' })
  const total = pool.reduce((sum, d) => sum + d.weight, 0)
  let roll = rng() * total
  for (const def of pool) {
    roll -= def.weight
    if (roll <= 0) return def
  }
  return pool[pool.length - 1]
}

function scaledBy(rate: number, min: number, factor: number): number {
  return Math.max(min, Math.floor(rate * factor))
}

/** 贸易事件数值：花费矿物换取科技点 */
function tradeTerms(state: GameState): { cost: number; gain: number } {
  const prod = netProduction(state)
  return {
    cost: scaledBy(prod.mineral, 500, 120),
    gain: scaledBy(prod.tech, 50, 30),
  }
}

/** 随机事件叙事（rng 可选一条） */
export function eventStory(defId: string, rng: () => number = Math.random): string {
  const pool = EVENT_STORIES[defId]
  if (!pool || pool.length === 0) return ''
  return pool[Math.floor(rng() * pool.length)]
}

/** 生成事件实例（交互类事件），数值固化进 payload 保证提示与结算一致 */
export function createEventInstance(state: GameState, defId: string, rng: () => number = Math.random): EventInstance {
  const uid = state.nextEventId
  state.nextEventId += 1
  const base: EventInstance = { uid, defId, title: '', desc: '', options: [], createdAt: state.lastTick, resolved: false }

  if (defId === 'raid') return createRaidInstance(state, base, rng)

  if (defId === 'trade') {
    const { cost, gain } = tradeTerms(state)
    const story = eventStory('trade', rng)
    return {
      ...base,
      title: '贸易商抵达',
      desc: story || `一艘挂着陌生旗帜的货船停靠在你的轨道港。`,
      payload: { cost, gain },
      options: [
        { id: 'accept', label: '成交', hint: `-${cost}矿物 +${gain}科技` },
        { id: 'refuse', label: '拒绝' },
      ],
    }
  }
  if (defId === 'meteor') {
    const gain = scaledBy(netProduction(state).mineral, 300, 60)
    const shieldCost = scaledBy(netProduction(state).tech, 200, 60)
    const story = eventStory('meteor', rng)
    return {
      ...base,
      title: '陨石雨',
      desc: story || `流星碎片坠入矿区，部分可采集；启动防护罩可减缓冲击、回收更多。`,
      payload: { gain, shieldCost },
      options: [
        { id: 'collect', label: '常规采集', hint: `+${gain}矿物` },
        { id: 'shield', label: '科技防护罩', hint: `-${shieldCost}科技 +${gain * 2}矿物` },
      ],
    }
  }
  // bug
  const cost = scaledBy(netProduction(state).mineral, 800, 200)
  const jamCost = scaledBy(netProduction(state).tech, 150, 50)
  const story = eventStory('bug', rng)
  return {
    ...base,
    title: '虫族警报',
    desc: story || `殖民地下层监测到虫群啃食矿脉的迹象。`,
    payload: { cost, jamCost },
    options: [
      { id: 'dispatch', label: '派遣清剿队', hint: `-${cost}矿物` },
      { id: 'jam', label: '神经干扰', hint: `-${jamCost}科技` },
      { id: 'ignore', label: '暂不处理' },
    ],
  }
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

/** 生成骚扰事件实例（针对威胁度最高的未结盟派系） */
function createRaidInstance(state: GameState, base: EventInstance, rng: () => number): EventInstance {
  const raider = raidableFaction(state)
  const factionId = raider?.id ?? 'unknown'
  const terms = raidTerms(state, factionId)
  const story = eventStory('raid', rng)
  return {
    ...base,
    title: `${raider?.name ?? '未知势力'}军事骚扰`,
    desc: story || `${raider?.name ?? '未知势力'}的舰队列阵于你的领空边缘，索要「通行税」。`,
    payload: { factionId, ...terms },
    options: [
      { id: 'repel', label: '军力击退', hint: `-${terms.strength}军力（威胁 −${RAID_THREAT_LOSS}）` },
      { id: 'buyoff', label: '付税买平安', hint: `-${terms.buyoff}矿物 好感 +${RAID_BUYOFF_FAVOR_GAIN}` },
      { id: 'ignore', label: '无视', hint: `矿/能各 -${Math.round(RAID_IGNORE_LOSS_PCT * 100)}%` },
    ],
  }
}

/** 处理事件：变更资源并返回日志内容 */
export function applyEvent(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const defId = instance.defId
  const prod = netProduction(state)

  if (defId === 'trade') {
    // 优先用实例固化数值，保证与提示一致
    const cost = Number(instance.payload?.cost ?? tradeTerms(state).cost)
    const gain = Number(instance.payload?.gain ?? tradeTerms(state).gain)
    if (optionId === 'accept') {
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: '贸易商摇摇头——你的矿物不够支付这笔交易。', changed: false }
      }
      state.resources.mineral -= cost
      state.resources.tech += gain
      return { logType: 'reward', logText: `贸易达成：-${cost} 矿物，+${gain} 科技点。`, changed: true }
    }
    return { logType: 'system', logText: '你婉拒了贸易商的报价，货船驶离轨道港。', changed: false }
  }

  if (defId === 'meteor') {
    const gain = Number(instance.payload?.gain ?? scaledBy(prod.mineral, 300, 60))
    const shieldCost = Number(instance.payload?.shieldCost ?? scaledBy(prod.tech, 200, 60))
    if (optionId === 'shield') {
      if (state.resources.tech < shieldCost) {
        return { logType: 'warning', logText: '科技点不足以维持防护罩，陨石雨自然坠落。', changed: false }
      }
      state.resources.tech -= shieldCost
      state.resources.mineral += gain * 2
      return { logType: 'reward', logText: `防护罩展开，陨石完整回收：-${shieldCost} 科技，+${gain * 2} 矿物。`, changed: true }
    }
    // collect（默认）
    state.resources.mineral += gain
    return { logType: 'reward', logText: `陨石雨结束，采集到 ${gain} 矿物。`, changed: true }
  }

  if (defId === 'bug') {
    if (optionId === 'dispatch') {
      const cost = Number(instance.payload?.cost ?? scaledBy(prod.mineral, 800, 200))
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: '你的矿物不足以组织清剿队。', changed: false }
      }
      state.resources.mineral -= cost
      return { logType: 'system', logText: `清剿队出动，虫群被驱逐出矿区（-${cost} 矿物）。`, changed: true }
    }
    if (optionId === 'jam') {
      const jamCost = Number(instance.payload?.jamCost ?? scaledBy(prod.tech, 150, 50))
      if (state.resources.tech < jamCost) {
        return { logType: 'warning', logText: '科技点不足以发动神经干扰。', changed: false }
      }
      state.resources.tech -= jamCost
      return { logType: 'system', logText: `神经干扰波覆盖矿层，虫群失去方向溃散（-${jamCost} 科技）。`, changed: true }
    }
    // ignore：扣减当前矿物 10%
    const loss = Math.floor(state.resources.mineral * 0.1)
    state.resources.mineral -= loss
    return { logType: 'warning', logText: `虫群啃食矿脉，损失了 ${loss} 矿物。`, changed: true }
  }

  if (defId === 'raid') return applyRaid(state, instance, optionId)

  return { logType: 'system', logText: '未知事件。', changed: false }
}

/** 骚扰事件结算：三选项（击退/买平安/无视），数值以实例固化 payload 为准 */
function applyRaid(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const factionId = String(instance.payload?.factionId ?? 'unknown')
  const f = state.factions[factionId]
  const factionName = FACTIONS[factionId]?.name ?? '未知势力'
  const strength = Number(instance.payload?.strength ?? raidTerms(state, factionId).strength)
  const buyoff = Number(instance.payload?.buyoff ?? raidTerms(state, factionId).buyoff)
  if (optionId === 'repel') {
    if (state.resources.military < strength) {
      return { logType: 'warning', logText: `军力不足以击退${factionName}的舰队（需 ${strength}⚔，当前 ${Math.floor(state.resources.military)}⚔）。`, changed: false }
    }
    state.resources.military -= strength
    if (f) f.threat = Math.max(0, f.threat - RAID_THREAT_LOSS)
    return { logType: 'system', logText: `你的舰队倾巢而出，${factionName}的骚扰舰队被击退（-${strength}⚔，威胁 −${RAID_THREAT_LOSS}）。`, changed: true }
  }
  if (optionId === 'buyoff') {
    if (state.resources.mineral < buyoff) {
      return { logType: 'warning', logText: `矿物不足以支付${factionName}索要的通行税。`, changed: false }
    }
    state.resources.mineral -= buyoff
    if (f) f.favor = Math.min(100, f.favor + RAID_BUYOFF_FAVOR_GAIN)
    return { logType: 'system', logText: `你向${factionName}缴纳了通行税，舰队退去（-${buyoff}矿物，好感 +${RAID_BUYOFF_FAVOR_GAIN}）。`, changed: true }
  }
  // ignore：矿/能各 -5%
  const lossMineral = Math.floor(state.resources.mineral * RAID_IGNORE_LOSS_PCT)
  const lossEnergy = Math.floor(state.resources.energy * RAID_IGNORE_LOSS_PCT)
  state.resources.mineral -= lossMineral
  state.resources.energy = Math.max(0, state.resources.energy - lossEnergy)
  return {
    logType: 'warning',
    logText: `${factionName}的舰队洗劫了外围仓库，损失 ${lossMineral} 矿物与 ${lossEnergy} 能源。`,
    changed: true,
  }
}

export interface RaidSettlement {
  /** 日志文本（main 层 pushLog） */
  logs: string[]
  /** 击退次数（离线自动判定） */
  repelled: number
  /** 损失封顶后实际扣减的矿物/能源 */
  mineralLost: number
  energyLost: number
}

/**
 * 离线骚扰结算：离线时长内每个威胁派系按 RAID_GAP_SECONDS 间隔骚扰若干次，
 * 每次自动判定——军力 ≥ 强度则自动击退（扣军力、威胁 −15），否则按无视规则扣资源；
 * 总损失封顶离线产出的 RAID_OFFLINE_LOSS_CAP（30%），保证挂机永远是净收益。
 * @param gains 离线产出（用于封顶）
 */
export function settleOfflineRaids(state: GameState, durationSeconds: number, gains: Record<ResourceKey, number>): RaidSettlement {
  const logs: string[] = []
  let totalRepelled = 0
  let totalMineralLost = 0
  let totalEnergyLost = 0
  const raidCount = Math.floor(durationSeconds / RAID_GAP_SECONDS)
  if (raidCount <= 0) return { logs, repelled: 0, mineralLost: 0, energyLost: 0 }

  for (const def of Object.values(FACTIONS)) {
    const f = state.factions[def.id]
    if (!f || f.allied || f.threat < RAID_THREAT_THRESHOLD) continue
    const terms = raidTerms(state, def.id)
    const cap = Math.max(0, gains.mineral * RAID_OFFLINE_LOSS_CAP)
    let repelled = 0
    let mineralLost = 0
    let energyLost = 0
    for (let i = 0; i < raidCount; i++) {
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
    totalMineralLost += mineralLost
    totalEnergyLost += energyLost
    logs.push(
      `${def.name}的舰队在离线期间${raidCount}次抵近边境：${repelled} 次被军力击退${mineralLost > 0 ? `，${mineralLost} 矿物被洗劫` : ''}。`,
    )
  }
  return { logs, repelled: totalRepelled, mineralLost: totalMineralLost, energyLost: totalEnergyLost }
}

/** 触发一次随机事件：trade/bug/meteor/raid 均进入待处理队列（交互事件） */
export function triggerRandomEvent(state: GameState, rng: () => number = Math.random): string | null {
  const def = pickEventDef(state, rng)
  const instance = createEventInstance(state, def.id, rng)
  state.pendingEvents.push(instance)
  return null
}

/** 安排下次事件触发时间：均值间隔 × (0.5~1.5) 抖动 × 缩放（无限模式更密） */
export function scheduleNextEvent(state: GameState, nowMs: number, rng: () => number = Math.random, scale = 1): void {
  const gap = MEAN_EVENT_GAP_SECONDS * (0.5 + rng()) * scale
  state.nextEventAt = nowMs + gap * 1000
}

/** 解析待处理事件实例 */
export function resolveEvent(state: GameState, uid: number, optionId: string): EventOutcome {
  const instance = state.pendingEvents.find((e) => e.uid === uid && !e.resolved)
  if (!instance) return { logType: 'system', logText: '该事件已失效。', changed: false }
  const outcome = applyEvent(state, instance, optionId)
  instance.resolved = true
  state.pendingEvents = state.pendingEvents.filter((e) => e.uid !== uid)
  return outcome
}

/** 移除已失效的待处理事件（如超过 10 分钟未处理） */
export function pruneStaleEvents(state: GameState, nowMs: number): void {
  const MAX_AGE_MS = 10 * 60_000
  state.pendingEvents = state.pendingEvents.filter((e) => nowMs - e.createdAt < MAX_AGE_MS)
}
