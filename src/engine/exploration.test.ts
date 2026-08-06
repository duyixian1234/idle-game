import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, tick } from './engine'
import { expeditionCost, expeditionPool, isExploreAvailable, settleExpeditions, startExpedition } from './exploration'
import { settleOffline } from './offline'
import { EXPEDITION_DURATION_MS } from './balance'
import type { ExpeditionState, GameState } from './types'

/** 通关后状态：phase=ended、足量资源、足够兵力 */
function endedState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  s.resources.mineral = 10_000_000
  s.resources.energy = 5_000_000
  s.resources.military = 50_000
  s.resources.tech = 1_000_000
  return s
}

/** 手动构造一个派遣（用于结算测试，绕过 roll） */
function fakeExpedition(overrides: Partial<ExpeditionState> = {}): ExpeditionState {
  return {
    id: 1,
    startedAt: 0,
    finishAt: EXPEDITION_DURATION_MS,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 },
    resolved: false,
    ...overrides,
  }
}

describe('engine: 探索入口与门控', () => {
  it('playing 阶段不可探索；ended/infinite 可探索', () => {
    const s = createInitialState(0)
    expect(isExploreAvailable(s)).toBe(false)
    expect(startExpedition(s, 0)).toEqual({ ok: false, reason: '通关后开放探索' })
    s.phase = 'ended'
    s.endingTriggered = true
    expect(isExploreAvailable(s)).toBe(true)
    s.phase = 'infinite'
    expect(isExploreAvailable(s)).toBe(true)
  })

  it('单槽：有进行中派遣时拒绝再次派遣', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    expect(startExpedition(s, 1000)).toEqual({ ok: false, reason: '已有一支探索队在途中' })
  })

  it('资源不足分别拒绝（矿物/能源/兵力）', () => {
    const s = endedState()
    s.resources.mineral = 100
    expect(startExpedition(s, 0)).toEqual({ ok: false, reason: '矿物不足' })
    s.resources.mineral = 10_000_000
    s.resources.energy = 100
    expect(startExpedition(s, 0)).toEqual({ ok: false, reason: '能源不足' })
    s.resources.energy = 5_000_000
    s.resources.military = 10
    expect(startExpedition(s, 0)).toEqual({ ok: false, reason: '军力不足' })
  })
})

describe('engine: 派遣出发（全提交 + 结果固化）', () => {
  it('正常出发：扣动态缩放矿物/能源 + 固定兵力，finishAt = now + 60min', () => {
    const s = endedState()
    const cost = expeditionCost(s)
    const before = { mineral: s.resources.mineral, energy: s.resources.energy, military: s.resources.military }
    const r = startExpedition(s, 1000, () => 0.99) // 注入 rng → 落入资源补偿
    expect(r.ok).toBe(true)
    const exp = r.value!
    expect(s.resources.mineral).toBe(before.mineral - cost.mineral)
    expect(s.resources.energy).toBe(before.energy - cost.energy)
    expect(s.resources.military).toBe(before.military - cost.military)
    expect(exp.startedAt).toBe(1000)
    expect(exp.finishAt).toBe(1000 + EXPEDITION_DURATION_MS)
    expect(exp.cost).toEqual(cost)
    expect(exp.cost.military).toBe(40)
    expect(s.expeditions).toHaveLength(1)
  })

  it('result 出发时固化：与出发时一致，不随回归重抽（注入 rng 断言）', () => {
    const s = endedState()
    const r = startExpedition(s, 1000, () => 0.99)
    const result = r.value!.result
    expect(result.kind).toBe('resource') // 空池（ticket 02 前）只能 roll 到补偿
    expect(s.expeditions[0].result).toEqual(result)
    // 回归（settle）不改结果
    const logs = settleExpeditions(s, 1000 + EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(s.expeditions).toHaveLength(0)
  })

  it('不传 rng：explore 域计数器消耗恰 1 次（结果型随机走持久域）', () => {
    const s = endedState()
    startExpedition(s, 0)
    expect(s.rngCounters.explore).toBe(1)
    expect(s.expeditions).toHaveLength(1)
    // 重放：同 seed 同 counter 的独立 state 出发 → 同 result（防 SL 语义）
    const s2 = endedState()
    startExpedition(s2, 0)
    expect(s2.expeditions[0].result).toEqual(s.expeditions[0].result)
  })

  it('nextExpeditionId 递增；兵力锁定不返还', () => {
    const s = endedState()
    startExpedition(s, 0)
    expect(s.nextExpeditionId).toBe(2)
    settleExpeditions(s, EXPEDITION_DURATION_MS)
    // 结算后兵力不回补
    expect(s.resources.military).toBe(50_000 - 40)
  })
})

describe('engine: 派遣结算（自动入账）', () => {
  it('未到期不动（不结算、不计次）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS - 1)
    expect(logs).toEqual([])
    expect(s.expeditions).toHaveLength(1)
    expect(s.stats.explorations).toBe(0)
  })

  it('resource 分支：按固化补偿值入账（含科技点），stats.explorations +1，resolved 后移除', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 } }))
    const mineralBefore = s.resources.mineral
    const techBefore = s.resources.tech
    const energyBefore = s.resources.energy
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(logs[0].type).toBe('reward')
    expect(logs[0].text).toContain('回收了')
    expect(s.resources.mineral).toBe(mineralBefore + 2250)
    expect(s.resources.tech).toBe(techBefore + 30)
    expect(s.resources.energy).toBe(energyBefore + 750)
    expect(s.stats.explorations).toBe(1)
    expect(s.expeditions).toHaveLength(0)
  })

  it('多派单一并结算（引擎不拦截，单槽由 startExpedition 保证）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2, finishAt: EXPEDITION_DURATION_MS + 1 }))
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS + 1)
    expect(logs).toHaveLength(2)
    expect(s.stats.explorations).toBe(2)
    expect(s.expeditions).toHaveLength(0)
  })

  it('tick 接入：倒计时到期自动入账并写日志', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    tick(s, EXPEDITION_DURATION_MS)
    expect(s.stats.explorations).toBe(1)
    expect(s.log.some((l) => l.text.includes('探索队返航'))).toBe(true)
    expect(s.expeditions).toHaveLength(0)
  })

  it('防御：池未定义时 faction 结果走「重新建立联系」分支（不崩）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'faction', factionId: 'ashCommune' } }))
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('重新建立与')
    expect(s.stats.explorations).toBe(1)
  })
})

describe('engine: 奖池（剔除制 + 权重）', () => {
  it('空池（ticket 02 前）：候选只剩资源补偿，权重随已收集数变化', () => {
    const s = endedState()
    expect(expeditionPool(s)).toEqual([{ kind: 'resource', weight: 6 }])
    s.exploredFactions = ['a', 'b']
    s.exploredPlanets = ['x']
    expect(expeditionPool(s)).toEqual([{ kind: 'resource', weight: 3 }])
    // 收集 4+ 后补偿权重封底 2
    s.exploredFactions = ['a', 'b', 'c', 'd']
    expect(expeditionPool(s)).toEqual([{ kind: 'resource', weight: 2 }])
  })
})

describe('engine: 离线推进', () => {
  it('settleOffline：离线期间倒计时到期，回归自动入账（含日志）', () => {
    const s = endedState()
    s.lastTick = 0
    s.expeditions.push(fakeExpedition())
    const off = settleOffline(s, EXPEDITION_DURATION_MS + 1000)
    expect(off.expeditionLogs).toHaveLength(1)
    expect(off.expeditionLogs[0].type).toBe('reward')
    expect(s.stats.explorations).toBe(1)
    expect(s.expeditions).toHaveLength(0)
  })

  it('离线未到期：不结算、无日志', () => {
    const s = endedState()
    s.lastTick = 0
    s.expeditions.push(fakeExpedition())
    const off = settleOffline(s, 60_000)
    expect(off.expeditionLogs).toEqual([])
    expect(s.expeditions).toHaveLength(1)
    expect(s.stats.explorations).toBe(0)
  })

  it('infinite 模式可出发（与 ended 同门控）', () => {
    const s = endedState()
    enterInfiniteMode(s)
    expect(s.phase).toBe('infinite')
    const r = startExpedition(s, 0)
    expect(r.ok).toBe(true)
  })
})
