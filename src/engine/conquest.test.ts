import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine'
import { conquestCostMult, conquestRewardMult, isConquestAvailable, autoConquestTick, settleConquests, startConquest } from './conquest'
import { settleOffline } from './offline'
import { generateConquestTarget } from './generate'
import { canResearchTech, canTechUpgrade, researchTech, upgradeTech } from './tech'
import { TECHS } from './data'
import type { GameState } from './types'

/** 构造状态：解锁前置星球、给足军力与资源 */
function conquestState(): GameState {
  const s = createInitialState(0)
  s.planets.ice = { unlocked: true }
  s.resources.military = 100_000
  s.resources.mineral = 10_000_000
  s.resources.tech = 1_000_000
  return s
}

describe('engine: 攻占系统（conquest）', () => {
  it('区域可用性：前置星球未解锁时 locked，解锁后可发起', () => {
    const s = createInitialState(0)
    expect(isConquestAvailable(s, 'outpost')).toBe(false) // ice 未解锁
    s.planets.ice = { unlocked: true }
    expect(isConquestAvailable(s, 'outpost')).toBe(true)
  })

  it('通关后区域（虫群母巢）在通关前不可发起，通关后（无限模式）可发起', () => {
    const s = conquestState()
    s.planets.dawn = { unlocked: true }
    expect(isConquestAvailable(s, 'nest')).toBe(false) // playing 阶段
    enterInfiniteMode(s) // phase 需先 ended —— 直接置 phase
    s.phase = 'ended'
    enterInfiniteMode(s)
    expect(s.phase).toBe('infinite')
    expect(isConquestAvailable(s, 'nest')).toBe(true)
  })

  it('发起攻占：扣投入军力、记录倒计时', () => {
    const s = conquestState()
    const r = startConquest(s, 'outpost', 2_000, 1000, () => 0.99) // 注入 rng → 时长 30min 上限
    expect(r.ok).toBe(true)
    expect(s.resources.military).toBe(98_000)
    expect(s.conquest.outpost.startedAt).toBe(1000)
    expect(s.conquest.outpost.finishAt).toBe(1000 + 30 * 60_000)
    expect(s.conquest.outpost.invested).toBe(2_000)
    // 进行中不可重复发起
    expect(isConquestAvailable(s, 'outpost')).toBe(false)
  })

  it('军力不足或投入无效时拒绝', () => {
    const s = conquestState()
    s.resources.military = 100
    expect(startConquest(s, 'outpost', 2_000, 0)).toEqual({ ok: false, reason: '军力不足' })
    expect(startConquest(s, 'outpost', 0, 0)).toEqual({ ok: false, reason: '投入军力无效' })
  })

  it('足额投入（=守卫强度）必成：成功获得奖励与永久加成', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0)
    const mineralBefore = s.resources.mineral
    const techBefore = s.resources.tech
    const logs = settleConquests(s, 60 * 60_000, () => 0.999) // rng 恒高 → 成功
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain('捷报')
    expect(s.conquest.outpost.status).toBe('conquered')
    expect(s.resources.mineral).toBe(mineralBefore + 50_000)
    expect(s.resources.tech).toBe(techBefore + 5_000)
    expect(s.techLevels.militaryTech).toBe(1) // 解锁军械科技
    // 已攻占不可再发起
    expect(isConquestAvailable(s, 'outpost')).toBe(false)
  })

  it('薄投博彩：低投入按概率失败，军力全损、可立即重试', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 200, 0) // 投入 200/500 = 40%
    const logs = settleConquests(s, 60 * 60_000, () => 0.999) // rng 高 → 落入失败区间（0.999 > 0.5）
    expect(logs[0]).toContain('失利')
    expect(s.conquest.outpost.status).toBe('available')
    expect(s.conquest.outpost.startedAt).toBeUndefined()
    // 可立即重试
    expect(isConquestAvailable(s, 'outpost')).toBe(true)
  })

  it('bonus 区域写入 permanentBonuses：军力上限与全产出加成', () => {
    const s = conquestState()
    s.planets.gas = { unlocked: true }
    s.planets.dawn = { unlocked: true }
    startConquest(s, 'shipyard', 8_000, 0)
    startConquest(s, 'wreckage', 30_000, 0)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.permanentBonuses.militaryCap).toBe(0.2)
    expect(s.permanentBonuses.production).toBe(0.1)
  })

  it('未到倒计时不结算', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0, () => 0) // 注入 rng → 时长 10min 下限
    const logs = settleConquests(s, 10 * 60_000 - 1, () => 0)
    expect(logs).toEqual([])
    expect(s.conquest.outpost.status).toBe('available')
  })

  it('tick 推进：倒计时到期后自动结算（成功）', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0)
    tick(s, 0 + 60 * 60_000, () => 0) // 足额 → 必成（rng 0 < 1）
    expect(s.conquest.outpost.status).toBe('conquered')
  })

  it('离线结算：离线期间倒计时到期，回归时结算战报', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, s.lastTick)
    const off = settleOffline(s, s.lastTick + 2 * 3600 * 1000, () => 0)
    expect(off.conquestLogs.length).toBe(1)
    expect(off.conquestLogs[0]).toContain('捷报')
    expect(s.conquest.outpost.status).toBe('conquered')
  })
})

describe('engine: 自动攻占（ADR-0033）', () => {
  /** 开启自动攻占 + 一个 available 生成军事目标（守卫 800，无成本快照）；
   * 军港 25 座 → 容量 5100（离线时军力被容量截断，需容量 ≥ 守卫 + 保底 10%，conquest-fleet 修订） */
  function autoState(): GameState {
    const s = conquestState()
    s.autoConquest = { enabled: true }
    s.planets.dawn = { unlocked: true }
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.generatedTargets.push({ kind: 'conquest', id: 'gen:conquest:0', name: '测试目标', desc: '', batch: 0, guard: 800, rewardMineral: 100_000 })
    s.conquest['gen:conquest:0'] = { status: 'available' }
    return s
  }

  it('开启 + 目标 available + 军力充足 → 投满守卫发起攻占（invested = guard）', () => {
    const s = autoState()
    const logs = autoConquestTick(s, 60_000)
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain('自动攻占')
    expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
    expect(s.resources.military).toBe(100_000 - 800)
    expect(s.autoConquest?.lastActionAt).toBe(60_000)
  })

  it('军力不足保底（投满后 < 容量×10%）→ 不发起；恰好等于保底 → 发起', () => {
    const s = autoState()
    s.resources.military = 1_300 // 容量 5100 → 保底 510；1300 − 800 = 500 < 510 → 跳过
    const logs = autoConquestTick(s, 60_000)
    expect(logs).toEqual([])
    expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' })
    const s2 = autoState()
    s2.resources.military = 1_310 // 1310 − 800 = 510 = 保底 → 恰好可发
    const logs2 = autoConquestTick(s2, 60_000)
    expect(logs2.length).toBe(1)
    expect(s2.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
  })

  it('仅生成目标：静态主线区域不自动发起', () => {
    const s = autoState()
    s.planets.ice = { unlocked: true }
    s.conquest.outpost = { status: 'available' }
    s.generatedTargets = []
    delete s.conquest['gen:conquest:0']
    const logs = autoConquestTick(s, 60_000)
    expect(logs).toEqual([])
    expect(s.conquest.outpost).toEqual({ status: 'available' })
  })

  it('冷却未过（60s 内）→ 不发起', () => {
    const s = autoState()
    s.autoConquest!.lastActionAt = 0
    const logs = autoConquestTick(s, 30_000)
    expect(logs).toEqual([])
  })

  it('开关关闭 → 不动作', () => {
    const s = autoState()
    s.autoConquest = undefined
    expect(autoConquestTick(s, 60_000)).toEqual([])
  })

  it('资源费不足（ADR-0028 costMineral）→ 暂停重试', () => {
    const s = autoState()
    s.generatedTargets[0] = { ...s.generatedTargets[0], costMineral: 9_000_000, costEnergy: 0 }
    s.resources.mineral = 1_000 // 不够 costMineral
    const logs = autoConquestTick(s, 60_000)
    expect(logs).toEqual([])
    expect(s.autoConquest?.pausedAt).toBe(60_000)
    expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' })
  })

  it('离线批量推进（settleOffline）：开启自动攻占 → 离线期间发起投满', () => {
    const s = autoState()
    settleOffline(s, s.lastTick + 5 * 60_000) // 5min 离线（≥5 个冷却周期）
    expect(s.conquest['gen:conquest:0'].invested).toBe(800)
    expect(s.resources.military).toBe(5_100 - 800) // 容量 5100 截断后投 800
  })
})

describe('engine: 舰队压制攻占（conquest-fleet）', () => {
  /** 舰队状态：船坞 Lv1（3 艘）、能源充足（powered）；shipyard 守卫 2000 已解锁 */
  function fleetState(): GameState {
    const s = conquestState()
    s.planets.gas = { unlocked: true }
    s.buildings.dock = 1
    s.upgrades.dock = 1
    s.fleet.count = 3 // 战力 3600
    s.resources.energy = 10_000 // > 3 艘维护 118.75/s → powered
    return s
  }

  it('useFleet=true + 舰队 powered → 锁定 fleetContrib = min(可用战力, 守卫×0.5)', () => {
    const s = fleetState()
    const r = startConquest(s, 'shipyard', 1_000, 0, () => 0.99)
    expect(r.ok).toBe(true)
    // min(3600, 2000×0.5=1000) = 1000
    expect(s.conquest.shipyard.fleetLocked).toBe(1_000)
    expect(s.conquest.shipyard.invested).toBe(1_000)
  })

  it('封顶生效：舰队战力 > 守卫×0.5 时只锁定守卫一半', () => {
    const s = fleetState()
    // nest 守卫 3000 × 0.5 = 1500 < 3600 → 锁定 1500（nest 为通关后区域，需 phase ≠ playing）
    s.phase = 'infinite'
    s.planets.dawn = { unlocked: true }
    startConquest(s, 'nest', 1_000, 0, () => 0.99)
    expect(s.conquest.nest.fleetLocked).toBe(1_500)
  })

  it('无舰队 / 舰队停摆（能源不足）→ 零锁定', () => {
    const s1 = fleetState()
    s1.fleet.count = 0
    startConquest(s1, 'shipyard', 1_000, 0, () => 0.99)
    expect(s1.conquest.shipyard.fleetLocked).toBeUndefined()
    const s2 = fleetState()
    s2.resources.energy = 0 // 停摆 → fleetPower 0
    startConquest(s2, 'shipyard', 1_000, 0, () => 0.99)
    expect(s2.conquest.shipyard.fleetLocked).toBeUndefined()
  })

  it('useFleet=false（自动攻占路径）→ 零锁定', () => {
    const s = fleetState()
    startConquest(s, 'shipyard', 1_000, 0, () => 0.99, false)
    expect(s.conquest.shipyard.fleetLocked).toBeUndefined()
  })

  it('结算成功：锁定释放（conquered 无 fleetLocked）', () => {
    const s = fleetState()
    startConquest(s, 'shipyard', 1_000, 0) // 1000 军力 + 1000 舰队 = 足额必成
    expect(s.conquest.shipyard.fleetLocked).toBe(1_000)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.conquest.shipyard.status).toBe('conquered')
    expect(s.conquest.shipyard.fleetLocked).toBeUndefined()
  })

  it('结算失败：锁定释放（available 无 fleetLocked，可重试）', () => {
    const s = fleetState()
    startConquest(s, 'shipyard', 200, 0) // 薄投：200+1000 = 1200/2000 = 60%
    const logs = settleConquests(s, 60 * 60_000, () => 0.9) // 0.9 > 0.6 → 失败
    expect(logs[0]).toContain('失利')
    expect(s.conquest.shipyard.status).toBe('available')
    expect(s.conquest.shipyard.fleetLocked).toBeUndefined()
    expect(isConquestAvailable(s, 'shipyard')).toBe(true)
  })

  it('舰队锁定提升成功率：薄投 + 舰队 = 足额必成', () => {
    const s = fleetState()
    startConquest(s, 'shipyard', 1_000, 0) // 1000 军力 + 1000 锁定 = 2000 = 守卫 → 必成
    const logs = settleConquests(s, 60 * 60_000, () => 0.999)
    expect(logs[0]).toContain('捷报')
    expect(s.conquest.shipyard.status).toBe('conquered')
  })
})

describe('engine: NG+ 与区域继承', () => {
  it('NG+ 重置区域攻占状态、保留永久加成；军力与军械科技重置', () => {
    const s = conquestState()
    s.permanentBonuses.production = 0.25
    s.techLevels.militaryTech = 3
    s.resources.military = 500
    startNewGamePlus(s, 0)
    // 区域全部重置为 locked
    expect(s.conquest.outpost.status).toBe('locked')
    expect(s.conquest.nest.status).toBe('locked')
    // 永久加成保留（继承）
    expect(s.permanentBonuses.production).toBe(0.25)
    // 军力清零、军械科技重置
    expect(s.resources.military).toBe(0)
    expect(s.techLevels.militaryTech).toBeUndefined()
  })
})

describe('engine: 攻占科技（conquest-guard-cap：劫掠战术）', () => {
  /** 已攻占 N 个目标（构造 status conquered）+ 可选科技等级 */
  function techState(conquered: number, lv = 0): GameState {
    const s = conquestState()
    for (let i = 0; i < conquered; i++) s.conquest[`gen:conquest:${i}`] = { status: 'conquered' }
    if (lv > 0) s.techLevels.conquestTheory = lv
    return s
  }

  it('研发门槛：已攻占 4 个拒绝、5 个可研发（requiresConquests 全口径 conqueredCount）', () => {
    const s4 = techState(4)
    expect(canResearchTech(s4, 'conquestTheory')).toBe(false)
    const s5 = techState(5)
    expect(canResearchTech(s5, 'conquestTheory')).toBe(true)
    expect(researchTech(s5, 'conquestTheory').ok).toBe(true)
    expect(s5.techLevels.conquestTheory).toBe(1)
    // 已研发后不可重复研发
    expect(researchTech(s5, 'conquestTheory').ok).toBe(false)
  })

  it('conquest 效果科技可升级：Lv1 → Lv2（canTechUpgrade 认 kind conquest）', () => {
    const s = techState(5, 1)
    expect(canTechUpgrade(TECHS.conquestTheory, 1)).toBe(true)
    expect(upgradeTech(s, 'conquestTheory').ok).toBe(true)
    expect(s.techLevels.conquestTheory).toBe(2)
  })

  it('效果派生：产出 1+0.1×Lv、消耗 max(0.5, 1−0.05×Lv)；未研发 = 1', () => {
    expect(conquestRewardMult(techState(0, 0))).toBe(1)
    expect(conquestCostMult(techState(0, 0))).toBe(1)
    expect(conquestRewardMult(techState(0, 5))).toBe(1.5)
    expect(conquestCostMult(techState(0, 5))).toBe(0.75)
    expect(conquestRewardMult(techState(0, 10))).toBe(2)
    expect(conquestCostMult(techState(0, 10))).toBe(0.5)
  })

  it('产出结算时实时乘：Lv5 攻占静态 outpost → 奖励 ×1.5（floor；静态+动态全适用 Q12）', () => {
    const s = techState(0, 5)
    startConquest(s, 'outpost', 2_000, 0)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.conquest.outpost.status).toBe('conquered')
    expect(s.resources.mineral).toBe(10_000_000 + Math.floor(50_000 * 1.5)) // 10,075,000
    expect(s.resources.tech).toBe(1_000_000 + Math.floor(5_000 * 1.5)) // 1,007,500
  })

  it('消耗生成时固化：同净产出下 Lv5 生成目标 costMineral/costEnergy ≈ Lv0 ×0.75（floor 容差 ≤1），奖励不变', () => {
    const s0 = techState(0, 0)
    s0.buildings.miner = 100
    const s5 = techState(0, 5)
    s5.buildings.miner = 100
    const t0 = generateConquestTarget(s0, () => 0.5)
    const t5 = generateConquestTarget(s5, () => 0.5)
    expect(Math.abs(t5.costMineral! - Math.floor(t0.costMineral! * 0.75))).toBeLessThanOrEqual(1)
    expect(Math.abs(t5.costEnergy! - Math.floor(t0.costEnergy! * 0.75))).toBeLessThanOrEqual(1)
    // 产出结算时乘：生成目标快照奖励不受科技影响（ticket 04：generate 只乘消耗）
    expect(t5.rewardMineral!).toBe(t0.rewardMineral!)
    expect(t5.rewardTech!).toBe(t0.rewardTech!)
  })
})
