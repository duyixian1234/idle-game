import { describe, expect, it } from 'vitest'
import { checkPlanetUnlocks, createInitialState, enterInfiniteMode, setActivePlanet, startNewGamePlus, tick } from './engine'
import { expeditionCost, expeditionPool, isExploreAvailable, settleExpeditions, startExpedition } from './exploration'
import { settleOffline } from './offline'
import { previewNewGamePlus } from './ngplus'
import { createFactionState, factionTechShare, isFederationUnified, techShareCost, tradeCost } from './diplomacy'
import { EXPEDITION_DURATION_MS, OUTPOST_ENERGY_MULT, OUTPOST_MINERAL_MULT } from './balance'
import { productionReport } from './production'
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

  it('faction 分支：发现 → 运行时创建派系（favor/threat 取 def 初值）+ 记录进度', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'faction', factionId: 'ashCommune' } }))
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('发现「灰潮共同体」')
    expect(s.factions.ashCommune).toMatchObject({ favor: 10, threat: 35, allied: false, tradeCount: 0 })
    expect(s.exploredFactions).toEqual(['ashCommune'])
    expect(s.stats.explorations).toBe(1)
  })

  it('planet 分支：发现 → 解锁天体（unlockedAt）+ 记录进度', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'planet', planetId: 'logistics' } }))
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('发现更佳的发展天体')
    expect(s.planets.logistics).toEqual({ unlocked: true, unlockedAt: EXPEDITION_DURATION_MS })
    expect(s.exploredPlanets).toEqual(['logistics'])
    expect(s.stats.explorations).toBe(1)
  })

  it('重复发现已收录派系/天体：走确认分支不重复创建（幂等）', () => {
    const s = endedState()
    s.factions.ashCommune = createFactionState({ id: 'ashCommune', name: '灰潮共同体', desc: '', initialFavor: 10, initialThreat: 35 })
    s.exploredFactions = ['ashCommune']
    s.expeditions.push(fakeExpedition({ result: { kind: 'faction', factionId: 'ashCommune' } }))
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs[0].text).toContain('重新建立与')
    expect(Object.keys(s.factions)).toHaveLength(5) // 未新增
  })
})

describe('engine: 奖池（剔除制 + 权重）', () => {
  it('完整池：4 势力 w2 + 2 天体 w1 + 补偿 w6，剔除后重归一化', () => {
    const s = endedState()
    const pool = expeditionPool(s)
    expect(pool).toHaveLength(7)
    expect(pool.filter((e) => e.kind === 'faction')).toHaveLength(4)
    expect(pool.filter((e) => e.kind === 'planet')).toHaveLength(2)
    expect(pool.find((e) => e.kind === 'resource')?.weight).toBe(6)
  })

  it('剔除制：已发现势力/天体不再出现在候选', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder']
    s.exploredPlanets = ['logistics']
    const pool = expeditionPool(s)
    expect(pool.filter((e) => e.id === 'ashCommune')).toHaveLength(0)
    expect(pool.filter((e) => e.kind === 'faction')).toHaveLength(2)
    expect(pool.filter((e) => e.kind === 'planet')).toHaveLength(1)
    // 收集 3 个 → 补偿权重 = max(2, 6-3) = 3
    expect(pool.find((e) => e.kind === 'resource')?.weight).toBe(3)
  })

  it('耗尽后：候选只剩资源补偿（w2），无收集品', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost']
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

describe('engine: 探索发现物（势力/天体）接入体系', () => {
  it('联邦判定：发现新势力后已统一的联邦变回未统一；全部纳入后恢复统一', () => {
    const s = endedState()
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    expect(isFederationUnified(s)).toBe(true)
    expect(s.factions.ashCommune).toBeUndefined()
    // 发现黑曜协议（favor 5）→ 联邦重新未统一（total 4→5）
    s.factions.obsidianPact = createFactionState({ id: 'obsidianPact', name: '黑曜协议', desc: '', initialFavor: 5, initialThreat: 55 })
    expect(isFederationUnified(s)).toBe(false)
    // 全部纳入（favor 100）→ 恢复统一
    s.factions.obsidianPact.favor = 100
    expect(isFederationUnified(s)).toBe(true)
  })

  it('外交差异：灰潮共同体贸易再 -5%（与声望折扣乘法叠加）；其余势力不受影响', () => {
    const s = endedState()
    s.factions.ashCommune = createFactionState({ id: 'ashCommune', name: '灰潮共同体', desc: '', initialFavor: 10, initialThreat: 35, tradeDiscount: 0.05 })
    const base = tradeCost(s, 'ferro').mineral
    const commune = tradeCost(s, 'ashCommune').mineral
    expect(commune).toBe(Math.floor(base * (1 - 0.05)))
    // 无 tradeDiscount 的探索势力与初始派系同价
    s.factions.ringOrder = createFactionState({ id: 'ringOrder', name: '星环修道会', desc: '', initialFavor: 15, initialThreat: 25 })
    expect(tradeCost(s, 'ringOrder').mineral).toBe(base)
  })

  it('外交差异：节点智械技术共享半价；其余势力全价', () => {
    const s = endedState()
    s.resources.tech = 100_000
    s.factions.nodeIntellect = createFactionState({ id: 'nodeIntellect', name: '节点智械', desc: '', initialFavor: 10, initialThreat: 40, techShareCostMult: 0.5 })
    expect(techShareCost('nodeIntellect').tech).toBe(10_000)
    expect(techShareCost('ferro').tech).toBe(20_000)
    const before = s.factions.nodeIntellect.favor
    factionTechShare(s, 'nodeIntellect')
    expect(s.resources.tech).toBe(100_000 - 10_000)
    expect(s.factions.nodeIntellect.favor).toBe(before + 15)
  })

  it('探索发现天体可切 activePlanet（setActivePlanet 接受 discoverOnly 星球）', () => {
    const s = endedState()
    s.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    const r = setActivePlanet(s, 'logistics')
    expect(r.ok).toBe(true)
    expect(s.activePlanet).toBe('logistics')
  })

  it('discoverOnly：不被 checkPlanetUnlocks 自动解锁（即使资源满足）', () => {
    const s = endedState()
    checkPlanetUnlocks(s)
    expect(s.planets.logistics?.unlocked).toBeUndefined()
    expect(s.planets.outpost?.unlocked).toBeUndefined()
    // 探索解锁后可用
    s.expeditions.push(fakeExpedition({ result: { kind: 'planet', planetId: 'outpost' } }))
    settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(s.planets.outpost?.unlocked).toBe(true)
  })
})

describe('engine: 探索天体机制', () => {
  /** 生产档：refinery 台数与 solar 台数可配（solar 少 → 能源缺口场景） */
  function prodState(refineries: number, solars: number, tech?: Record<string, number>): GameState {
    const s = endedState()
    s.buildings.refinery = refineries
    s.buildings.solar = solars
    s.resources.energy = 0
    if (tech) s.techLevels = { ...tech }
    return s
  }

  it('logisticsHub：科技点折算能源，缺口场景 energyRatio 提升', () => {
    // 缺口档：10 精炼厂（需求 5/s）vs 1 太阳能（产出 1/s）→ 无科技 ratio = 1/5 = 0.2
    const base = productionReport(prodState(10, 1)).energyRatio
    expect(base).toBeCloseTo(0.2, 6)
    // 切物流港但无科技盈余 → 折算 0，ratio 不变
    const noTech = prodState(10, 1)
    noTech.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    noTech.activePlanet = 'logistics'
    noTech.resources.tech = 0 // endedState 自带 100 万科技点，需显式清零测"无盈余"基线
    expect(productionReport(noTech).energyRatio).toBeCloseTo(base, 6)
    // 有 10 万科技盈余 → 池加成 5 万，ratio 拉满到 1
    noTech.resources.tech = 100_000
    expect(productionReport(noTech).energyRatio).toBe(1)
  })

  it('outpost：矿物 ×1.25（能源充足档），ratio 不变', () => {
    const base = productionReport(prodState(10, 20)) // 20 太阳能 → 充足
    expect(base.energyRatio).toBe(1)
    const s = prodState(10, 20)
    s.planets.outpost = { unlocked: true, unlockedAt: 1000 }
    s.activePlanet = 'outpost'
    const out = productionReport(s)
    expect(out.energyRatio).toBe(1) // 需求 ×1.2 后仍充足
    expect(out.nominal.mineral).toBeCloseTo(base.nominal.mineral * OUTPOST_MINERAL_MULT, 6)
  })

  it('outpost：能源缺口场景需求 ×1.2 → ratio 下降', () => {
    const base = productionReport(prodState(10, 1))
    expect(base.energyRatio).toBeCloseTo(0.2, 6)
    const s = prodState(10, 1)
    s.planets.outpost = { unlocked: true, unlockedAt: 1000 }
    s.activePlanet = 'outpost'
    const out = productionReport(s)
    expect(out.energyRatio).toBeCloseTo(1 / (5 * OUTPOST_ENERGY_MULT), 6) // 1 / 6
  })

  it('outpost 机制独立于科技加成（×1.25 在科技乘数之上）', () => {
    const s = prodState(10, 20, { planetDrill: 1 })
    s.planets.outpost = { unlocked: true, unlockedAt: 1000 }
    s.activePlanet = 'outpost'
    // 10 精炼厂 × 3/s × 科技 1.5 × 前哨 1.25 = 56.25
    expect(productionReport(s).nominal.mineral).toBeCloseTo(10 * 3 * 1.5 * OUTPOST_MINERAL_MULT, 6)
  })
})

describe('engine: 探索与 NG+ 交互（决策 Q18）', () => {
  it('NG+ 重置探索字段：派遣丢弃、发现进度清零、id 归 1、统计归零', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    s.exploredFactions = ['ashCommune', 'ringOrder']
    s.exploredPlanets = ['logistics']
    s.nextExpeditionId = 3
    s.stats.explorations = 2
    const militaryBefore = s.resources.military
    startNewGamePlus(s, 0)
    expect(s.expeditions).toEqual([])
    expect(s.exploredFactions).toEqual([])
    expect(s.exploredPlanets).toEqual([])
    expect(s.nextExpeditionId).toBe(1)
    expect(s.stats.explorations).toBe(0)
    // 派遣中任务静默丢弃不退款（兵力不返还——resources 已整体重置为 0）
    expect(s.resources.military).toBe(0)
    expect(militaryBefore).toBeGreaterThan(0)
  })

  it('NG+ 保留 fixed-rng 字段与 factionCodex（新势力结盟历史继承）', () => {
    const s = endedState()
    s.factions.ashCommune = createFactionState({ id: 'ashCommune', name: '灰潮共同体', desc: '', initialFavor: 10, initialThreat: 35 })
    s.factions.ashCommune.allied = true
    s.factionCodex.push('ferro')
    const seedBefore = s.seed
    const countersBefore = JSON.stringify(s.rngCounters)
    startNewGamePlus(s, 0)
    expect(s.seed).toBe(seedBefore)
    expect(JSON.stringify(s.rngCounters)).toBe(countersBefore)
    expect(s.factionCodex).toContain('ashCommune') // 探索势力结盟历史继承
    expect(s.factionCodex).toContain('ferro')
  })

  it('previewNewGamePlus 失去清单含探索条目（已收集数 + 派遣中标记）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['logistics']
    const p = previewNewGamePlus(s)
    expect(p.lost.exploredCount).toBe(2)
    expect(p.lost.expeditionOngoing).toBe(true)
    // 无派遣时标记 false
    const s2 = endedState()
    expect(previewNewGamePlus(s2).lost.expeditionOngoing).toBe(false)
  })
})
