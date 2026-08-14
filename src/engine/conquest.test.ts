import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine'
import { autoConquestTick, conquestCostMult, conquestRewardMult, endlessBossGuard, ensureEndlessBoss, isConquestAvailable, settleConquests, startConquest } from './conquest'
import { settleOffline } from './offline'
import { generateConquestTarget } from './generate'
import { canResearchTech, canTechUpgrade, researchTech, upgradeTech } from './tech'
import { TECHS } from './data'
import { CONQUEST_MILITARY_REFUND_PCT } from './balance'
import { militaryCap, nominalMilitaryProduction } from './production'
import { transportCapacity, bossCanPay } from './troop-transport'
import { formatNumber } from './format'
import type { GameState, GeneratedTarget } from './types'

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
    s.resources.military = 1_300 // 容量 5100 → 保底 510；1300 − 800 = 500 < 510 → 首个目标即 break
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

  it('冷却未过（30s 内）→ 不发起', () => {
    const s = autoState()
    s.autoConquest!.lastActionAt = 0
    const logs = autoConquestTick(s, 30_000 - 1) // 29,999ms < 30s 冷却 → 不发起
    expect(logs).toEqual([])
    // 恰好 = 冷却 → 发起
    const s2 = autoState()
    s2.autoConquest!.lastActionAt = 0
    expect(autoConquestTick(s2, 30_000).length).toBe(1)
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

  it('离线军事回充（offline-regen）：兵营产出使自动攻占超出一次性预算持续发起', () => {
    // 8 个守卫 800 的目标：一次性预算（cap 5100 − 保底 510 = 4590）只够 5 个；
    // 兵营（20 座 = 10/s）在离线批量循环内步进入账回充 → 每个冷却周期军力恢复，可全部发起。
    const mkTargets = () =>
      Array.from({ length: 8 }, (_, i) => ({
        kind: 'conquest' as const,
        id: `gen:conquest:${i}`,
        name: `目标${i}`,
        desc: '',
        batch: 0 as const,
        guard: 800,
        rewardMineral: 100_000,
      }))
    const s1 = autoStateMulti(mkTargets()) // 无兵营：军事一次性预算
    const s2 = autoStateMulti(mkTargets())
    s2.buildings.barracks = 20 // 10/s 军事产出 → 离线 5min 回充 3000
    settleOffline(s1, s1.lastTick + 5 * 60_000)
    settleOffline(s2, s2.lastTick + 5 * 60_000)
    const started1 = s1.generatedTargets.filter((gt) => s1.conquest[gt.id]?.startedAt != null).length
    const started2 = s2.generatedTargets.filter((gt) => s2.conquest[gt.id]?.startedAt != null).length
    expect(started1).toBe(5) // 一次性预算被 cap 卡住
    expect(started2).toBe(8) // 军事回充 → 全部发起
    expect(started2).toBeGreaterThan(started1)
  })

  /** 多目标自动攻占态（auto-conquest-priority）：默认守卫 800/1200/2000 无资源费；数组序 = 发现序 */
  function autoStateMulti(targets: GeneratedTarget[] = [
    { kind: 'conquest', id: 'gen:conquest:0', name: '目标甲', desc: '', batch: 0, guard: 800, rewardMineral: 100_000 },
    { kind: 'conquest', id: 'gen:conquest:1', name: '目标乙', desc: '', batch: 0, guard: 1_200, rewardMineral: 100_000 },
    { kind: 'conquest', id: 'gen:conquest:2', name: '目标丙', desc: '', batch: 0, guard: 2_000, rewardMineral: 100_000 },
  ]): GameState {
    const s = conquestState()
    s.autoConquest = { enabled: true }
    s.planets.dawn = { unlocked: true }
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.generatedTargets.push(...targets)
    for (const gt of s.generatedTargets) s.conquest[gt.id] = { status: 'available' }
    return s
  }

  it('多目标可用 → 守卫升序优先（批量后一次冷却按消耗升序发起全部）', () => {
    const s = autoStateMulti()
    const logs = autoConquestTick(s, 60_000)
    expect(logs.length).toBe(3)
    expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
    expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
    // 日志顺序 = 守卫升序（消耗排序主序）
    expect(logs[0]).toContain('目标甲')
    expect(logs[1]).toContain('目标乙')
    expect(logs[2]).toContain('目标丙')
    expect(s.autoConquest?.lastActionAt).toBe(60_000)
  })

  it('军力仅够一个 → 冷却后下一 tick → 选次低守卫目标（批量与冷却协同）', () => {
    const s = autoStateMulti()
    // 容量 5100 → 保底 510；军力 1310：发 800 后剩 510（=保底），1200/2000 break
    s.resources.military = 1_310
    autoConquestTick(s, 60_000) // 首 tick 发 800
    expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
    expect(s.conquest['gen:conquest:1']).toEqual({ status: 'available' })
    // 冷却期间军力回充（模拟生产），下次冷却可发次低守卫
    s.resources.military = 1_310 + 1_200
    const logs = autoConquestTick(s, 120_000)
    expect(logs.length).toBe(1)
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
    expect(s.conquest['gen:conquest:2']).toEqual({ status: 'available' })
  })

  it('守卫最低目标进行中（startedAt）→ 跳过，批量发起其余目标', () => {
    const s = autoStateMulti()
    s.conquest['gen:conquest:0'] = { status: 'available', startedAt: 0, finishAt: 10 * 60_000, invested: 800 }
    const logs = autoConquestTick(s, 60_000)
    expect(logs.length).toBe(2) // 甲跳过，乙丙批量发起
    expect(s.conquest['gen:conquest:0'].invested).toBe(800) // 进行中不重投
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
    expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
  })

  it('守卫相同 → 资源费（costMineral+costEnergy）更低的目标优先（军力只够一个时平局打破决定胜者）', () => {
    const s = autoStateMulti([
      { kind: 'conquest', id: 'gen:conquest:0', name: '目标甲', desc: '', batch: 0, guard: 800, costMineral: 500_000, costEnergy: 0, rewardMineral: 100_000 },
      { kind: 'conquest', id: 'gen:conquest:1', name: '目标乙', desc: '', batch: 0, guard: 800, costMineral: 1_000, costEnergy: 0, rewardMineral: 100_000 },
    ])
    s.resources.mineral = 600_000 // 只够发起一个的矿物费（乙 1000 够、甲 500000 也够，军力只够一个）
    s.resources.military = 1_310 // 军力只够发起一个守卫 800（+保底 510）
    const logs = autoConquestTick(s, 60_000)
    expect(logs.length).toBe(1)
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 800 }) // 乙资源费低先发
    expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' })
  })

  it('守卫最低目标资源费不足 → 暂停并跳过，批量发起其余目标（pausedAt 语义保留）', () => {
    const s = autoStateMulti([
      { kind: 'conquest', id: 'gen:conquest:0', name: '目标甲', desc: '', batch: 0, guard: 800, costMineral: 9_000_000, costEnergy: 0, rewardMineral: 100_000 },
      { kind: 'conquest', id: 'gen:conquest:1', name: '目标乙', desc: '', batch: 0, guard: 1_200, rewardMineral: 100_000 },
      { kind: 'conquest', id: 'gen:conquest:2', name: '目标丙', desc: '', batch: 0, guard: 2_000, rewardMineral: 100_000 },
    ])
    s.resources.mineral = 1_000 // 不够目标甲的 costMineral，目标乙丙无资源费
    const logs = autoConquestTick(s, 60_000)
    expect(logs.length).toBe(2) // 甲跳过，乙丙批量发起
    expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' }) // 资源费不足未发起
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
    expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
    expect(s.autoConquest?.pausedAt).toBe(60_000)
  })

  it('离线批量推进（settleOffline）：多目标在同一冷却周期批量发起（同口径在线）', () => {
    const s = autoStateMulti()
    settleOffline(s, s.lastTick + 5 * 60_000) // 5min 离线（≥5 个冷却周期，3 目标全部投满）
    expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
    expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
    expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
    // 批量语义：三个目标在同一冷却周期（首个离线周期）内发起 → startedAt 相等
    expect(s.conquest['gen:conquest:0'].startedAt).toBe(s.conquest['gen:conquest:1'].startedAt)
    expect(s.conquest['gen:conquest:1'].startedAt).toBe(s.conquest['gen:conquest:2'].startedAt)
  })

  describe('批量发起（auto-conquest-batch，ADR-0057）', () => {
    it('军力充足多目标 → 一次冷却批量发起全部（logs 逐条，守卫升序）', () => {
      const s = autoStateMulti()
      const logs = autoConquestTick(s, 60_000)
      expect(logs.length).toBe(3)
      expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
      expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
      expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
      // 日志顺序 = 守卫升序
      expect(logs[0]).toContain('目标甲')
      expect(logs[1]).toContain('目标乙')
      expect(logs[2]).toContain('目标丙')
      // 军力：100_000 − 800 − 1200 − 2000 = 96_000
      expect(s.resources.military).toBe(96_000)
      expect(s.autoConquest?.lastActionAt).toBe(60_000)
    })

    it('军力仅够部分 → 发起前 N 个后 break（守卫升序单调屏障）', () => {
      const s = autoStateMulti()
      // 容量 5100 → 保底 510；军力 2510：发 800 → 1710 → 发 1200 → 510（=保底恰好）→ 2000 break
      s.resources.military = 2_510
      const logs = autoConquestTick(s, 60_000)
      expect(logs.length).toBe(2)
      expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
      expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
      expect(s.conquest['gen:conquest:2']).toEqual({ status: 'available' }) // 未发起
      expect(s.resources.military).toBe(510) // 恰为保底
    })

    it('首个目标军力不足 → 直接 break（logs 空，lastActionAt 不更新）', () => {
      const s = autoStateMulti()
      s.resources.military = 1_300 // 容量 5100 → 保底 510；1300 − 800 = 500 < 510 → 首个 break
      const logs = autoConquestTick(s, 60_000)
      expect(logs).toEqual([])
      expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' })
      expect(s.autoConquest?.lastActionAt).toBeUndefined()
    })

    it('资源费不足目标 continue（pausedAt），后续经济够的目标仍批量发起', () => {
      const s = autoStateMulti([
        { kind: 'conquest', id: 'gen:conquest:0', name: '目标甲', desc: '', batch: 0, guard: 800, costMineral: 9_000_000, costEnergy: 0, rewardMineral: 100_000 },
        { kind: 'conquest', id: 'gen:conquest:1', name: '目标乙', desc: '', batch: 0, guard: 1_200, rewardMineral: 100_000 },
        { kind: 'conquest', id: 'gen:conquest:2', name: '目标丙', desc: '', batch: 0, guard: 2_000, rewardMineral: 100_000 },
      ])
      s.resources.mineral = 1_000 // 不够目标甲 costMineral；乙丙无资源费
      const logs = autoConquestTick(s, 60_000)
      expect(logs.length).toBe(2) // 甲跳过，乙丙批量发起
      expect(s.conquest['gen:conquest:0']).toEqual({ status: 'available' })
      expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
      expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
      expect(s.autoConquest?.pausedAt).toBe(60_000) // 甲资源费不足暂停标记保留
    })

    it('离线批量（settleOffline）→ 每冷却周期批量发起，与在线同口径', () => {
      const s = autoStateMulti()
      // 军力充足；5min 离线 ≥ 5 冷却周期，但首周期已发全部 3 目标 → 后续周期无候选
      settleOffline(s, s.lastTick + 5 * 60_000)
      expect(s.conquest['gen:conquest:0']).toMatchObject({ status: 'available', invested: 800 })
      expect(s.conquest['gen:conquest:1']).toMatchObject({ status: 'available', invested: 1_200 })
      expect(s.conquest['gen:conquest:2']).toMatchObject({ status: 'available', invested: 2_000 })
      // 批量在同一冷却周期内发起：startedAt 相等（同一次 autoConquestTick 循环）
      expect(s.conquest['gen:conquest:0'].startedAt).toBe(s.conquest['gen:conquest:2'].startedAt)
    })

    it('lastActionAt 批量成功后统一更新为本次 nowMs（循环结束一次）', () => {
      const s = autoStateMulti()
      autoConquestTick(s, 60_000)
      expect(s.autoConquest?.lastActionAt).toBe(60_000)
      // 冷却未过（20s < 30s）→ 不重复发起
      expect(autoConquestTick(s, 60_000 + 20_000)).toEqual([])
    })
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

describe('engine: boss 军力挑战（endless-progression，ADR-0053）', () => {
  /** infinite 生产档：军港+兵营使产能/容量可算 */
  function bossState(): GameState {
    const s = createInitialState(0, 7)
    s.phase = 'infinite'
    s.endingTriggered = true
    s.planets.dawn = { unlocked: true }
    s.resources.military = 10_000_000
    s.resources.mineral = 10_000_000_000
    s.resources.tech = 1_000_000_000
    s.buildings.miner = 100
    s.buildings.solar = 100
    s.buildings.militaryPort = 25
    s.buildings.barracks = 100
    return s
  }

  it('boss 目标：layer%3===0 且 ≥3 时注入，守卫公式含层数系数且受双上限约束', () => {
    const s = bossState()
    s.endless.layer = 3
    expect(ensureEndlessBoss(s)).toBe('boss:L3')
    const t = s.generatedTargets.find((x) => x.id === 'boss:L3')!
    expect(t.kind).toBe('conquest')
    expect(s.conquest['boss:L3']).toEqual({ status: 'available' })
    // 守卫 = min(产能×40s×1.3, ⌊容量/3⌋×1.2, 产能×360s)
    const cap = militaryCap(s)
    const prod = nominalMilitaryProduction(s)
    const byProd = Math.floor(prod * 40 * (1 + 0.15 * 2))
    const byCap = Math.floor(Math.floor(cap / 3) * (1 + 0.10 * 2))
    const byMax = Math.floor(prod * 360)
    expect(t.guard).toBe(Math.max(500, Math.min(byProd, byCap, byMax)))
    // 幂等：不重复注入
    expect(ensureEndlessBoss(s)).toBe('boss:L3')
    expect(s.generatedTargets.filter((x) => x.id === 'boss:L3')).toHaveLength(1)
    // 层数非 3 倍数不注入
    const s2 = bossState()
    s2.endless.layer = 4
    expect(ensureEndlessBoss(s2)).toBeNull()
  })

  it('boss 结算复用攻占管线：足额投入必成，bossDefeated +1、层数 +1（boss 击败路径保留）', () => {
    const s = bossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    const mineralBefore = s.resources.mineral
    const r = startConquest(s, 'boss:L3', guard, 0)
    expect(r.ok).toBe(true)
    const logs = settleConquests(s, 30 * 60_000 + 1)
    expect(s.conquest['boss:L3'].status).toBe('conquered')
    expect(s.archivedRounds['boss:L3']).toBe(0)
    expect(s.endless.bossDefeated).toBe(1)
    expect(s.endless.layer).toBe(4) // +1
    expect(s.resources.mineral).toBeGreaterThan(mineralBefore) // 层数系数奖励到账
    expect(logs.some((l) => l.includes('无尽守卫'))).toBe(true)
  })

  it('autoBoss：默认关（不自动发起）；开启后按自动攻占冷却发起 boss', () => {
    const s = bossState()
    s.endless.layer = 3
    s.autoConquest = { enabled: true }
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    expect(s.resources.military).toBeGreaterThan(guard)
    // 默认关：autoConquest 不自动发起 boss
    expect(autoConquestTick(s, 0)).toEqual([])
    expect(s.conquest['boss:L3'].startedAt).toBeUndefined()
    // 开启 autoBoss：按冷却发起
    s.endless.autoBoss = true
    const logs = autoConquestTick(s, 0)
    expect(logs.some((l) => l.includes('boss:L3') || l.includes('无尽守卫'))).toBe(true)
    expect(s.conquest['boss:L3'].startedAt).toBe(0)
  })

  it('autoBoss 独立生效（ADR-0061 修订）：autoConquest 未开启时，autoBoss 开启仍自动发起 boss；冷却持久化到配置', () => {
    const s = bossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    expect(s.autoConquest?.enabled).toBe(false) // autoConquest 配置存在但关闭
    // 仅开启 autoBoss（autoConquest 保持关闭）
    s.endless.autoBoss = true
    const logs = autoConquestTick(s, 0)
    expect(logs.some((l) => l.includes('boss:L3') || l.includes('无尽守卫'))).toBe(true)
    expect(s.conquest['boss:L3'].startedAt).toBe(0)
    // boss-only 模式冷却写入：lastActionAt 持久化到已有配置
    expect(s.autoConquest).toEqual({ enabled: false, lastActionAt: 0 })
    // 冷却期内不重复发起
    expect(autoConquestTick(s, 10_000)).toEqual([])
  })

  it('离线（settleOffline）：autoBoss 独立生效——autoConquest 未开启也按冷却周期发起 boss', () => {
    const s = bossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    // 仅开启 autoBoss（autoConquest 保持关闭）
    s.endless.autoBoss = true
    settleOffline(s, s.lastTick + 5 * 60_000) // 5min 离线（≥5 个冷却周期）
    expect(s.conquest['boss:L3'].startedAt).toBeDefined()
    expect(s.autoConquest?.lastActionAt).toBeDefined() // boss-only 冷却持久化
  })
})

describe('engine: 攻占军力返还（conquest-refund，ADR-0056）', () => {
  /** 返还测试态：军力容量足够大（军港 25 → 容量 5100）、军力给足（满容量，容量铁律）、前置星球全解锁 */
  function refundState(): GameState {
    const s = conquestState()
    s.planets.dawn = { unlocked: true }
    s.planets.orbital = { unlocked: true }
    s.planets.gas = { unlocked: true }
    s.buildings.militaryPort = 25
    s.resources.military = militaryCap(s)
    return s
  }

  it('足额投入成功 → 返还 ⌊invested × 0.5⌋，捷报日志含返还文案', () => {
    const s = refundState()
    const cap = militaryCap(s)
    startConquest(s, 'outpost', 2_000, 0) // 守卫 500，足额 2000 → 必成
    const militaryBefore = s.resources.military // cap − 2000
    const logs = settleConquests(s, 60 * 60_000, () => 0.999)
    expect(s.conquest.outpost.status).toBe('conquered')
    const refund = Math.floor(2_000 * CONQUEST_MILITARY_REFUND_PCT)
    expect(s.resources.military).toBe(Math.min(cap, militaryBefore + refund))
    expect(logs[0]).toContain('返还军力')
    expect(logs[0]).toContain(formatNumber(refund)) // 日志经 formatNumber 格式化（1,000.00）
  })

  it('薄投成功 → 按 invested 返还（非守卫值），不产生净增军力', () => {
    const s = refundState()
    // outpost 守卫 500，薄投 200（40% 成功率）；rng 0.2 < 0.4 → 成功
    startConquest(s, 'outpost', 200, 0)
    const militaryBefore = s.resources.military // cap − 200
    settleConquests(s, 60 * 60_000, () => 0.2)
    expect(s.conquest.outpost.status).toBe('conquered')
    const refund = Math.floor(200 * CONQUEST_MILITARY_REFUND_PCT)
    expect(s.resources.military).toBe(militaryBefore + refund)
    // 返还 ≤ 投入 → 军力不净增（防印钞）
    expect(refund).toBeLessThan(200)
    expect(s.resources.military).toBeLessThan(militaryCap(s))
  })

  it('返还受容量截断：返还入账 clamp 到 cap（返还率 <1 时仅在军力逼近 cap 的场景触发）', () => {
    const s = refundState()
    const cap = militaryCap(s)
    // 返还前军力已逼近 cap（返还空间不足）；注入大额 invested 使返还量超过剩余容量 → min(cap, ...) 截断
    s.resources.military = cap - 50
    s.conquest.outpost = { status: 'available', startedAt: 0, finishAt: 60_000, invested: 10_000 }
    settleConquests(s, 60 * 60_000, () => 0.999)
    expect(s.conquest.outpost.status).toBe('conquered')
    expect(s.resources.military).toBe(cap) // clamp 到容量上限，溢出浪费
  })

  it('失败 → 不返还（军力全损）', () => {
    const s = refundState()
    startConquest(s, 'outpost', 200, 0) // 薄投 40% 成功率
    const militaryBefore = s.resources.military
    settleConquests(s, 60 * 60_000, () => 0.9) // 0.9 > 0.4 → 失败
    expect(s.conquest.outpost.status).toBe('available')
    expect(s.resources.military).toBe(militaryBefore) // 全损，无返还
  })

  it('fleetLocked 折算不参与返还：仅按 invested 计算', () => {
    const s = refundState()
    s.buildings.dock = 1
    s.upgrades.dock = 1
    s.fleet.count = 3 // 战力 3600 → shipyard 守卫 2000×0.5=1000 锁定
    s.resources.energy = 10_000
    startConquest(s, 'shipyard', 1_000, 0, () => 0.99) // 1000 军力 + 1000 舰队 = 2000 = 守卫 → 必成
    expect(s.conquest.shipyard.fleetLocked).toBe(1_000)
    const militaryBefore = s.resources.military
    settleConquests(s, 60 * 60_000, () => 0.999)
    expect(s.conquest.shipyard.status).toBe('conquered')
    // 返还仅按 invested 1000，不按 invested+fleetLocked 2000
    const refund = Math.floor(1_000 * CONQUEST_MILITARY_REFUND_PCT)
    expect(s.resources.military).toBe(militaryBefore + refund)
  })

  it('离线结算（settleOffline → settleConquests）同口径返还', () => {
    const s = refundState()
    // 压低所有派系威胁：防离线 raid 扣军力干扰返还断言
    for (const f of Object.values(s.factions)) f.threat = 0
    startConquest(s, 'outpost', 2_000, s.lastTick)
    const militaryBefore = s.resources.military
    const refund = Math.floor(2_000 * CONQUEST_MILITARY_REFUND_PCT)
    const off = settleOffline(s, s.lastTick + 2 * 3600 * 1000, () => 0)
    expect(off.conquestLogs.length).toBe(1)
    expect(off.conquestLogs[0]).toContain('捷报')
    expect(s.resources.military).toBe(militaryBefore + refund)
  })

  it('静态/动态/boss 统一适用：生成目标成功后同样返还', () => {
    const s = refundState()
    s.phase = 'infinite'
    s.endingTriggered = true
    const gt = generateConquestTarget(s, () => 0.5)
    s.generatedTargets.push(gt)
    s.conquest[gt.id] = { status: 'available' }
    const guard = gt.guard!
    startConquest(s, gt.id, guard, 0)
    const militaryBefore = s.resources.military
    const refund = Math.floor(guard * CONQUEST_MILITARY_REFUND_PCT)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.conquest[gt.id].status).toBe('conquered')
    expect(s.resources.military).toBe(militaryBefore + refund)
  })
})

describe('engine: 运兵船 boss 集成（troop-transport，ADR-0061）', () => {
  /** boss 集成测试档：军港 25 → cap 5100、兵营 100 → 产能 50/s、池容量 50%、池内 2500 */
  function transportBossState(): GameState {
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.endingTriggered = true
    s.planets.dawn = { unlocked: true }
    s.planets.ice = { unlocked: true }
    s.resources.military = 10_000_000
    s.resources.mineral = 10_000_000_000
    s.resources.tech = 1_000_000_000
    s.buildings.miner = 100
    s.buildings.solar = 100
    s.buildings.militaryPort = 25
    s.buildings.barracks = 100
    s.transportShip = { capacityPct: 0.5, stored: 2500 }
    return s
  }

  it('boss 支付池优先：池内军力足额时主容量不动，结算返还回池（残兵归库）', () => {
    const s = transportBossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    const mainBefore = s.resources.military
    const r = startConquest(s, 'boss:L3', guard, 0)
    expect(r.ok).toBe(true)
    // 池支付：stored 2500 - guard（≈2040）≈ 460；主容量不动
    expect(s.transportShip!.stored).toBe(2500 - guard)
    expect(s.resources.military).toBe(mainBefore)
    // 结算成功：返还 ⌊guard×50%⌋ 回池
    const refund = Math.floor(guard * CONQUEST_MILITARY_REFUND_PCT)
    settleConquests(s, 30 * 60_000 + 1, () => 0)
    expect(s.conquest['boss:L3'].status).toBe('conquered')
    expect(s.transportShip!.stored).toBe(2500 - guard + refund)
    expect(s.resources.military).toBe(mainBefore) // 返还进池不进主容量
  })

  it('boss 攻占成功 +3% 池容量（周目内积累）', () => {
    const s = transportBossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    startConquest(s, 'boss:L3', guard, 0)
    settleConquests(s, 30 * 60_000 + 1, () => 0)
    expect(s.transportShip!.capacityPct).toBeCloseTo(0.53, 10) // 0.5 + 0.03
  })

  it('静态 4 区攻占成功 +5% 池容量（周目内积累）', () => {
    const s = transportBossState()
    startConquest(s, 'outpost', 500, 0) // outpost 守卫 500，ice 已解锁
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.conquest['outpost'].status).toBe('conquered')
    expect(s.transportShip!.capacityPct).toBeCloseTo(0.55, 10) // 0.5 + 0.05
  })

  it('生成目标（gen: 前缀）攻占不计池容量（ADR-0012 红线）', () => {
    const s = transportBossState()
    const gt: GeneratedTarget = { kind: 'conquest', id: 'gen:conquest:1', name: 'gen 目标', desc: '', batch: 0, guard: 500 }
    s.generatedTargets.push(gt)
    s.conquest['gen:conquest:1'] = { status: 'available' }
    startConquest(s, 'gen:conquest:1', 500, 0)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.conquest['gen:conquest:1'].status).toBe('conquered')
    expect(s.transportShip!.capacityPct).toBeCloseTo(0.5, 10) // 不变
  })

  it('池不足时主容量全量补（boss 突破安全垫，ADR-0061 修订）；池+主容量总量不足则拒绝', () => {
    const s = transportBossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    // 池 100 + 主容量（全量可付，含安全垫部分）610 < 守卫 → 拒绝
    s.transportShip!.stored = 100
    s.resources.military = Math.floor(militaryCap(s) * 0.1) // 主容量恰好安全垫（510）
    const r = startConquest(s, 'boss:L3', guard, 0)
    expect(r.ok).toBe(false) // 池 100 + 主容量 510 = 610 < guard
    expect(s.transportShip!.stored).toBe(100) // 支付不变
    expect(s.resources.military).toBe(Math.floor(militaryCap(s) * 0.1))
    // boss 突破安全垫：主容量低于安全垫但池+主容量 ≥ 守卫 → 仍可发起（主容量全量可付）
    const s2 = transportBossState()
    s2.endless.layer = 3
    ensureEndlessBoss(s2)
    s2.transportShip!.stored = guard - 400 // 池补足差额（池容量 2805 ≥ 1640）
    s2.resources.military = 400 // 低于安全垫 510
    expect(startConquest(s2, 'boss:L3', guard, 0).ok).toBe(true)
    expect(s2.transportShip!.stored).toBe(0) // 池优先全额支付（1640）
    expect(s2.resources.military).toBe(0) // 主容量补剩余 400（突破安全垫全付）
    // 池+主容量总量不足 → 拒绝
    s.transportShip!.stored = 100
    s.resources.military = 300
    expect(startConquest(s, 'boss:L3', guard, 0).ok).toBe(false)
    expect(s.transportShip!.stored).toBe(100)
  })

  it('守卫可支付上限约束（死锁修复，2026-08-14）：守卫 ≤ 主容量上限 + 运兵船池容量（投满必成）', () => {
    const s = transportBossState()
    // 高层数：原公式容量项 ⌊cap/3⌋×(1+0.10×(layer-1)) 随层数放大可超玩家总量上限 →
    // 必须被「主容量 + 池容量」封顶，保证玩家总能凑齐军力发起
    s.endless.layer = 30
    const guard = endlessBossGuard(s, 30)
    const maxPay = militaryCap(s) + transportCapacity(s)
    expect(guard).toBeLessThanOrEqual(maxPay)
    // 池全量 + 主容量满 → 可付（投满守卫必成，而非「守卫 > 兵力上限+运兵船上限」的不可达死锁）
    s.transportShip!.stored = transportCapacity(s)
    s.resources.military = militaryCap(s)
    expect(bossCanPay(s, guard)).toBe(true)
    // 守卫仍 ≥ 500 保底（不因封顶塌 0）
    expect(guard).toBeGreaterThanOrEqual(500)
  })

  it('存量 boss 守卫快照刷新（死锁修复，2026-08-14）：已存在目标守卫超限时收敛到当前公式值（含可支付上限）', () => {
    const s = transportBossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const id = 'boss:L3'
    // 人为制造超限快照（旧档场景：守卫公式未含可支付上限时生成的固化守卫）
    const t = s.generatedTargets.find((x) => x.id === id)!
    t.guard = militaryCap(s) * 10 // 远超任何可支付能力
    // 重新 ensure → 刷新为当前公式值（含可支付上限约束），不重复注入
    expect(ensureEndlessBoss(s)).toBe(id)
    const refreshed = s.generatedTargets.find((x) => x.id === id)!
    expect(refreshed.guard).toBe(endlessBossGuard(s, 3))
    expect(refreshed.guard).toBeLessThanOrEqual(militaryCap(s) + transportCapacity(s))
    expect(s.generatedTargets.filter((x) => x.id === id)).toHaveLength(1)
  })

  it('军力浮点残差不阻塞 boss 发起（死锁修复，2026-08-14）：462,335.9999 级残差按 ceil 判付', () => {
    const s = transportBossState()
    s.endless.layer = 3
    ensureEndlessBoss(s)
    const guard = s.generatedTargets.find((x) => x.id === 'boss:L3')!.guard!
    // 池全量 + 主容量满（带浮点残差）：ceil(462335.9999)=462336 ≥ remaining → 可付
    s.transportShip!.stored = guard // 池全量恰好覆盖守卫 → 主容量零补足
    s.resources.military = 462_335.9999
    expect(bossCanPay(s, guard)).toBe(true)
    // 扣费不扣成负数：军力残差侧实扣封顶
    expect(startConquest(s, 'boss:L3', guard, 0).ok).toBe(true)
    expect(s.resources.military).toBeGreaterThanOrEqual(0)
  })
})

describe('engine: 发起失败不消耗资源（扣费顺序回归）', () => {
  it('资源费不足（costMineral 不够）→ 发起失败，军力不白扣、不写 conquest 态', () => {
    const s = conquestState()
    const gt: GeneratedTarget = { kind: 'conquest', id: 'gen:conquest:fail', name: 'x', desc: '', batch: 0, guard: 500, costMineral: 9_000_000, costEnergy: 0 }
    s.generatedTargets.push(gt)
    s.conquest['gen:conquest:fail'] = { status: 'available' }
    s.resources.mineral = 1_000 // 不够 costMineral
    s.resources.military = 50_000
    const r = startConquest(s, 'gen:conquest:fail', 500, 0)
    expect(r.ok).toBe(false)
    expect(s.resources.military).toBe(50_000) // 军力不白扣（校验通过后才扣）
    expect(s.resources.mineral).toBe(1_000)
    expect(s.conquest['gen:conquest:fail'].startedAt).toBeUndefined()
  })
})
