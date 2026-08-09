import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { applyEvent, triggerRandomEvent, settleOfflineRaids } from './events'
import { settleOffline } from './offline'
import { applyFleetMaintenance, fleetMaintenance, fleetPowered, fleetPower } from './fleet'
import { RAID_THREAT_LOSS } from './balance'
import { coercionUnlocked } from './diplomacy'
import type { GameState } from './types'
import { formatNumber } from './format'

/**
 * 舰队防御闭环测试状态：铁卫 70（强度 3500）为唯一骚扰源（其余威胁归零），
 * 星港 + 船坞 Lv1 + 3 艘护卫舰 + 能源充足 → 舰队战力 3600 ≥ 3500（可自动迎击铁卫）。
 */
function fleetRaiderState(): GameState {
  const s = createInitialState(0, 42)
  s.planets.orbital = { unlocked: true }
  s.planets.dawn = { unlocked: true }
  s.buildings.deepDrill = 6
  s.buildings.starportMine = 1
  s.buildings.dock = 1
  s.upgrades.dock = 1
  s.fleet.count = 3
  s.resources.mineral = 500_000_000
  s.resources.energy = 100_000_000
  s.resources.tech = 100_000
  s.resources.military = 100_000
  s.factions.vox.threat = 0
  s.factions.cygnus.threat = 0
  s.factions.lumen.threat = 0
  return s
}

describe('engine: 舰队自动迎击（在线）', () => {
  it('战力足够：raid 被选中时不生成事件实例，直接结算为日志（威胁 −15、不扣军力）', () => {
    const s = fleetRaiderState()
    // rng 0.95 → 命中 raid（权重池含 raid 且铁卫为骚扰源，同 raid.test.ts 先例）
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome).not.toBeNull()
    expect(outcome?.logType).toBe('system')
    expect(outcome?.logText).toContain('护卫舰队迎击')
    expect(s.pendingEvents).toHaveLength(0) // 事件卡不生成
    expect(s.factions.ferro.threat).toBe(70 - RAID_THREAT_LOSS)
    expect(s.resources.military).toBe(100_000) // 不扣军力
  })

  it('自动迎击同为"遭遇"：拦截路径置位 coercionUnlocked，解锁胁迫外交（与 applyRaid/离线结算同口径）', () => {
    const s = fleetRaiderState()
    expect(coercionUnlocked(s)).toBe(false) // 初始未解锁
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome?.logText).toContain('护卫舰队迎击')
    expect(coercionUnlocked(s)).toBe(true)
    expect(s.storyFlags['coercionUnlocked']).toBe(true)
    // 解锁叙事已入日志（与 settleOfflineRaids 文案一致）
    expect(s.log.some((l) => l.text.includes('外交压制手段已解锁'))).toBe(true)
    // 幂等：后续拦截不再重复置位（unlockCoercion 返回 false，无重复 story 日志）
    const storyCount = s.log.filter((l) => l.text.includes('外交压制手段已解锁')).length
    triggerRandomEvent(s, () => 0.95)
    expect(s.log.filter((l) => l.text.includes('外交压制手段已解锁')).length).toBe(storyCount)
  })

  it('战力不足：事件照常生成，repel 所需军力 = max(50, strength − fleetPower)（残余削减）', () => {
    const s = fleetRaiderState()
    s.fleet.count = 1 // 战力 1200 < 3500
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome).toBeNull()
    expect(s.pendingEvents).toHaveLength(1)
    const inst = s.pendingEvents[0]
    expect(inst.defId).toBe('raid')
    // 残余 = 3500 − 1200 = 2300
    expect(inst.payload?.repelCost).toBe(3500 - fleetPower(s))
    expect(inst.options[0].hint).toContain(`-${formatNumber(3500 - fleetPower(s))} 军力`)
  })

  it('残余强度公式：repelCost = max(50, strength − fleetPower)，永不低于 50（下限兜底）', () => {
    const s = fleetRaiderState()
    s.fleet.count = 2 // 战力 2400 < 3500 → 残余 1100（正常削减分支）
    triggerRandomEvent(s, () => 0.95)
    const inst = s.pendingEvents[0]
    expect(inst.payload?.repelCost).toBe(3500 - fleetPower(s))
    expect(inst.payload?.repelCost).toBeGreaterThanOrEqual(50)
  })

  it('结算口径：applyEvent repel 按残余扣军力', () => {
    const s = fleetRaiderState()
    s.fleet.count = 1
    triggerRandomEvent(s, () => 0.95)
    const inst = s.pendingEvents[0]
    const out = applyEvent(s, inst, 'repel')
    expect(out.changed).toBe(true)
    expect(s.resources.military).toBe(100_000 - (3500 - fleetPower(s)))
    expect(s.factions.ferro.threat).toBe(70 - RAID_THREAT_LOSS)
  })

  it('舰队停摆时自动迎击失效：战力归零 → raid 弹窗、repel 全量强度', () => {
    const s = fleetRaiderState()
    s.resources.energy = 1 // 停摆
    expect(fleetPowered(s)).toBe(false)
    expect(fleetPower(s)).toBe(0)
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome).toBeNull()
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].payload?.repelCost).toBe(3500)
  })

  it('舰队压制锁定期间自动迎击用可用战力：3 艘(3600) 锁 1000 → 可用 2600 < 3500 → raid 弹窗、repel 按残余', () => {
    const s = fleetRaiderState() // 3 艘战力 3600 ≥ 3500 本可自动迎击铁卫
    s.conquest['gen:conquest:0'] = { status: 'available', startedAt: 1, finishAt: 2, invested: 500, fleetLocked: 1_000 }
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome).toBeNull() // 不自动迎击（可用 2600 < 3500）
    expect(s.pendingEvents).toHaveLength(1)
    const inst = s.pendingEvents[0]
    expect(inst.payload?.repelCost).toBe(3500 - 2600) // 900，按可用战力削减
    // 锁定释放后恢复自动迎击
    delete s.conquest['gen:conquest:0'].fleetLocked
    const outcome2 = triggerRandomEvent(s, () => 0.95)
    expect(outcome2?.logText).toContain('护卫舰队迎击')
    expect(s.pendingEvents).toHaveLength(1) // 新 raid 被拦截，旧事件卡仍在（未结算）
  })
})

describe('engine: 军械科技舰队放大器（ticket 05）——倍率改变自动迎击判定边界', () => {
  /** 沃克斯 60（强度 3000）为唯一骚扰源，2 艘护卫舰（战力 2400）在无科技时不够 */
  function voxTwoShipState(): GameState {
    const s = fleetRaiderState()
    s.fleet.count = 2
    s.factions.ferro.threat = 0
    s.factions.vox.threat = 60 // 沃克斯为唯一骚扰源（fleetRaiderState 默认已归零）
    return s
  }

  it('无科技：2 艘战力 2400 < 3000 → raid 弹窗，残余 = 3000 − 2400 = 600', () => {
    const s = voxTwoShipState()
    expect(fleetPower(s)).toBeCloseTo(2 * 1200)
    const outcome = triggerRandomEvent(s, () => 0.95)
    expect(outcome).toBeNull()
    expect(s.pendingEvents[0].payload?.repelCost).toBe(3000 - 2400)
  })

  it('科技 Lv2（×1.2）：2880 仍不够 → 弹窗；Lv3（×1.3）：3120 ≥ 3000 → 自动迎击', () => {
    // Lv2 不够
    const s2 = voxTwoShipState()
    s2.techLevels.militaryTech = 2
    expect(fleetPower(s2)).toBeCloseTo(2 * 1200 * 1.2)
    expect(triggerRandomEvent(s2, () => 0.95)).toBeNull()
    expect(s2.pendingEvents).toHaveLength(1)
    // Lv3 够
    const s3 = voxTwoShipState()
    s3.techLevels.militaryTech = 3
    expect(fleetPower(s3)).toBeCloseTo(2 * 1200 * 1.3)
    const outcome = triggerRandomEvent(s3, () => 0.95)
    expect(outcome?.logText).toContain('护卫舰队迎击')
    expect(s3.pendingEvents).toHaveLength(0)
  })

  it('科技 0/1/满级倍率：×1 / ×1.1 / ×1.5（Lv5 满级 = 1.5× 基础锚点）', () => {
    const s = fleetRaiderState()
    s.fleet.count = 3
    expect(fleetPower(s)).toBeCloseTo(3 * 1200)
    s.techLevels.militaryTech = 1
    expect(fleetPower(s)).toBeCloseTo(3 * 1200 * 1.1)
    s.techLevels.militaryTech = 5
    expect(fleetPower(s)).toBeCloseTo(3 * 1200 * 1.5)
  })
})

describe('engine: 软降级（tick 维护费结算）', () => {
  it('能源 ≥ 总维护费：tick 扣费、舰队运转', () => {
    const s = fleetRaiderState()
    const maint = fleetMaintenance(s)
    const energyBefore = s.resources.energy
    tick(s, 1000)
    expect(s.resources.energy).toBeCloseTo(energyBefore - maint) // 1 秒维护费
    expect(fleetPowered(s)).toBe(true)
  })

  it('能源不足：tick 不扣费、舰队停摆（无惩罚）', () => {
    const s = fleetRaiderState()
    s.resources.energy = 1
    const before = s.resources.energy
    tick(s, 1000)
    expect(s.resources.energy).toBeCloseTo(before) // 不扣费
    expect(fleetPowered(s)).toBe(false)
  })

  it('恢复供能后自动重启：能源回到足够 → 下一 tick 扣费运转且保持运转', () => {
    const s = fleetRaiderState()
    s.resources.energy = 1
    tick(s, 1000) // 停摆期（dt=1s）
    s.resources.energy = fleetMaintenance(s) * 2 + 100 // 供能恢复（足够盈余，扣费后仍 ≥ 维护费）
    const before = s.resources.energy
    tick(s, 2000) // 推进下一 tick（dt=1s）
    expect(s.resources.energy).toBeLessThan(before) // 扣费
    expect(fleetPowered(s)).toBe(true) // 扣费后仍满足运转条件
  })

  it('0 舰无维护费', () => {
    const s = fleetRaiderState()
    s.fleet.count = 0
    const before = s.resources.energy
    tick(s, 1000)
    expect(s.resources.energy).toBeCloseTo(before)
  })
})

describe('engine: 离线同口径（整段硬扣 + 自动迎击）', () => {
  it('离线维护费整段硬扣：可为负、回归 clamp 0（防离线前压能源刷免费舰队）', () => {
    const s = fleetRaiderState()
    for (const id of Object.keys(s.factions)) s.factions[id].threat = 0 // 隔离骚扰
    s.resources.energy = 10
    const now = 0
    s.lastTick = now - 3600 * 1000 // 离线 1 小时
    settleOffline(s, now)
    // 硬扣整段：10 − 维护费×3600 → 负 → clamp 0
    expect(s.resources.energy).toBe(0)
    // 对照：同一能源下 tick 软模式不扣费（软降级语义），离线硬扣与之明确区分
    const s2 = fleetRaiderState()
    s2.resources.energy = 10
    applyFleetMaintenance(s2, 3600, false)
    expect(s2.resources.energy).toBe(10)
  })

  it('离线自动迎击优先舰队：够强不扣军力、威胁递减、无资源损失', () => {
    const s = fleetRaiderState()
    const gains = { mineral: 10_000, energy: 5_000, tech: 100, military: 0 }
    const r = settleOfflineRaids(s, 2 * 3600, gains) // 2 小时 = 2 次
    expect(r.fleetRepelled).toBe(2)
    expect(r.repelled).toBe(2)
    expect(s.resources.military).toBe(100_000) // 舰队代劳，不扣军力
    expect(s.factions.ferro.threat).toBe(70 - 2 * RAID_THREAT_LOSS)
    expect(r.mineralLost).toBe(0)
    expect(r.logs[0]).toContain('护卫舰队迎击')
  })

  it('离线舰队停摆：回退军力击退（够强），封顶 30% 不变', () => {
    const s = fleetRaiderState()
    s.resources.energy = 1 // 舰队停摆
    const gains = { mineral: 10_000, energy: 5_000, tech: 100, military: 0 }
    const r = settleOfflineRaids(s, 2 * 3600, gains)
    expect(r.fleetRepelled).toBe(0)
    expect(r.repelled).toBe(2) // 军力击退兜底
    expect(s.resources.military).toBe(100_000 - 2 * 3500)
    expect(r.mineralLost).toBe(0)
  })

  it('离线舰队停摆 + 军力也不足：回退无视扣资源，封顶 30% 不变', () => {
    const s = fleetRaiderState()
    s.resources.energy = 1 // 舰队停摆（能源 < 维护费）
    s.resources.military = 0
    s.resources.mineral = 10_000
    const gains = { mineral: 1_000, energy: 500, tech: 100, military: 0 }
    const r = settleOfflineRaids(s, 2 * 3600, gains)
    // cap = 300；每次 5% → 第一次 300、第二次 0（与无舰队时完全一致）
    expect(r.mineralLost).toBe(300)
    expect(s.resources.mineral).toBe(10_000 - 300)
    expect(r.repelled).toBe(0)
    expect(r.fleetRepelled).toBe(0)
  })

  it('离线时长不足一个骚扰间隔：无结算、无维护费影响以外的副作用', () => {
    const s = fleetRaiderState()
    const r = settleOfflineRaids(s, 30 * 60, { mineral: 1000, energy: 500, tech: 100, military: 0 })
    expect(r.logs).toEqual([])
    expect(r.repelled).toBe(0)
  })
})

describe('engine: applyFleetMaintenance 双模式', () => {
  it('hard 模式：整段硬扣可为负（离线口径）', () => {
    const s = fleetRaiderState()
    s.resources.energy = 10
    applyFleetMaintenance(s, 3600, true)
    expect(s.resources.energy).toBeCloseTo(10 - fleetMaintenance(s) * 3600)
  })

  it('soft 模式：负担不起不扣费（tick 口径）', () => {
    const s = fleetRaiderState()
    s.resources.energy = 10
    applyFleetMaintenance(s, 3600, false)
    expect(s.resources.energy).toBe(10)
  })
})
