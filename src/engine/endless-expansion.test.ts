import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, startNewGamePlus } from './engine'
import { expeditionPool, settleExpeditions, startExpedition } from './exploration'
import { settleConquests, startConquest } from './conquest'
import { factionAlliance } from './diplomacy'
import { migrateSave, serializeSave } from './save'
import { ENDLESS_BATCH_2_EXPLORATIONS } from './balance'
import { endlessBatchUnlocked, endlessTargetId, generateConquestTarget, generateFactionTarget, generatePlanetTarget, generatedCap, programmaticActiveCount } from './generate'
import { CONQUESTS, ENDLESS_CONQUESTS, EXPLORE_FACTIONS, EXPLORE_PLANETS } from './data'
import { SCHEMA_VERSION } from './types'
import type { ExpeditionState, GameState } from './types'

/** 派遣/攻占时长上限（测试周期常量）：真实派遣掷 10~30min，30min 保证任意真实派遣到期；fake 数据与 settle 时刻同口径 */
const CYCLE = 30 * 60_000

/** 无尽模式状态：phase=infinite、足量资源/兵力、dawn 已解锁（攻占前置）；
 * 带生产建筑（miner/solar Lv5 → 各 350/s）——ticket 01 生成目标奖励/成本/礼包锚定当期净产出 */
function infiniteState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'infinite'
  s.endingTriggered = true
  s.resources.mineral = 100_000_000
  s.resources.energy = 50_000_000
  s.resources.military = 500_000
  s.resources.tech = 10_000_000
  s.planets.dawn = { unlocked: true }
  s.buildings.miner = 100
  s.upgrades.miner = 5
  s.buildings.solar = 100
  s.upgrades.solar = 5
  return s
}

/** 手动构造派遣（结算绕过 roll） */
function fakeExpedition(result: ExpeditionState['result']): ExpeditionState {
  return {
    id: 1,
    startedAt: 0,
    finishAt: CYCLE,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result,
    resolved: false,
  }
}

/** 固定 roll 序列（生成器注入；耗尽后 0.5） */
function fixedRolls(values: number[]): () => number {
  let i = 0
  return () => values[i++] ?? 0.5
}

describe('engine: endless-expansion 程序生成器', () => {
  it('确定性：同 roll 序列 → 同生成结果', () => {
    const s = infiniteState()
    const a = generateConquestTarget(s, fixedRolls([0.1, 0.2, 0.3, 0.4, 0.5]))
    const b = generateConquestTarget(s, fixedRolls([0.1, 0.2, 0.3, 0.4, 0.5]))
    expect(a).toEqual(b)
    expect(a.kind).toBe('conquest')
  })

  it('军事目标：守卫 ≥ 500、奖励/成本同源锚当期产出（矿+科技双发）、**永不生成 permanentBonus**（关键防回归）', () => {
    const s = infiniteState()
    for (let i = 0; i < 50; i++) {
      const t = generateConquestTarget(s, fixedRolls([0.1, 0.2, 0.3, 0.4, 0.5]))
      expect(t.guard).toBeGreaterThanOrEqual(500)
      expect(t.bonus).toBeUndefined()
      // ADR-0028：奖励矿+科技双发，成本与奖励同源（N=120 / M=60 → 奖励 = 2×成本）
      expect(t.rewardMineral).toBeDefined()
      expect(t.rewardTech).toBeDefined()
      expect(t.costMineral).toBeDefined()
      expect(t.costEnergy).toBeDefined()
      expect(t.rewardMineral!).toBe(2 * t.costMineral!)
      // 锚定当期净产出（350/s）：奖励恒定不随生成次数漂移
      expect(t.rewardMineral!).toBe(42_000)
      expect(t.rewardTech!).toBe(2_800)
      expect(t.costMineral!).toBe(21_000)
      expect(t.costEnergy!).toBe(21_000)
    }
  })

  it('军事目标奖励/成本随当期净产出缩放：同源锚定 → 净比值恒定（防印钞结构）', () => {
    const s1 = infiniteState()
    s1.buildings.miner = 100
    const t1 = generateConquestTarget(s1, fixedRolls([0.1, 0.2, 0.3]))
    const s2 = infiniteState()
    s2.buildings.miner = 1_000 // 矿物产出 ×10
    const t2 = generateConquestTarget(s2, fixedRolls([0.1, 0.2, 0.3]))
    expect(t2.rewardMineral!).toBe(t1.rewardMineral! * 10)
    expect(t2.costMineral!).toBe(t1.costMineral! * 10)
    // 净比值 (N−M)/M 恒定
    expect((t2.rewardMineral! - t2.costMineral!) / t2.costMineral!).toBe((t1.rewardMineral! - t1.costMineral!) / t1.costMineral!)
  })

  it('军事目标守卫随军力容量缩放（ADR-0033：容量 × 15-40%，clamp 500 下限），不随周目直接缩放', () => {
    const s1 = infiniteState()
    s1.planets.orbital = { unlocked: true }
    s1.buildings.militaryPort = 0
    const g1 = generateConquestTarget(s1, fixedRolls([0.1, 0.2, 0.3]))
    // 无军港容量 100 → 守卫 clamp 500
    expect(g1.guard).toBe(500)
    const s3 = infiniteState()
    s3.planets.orbital = { unlocked: true }
    s3.buildings.militaryPort = 25 // 容量 5100 → 守卫 ∈ [765, 2040]
    const g3 = generateConquestTarget(s3, fixedRolls([0.1, 0.2, 0.3]))
    expect(g3.guard!).toBeGreaterThanOrEqual(500)
    expect(g3.guard!).toBeGreaterThan(g1.guard!)
    expect(g3.guard!).toBeLessThanOrEqual(2_040)
  })

  it('外交对象：favor ∈ [0,30]、threat ∈ [25,55]、特性 1-2 个', () => {
    const s = infiniteState()
    for (let i = 0; i < 50; i++) {
      const t = generateFactionTarget(s, fixedRolls([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]))
      expect(t.initialFavor!).toBeGreaterThanOrEqual(0)
      expect(t.initialFavor!).toBeLessThanOrEqual(30)
      expect(t.initialThreat!).toBeGreaterThanOrEqual(25)
      expect(t.initialThreat!).toBeLessThanOrEqual(55)
      const traits = [t.tradeDiscount, t.techShareCostMult, t.intimidateCostMult].filter((x) => x != null)
      expect(traits.length).toBeGreaterThanOrEqual(1)
      expect(traits.length).toBeLessThanOrEqual(2)
    }
  })

  it('天体：单种产出、output ∈ [0.5,2]、outputPct ∈ [0.005,0.02]', () => {
    const s = infiniteState()
    for (let i = 0; i < 50; i++) {
      const t = generatePlanetTarget(s, fixedRolls([0.1, 0.2, 0.3]))
      const keys = Object.keys(t.output ?? {})
      expect(keys.length).toBe(1)
      const k = keys[0] as keyof NonNullable<typeof t.output>
      expect(t.output![k]).toBeGreaterThanOrEqual(0.5)
      expect(t.output![k]).toBeLessThanOrEqual(2)
      expect(t.outputPct![k]).toBeGreaterThanOrEqual(0.005)
      expect(t.outputPct![k]).toBeLessThanOrEqual(0.02)
    }
  })

  it('数量上限：max(2 + floor(探索次数/10), 2 + 周目数)，不封顶', () => {
    const s = infiniteState()
    expect(generatedCap(s, 'conquest')).toBe(2)
    s.stats.explorations = 9
    expect(generatedCap(s, 'conquest')).toBe(2)
    s.stats.explorations = 10
    expect(generatedCap(s, 'conquest')).toBe(3)
    s.stats.explorations = 30
    expect(generatedCap(s, 'conquest')).toBe(5)
    s.ngPlusLevel = 4
    // 周目保底取高者：2 + 4 = 6 > 2 + floor(30/10) = 5
    expect(generatedCap(s, 'conquest')).toBe(6)
  })

  it('活跃计数：仅计程序生成（batch 0）未归档目标', () => {
    const s = infiniteState()
    s.generatedTargets.push({ kind: 'conquest', id: 'endless:warband', name: 'x', desc: '', batch: 1, guard: 800 })
    s.generatedTargets.push({ kind: 'conquest', id: 'gen:conquest:0', name: 'y', desc: '', batch: 0, guard: 800 })
    s.generatedTargets.push({ kind: 'conquest', id: 'gen:conquest:1', name: 'z', desc: '', batch: 0, guard: 800 })
    expect(programmaticActiveCount(s, 'conquest')).toBe(2)
    s.archivedRounds['gen:conquest:0'] = 0
    expect(programmaticActiveCount(s, 'conquest')).toBe(1)
  })

  it('保底批次：batch 1 恒解锁；batch 2 需 ≥ 15 次探索', () => {
    const s = infiniteState()
    expect(endlessBatchUnlocked(s, 1)).toBe(true)
    expect(endlessBatchUnlocked(s, 2)).toBe(false)
    s.stats.explorations = ENDLESS_BATCH_2_EXPLORATIONS - 1
    expect(endlessBatchUnlocked(s, 2)).toBe(false)
    s.stats.explorations = ENDLESS_BATCH_2_EXPLORATIONS
    expect(endlessBatchUnlocked(s, 2)).toBe(true)
  })
})

describe('engine: endless-expansion 探索奖池作用域', () => {
  it('ended 档：不注入扩展池（与现状逐字节一致——无 conquest/无 gen 占位）', () => {
    const s = infiniteState()
    s.phase = 'ended'
    const pool = expeditionPool(s)
    expect(pool.some((e) => e.kind === 'conquest')).toBe(false)
    expect(pool.some((e) => e.id?.startsWith('gen:'))).toBe(false)
    expect(pool.some((e) => e.id?.startsWith('endless:'))).toBe(false)
    // 条数 = 4 派系 + 5 天体 + 1 资源补偿
    expect(pool.length).toBe(Object.keys(EXPLORE_FACTIONS).length + Object.keys(EXPLORE_PLANETS).length + 1)
  })

  it('infinite 档：注入 batch 1 保底 + gen 占位；batch 2 未解锁不注入', () => {
    const s = infiniteState()
    s.stats.explorations = 0
    const pool = expeditionPool(s)
    const endlessConquests = pool.filter((e) => e.kind === 'conquest' && e.id?.startsWith('endless:'))
    // batch 1 保底 2 个（warband/iceFortress），batch 2（devourer）未解锁
    expect(endlessConquests.length).toBe(2)
    expect(endlessConquests.some((e) => e.id === endlessTargetId('warband'))).toBe(true)
    expect(endlessConquests.some((e) => e.id === endlessTargetId('devourer'))).toBe(false)
    // batch 1 外交保底 2 个 + 天体保底 1 个（机制型）
    expect(pool.filter((e) => e.kind === 'faction' && e.id?.startsWith('endless:')).length).toBe(2)
    expect(pool.filter((e) => e.kind === 'planet' && e.id?.startsWith('endless:')).length).toBe(1)
    // gen 占位 3 类各 1
    expect(pool.filter((e) => e.id === 'gen:conquest').length).toBe(1)
    expect(pool.filter((e) => e.id === 'gen:faction').length).toBe(1)
    expect(pool.filter((e) => e.id === 'gen:planet').length).toBe(1)
    // batch 2 解锁后：+devourer + mechSwarm + magnetarField
    s.stats.explorations = ENDLESS_BATCH_2_EXPLORATIONS
    const pool2 = expeditionPool(s)
    expect(pool2.some((e) => e.id === endlessTargetId('devourer'))).toBe(true)
    expect(pool2.filter((e) => e.kind === 'faction' && e.id?.startsWith('endless:')).length).toBe(3)
    expect(pool2.filter((e) => e.kind === 'planet' && e.id?.startsWith('endless:')).length).toBe(2)
  })

  it('数量上限生效：程序生成目标达 cap 后 gen 占位不再入池', () => {
    const s = infiniteState()
    s.stats.explorations = 30 // cap = 5
    for (let i = 0; i < 5; i++) {
      s.generatedTargets.push({ kind: 'conquest', id: `gen:conquest:${i}`, name: 'x', desc: '', batch: 0, guard: 800 })
    }
    const pool = expeditionPool(s)
    expect(pool.some((e) => e.id === 'gen:conquest')).toBe(false)
    // 手写保底不受上限约束
    expect(pool.some((e) => e.id === endlessTargetId('warband'))).toBe(true)
  })

  it('已获得的手写保底目标不入池（剔除制）', () => {
    const s = infiniteState()
    s.generatedTargets.push({ kind: 'conquest', id: endlessTargetId('warband'), name: '掠夺者舰队', desc: '', batch: 1, guard: 800 })
    const pool = expeditionPool(s)
    expect(pool.some((e) => e.id === endlessTargetId('warband'))).toBe(false)
  })
})

describe('engine: endless-expansion 探索结算三路创建', () => {
  it('军事目标（手写保底）：结算创建快照 + conquest 状态 available', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'conquest', targetId: endlessTargetId('warband') }))
    const logs = settleExpeditions(s, CYCLE + 1)
    const t = s.generatedTargets.find((x) => x.id === endlessTargetId('warband'))
    expect(t).toBeDefined()
    expect(t?.guard).toBe(ENDLESS_CONQUESTS.warband.guard)
    expect(s.conquest[endlessTargetId('warband')]).toEqual({ status: 'available' })
    expect(logs[0].text).toContain('掠夺者舰队')
  })

  it('军事目标（程序生成）：结算实时生成（gen 域确定性）', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'conquest', targetId: 'gen:conquest' }))
    settleExpeditions(s, CYCLE + 1)
    const t = s.generatedTargets.find((x) => x.kind === 'conquest' && x.id.startsWith('gen:conquest:'))
    expect(t).toBeDefined()
    expect(t?.bonus).toBeUndefined()
    expect(s.conquest[t!.id]).toEqual({ status: 'available' })
  })

  it('外交对象（程序生成）：结算创建派系 + 进 exploredFactions', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'faction', factionId: 'gen:faction' }))
    settleExpeditions(s, CYCLE + 1)
    const t = s.generatedTargets.find((x) => x.kind === 'faction' && x.id.startsWith('gen:faction:'))
    expect(t).toBeDefined()
    expect(s.factions[t!.id]).toBeDefined()
    expect(s.exploredFactions).toContain(t!.id)
  })

  it('外交发现礼包（ADR-0028）：产能挂钩资源到账 + 好感 +10（<40 自动外交阈值）', () => {
    const s = infiniteState()
    const mineralBefore = s.resources.mineral
    const techBefore = s.resources.tech
    s.expeditions.push(fakeExpedition({ kind: 'faction', factionId: 'gen:faction' }))
    settleExpeditions(s, CYCLE + 1)
    const t = s.generatedTargets.find((x) => x.kind === 'faction' && x.id.startsWith('gen:faction:'))
    expect(t).toBeDefined()
    const f = s.factions[t!.id]
    expect(f).toBeDefined()
    // 好感 = initialFavor(0-29) + 10，恒 < 40（零钳制逻辑）
    expect(f!.favor).toBeGreaterThanOrEqual(10)
    expect(f!.favor).toBeLessThan(40)
    // 礼包 = 当期净产出 × G 秒（350/s × 60 = 21,000 矿 + 350/s × 5 = 1,750 科技）
    expect(s.resources.mineral - mineralBefore).toBe(21_000)
    expect(s.resources.tech - techBefore).toBe(1_750)
  })

  it('天体（手写机制型）：结算解锁 + 发现即归档（一次性不可再交互）', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'planet', planetId: endlessTargetId('blackHoleObservatory') }))
    settleExpeditions(s, CYCLE + 1)
    const id = endlessTargetId('blackHoleObservatory')
    expect(s.planets[id]?.unlocked).toBe(true)
    expect(s.archivedRounds[id]).toBe(0)
    expect(s.exploredPlanets).toContain(id)
  })

  it('天体（程序生成产出型）：结算解锁 + 不归档（保留列表持续派遣）', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'planet', planetId: 'gen:planet' }))
    settleExpeditions(s, CYCLE + 1)
    const t = s.generatedTargets.find((x) => x.kind === 'planet' && x.id.startsWith('gen:planet:'))
    expect(t).toBeDefined()
    expect(s.planets[t!.id]?.unlocked).toBe(true)
    expect(s.archivedRounds[t!.id]).toBeUndefined()
  })

  it('派遣走 startExpedition 全链路（infinite 档 roll 可命中扩展池）', () => {
    const s = infiniteState()
    s.stats.explorations = 0
    // 强制 roll 命中第一项（endless:warband 权重排序在静态派系后，这里直接断言 pool 非空即可）
    const pool = expeditionPool(s)
    expect(pool.length).toBeGreaterThan(0)
    const r = startExpedition(s, 0)
    expect(r.ok).toBe(true)
    expect(s.expeditions.length).toBe(1)
  })
})

describe('engine: endless-expansion 攻占双遍历', () => {
  it('动态军事目标：足额投入必成 → conquered + 归档周目标记', () => {
    const s = infiniteState()
    const id = endlessTargetId('warband')
    s.generatedTargets.push({ kind: 'conquest', id, name: '掠夺者舰队', desc: '', batch: 1, guard: ENDLESS_CONQUESTS.warband.guard, rewardMineral: 800_000 })
    s.conquest[id] = { status: 'available' }
    const r = startConquest(s, id, ENDLESS_CONQUESTS.warband.guard, 0)
    expect(r.ok).toBe(true)
    const logs = settleConquests(s, CYCLE + 1)
    expect(s.conquest[id].status).toBe('conquered')
    expect(s.archivedRounds[id]).toBe(0)
    expect(logs.some((l) => l.includes('掠夺者舰队'))).toBe(true)
  })

  it('动态军事目标：投入不足失败 → 可重试（status available）', () => {
    const s = infiniteState()
    const id = 'gen:conquest:0'
    s.generatedTargets.push({ kind: 'conquest', id, name: '测试目标', desc: '', batch: 0, guard: 3000 })
    s.conquest[id] = { status: 'available' }
    startConquest(s, id, 1, 0)
    const logs = settleConquests(s, CYCLE + 1, () => 0.999)
    expect(s.conquest[id].status).toBe('available')
    expect(logs.some((l) => l.includes('失利'))).toBe(true)
  })

  it('静态目标征服后写归档周目标记（折叠区数据源）', () => {
    const s = infiniteState()
    s.conquest.outpost = { status: 'available', startedAt: 0, finishAt: CYCLE, invested: CONQUESTS.outpost.guard }
    settleConquests(s, CYCLE + 1)
    expect(s.conquest.outpost.status).toBe('conquered')
    expect(s.archivedRounds.outpost).toBe(0)
  })

  it('动态目标不参与 conquestAll 里程碑（静态表检查天然隔离）', () => {
    const s = infiniteState()
    const id = 'gen:conquest:0'
    s.generatedTargets.push({ kind: 'conquest', id, name: '测试目标', desc: '', batch: 0, guard: 800 })
    s.conquest[id] = { status: 'available' }
    startConquest(s, id, 800, 0)
    settleConquests(s, CYCLE + 1)
    // 静态 4 区域未全肃清 → 里程碑不触发（动态完成不产生 firstConquest/conquestAll 叙事）
    expect(s.storyFlags.firstConquest).toBeUndefined()
    expect(s.storyFlags.conquestAll).toBeUndefined()
  })
})

describe('engine: endless-expansion 结盟归档与存档', () => {
  it('结盟（静态派系）→ archivedRounds 记录归档周目', () => {
    const s = infiniteState()
    s.factions.ferro.favor = 85
    const r = factionAlliance(s, 'ferro')
    expect(r.ok).toBe(true)
    expect(s.archivedRounds.ferro).toBe(0)
  })

  it('v11 → v14 迁移：补默认空数组与胁迫字段，写死目标版本为当前', () => {
    const s = infiniteState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 11
    delete raw.generatedTargets
    delete raw.archivedRounds
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.generatedTargets).toEqual([])
    expect(migrated.archivedRounds).toEqual({})
  })

  it('v13 → v14 迁移：外交自动化 perFaction boolean → 三态模式（false→off，true→缺省 ally）', () => {
    const s = infiniteState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.diplomacyAuto = { enabled: true, perFaction: { ferro: false, cygnus: true, lumen: 'off' } }
    raw.schemaVersion = 13
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.diplomacyAuto?.perFaction).toEqual({ ferro: 'off', lumen: 'off' })
    expect(migrated.diplomacyAuto?.enabled).toBe(true)
  })

  it('NG+ 清空生成目标与归档标记（本周目语义）；无尽继续时探索可重注入', () => {
    const s = infiniteState()
    s.expeditions.push(fakeExpedition({ kind: 'conquest', targetId: 'gen:conquest' }))
    settleExpeditions(s, CYCLE + 1)
    expect(s.generatedTargets.length).toBeGreaterThan(0)
    s.archivedRounds.outpost = 0
    startNewGamePlus(s, 0)
    expect(s.generatedTargets).toEqual([])
    expect(s.archivedRounds).toEqual({})
    // NG+ 后 phase='playing'（非无限）→ 无扩展池
    const pool = expeditionPool(s)
    expect(pool.some((e) => e.kind === 'conquest')).toBe(false)
    // 再次通关进入无限 → 扩展池恢复
    s.phase = 'ended'
    enterInfiniteMode(s)
    const pool2 = expeditionPool(s)
    expect(pool2.some((e) => e.kind === 'conquest')).toBe(true)
  })
})
