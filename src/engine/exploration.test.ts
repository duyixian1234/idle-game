import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine'
import { checkPlanetUnlocks, setActivePlanet } from './planets'
import {
  escortFee,
  expeditionCost,
  expeditionMilitaryCost,
  expeditionPool,
  explorationHarvestMult,
  explorationSlots,
  exploreProgress,
  isExploreAvailable,
  settleExpeditions,
  startExpedition,
  wormholeLevelForSlot,
} from './exploration'
import { formatPercent } from './format'
import { settleOffline } from './offline'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { reputation } from './reputation'
import { previewNewGamePlus } from './ngplus'
import { createFactionState, factionTechShare, isFederationUnified, techShareCost, tradeCost } from './diplomacy'
import { OUTPOST_ENERGY_MULT, OUTPOST_MINERAL_MULT } from './balance'
import { productionReport, militaryCap } from './production'
import type { ExpeditionState, GameState } from './types'

/** 派遣时长上限（测试周期常量）：真实派遣掷 10~30min，30min 保证任意真实派遣到期；fake 数据与 settle 时刻同口径 */
const CYCLE = 30 * 60_000

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
    finishAt: CYCLE,
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

  it('多槽：基础 5 槽满员时拒绝再次派遣；第 6 槽枢纽 Lv1 解锁后可续派', () => {
    const s = endedState()
    // 基础 5 槽：4 支在途 → 第 5 支可出发
    for (let i = 1; i <= 4; i++) s.expeditions.push(fakeExpedition({ id: i }))
    expect(startExpedition(s, 1000)).toMatchObject({ ok: true })
    expect(s.expeditions).toHaveLength(5)
    // 5 槽满员再拒
    expect(startExpedition(s, 2000)).toEqual({ ok: false, reason: '全部探索信道已占用，需等待返航' })
    // 跃迁枢纽 Lv1 → 6 槽：可派第 6 支
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 1
    expect(startExpedition(s, 3000)).toMatchObject({ ok: true })
    expect(s.expeditions).toHaveLength(6)
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
  it('正常出发：扣动态缩放矿物/能源 + 固定兵力，finishAt = now + 注入时长（rng 0.99 → 30min 上限）', () => {
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
    expect(exp.finishAt).toBe(1000 + CYCLE)
    expect(exp.cost).toEqual(cost)
    expect(exp.cost.military).toBe(40)
    expect(s.expeditions).toHaveLength(1)
  })

  it('result 出发时固化：与出发时一致，不随回归重抽（注入 rng 断言）', () => {
    const s = endedState()
    const r = startExpedition(s, 1000, () => 0.99)
    const result = r.value!.result
    expect(result.kind).toBe('resource') // rng 0.99 落入末位补偿分支
    expect(s.expeditions[0].result).toEqual(result)
    // 回归（settle）不改结果
    const logs = settleExpeditions(s, 1000 + CYCLE)
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
    settleExpeditions(s, CYCLE)
    // 结算后兵力不回补
    expect(s.resources.military).toBe(50_000 - 40)
  })
})

describe('engine: 探索槽位与成本自适应', () => {
  it('explorationSlots：默认 5 槽，枢纽等级驱动（Lv1 +1、Lv4 +2、Lv10 +5 = 满 10 槽）', () => {
    const s = endedState()
    expect(explorationSlots(s)).toBe(5)
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 1
    expect(explorationSlots(s)).toBe(6)
    s.upgrades.jumpgate = 4
    expect(explorationSlots(s)).toBe(7)
    // Lv10 触达上限 10
    s.upgrades.jumpgate = 10
    expect(explorationSlots(s)).toBe(10)
  })

  it('军事点自适应：随军力上限 2% 缩放，保底 40，封顶 1000，×槽位', () => {
    const s = endedState()
    expect(militaryCap(s)).toBe(100)
    expect(expeditionMilitaryCost(s, 0)).toBe(40) // floor(100×0.02)=2 → 保底 40
    // cap 5000 → floor(5000×0.02)=100
    s.permanentBonuses['militaryCap'] = 49 // 100 × (1+49) = 5000
    expect(expeditionMilitaryCost(s, 0)).toBe(100)
    expect(expeditionMilitaryCost(s, 1)).toBe(200)
    expect(expeditionMilitaryCost(s, 2)).toBe(300)
    // cap 20000 → 400
    s.permanentBonuses['militaryCap'] = 199
    expect(expeditionMilitaryCost(s, 0)).toBe(400)
    // cap 100000 → floor(0.02×100000)=2000 → 封顶 1000
    s.permanentBonuses['militaryCap'] = 999
    expect(expeditionMilitaryCost(s, 0)).toBe(1000)
  })

  it('warpDrive 质变：Lv≥10 派遣军力 −10%（Lv<10 与现状逐字节一致）', () => {
    const s = endedState()
    s.permanentBonuses['militaryCap'] = 49 // cap 5000 → 派遣军力 base 100
    expect(expeditionMilitaryCost(s, 0)).toBe(100)
    expect(expeditionMilitaryCost(s, 1)).toBe(200)
    s.techLevels.warpDrive = 9
    expect(expeditionMilitaryCost(s, 0)).toBe(100) // 未达阈值不变
    s.techLevels.warpDrive = 10
    expect(expeditionMilitaryCost(s, 0)).toBe(90) // 100 × 0.9
    expect(expeditionMilitaryCost(s, 1)).toBe(180) // 200 × 0.9
    s.techLevels.warpDrive = 20
    expect(expeditionMilitaryCost(s, 0)).toBe(90) // 阈值后恒定 0.9
  })

  it('矿物/能源 cap 随周目 ×1.5^level（0/5/10 周目断言）', () => {
    const s = endedState()
    s.buildings.miner = 30_000 // 30k/s → 30k×300=9M 打满任意周目 cap
    s.buildings.solar = 24_000 // 24k/s → 24k×150=3.6M
    const c0 = expeditionCost(s, 0)
    expect(c0.mineral).toBe(150_000)
    expect(c0.energy).toBe(60_000)
    s.ngPlusLevel = 5
    const c5 = expeditionCost(s, 0)
    expect(c5.mineral).toBe(Math.floor(150_000 * Math.pow(1.5, 5))) // 1_139_062
    expect(c5.energy).toBe(Math.floor(60_000 * Math.pow(1.5, 5))) // 455_625
    s.ngPlusLevel = 10
    const c10 = expeditionCost(s, 0)
    expect(c10.mineral).toBe(Math.floor(150_000 * Math.pow(1.5, 10))) // 8_649_755
    expect(c10.energy).toBe(Math.floor(60_000 * Math.pow(1.5, 10))) // 3_459_902
    // 收益比结构：cap 只影响绝对规模，min/factor 不动（balance-sim 锚点保持）
    expect(expeditionCost(s, 0).military).toBe(40)
  })

  it('每槽成本独立：军事点 ×槽位（40/80/120），cap 随周目对两槽同时生效', () => {
    const s = endedState()
    expect(expeditionCost(s, 0).military).toBe(40)
    expect(expeditionCost(s, 1).military).toBe(80)
    expect(expeditionCost(s, 2).military).toBe(120)
  })

  it('多槽同时派遣：≤ 槽数成功、超槽拒绝、每槽独立出发时间', () => {
    const s = endedState()
    // 默认 5 槽：5 支全出 + 第 6 支拒绝
    const starts = [0, 10_000, 20_000, 30_000, 40_000]
    const results = starts.map((t, i) => startExpedition(s, t, () => 0.5, i))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(s.expeditions).toHaveLength(5)
    expect(s.expeditions.map((e) => e.startedAt)).toEqual(starts)
    // 5 槽满员：第 6 支拒绝
    expect(startExpedition(s, 50_000, () => 0, 0)).toEqual({ ok: false, reason: '全部探索信道已占用，需等待返航' })
  })

  it('每槽独立 roll 固化：注入不同 rng → 不同 result（计数器天然独立）', () => {
    const s = endedState()
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 1
    let calls = 0
    const rng = () => (calls++ === 0 ? 0.0 : 0.99) // 槽 0 落第一项（势力），槽 1 落 resource
    const r1 = startExpedition(s, 0, rng, 0)
    const r2 = startExpedition(s, 1000, rng, 1)
    expect(r1.value!.result.kind).toBe('faction')
    expect(r2.value!.result.kind).toBe('resource')
    expect(s.expeditions[0].result).not.toEqual(s.expeditions[1].result)
  })

  it('探索收获倍率：1 + 0.3×枢纽等级；作用于 resource 分支补偿（×mult）', () => {
    const s = endedState()
    expect(explorationHarvestMult(s)).toBe(1)
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 1
    expect(explorationHarvestMult(s)).toBe(1.3)
    s.upgrades.jumpgate = 10
    expect(explorationHarvestMult(s)).toBe(4)
    // resource 分支：0.99 落补偿 → 补偿 ×1.3（无枢纽基线 ×1）
    const s1 = endedState()
    const base = startExpedition(s1, 0, () => 0.99, 0).value!.result
    const s2 = endedState()
    s2.buildings.jumpgate = 1
    s2.upgrades.jumpgate = 1
    const boosted = startExpedition(s2, 0, () => 0.99, 0).value!.result
    if (base.kind === 'resource' && boosted.kind === 'resource') {
      expect(boosted.mineral).toBe(Math.floor(base.mineral * 1.3))
      expect(boosted.tech).toBe(Math.floor(base.tech * 1.3))
      expect(boosted.energy).toBe(Math.floor(base.energy * 1.3))
    } else {
      throw new Error('rng 0.99 应落入 resource 补偿')
    }
  })
})

describe('engine: 派遣结算（自动入账）', () => {
  it('未到期不动（不结算、不计次）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    const logs = settleExpeditions(s, CYCLE - 1)
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
    const logs = settleExpeditions(s, CYCLE)
    expect(logs).toHaveLength(1)
    expect(logs[0].type).toBe('reward')
    expect(logs[0].text).toContain('回收了')
    expect(s.resources.mineral).toBe(mineralBefore + 2250)
    expect(s.resources.tech).toBe(techBefore + 30)
    expect(s.resources.energy).toBe(energyBefore + 750)
    expect(s.stats.explorations).toBe(1)
    expect(s.expeditions).toHaveLength(0)
  })

  it('resource 分支：探索收获计入累计统计（explore*Earned 三元组 + 并入全局累计，ADR-0041）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 } }))
    settleExpeditions(s, CYCLE)
    expect(s.stats.exploreMineralEarned).toBe(2250)
    expect(s.stats.exploreEnergyEarned).toBe(750)
    expect(s.stats.exploreTechEarned).toBe(30)
    expect(s.stats.totalMineralEarned).toBe(2250)
    expect(s.stats.totalEnergyEarned).toBe(750)
    expect(s.stats.totalTechEarned).toBe(30)
  })

  it('护航派遣：返还计入探索收获（escort 共享 resource 分支，ADR-0041）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ escort: true, result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 } }))
    settleExpeditions(s, CYCLE)
    expect(s.stats.exploreMineralEarned).toBe(2250)
    expect(s.stats.explorations).toBe(1)
    expect(s.stats.escortedExpeditions).toBe(1)
  })

  it('多派单一并结算（引擎不拦截，单槽由 startExpedition 保证）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2, finishAt: CYCLE + 1 }))
    const logs = settleExpeditions(s, CYCLE + 1)
    expect(logs).toHaveLength(2)
    expect(s.stats.explorations).toBe(2)
    expect(s.expeditions).toHaveLength(0)
  })

  it('tick 接入：倒计时到期自动入账并写日志', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    tick(s, CYCLE)
    expect(s.stats.explorations).toBe(1)
    expect(s.log.some((l) => l.text.includes('探索队返航'))).toBe(true)
    expect(s.expeditions).toHaveLength(0)
  })

  it('faction 分支：发现 → 运行时创建派系（favor/threat 取 def 初值）+ 记录进度', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'faction', factionId: 'ashCommune' } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('发现「灰潮共同体」')
    expect(s.factions.ashCommune).toMatchObject({ favor: 10, threat: 35, allied: false, tradeCount: 0 })
    expect(s.exploredFactions).toEqual(['ashCommune'])
    expect(s.stats.explorations).toBe(1)
  })

  it('planet 分支：发现 → 解锁天体（unlockedAt）+ 记录进度', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ result: { kind: 'planet', planetId: 'logistics' } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('发现更佳的发展天体')
    expect(s.planets.logistics).toEqual({ unlocked: true, unlockedAt: CYCLE })
    expect(s.exploredPlanets).toEqual(['logistics'])
    expect(s.stats.explorations).toBe(1)
  })

  it('planet 分支：已解锁但目标 def 缺失（边界态）日志显示占位名（未知天体）而非原始 id', () => {
    const s = endedState()
    s.planets['ghost'] = { unlocked: true, unlockedAt: 0 } // 旧存档残留态：解锁但不在任何 def 表
    s.expeditions.push(fakeExpedition({ result: { kind: 'planet', planetId: 'ghost' } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).not.toContain('ghost')
    expect(logs[0].text).toContain('未知天体')
  })

  it('重复发现已收录派系：好感 +5（封顶 100），不重复创建', () => {
    const s = endedState()
    s.factions.ashCommune = createFactionState({ id: '灰潮共同体', descText: '', initialFavor: 10, initialThreat: 35 })
    s.exploredFactions = ['ashCommune']
    s.expeditions.push(fakeExpedition({ result: { kind: 'faction', factionId: 'ashCommune' } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs[0].text).toContain('重新建立与')
    expect(logs[0].text).toContain('好感 +5')
    expect(Object.keys(s.factions)).toHaveLength(5) // 未新增
    expect(s.factions.ashCommune.favor).toBe(15)
    // 封顶 100
    s.factions.ashCommune.favor = 99
    s.expeditions.push(fakeExpedition({ id: 2, result: { kind: 'faction', factionId: 'ashCommune' } }))
    settleExpeditions(s, CYCLE)
    expect(s.factions.ashCommune.favor).toBe(100)
  })

  it('重复发现已收录天体：产出增益 +0.1（封顶 0.5），不重复解锁', () => {
    const s = endedState()
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 1000 }
    s.exploredPlanets = ['rubbleBelt']
    s.expeditions.push(fakeExpedition({ result: { kind: 'planet', planetId: 'rubbleBelt' } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs[0].text).toContain(`产出增益 +${formatPercent(10)}`)
    expect(s.planets.rubbleBelt.outputBonus).toBe(0.1)
    // 封顶 0.5
    s.planets.rubbleBelt.outputBonus = 0.45
    s.expeditions.push(fakeExpedition({ id: 2, result: { kind: 'planet', planetId: 'rubbleBelt' } }))
    settleExpeditions(s, CYCLE)
    expect(s.planets.rubbleBelt.outputBonus).toBe(0.5)
  })
})

describe('engine: 深空碑文（deepSpace 成就挂点）', () => {
  it('首次探索结算触发：storyFlags.deepSpace 置位 + 碑文叙事入日志', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition())
    const logs = settleExpeditions(s, CYCLE)
    expect(s.storyFlags.deepSpace).toBe(true)
    expect(s.log.some((l) => l.text.includes('禁航航线'))).toBe(true)
    expect(s.log.some((l) => l.text.includes('警世铭'))).toBe(true)
    expect(logs).toHaveLength(1) // 探索返航日志照常返回（调用方 pushLog），碑文叙事由 playMilestone 直入 state.log
  })

  it('非首次不重复：flag 已置位再结算不触发', () => {
    const s = endedState()
    s.storyFlags.deepSpace = true
    s.expeditions.push(fakeExpedition())
    settleExpeditions(s, CYCLE)
    expect(s.log.filter((l) => l.text.includes('警世铭'))).toHaveLength(0)
  })

  it('多笔同批结算仅第一笔触发（playMilestone 内部 storyFlags 防重复双保险）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2 }))
    settleExpeditions(s, CYCLE)
    expect(s.log.filter((l) => l.text.includes('警世铭'))).toHaveLength(1)
    expect(s.stats.explorations).toBe(2)
  })

  it('playing 阶段不触发（isExploreAvailable 守卫：防御性，正常流程无在途派遣）', () => {
    const s = createInitialState(0)
    s.expeditions.push(fakeExpedition())
    settleExpeditions(s, CYCLE)
    expect(s.storyFlags.deepSpace).toBeUndefined()
  })

  it('成就解锁：结算后 checkAchievements 发 2000 科技 + 3 声望（先清场隔离并发成就）', () => {
    const s = endedState()
    // 预置通关后已探索过：隔离 explorerFirst（stats.explorations ≥ 1，collect 周目类）在结算时并发解锁
    s.stats.explorations = 1
    // ended 状态满足 federation 成就条件（endingTriggered），预先解锁避免污染增量断言
    checkAchievements(s, 1)
    expect(s.achievements.federation).toBeTruthy()
    expect(s.achievements.explorerFirst).toBeTruthy()
    const repBefore = reputation(s) // federation 8 + explorerFirst 2 = 10
    s.expeditions.push(fakeExpedition())
    settleExpeditions(s, CYCLE)
    const techAfterSettle = s.resources.tech // 含探索资源补偿入账（fakeExpedition +30）
    const newly = checkAchievements(s, 2)
    expect(newly.map((d) => d.id)).toEqual(['deepSpace']) // 精确集合：无其他并发成就
    expect(s.achievements.deepSpace).toMatchObject({ unlockedAt: 2 })
    expect(s.resources.tech).toBe(techAfterSettle + 2_000) // 增量仅成就奖励（隔离探索入账）
    expect(reputation(s)).toBe(repBefore + 3)
  })

  it('离线路径：settleOffline 结算探索到期同样触发（探索离线推进语义一致）', () => {
    const s = endedState()
    s.lastTick = 0
    s.expeditions.push(fakeExpedition())
    const off = settleOffline(s, CYCLE)
    expect(s.storyFlags.deepSpace).toBe(true)
    expect(off.expeditionLogs).toHaveLength(1)
    expect(s.log.some((l) => l.text.includes('警世铭'))).toBe(true)
  })
})

describe('engine: 奖池（剔除制 + 权重）', () => {
  it('完整池：4 势力 w2 + 5 天体 w1 + 补偿 w6，剔除后重归一化', () => {
    const s = endedState()
    const pool = expeditionPool(s)
    expect(pool).toHaveLength(10)
    expect(pool.filter((e) => e.kind === 'faction')).toHaveLength(4)
    expect(pool.filter((e) => e.kind === 'planet')).toHaveLength(5)
    expect(pool.find((e) => e.kind === 'resource')?.weight).toBe(6)
  })

  it('剔除制：已发现势力/天体不再出现在候选', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder']
    s.exploredPlanets = ['logistics']
    const pool = expeditionPool(s)
    expect(pool.filter((e) => e.id === 'ashCommune')).toHaveLength(0)
    expect(pool.filter((e) => e.kind === 'faction')).toHaveLength(2)
    expect(pool.filter((e) => e.kind === 'planet')).toHaveLength(4)
    // 收集 3 个 → 补偿权重 = max(2, 6-3) = 3
    expect(pool.find((e) => e.kind === 'resource')?.weight).toBe(3)
  })

  it('耗尽后：候选只剩资源补偿（w2），无收集品', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    expect(expeditionPool(s)).toEqual([{ kind: 'resource', weight: 2 }])
  })
})

describe('engine: 探索收集进度（explore-endstate）', () => {
  it('exploreProgress 空态：0/4 势力、0/5 天体、未尽览', () => {
    const s = endedState()
    expect(exploreProgress(s)).toEqual({
      factions: { found: 0, total: 4 },
      planets: { found: 0, total: 5 },
      exhausted: false,
      endless: { conquest: 0, faction: 0, planet: 0 },
    })
  })

  it('exploreProgress 部分收集：found 随 explored* 计数，未尽览', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder']
    s.exploredPlanets = ['logistics', 'rubbleBelt']
    expect(exploreProgress(s)).toEqual({
      factions: { found: 2, total: 4 },
      planets: { found: 2, total: 5 },
      exhausted: false,
      endless: { conquest: 0, faction: 0, planet: 0 },
    })
  })

  it('exploreProgress 集齐（4 势力 + 5 天体）：exhausted=true', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    expect(exploreProgress(s)).toEqual({
      factions: { found: 4, total: 4 },
      planets: { found: 5, total: 5 },
      exhausted: true,
      endless: { conquest: 0, faction: 0, planet: 0 },
    })
  })

  it('infinite 扩展池仍有目标（军事/外交/天体）→ exhausted=false（作用域：无尽目标入池）', () => {
    const s = endedState()
    enterInfiniteMode(s)
    expect(exploreProgress(s)).toEqual({
      factions: { found: 0, total: 4 },
      planets: { found: 0, total: 5 },
      exhausted: false,
      endless: { conquest: 0, faction: 0, planet: 0 },
    })
  })

  it('found clamp 到 total：infinite 程序生成天体也会进 exploredPlanets，超额不溢出（避免「天体 8/5」）', () => {
    const s = endedState()
    enterInfiniteMode(s)
    // 4 静态势力 + 6 个天体（静态 5 + 程序生成 1）→ found 显示 clamp 到 5
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect', 'endless:extraFaction']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm', 'gen:planet']
    expect(exploreProgress(s)).toEqual({
      factions: { found: 4, total: 4 },
      planets: { found: 5, total: 5 },
      exhausted: false,
      endless: { conquest: 0, faction: 0, planet: 0 },
    })
  })

  it('无尽活跃目标：generatedTargets 未归档（archivedRounds==null）按军事/势力/天体分类', () => {
    const s = endedState()
    enterInfiniteMode(s)
    s.generatedTargets = [
      { kind: 'conquest', id: 'endless:warband', batch: 1, name: '掠夺者舰队', desc: '', guard: 800 },
      { kind: 'conquest', id: 'gen:conquest:0', batch: 0, name: '幽影军团', desc: '', guard: 800 },
      { kind: 'faction', id: 'endless:starlightLeague', batch: 1, name: '星光商会', desc: '', initialFavor: 25, initialThreat: 40 },
      { kind: 'planet', id: 'endless:blackHoleObservatory', batch: 1, name: '黑洞视界观测站', desc: '', mechanicId: 'logisticsHub' },
      { kind: 'planet', id: 'gen:planet:0', batch: 0, name: '碎星平原', desc: '', output: { energy: 1 } },
      { kind: 'planet', id: 'gen:planet:1', batch: 0, name: '极光海', desc: '', output: { mineral: 1 } },
    ]
    // 攻占成功归档 1 个军事目标（endless-expansion 归档语义：archivedRounds 标记）
    s.archivedRounds['gen:conquest:0'] = s.ngPlusLevel
    expect(exploreProgress(s).endless).toEqual({ conquest: 1, faction: 1, planet: 3 })
  })

  it('结算日志：集齐后资源补偿宣告终态（含护航变体）', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    s.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2, escort: true, result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 } }))
    const logs = settleExpeditions(s, CYCLE)
    expect(logs[0].text).toContain('已尽览所有已知目标，无新发现')
    expect(logs[0].text).not.toContain('未发现新文明')
    expect(logs[1].text).toContain('护航编队返航：已尽览所有已知目标，无新发现')
  })

  it('结算日志：未尽览保持「未发现新文明」', () => {
    const s = endedState()
    s.exploredFactions = ['ashCommune']
    s.expeditions.push(fakeExpedition())
    const logs = settleExpeditions(s, CYCLE)
    expect(logs[0].text).toContain('未发现新文明')
    expect(logs[0].text).not.toContain('已尽览')
  })

  it('结算日志：infinite 扩展池有目标时不含「已尽览」', () => {
    const s = endedState()
    enterInfiniteMode(s)
    s.expeditions.push(fakeExpedition())
    const logs = settleExpeditions(s, CYCLE)
    expect(logs[0].text).toContain('未发现新文明')
    expect(logs[0].text).not.toContain('已尽览')
  })
})

describe('engine: 离线推进', () => {
  it('settleOffline：离线期间倒计时到期，回归自动入账（含日志）', () => {
    const s = endedState()
    s.lastTick = 0
    s.expeditions.push(fakeExpedition())
    const off = settleOffline(s, CYCLE + 1000)
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
    s.factions.obsidianPact = createFactionState({ id: '黑曜协议', descText: '', initialFavor: 5, initialThreat: 55 })
    expect(isFederationUnified(s)).toBe(false)
    // 全部纳入（favor 100）→ 恢复统一
    s.factions.obsidianPact.favor = 100
    expect(isFederationUnified(s)).toBe(true)
  })

  it('外交差异：灰潮共同体贸易再 -5%、星环修道会再 -8%（与声望折扣乘法叠加）；其余势力不受影响', () => {
    const s = endedState()
    s.factions.ashCommune = createFactionState({ id: '灰潮共同体', descText: '', initialFavor: 10, initialThreat: 35, tradeDiscount: 0.05 })
    const base = tradeCost(s, 'ferro').mineral
    const commune = tradeCost(s, 'ashCommune').mineral
    expect(commune).toBe(Math.floor(base * (1 - 0.05)))
    // 星环修道会 tradeDiscount 0.08
    s.factions.ringOrder = createFactionState({ id: '星环修道会', descText: '', initialFavor: 15, initialThreat: 25, tradeDiscount: 0.08 })
    expect(tradeCost(s, 'ringOrder').mineral).toBe(Math.floor(base * (1 - 0.08)))
  })

  it('外交差异：节点智械技术共享半价；其余势力全价', () => {
    const s = endedState()
    s.resources.tech = 100_000
    s.factions.nodeIntellect = createFactionState({ id: '节点智械', descText: '', initialFavor: 10, initialThreat: 40, techShareCostMult: 0.5 })
    expect(techShareCost(s, 'nodeIntellect').tech).toBe(10_000)
    expect(techShareCost(s, 'ferro').tech).toBe(20_000)
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
    settleExpeditions(s, CYCLE)
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
    // 缺口档：10 精炼厂（需求 5/s）vs 1 太阳能（产出 1/s）→ 无科技 ratio = 1.05/5 = 0.21
    // （ended 阶段探索外交基础 ×1.05，ADR-0064：能源产出同比例放大）
    const base = productionReport(prodState(10, 1)).energyRatio
    expect(base).toBeCloseTo(1.05 / 5, 6)
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
    expect(base.energyRatio).toBeCloseTo(1.05 / 5, 6)
    const s = prodState(10, 1)
    s.planets.outpost = { unlocked: true, unlockedAt: 1000 }
    s.activePlanet = 'outpost'
    const out = productionReport(s)
    expect(out.energyRatio).toBeCloseTo(1.05 / (5 * OUTPOST_ENERGY_MULT), 6) // 1.05 / 6
  })

  it('outpost 机制独立于科技加成（×1.25 在科技乘数之上）', () => {
    const s = prodState(10, 20, { planetDrill: 1 })
    s.planets.outpost = { unlocked: true, unlockedAt: 1000 }
    s.activePlanet = 'outpost'
    // 10 精炼厂 × 3/s × 科技 1.5 × 前哨 1.25 × 探索外交 1.05 = 59.0625
    expect(productionReport(s).nominal.mineral).toBeCloseTo(10 * 3 * 1.5 * OUTPOST_MINERAL_MULT * 1.05, 6)
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
    s.factions.ashCommune = createFactionState({ id: '灰潮共同体', descText: '', initialFavor: 10, initialThreat: 35 })
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

  it('previewNewGamePlus 失去清单含探索条目（已收集数 + 派遣中数量化）', () => {
    const s = endedState()
    s.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2 }))
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['logistics']
    const p = previewNewGamePlus(s)
    expect(p.lost.exploredCount).toBe(2)
    expect(p.lost.activeExpeditions).toBe(2)
    // 已结算的不计入
    const s2 = endedState()
    s2.expeditions.push(fakeExpedition({ id: 1 }), fakeExpedition({ id: 2, resolved: true }))
    expect(previewNewGamePlus(s2).lost.activeExpeditions).toBe(1)
    // 无派遣时为 0
    const s3 = endedState()
    expect(previewNewGamePlus(s3).lost.activeExpeditions).toBe(0)
  })
})

describe('engine: 探索声望加成（ngplus-experience，ADR-0063：探索槽 + 护航费折扣）', () => {
  /** 逐步解锁成就直至声望 ≥ n（借道 achievements 集合，绕条件） */
  const pushRep = (s: GameState, n: number): void => {
    let sum = 0
    for (const def of Object.values(ACHIEVEMENTS)) {
      if (sum >= n) return
      if (!s.achievements[def.id]) {
        s.achievements[def.id] = { unlockedAt: 1, unlockedInRound: 0 }
        sum += def.rep
      }
    }
  }

  it('explorationSlots：声望阶梯探索槽（80→+1、100→+2），上限 20 同步 +2 → 22', () => {
    const s = endedState()
    expect(explorationSlots(s)).toBe(5) // 无声望基线
    // 声望 80：+1 槽（5 → 6）
    pushRep(s, 80)
    expect(reputation(s)).toBeGreaterThanOrEqual(80)
    expect(explorationSlots(s)).toBe(6)
    // 声望 100：+2 槽（→ 7）
    pushRep(s, 100)
    expect(explorationSlots(s)).toBe(7)
    // 满配：枢纽 Lv10（+5）+ 虫洞 Lv10（+10）+ 声望 2 = 22（上限 20+2 同步提升）
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 10
    s.buildings.wormhole = 1
    s.upgrades.wormhole = 10
    expect(explorationSlots(s)).toBe(22)
  })

  it('escortFee：声望护航费折扣（满声望 −10%）；与 warpDrive Lv20 −10% 叠加共 −20%', () => {
    const s = endedState()
    s.fleet = { count: 5 } // 5 舰维护费可控（1.5^5 几何级数），能源足量 → 运转
    s.buildings.dock = 1
    s.buildings.solar = 2000 // 放大能源净产出 → perShip 大，floor 误差可忽略
    // 无声望、无 warp：基准（E = 舰数，escortThroughputMult = 1）
    const fee0 = escortFee(s)
    expect(fee0).toBeGreaterThan(100) // 前提校验：费用量级足够支撑比例断言
    // 满声望（warp 未变，E 不变）→ −10%
    pushRep(s, 100)
    expect(escortFee(s)).toBe(Math.max(0, Math.floor(fee0 * (1 - 0.1))))
    // warpDrive Lv20：E 含 warp 倍率（基准变化），同 warp 下有/无声望对比 → 叠加 −20% vs −10%
    s.techLevels.warpDrive = 20
    const feeWarpRep = escortFee(s)
    for (const id of Object.keys(s.achievements)) delete s.achievements[id]
    const feeWarpNoRep = escortFee(s)
    expect(feeWarpRep / feeWarpNoRep).toBeCloseTo(0.8 / 0.9, 2) // (1−0.2)/(1−0.1)
  })
})

describe('engine: 虫洞探索扩展（wormhole-empire ticket 03：槽位 20 + 能源减耗）', () => {
  const wormholeLevel = (s: GameState, lv: number): void => {
    s.buildings.wormhole = 1
    s.upgrades.wormhole = lv
  }

  it('explorationSlots：无虫洞 = 现状基线（枢纽 Lv10 满 10）；虫洞每级 +1 至 Lv10 满 20', () => {
    const s = endedState()
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 10
    expect(explorationSlots(s)).toBe(10) // 现状基线

    wormholeLevel(s, 1)
    expect(explorationSlots(s)).toBe(11)
    wormholeLevel(s, 5)
    expect(explorationSlots(s)).toBe(15)
    wormholeLevel(s, 10)
    expect(explorationSlots(s)).toBe(20)
  })

  it('wormholeLevelForSlot：第 6-10 槽由枢纽承担、第 11-20 槽由虫洞承担', () => {
    expect(wormholeLevelForSlot(5)).toBe(0) // 基础槽
    expect(wormholeLevelForSlot(6)).toBe(0) // 枢纽槽，不要求虫洞
    expect(wormholeLevelForSlot(11)).toBe(1)
    expect(wormholeLevelForSlot(15)).toBe(5)
    expect(wormholeLevelForSlot(20)).toBe(10)
  })

  it('expeditionCost：虫洞每级 −5% 探索能源（Lv10 −50%），矿物/军事点不变；无虫洞 = 现状基线', () => {
    const s = endedState()
    const base = expeditionCost(s, 0)
    const noWormhole = expeditionCost(s, 0)
    expect(noWormhole.energy).toBe(base.energy)

    wormholeLevel(s, 5)
    const c5 = expeditionCost(s, 0)
    expect(c5.energy).toBe(Math.max(1, Math.floor(base.energy * (1 - 0.25))))
    expect(c5.mineral).toBe(base.mineral)
    expect(c5.military).toBe(base.military)

    wormholeLevel(s, 10)
    const c10 = expeditionCost(s, 0)
    expect(c10.energy).toBe(Math.max(1, Math.floor(base.energy * (1 - 0.5))))
  })

  it('能源减耗只作用基础派遣能源：护航费（escortFee）不受虫洞影响', () => {
    const s = endedState()
    s.fleet = { count: 1 }
    s.buildings.dock = 1
    const fee0 = escortFee(s)
    wormholeLevel(s, 10)
    expect(escortFee(s)).toBe(fee0)
  })
})

describe('engine: 虫洞发现权重（wormhole-empire ticket 04：非 resource 分支 ×(1+0.1×级)）', () => {
  it('无虫洞：奖池权重与现状逐字节一致', () => {
    const s = endedState()
    const pool = expeditionPool(s)
    const faction = pool.filter((e) => e.kind === 'faction')
    const planet = pool.filter((e) => e.kind === 'planet')
    const resource = pool.filter((e) => e.kind === 'resource')
    // 4 势力 w1、5 天体 w2、resource max(2, 6-0)=6
    expect(faction).toHaveLength(4)
    expect(faction.every((e) => e.weight === 1)).toBe(true)
    expect(planet).toHaveLength(5)
    expect(planet.every((e) => e.weight === 2)).toBe(true)
    expect(resource).toHaveLength(1)
    expect(resource[0].weight).toBe(6)
  })

  it('虫洞 Lv10：faction/planet weight ×2，resource 不变', () => {
    const s = endedState()
    s.buildings.wormhole = 1
    s.upgrades.wormhole = 10
    const pool = expeditionPool(s)
    const faction = pool.filter((e) => e.kind === 'faction')
    const planet = pool.filter((e) => e.kind === 'planet')
    const resource = pool.filter((e) => e.kind === 'resource')
    expect(faction.every((e) => e.weight === 2)).toBe(true) // 1 × 2
    expect(planet.every((e) => e.weight === 4)).toBe(true) // 2 × 2
    expect(resource[0].weight).toBe(6) // resource 不放大
  })

  it('虫洞 Lv5：faction weight ×1.5、planet weight ×3', () => {
    const s = endedState()
    s.buildings.wormhole = 1
    s.upgrades.wormhole = 5
    const pool = expeditionPool(s)
    const faction = pool.filter((e) => e.kind === 'faction')
    const planet = pool.filter((e) => e.kind === 'planet')
    expect(faction.every((e) => e.weight === 1.5)).toBe(true)
    expect(planet.every((e) => e.weight === 3)).toBe(true)
  })
})
