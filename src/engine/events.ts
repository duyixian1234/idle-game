import type { EventInstance, GameState } from './types'
import { netProduction } from './engine'
import { EVENT_STORIES } from './story'

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

/** 处理事件：变更资源并返回日志内容 */
export function applyEvent(state: GameState, instance: EventInstance, optionId: string): EventOutcome {
  const defId = instance.defId
  const prod = netProduction(state)

  if (defId === 'trade') {
    // 优先用实例固化数值，保证与提示一致
    const cost = instance.payload?.cost ?? tradeTerms(state).cost
    const gain = instance.payload?.gain ?? tradeTerms(state).gain
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
    const gain = instance.payload?.gain ?? scaledBy(prod.mineral, 300, 60)
    const shieldCost = instance.payload?.shieldCost ?? scaledBy(prod.tech, 200, 60)
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
      const cost = instance.payload?.cost ?? scaledBy(prod.mineral, 800, 200)
      if (state.resources.mineral < cost) {
        return { logType: 'warning', logText: '你的矿物不足以组织清剿队。', changed: false }
      }
      state.resources.mineral -= cost
      return { logType: 'system', logText: `清剿队出动，虫群被驱逐出矿区（-${cost} 矿物）。`, changed: true }
    }
    if (optionId === 'jam') {
      const jamCost = instance.payload?.jamCost ?? scaledBy(prod.tech, 150, 50)
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

  return { logType: 'system', logText: '未知事件。', changed: false }
}

/** 触发一次随机事件：trade/bug/meteor 均进入待处理队列（交互事件） */
export function triggerRandomEvent(state: GameState, rng: () => number = Math.random): string | null {
  const def = pickEventDef(rng)
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
