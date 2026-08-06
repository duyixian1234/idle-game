import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { netProduction } from './production'
import { pushLog } from './core'
import { applyEvent, createEventInstance, pruneStaleEvents, resolveEvent, scheduleNextEvent, triggerRandomEvent } from './events'
import { MEAN_EVENT_GAP_SECONDS } from './balance'

/** 固定 rng 序列 */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('engine: 随机事件触发', () => {
  it('到点后 tick 触发事件并安排下一次', () => {
    const s = createInitialState(0)
    s.nextEventAt = 10_000
    // rng 0.1 → 选中 trade（权重池 9，0.1*9=0.9 → trade）
    tick(s, 10_000, seqRng([0.1, 0.5]))
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].defId).toBe('trade')
    expect(s.nextEventAt).toBeGreaterThan(10_000)
  })

  it('陨石雨进入待处理队列（交互事件）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    // rng 0.5 → roll=4.5：trade(4)→剩0.5→meteor(3)→触发
    const text = triggerRandomEvent(s, seqRng([0.5]))
    expect(text).toBeNull()
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].defId).toBe('meteor')
    expect(s.resources.mineral).toBe(15) // 未决策前资源不变
  })

  it('事件触发不改变 lastTick（不打断结算）', () => {
    const s = createInitialState(0)
    s.nextEventAt = 1000
    tick(s, 1000, seqRng([0.1, 0.5]))
    expect(s.lastTick).toBe(1000)
    expect(s.playSeconds).toBeGreaterThan(0)
  })

  it('频率可控：均值间隔 90 秒 ± 50% 抖动', () => {
    const s = createInitialState(0)
    scheduleNextEvent(s, 1000, seqRng([0.5]))
    const gap = (s.nextEventAt - 1000) / 1000
    expect(gap).toBeCloseTo(MEAN_EVENT_GAP_SECONDS)
    scheduleNextEvent(s, 1000, seqRng([0.0]))
    expect(s.nextEventAt - 1000).toBeCloseTo(MEAN_EVENT_GAP_SECONDS * 0.5 * 1000)
    scheduleNextEvent(s, 1000, seqRng([1.0]))
    expect(s.nextEventAt - 1000).toBeCloseTo(MEAN_EVENT_GAP_SECONDS * 1.5 * 1000)
  })
})

describe('engine: 贸易商事件', () => {
  it('接受：扣矿物得科技点', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.resources.tech = 0
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('贸易达成')
    expect(s.resources.mineral).toBeLessThan(10_000)
    expect(s.resources.tech).toBeGreaterThan(0)
  })

  it('矿物不足时接受失败', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(false)
    expect(s.resources.tech).toBe(0)
  })

  it('拒绝无变化', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const before = { ...s.resources }
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'refuse')
    expect(outcome.changed).toBe(false)
    expect(s.resources).toEqual(before)
  })
})

describe('engine: 陨石雨事件', () => {
  it('常规采集：获得基础矿物', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    const inst = createEventInstance(s, 'meteor')
    const gain = Number(inst.payload!.gain)
    const outcome = applyEvent(s, inst, 'collect')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(100 + gain)
  })

  it('科技防护罩：扣科技点、采集翻倍', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'meteor')
    const shieldCost = Number(inst.payload!.shieldCost)
    const gain = Number(inst.payload!.gain)
    const outcome = applyEvent(s, inst, 'shield')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('防护罩')
    expect(s.resources.tech).toBe(10_000 - shieldCost)
    expect(s.resources.mineral).toBe(100 + gain * 2)
  })

  it('科技防护罩：科技点不足时失败且资源不变', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.resources.tech = 0
    const inst = createEventInstance(s, 'meteor')
    const outcome = applyEvent(s, inst, 'shield')
    expect(outcome.changed).toBe(false)
    expect(s.resources.mineral).toBe(100)
    expect(s.resources.tech).toBe(0)
  })
})

describe('engine: 虫族警报事件', () => {
  it('派遣：扣矿物、无资源损失', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'dispatch')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('清剿队')
    expect(s.resources.mineral).toBeLessThan(50_000)
  })

  it('神经干扰：扣科技点替代矿物清剿', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'bug')
    const jamCost = Number(inst.payload!.jamCost)
    const outcome = applyEvent(s, inst, 'jam')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('神经干扰')
    expect(s.resources.tech).toBe(10_000 - jamCost)
    expect(s.resources.mineral).toBe(50_000) // 矿物不受损
  })

  it('神经干扰：科技点不足时失败', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.resources.tech = 0
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'jam')
    expect(outcome.changed).toBe(false)
    expect(s.resources.mineral).toBe(50_000)
  })

  it('忽略：扣减当前矿物 10%', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'ignore')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('虫群啃食')
    expect(s.resources.mineral).toBeCloseTo(9000)
  })
})

describe('engine: 事件解析与清理', () => {
  it('resolveEvent 移除实例并返回结果', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const outcome = resolveEvent(s, inst.uid, 'accept')
    expect(outcome.changed).toBe(true)
    expect(s.pendingEvents).toHaveLength(0)
  })

  it('重复解析已失效实例返回无变化', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'trade')
    resolveEvent(s, inst.uid, 'refuse')
    const again = resolveEvent(s, inst.uid, 'refuse')
    expect(again.changed).toBe(false)
  })

  it('虫族事件结算使用创建时固化成本（提示与扣费一致）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.buildings.miner = 1
    const inst = createEventInstance(s, 'bug')
    const fixedCost = Number(inst.payload?.cost ?? 0)
    // 结算前改变产出，成本不应漂移
    s.buildings.miner = 100
    const outcome = applyEvent(s, inst, 'dispatch')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(50_000 - fixedCost)
  })

  it('贸易事件结算使用固化数值', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'trade')
    const fixedCost = Number(inst.payload?.cost ?? 0)
    const fixedGain = Number(inst.payload?.gain ?? 0)
    s.buildings.miner = 1000
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(50_000 - fixedCost)
    expect(s.resources.tech).toBe(fixedGain)
  })

  it('超时未处理的事件被清理，新事件保留', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'bug')
    s.pendingEvents.push(inst)
    s.pendingEvents[0].createdAt = 0 // 模拟过期
    const fresh = createEventInstance(s, 'trade')
    fresh.createdAt = 660_001
    s.pendingEvents.push(fresh)
    pruneStaleEvents(s, 11 * 60_000 + 1)
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].uid).toBe(fresh.uid)
  })

  it('日志上限 200 条', () => {
    const s = createInitialState(0)
    for (let i = 0; i < 250; i++) pushLog(s, 'system', `m${i}`)
    expect(s.log).toHaveLength(200)
  })
})

describe('engine: 事件与产出协同', () => {
  it('事件期间产出结算不受影响', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.nextEventAt = 5000
    const mineralBefore = s.resources.mineral
    tick(s, 5000, seqRng([0.1, 0.5]))
    // 5 秒矿物产出 5（事件实例产生但结算照常）
    expect(s.resources.mineral).toBeCloseTo(mineralBefore + 5)
    expect(s.pendingEvents).toHaveLength(1)
  })

  it('净产出函数可独立使用', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    expect(netProduction(s).mineral).toBe(2)
  })
})
