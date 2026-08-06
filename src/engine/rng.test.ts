import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { settleConquests, startConquest } from './conquest'
import { pickEventDef, triggerRandomEvent } from './events'
import { settleOffline } from './offline'
import { mulberry32, randSeed, rollDomain, SALT, streamFor } from './rng'
import type { GameState } from './types'

/** 初始档所有派系威胁清零：事件池固定为基础 3 类（trade 4 / meteor 3 / bug 2，total 9），无 raid 干扰 */
function fixedPool(state: GameState): GameState {
  for (const f of Object.values(state.factions)) f.threat = 0
  return state
}

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

describe('engine: 接线（结果型走持久域）', () => {
  it('pickEventDef 不传 rng：连续调用消耗 event 域且结果确定', () => {
    const s = fixedPool(createInitialState(0, 42))
    const def1 = pickEventDef(s)
    expect(s.rngCounters.event).toBe(1)
    pickEventDef(s)
    expect(s.rngCounters.event).toBe(2)
    // 同 (seed, counter) 独立实例重放 → 同结果
    const replay = pickEventDef(fixedPool(createInitialState(0, 42)))
    expect(replay.id).toBe(def1.id)
  })

  it('triggerRandomEvent 不传 rng：事件类型消耗 event 域恰 1 次（文案走即时流不增计数）', () => {
    const s = fixedPool(createInitialState(0, 42))
    triggerRandomEvent(s)
    expect(s.rngCounters.event).toBe(1)
    expect(s.rngCounters.conquest).toBeUndefined()
    expect(s.pendingEvents).toHaveLength(1)
    // 重放：同 seed 同 counter 的独立 state 触发同一事件类型
    const s2 = fixedPool(createInitialState(0, 42))
    triggerRandomEvent(s2)
    expect(s2.pendingEvents[0].defId).toBe(s.pendingEvents[0].defId)
  })

  it('settleConquests 不传 rng：走 conquest 域（足额投入消耗 1 次计数且必成）', () => {
    const s = createInitialState(0, 42)
    s.planets.ice = { unlocked: true }
    s.resources.military = 100_000
    startConquest(s, 'outpost', 2_000, 0) // 足额 → chance = 1
    const logs = settleConquests(s, 60 * 60_000)
    expect(s.rngCounters.conquest).toBe(1)
    expect(logs[0]).toContain('捷报')
    expect(s.conquest.outpost.status).toBe('conquered')
  })

  it('settleConquests 不传 rng：薄投结果仅由 (seed, counter) 决定（重放一致）', () => {
    const run = () => {
      const s = createInitialState(0, 42)
      s.planets.ice = { unlocked: true }
      s.resources.military = 100_000
      startConquest(s, 'outpost', 200, 0) // 薄投 → chance < 1
      const logs = settleConquests(s, 60 * 60_000)
      return { log: logs[0], status: s.conquest.outpost.status, counter: s.rngCounters.conquest }
    }
    expect(run()).toEqual(run())
  })

  it('tick 不传 rng：事件类型 event 域 + 攻占 conquest 域各计各的', () => {
    const s = fixedPool(createInitialState(0, 42))
    s.nextEventAt = 10_000
    s.planets.ice = { unlocked: true }
    s.resources.military = 100_000
    startConquest(s, 'outpost', 2_000, 0) // finishAt = 3_600_000
    tick(s, 3_600_000) // 事件（已到点）+ 攻占（已到期），均不传 rng
    expect(s.rngCounters.event).toBe(1)
    expect(s.rngCounters.conquest).toBe(1)
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.conquest.outpost.status).toBe('conquered')
  })

  it('settleOffline 不传 rng：离线攻占结算走 conquest 域', () => {
    const s = fixedPool(createInitialState(0, 42))
    s.lastTick = 0
    s.planets.ice = { unlocked: true }
    s.resources.military = 100_000
    startConquest(s, 'outpost', 2_000, 0) // finishAt = 3_600_000
    const r = settleOffline(s, 3_600_000)
    expect(r.conquestLogs).toHaveLength(1)
    expect(s.rngCounters.conquest).toBe(1)
  })
})

describe('engine: 防 SL 语义（保存 → 恢复 → 序列延续）', () => {
  it('恢复快照后继续 roll，与未中断连续 roll 序列完全一致', () => {
    const makeState = () => fixedPool(createInitialState(0, 42))
    // 未中断：连续 roll 6 次
    const a = makeState()
    const defsA: string[] = []
    for (let i = 0; i < 6; i++) defsA.push(pickEventDef(a).id)
    // 中断：roll 3 次 → 深拷贝模拟存档恢复 → 再 roll 3 次
    const b = makeState()
    const defsB: string[] = []
    for (let i = 0; i < 3; i++) defsB.push(pickEventDef(b).id)
    const snapshot = JSON.parse(JSON.stringify(b)) as GameState // 存档恢复（含 rngCounters）
    for (let i = 0; i < 3; i++) defsB.push(pickEventDef(snapshot).id)
    expect(defsB).toEqual(defsA)
  })

  it('装饰型 stream 不改变任何持久化状态（全状态快照断言）', () => {
    const s = createInitialState(0, 42)
    const before = JSON.stringify(s)
    const stream = streamFor(s)
    stream(); stream(); stream()
    expect(JSON.stringify(s)).toBe(before)
  })

  it('显式注入 rng 跳过计数器（测试路径不污染持久化状态）', () => {
    const s = fixedPool(createInitialState(0, 42))
    triggerRandomEvent(s, () => 0.1) // 注入 rng
    expect(s.rngCounters).toEqual({})
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].defId).toBe('trade') // 0.1*9=0.9 → trade
  })
})
