import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import {
  applyEvent,
  createEventInstance,
  pickEventDef,
  raidableFaction,
  RAID_THREAT_LOSS,
  RAID_IGNORE_LOSS_PCT,
  settleOfflineRaids,
} from './events'
import { factionAlliance } from './diplomacy'
import type { GameState } from './types'

/** 构造状态：解锁轨道工厂站并给足资源；仅铁卫为骚扰源（其余派系威胁归零，保证确定性） */
function raiderState(): GameState {
  const s = createInitialState(0)
  s.planets.orbital = { unlocked: true }
  s.resources.mineral = 1_000_000
  s.resources.energy = 1_000_000
  s.resources.tech = 100_000
  s.resources.military = 100_000
  s.factions.ferro.favor = 90
  s.factions.vox.threat = 0
  s.factions.cygnus.threat = 0
  s.factions.lumen.threat = 0
  return s
}

describe('engine: 派系骚扰（raid）', () => {
  it('raidableFaction：threat ≥55 未结盟派系为骚扰源，取威胁最高者', () => {
    const s = createInitialState(0)
    // 初始 threat：铁卫 70 / 沃克斯 60 / 天鹅 50 / 圣光 40
    expect(raidableFaction(s)?.id).toBe('ferro')
    // 铁卫威慑降 threat 到 45 → 沃克斯（60）成为最高威胁源
    s.factions.ferro.threat = 45
    expect(raidableFaction(s)?.id).toBe('vox')
    // 全部低于阈值 → 无骚扰源
    s.factions.vox.threat = 50
    expect(raidableFaction(s)).toBeNull()
  })

  it('结盟派系永不骚扰（免疫）', () => {
    const s = raiderState()
    expect(raidableFaction(s)?.id).toBe('ferro')
    // 结盟需要好感 ≥80 且资源足
    expect(factionAlliance(s, 'ferro')).toEqual({ ok: true })
    expect(raidableFaction(s)).toBeNull() // 铁卫免疫后无骚扰源（其余已归零）
  })

  it('pickEventDef：有骚扰源时 raid 进入候选（可被选中）', () => {
    const s = raiderState()
    // rng 返回 0.999… → 命中最后一项；raid 权重 2/总权重 11 → 0.9 落在 raid 区间
    const def = pickEventDef(s, () => 0.95)
    expect(def.id).toBe('raid')
    // 无骚扰源时 raid 不参与候选（0.95 命中 bug）
    const s2 = createInitialState(0)
    s2.factions.ferro.threat = 0
    s2.factions.vox.threat = 0
    s2.factions.cygnus.threat = 0
    s2.factions.lumen.threat = 0
    expect(pickEventDef(s2, () => 0.95).id).not.toBe('raid')
  })

  it('createEventInstance：raid 数值固化（strength = threat×200）', () => {
    const s = raiderState()
    const inst = createEventInstance(s, 'raid', () => 0)
    expect(inst.defId).toBe('raid')
    expect(inst.payload?.factionId).toBe('ferro')
    expect(inst.payload?.strength).toBe(70 * 200)
    expect(inst.options.map((o) => o.id)).toEqual(['repel', 'buyoff', 'ignore'])
  })

  it('军力击退：扣军力、威胁 −15', () => {
    const s = raiderState()
    const inst = createEventInstance(s, 'raid', () => 0)
    const before = s.factions.ferro.threat
    const out = applyEvent(s, inst, 'repel')
    expect(out.changed).toBe(true)
    expect(s.resources.military).toBe(100_000 - 70 * 200)
    expect(s.factions.ferro.threat).toBe(before - RAID_THREAT_LOSS)
  })

  it('军力不足击退失败（warning）', () => {
    const s = raiderState()
    s.resources.military = 100
    const inst = createEventInstance(s, 'raid', () => 0)
    const out = applyEvent(s, inst, 'repel')
    expect(out.logType).toBe('warning')
    expect(out.changed).toBe(false)
    expect(s.resources.military).toBe(100)
  })

  it('买平安：扣矿物、好感 +5', () => {
    const s = raiderState()
    const before = s.factions.ferro.favor
    const inst = createEventInstance(s, 'raid', () => 0)
    const out = applyEvent(s, inst, 'buyoff')
    expect(out.changed).toBe(true)
    expect(s.factions.ferro.favor).toBe(before + 5)
    expect(s.resources.mineral).toBe(1_000_000 - Number(inst.payload?.buyoff ?? 0))
  })

  it('无视：矿/能各 −5%', () => {
    const s = raiderState()
    const inst = createEventInstance(s, 'raid', () => 0)
    const out = applyEvent(s, inst, 'ignore')
    expect(out.changed).toBe(true)
    expect(s.resources.mineral).toBe(1_000_000 * (1 - RAID_IGNORE_LOSS_PCT))
    expect(s.resources.energy).toBe(1_000_000 * (1 - RAID_IGNORE_LOSS_PCT))
  })
})

describe('engine: 离线骚扰结算', () => {
  it('军力足够时自动击退（扣军力、威胁递减），无资源损失', () => {
    const s = raiderState()
    const gains = { mineral: 10_000, energy: 5_000, tech: 100, military: 0 }
    const r = settleOfflineRaids(s, 2 * 3600, gains) // 2 小时 = 2 次
    expect(r.repelled).toBe(2)
    // 离线结算 terms 一次固化（与事件 payload 固化口径一致）：两次均按 strength = 70×200
    expect(s.factions.ferro.threat).toBe(70 - 2 * RAID_THREAT_LOSS)
    expect(s.resources.military).toBe(100_000 - 2 * 70 * 200)
    expect(r.mineralLost).toBe(0)
    expect(r.logs.length).toBe(1)
  })

  it('军力不足时按无视损失，封顶离线产出 30%', () => {
    const s = raiderState()
    s.resources.military = 0
    s.resources.mineral = 10_000
    s.resources.energy = 10_000
    const gains = { mineral: 1_000, energy: 500, tech: 100, military: 0 }
    const r = settleOfflineRaids(s, 2 * 3600, gains)
    // cap = 1000 × 0.3 = 300；每次 5%（500）→ 第一次 300、第二次 0
    expect(r.mineralLost).toBe(300)
    expect(s.resources.mineral).toBe(10_000 - 300)
    expect(r.repelled).toBe(0)
  })

  it('离线时长不足一个骚扰间隔则不结算', () => {
    const s = raiderState()
    const r = settleOfflineRaids(s, 30 * 60, { mineral: 1000, energy: 500, tech: 100, military: 0 })
    expect(r.logs).toEqual([])
    expect(r.repelled).toBe(0)
  })

  it('全部派系低于阈值或已结盟时无离线骚扰', () => {
    const s = createInitialState(0)
    s.factions.ferro.threat = 30
    s.factions.vox.threat = 30
    const r = settleOfflineRaids(s, 8 * 3600, { mineral: 1000, energy: 500, tech: 100, military: 0 })
    expect(r.logs).toEqual([])
  })
})
