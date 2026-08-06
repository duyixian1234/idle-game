import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { mulberry32, randSeed, rollDomain, SALT, streamFor } from './rng'
import type { GameState } from './types'

describe('engine: mulberry32 PRNG', () => {
  it('对固定 seed 输出确定快照序列（写死前 10 个值，可审计）', () => {
    const rng = mulberry32(42)
    const snapshot = [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423, 0.5265925421845168, 0.2732279943302274, 0.6247446539346129, 0.8654746483080089, 0.4723170551005751]
    for (let i = 0; i < snapshot.length; i++) {
      expect(rng()).toBeCloseTo(snapshot[i], 12)
    }
  })

  it('同 seed 输出序列一致（重放确定性）', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
  })

  it('不同 seed 序列不同', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    let differs = false
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) differs = true
    }
    expect(differs).toBe(true)
  })
})

describe('engine: rollDomain（持久域派生）', () => {
  it('同参同值：给定 (seed, domain, counter) 幂等重放', () => {
    const s1 = createInitialState(0, 42)
    const s2 = createInitialState(0, 42)
    const a = rollDomain(s1, 'event')
    const b = rollDomain(s2, 'event')
    for (let i = 0; i < 5; i++) expect(a()).toBe(b())
  })

  it('counter 逐次 +1：连续 roll 序列推进且写回可见', () => {
    const s = createInitialState(0, 42)
    const roll = rollDomain(s, 'event')
    const first = roll()
    expect(s.rngCounters.event).toBe(1)
    const second = roll()
    expect(s.rngCounters.event).toBe(2)
    // 同 seed 同 counter=0 的独立实例应产出 first；counter=1 产出 second
    const replay = rollDomain(createInitialState(0, 42), 'event')
    expect(replay()).toBe(first)
    expect(replay()).toBe(second)
  })

  it('跨域隔离：同 seed 同 counter 不同域值不同', () => {
    const s = createInitialState(0, 42)
    const e = rollDomain(s, 'event')()
    const c = rollDomain(s, 'conquest')()
    const x = rollDomain(s, 'explore')()
    // 域盐不同 → 三者互不相同（SALT 常量表固定）
    expect(new Set([e, c, x]).size).toBe(3)
    expect(SALT.event).not.toBe(SALT.conquest)
    expect(SALT.conquest).not.toBe(SALT.explore)
  })

  it('跨域计数器独立推进', () => {
    const s = createInitialState(0, 42)
    const e = rollDomain(s, 'event')
    const c = rollDomain(s, 'conquest')
    e(); e()
    c()
    expect(s.rngCounters).toEqual({ event: 2, conquest: 1 })
  })

  it('无字段 state 容错：seed 按 0、counters 懒初始化且写回后可见', () => {
    const s1 = {} as GameState
    const s2 = {} as GameState
    // 两个独立实例：同 seed(0) 同 counter(0) → 同值；随后各自写回 counter=1
    expect(rollDomain(s1, 'event')()).toBe(rollDomain(s2, 'event')())
    expect(s1.rngCounters).toBeDefined()
    expect(s1.rngCounters.event).toBe(1)
    expect(s2.rngCounters).toEqual({ event: 1 })
    expect(rollDomain(s1, 'conquest')()).toBe(rollDomain(s2, 'conquest')())
    expect(s1.rngCounters).toEqual({ event: 1, conquest: 1 })
  })

  it('不改变 state 引用，只替换 rngCounters 子对象', () => {
    const s = createInitialState(0, 42)
    const ref = s
    rollDomain(s, 'event')()
    expect(s).toBe(ref)
    expect(ref.rngCounters.event).toBe(1)
  })
})

describe('engine: streamFor（装饰型即时流）', () => {
  it('内存级实例不写任何持久化状态', () => {
    const s = createInitialState(0, 42)
    const before = JSON.stringify(s.rngCounters)
    const stream = streamFor(s)
    const vals: number[] = []
    for (let i = 0; i < 5; i++) vals.push(stream())
    expect(JSON.stringify(s.rngCounters)).toBe(before)
    // 独立重放：新 stream 同序列（seed 派生）
    const replay = streamFor(createInitialState(0, 42))
    for (const v of vals) expect(replay()).toBe(v)
  })

  it('stream 与 rollDomain 序列不同（同一实例不混流）', () => {
    const s = createInitialState(0, 42)
    const stream = streamFor(s)
    const roll = rollDomain(s, 'event')
    const s1 = stream()
    const r1 = roll()
    // 装饰流消耗 seed 自身序列、持久域消耗 seed^SALT 序列 → 值不同
    expect(s1).not.toBe(r1)
  })
})

describe('engine: randSeed', () => {
  it('范围 [0, 2^32) 且多次调用不恒等（弱断言）', () => {
    const seeds = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const seed = randSeed()
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(0x100000000)
      expect(Number.isInteger(seed)).toBe(true)
      seeds.add(seed)
    }
    expect(seeds.size).toBeGreaterThan(1)
  })
})

describe('engine: createInitialState 种子参数化', () => {
  it('传固定 seed 时字段确定', () => {
    const s = createInitialState(1000, 42)
    expect(s.seed).toBe(42)
    expect(s.rngCounters).toEqual({})
    // 不传 seed 时自动生成（范围内）
    const auto = createInitialState(1000)
    expect(auto.seed).toBeGreaterThanOrEqual(0)
    expect(auto.seed).toBeLessThan(0x100000000)
    expect(auto.rngCounters).toEqual({})
  })
})
