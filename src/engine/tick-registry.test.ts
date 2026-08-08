import { describe, expect, it } from 'vitest'
import { createTickRegistry, type TickGroup, type TickGroupId } from './tick-registry'
import { tickGroupOrder } from './engine'
import type { GameState } from './types'

function makeGroup(id: TickGroupId, after: TickGroupId[] = []): TickGroup {
  return { id, after, run: () => {} }
}

function ids(groups: TickGroup[]): TickGroupId[] {
  return groups.map((g) => g.id)
}

/** 最小合法 state 桩（仅用于 run 签名校验，run 为空实现不触碰字段） */
function stubState(): GameState {
  return {} as GameState
}

describe('tick-registry', () => {
  it('拓扑序 = 注册序展开（链式依赖下稳定）', () => {
    const r = createTickRegistry()
    r.register(makeGroup('resources'))
    r.register(makeGroup('diplomacy', ['resources']))
    r.register(makeGroup('events', ['diplomacy']))
    r.register(makeGroup('settlement', ['events']))
    r.register(makeGroup('ending', ['settlement']))
    expect(ids(r.build())).toEqual(['resources', 'diplomacy', 'events', 'settlement', 'ending'])
  })

  it('乱序注册仍输出拓扑序（依赖决定顺序而非注册顺序）', () => {
    const r = createTickRegistry()
    r.register(makeGroup('ending', ['settlement']))
    r.register(makeGroup('settlement', ['events']))
    r.register(makeGroup('events', ['diplomacy']))
    r.register(makeGroup('diplomacy', ['resources']))
    r.register(makeGroup('resources'))
    expect(ids(r.build())).toEqual(['resources', 'diplomacy', 'events', 'settlement', 'ending'])
  })

  it('同层保持注册序（无依赖组按注册序输出）', () => {
    const r = createTickRegistry()
    r.register(makeGroup('events'))
    r.register(makeGroup('resources'))
    r.register(makeGroup('diplomacy'))
    expect(ids(r.build())).toEqual(['events', 'resources', 'diplomacy'])
  })

  it('环检测 fail-fast', () => {
    const r = createTickRegistry()
    r.register(makeGroup('resources', ['ending']))
    r.register(makeGroup('ending', ['resources']))
    expect(() => r.build()).toThrow(/cycle detected/)
  })

  it('未知依赖 fail-fast', () => {
    const r = createTickRegistry()
    r.register(makeGroup('resources', ['nope' as TickGroupId]))
    expect(() => r.build()).toThrow(/unknown dependency/)
  })

  it('重复 id 注册抛错', () => {
    const r = createTickRegistry()
    r.register(makeGroup('resources'))
    expect(() => r.register(makeGroup('resources'))).toThrow(/duplicate/)
  })

  it('build 结果缓存（重复调用同序，register 后失效）', () => {
    const r = createTickRegistry()
    r.register(makeGroup('resources'))
    const first = r.build()
    r.register(makeGroup('diplomacy', ['resources']))
    const second = r.build()
    expect(first).not.toBe(second)
    expect(ids(second)).toEqual(['resources', 'diplomacy'])
  })

  it('run 按拓扑序透传 state/nowMs/rng', () => {
    const calls: string[] = []
    const r = createTickRegistry()
    r.register({ id: 'resources', after: [], run: (_s, now, rng) => { calls.push(`resources:${now}:${rng ? 'rng' : 'none'}`) } })
    r.register({ id: 'ending', after: ['resources'], run: () => { calls.push('ending') } })
    const state = stubState()
    const rng = () => 0.5
    for (const g of r.build()) g.run(state, 1234, rng)
    expect(calls).toEqual(['resources:1234:rng', 'ending'])
  })
})

describe('tick golden-order（ADR-0034）', () => {
  // 真值来源：tick() 重构前（engine.ts 106-188）的线性执行序列，
  // 按 5 结算阶段组归属；任何注册顺序/after 变更导致拓扑序偏离此序 → 红。
  // 顺序依赖注：coercionTick→autoDiplomacyTick（cooldown 共享）、
  // settleExpeditions→autoExploreDispatch（结算后补位）、checkEnding→checkAchievements（ending 前置）。
  it('engine 注册拓扑序 == 旧线性序列展开', () => {
    expect(tickGroupOrder()).toEqual([
      'resources',
      'diplomacy',
      'events',
      'settlement',
      'ending',
    ])
  })
})
