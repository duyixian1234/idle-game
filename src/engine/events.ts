import type { EventInstance, GameState } from './types'
import { netProduction } from './engine'

export interface RandomEventDef {
  id: string
  name: string
  /** 触发权重 */
  weight: number
  kind: 'trade' | 'meteor' | 'bug'
}

/** 随机事件定义表 */
export const EVENT_DEFS: RandomEventDef[] = [
  { id: 'trade', name: '贸易商', weight: 4, kind: 'trade' },
  { id: 'meteor', name: '陨石雨', weight: 3, kind: 'meteor' },
  { id: 'bug', name: '虫族警报', weight: 2, kind: 'bug' },
]

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

/** 按权重随机选择事件定义（rng 可注入） */
export function pickEventDef(rng: () => number = Math.random): RandomEventDef {
  const total = EVENT_DEFS.reduce((sum, d) => sum + d.weight, 0)
  let roll = rng() * total
  for (const def of EVENT_DEFS) {
    roll -= def.weight
    if (roll <= 0) return def
  }
  return EVENT_DEFS[EVENT_DEFS.length - 1]
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

/** 生成事件实例（交互类事件） */
export function createEventInstance(state: GameState, defId: string): EventInstance {
  const uid = state.nextEventId
  state.nextEventId += 1
  const base: EventInstance = { uid, defId, title: '', desc: '', options: [], createdAt: state.lastTick, resolved: false }

  if (defId === 'trade') {
    const { cost, gain } = tradeTerms(state)
    return {
      ...base,
      title: '贸易商抵达',
      desc: `一艘挂着陌生旗帜的货船停靠在你的轨道港。船长愿意用 ${cost} 矿物交换 ${gain} 科技点。`,
      options: [
        { id: 'accept', label: '成交', hint: `-${cost}矿物 +${gain}科技` },
        { id: 'refuse', label: '拒绝' },
      ],
    }
  }
  // bug
  const cost = scaledBy(netProduction(state).mineral, 800, 200)
  return {
    ...base,
    title: '虫族警报',
    desc: `殖民地下层监测到虫群啃食矿脉的迹象。若不处理，储量将被蚕食。派遣清剿队需要 ${cost} 矿物。`,
    options: [
      { id: 'dispatch', label: '派遣清剿队', hint: `-${cost}矿物` },
      { id: 'ignore', label: '暂不处理' },
    ],
  }
}

/** 处理事件：变更资源并返回日志内容 */
export function applyEvent(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const defId = instance.defId
  const prod = netProduction(state)

  if (defId === 'trade') {
    const { cost, gain } = tradeTerms(state)
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
    const gain = scaledBy(prod.mineral, 300, 60)
    state.resources.mineral += gain
    return { logType: 'reward', logText: `陨石雨过后，地表散落着稀有矿脉，采集到 ${gain} 矿物。`, changed: true }
  }

  if (defId === 'bug') {
    if (optionId === 'dispatch') {
      const cost = scaledBy(prod.mineral, 800, 200)
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: '你的矿物不足以组织清剿队。', changed: false }
      }
      state.resources.mineral -= cost
      return { logType: 'system', logText: `清剿队出动，虫群被驱逐出矿区（-${cost} 矿物）。`, changed: true }
    }
    // ignore：扣减当前矿物 10%
    const loss = Math.floor(state.resources.mineral * 0.1)
    state.resources.mineral -= loss
    return { logType: 'warning', logText: `虫群啃食矿脉，损失了 ${loss} 矿物。`, changed: true }
  }

  return { logType: 'system', logText: '未知事件。', changed: false }
}

/** 触发一次随机事件：meteor 立即生效；trade/bug 进入待处理队列 */
export function triggerRandomEvent(state: GameState, rng: () => number = Math.random): string | null {
  const def = pickEventDef(rng)
  if (def.kind === 'meteor') {
    const outcome = applyEvent(
      state,
      { uid: -1, defId: 'meteor', title: '', desc: '', options: [], createdAt: state.lastTick, resolved: true },
      '',
    )
    return outcome.logText
  }
  const instance = createEventInstance(state, def.id)
  state.pendingEvents.push(instance)
  return null
}

/** 安排下次事件触发时间：均值间隔 × (0.5~1.5) 抖动 */
export function scheduleNextEvent(state: GameState, nowMs: number, rng: () => number = Math.random): void {
  const gap = MEAN_EVENT_GAP_SECONDS * (0.5 + rng())
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
