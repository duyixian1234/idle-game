import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { resolveEvent, triggerRandomEvent } from './events'
import { equivalentFleet, escortFee, escortFeePerShip, escortHarvestMult, expeditionMilitaryCost } from './exploration'
import { FLEET_HARVEST_PCT_PER_SHIP, TECH_UPGRADE_GROWTH, COERCION_UNLOCK_MILITARY_CAP, MILITARY_CAP_TECH_PER_LEVEL, WARP_EXPEDITION_COST_REDUCTION, WARP_ESCORT_FEE_REDUCTION } from './balance'
import { militaryCap } from './production'

function simulate(seed: number) {
  const state = createInitialState(0, seed)
  state.resources.mineral = 1_000_000_000
  state.resources.energy = 1_000_000_000
  state.resources.tech = 1_000_000_000
  state.resources.military = 1_000_000_000
  state.buildings.miner = 10
  state.buildings.solar = 10
  const counts: Record<string, number> = {}
  let resolved = 0

  for (let i = 0; i < 120; i += 1) {
    triggerRandomEvent(state)
    const instance = state.pendingEvents[0]
    if (!instance) continue
    counts[instance.defId] = (counts[instance.defId] ?? 0) + 1
    const outcome = resolveEvent(state, instance.uid, instance.options[0]?.id ?? '')
    if (outcome.changed) resolved += 1
  }

  return { counts, resolved, resources: { ...state.resources }, rngCounters: { ...state.rngCounters } }
}

describe('balance: deterministic event simulation', () => {
  it('固定种子在事件选择、处理率和资源净变化上可重放', () => {
    const first = simulate(0xdecafbad)
    const second = simulate(0xdecafbad)

    expect(second).toEqual(first)
    expect(Object.values(first.counts).reduce((sum, count) => sum + count, 0)).toBe(120)
    expect(first.resolved).toBe(120)
    expect(first.counts.trade).toBeGreaterThan(35)
    expect(first.counts.meteor).toBeGreaterThan(20)
    expect(first.counts.bug).toBeGreaterThan(10)
    expect(first.resources.mineral).toBeGreaterThan(0)
    expect(first.resources.tech).toBeGreaterThan(0)
    expect(first.rngCounters.event).toBe(120)
  })

  it('不同种子仍保持同一事件曲线的可用分布', () => {
    const samples = [1, 2, 3, 4, 5].map(simulate)
    const totals = samples.map((sample) => Object.values(sample.counts).reduce((sum, count) => sum + count, 0))
    expect(totals).toEqual([120, 120, 120, 120, 120])
    for (const sample of samples) {
      expect(sample.resolved).toBe(120)
      expect(sample.counts.trade).toBeGreaterThan(25)
      expect(sample.counts.bug).toBeGreaterThan(10)
    }
  })
})

describe('balance: 舰队战力→探索链路（fleet-power-exploration ticket 03）', () => {
  it('护航投入产出比不漂移：费/E 恒 = 每舰费、倍率增量/E 恒 = 1%（任意舰数×科技组合）', () => {
    const combos: Array<[number, number, number]> = [
      [3, 0, 0],
      [3, 5, 0],
      [3, 0, 20],
      [3, 5, 20],
      [24, 5, 20],
      [1, 3, 7],
    ]
    for (const [count, military, warp] of combos) {
      const s = createInitialState(0)
      s.phase = 'ended'
      s.buildings.dock = 1
      s.upgrades.dock = 1
      s.fleet.count = count
      s.resources.energy = 1e15
      s.techLevels.militaryTech = military
      s.techLevels.warpDrive = warp
      s.buildings.solar = 100
      s.upgrades.solar = 5
      s.buildings.miner = 100
      s.upgrades.miner = 5
      const E = equivalentFleet(s)
      expect(E).toBeCloseTo(count * (1 + 0.1 * military) * (1 + 0.1 * warp))
      // 护航费 = floor(每舰费 × E)；warp≥20 时 ×(1 − WARP_ESCORT_FEE_REDUCTION)（ADR-0026 质变）
      const fee = escortFee(s)
      const raw = Math.floor(escortFeePerShip(s) * E)
      expect(fee).toBe(warp >= 20 ? Math.floor(raw * (1 - WARP_ESCORT_FEE_REDUCTION)) : raw)
      expect(escortHarvestMult(s)).toBeCloseTo(1 + FLEET_HARVEST_PCT_PER_SHIP * E)
    }
  })

  it('星舰线科技点出口容量量级：Lv1-20 累计 ≈ 11.6 亿（> 枢纽 5000 万 ×20，出口容量两个数量级）', () => {
    let total = 0
    for (let lv = 0; lv < 20; lv++) total += Math.ceil(20_000 * Math.pow(TECH_UPGRADE_GROWTH, lv))
    expect(total).toBeGreaterThan(1_000_000_000)
    expect(total).toBeLessThan(1_300_000_000)
  })

  it('军械科技容量通道：Lv5 + 25 座军港 → 容量 7,650 ≥ 胁迫解锁阈值 5000（提前 ~32%）', () => {
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    const cap = militaryCap(s)
    expect(cap).toBe(7_650) // (100 + 200×25) × 1.5
    expect(cap).toBeGreaterThanOrEqual(COERCION_UNLOCK_MILITARY_CAP)
  })

  it('军力容量膨胀下探索派遣军力仍受 clamp 1000 封顶（不随军械等级漂移）', () => {
    for (const mil of [0, 3, 5]) {
      const s = createInitialState(0)
      s.phase = 'ended'
      s.planets.orbital = { unlocked: true }
      s.buildings.militaryPort = 25
      s.techLevels.militaryTech = mil
      s.resources.military = militaryCap(s)
      expect(expeditionMilitaryCost(s, 0)).toBeLessThanOrEqual(1000)
      expect(expeditionMilitaryCost(s, 3)).toBeLessThanOrEqual(1000)
    }
  })

  it('军械容量每级 +10%：MILITARY_CAP_TECH_PER_LEVEL 常量生效（5 级 = ×1.5）', () => {
    expect(MILITARY_CAP_TECH_PER_LEVEL).toBe(0.1)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 1
    s.techLevels.militaryTech = 5
    expect(militaryCap(s)).toBe(Math.floor(300 * (1 + MILITARY_CAP_TECH_PER_LEVEL * 5)))
  })

  it('星舰质变锚定：Lv10 派遣军力 = 0.9×原值、Lv20 护航费 = 0.9×原值（锚定产出不脱钩）', () => {
    // Lv10 派遣军力（cap 5000 → base 100）
    const s = createInitialState(0)
    s.phase = 'ended'
    s.planets.orbital = { unlocked: true }
    s.permanentBonuses['militaryCap'] = 49
    const raw = expeditionMilitaryCost(s, 0)
    s.techLevels.warpDrive = 10
    expect(expeditionMilitaryCost(s, 0)).toBe(Math.floor(raw * (1 - WARP_EXPEDITION_COST_REDUCTION)))
    // Lv20 护航费
    const f = createInitialState(0)
    f.phase = 'ended'
    f.buildings.starportMine = 1
    f.buildings.dock = 1
    f.upgrades.dock = 1
    f.fleet.count = 3
    f.buildings.solar = 100
    f.upgrades.solar = 5
    f.resources.energy = 1e15
    const rawFee = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    f.techLevels.warpDrive = 20
    const rawFee20 = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    expect(escortFee(f)).toBe(Math.floor(rawFee20 * (1 - WARP_ESCORT_FEE_REDUCTION)))
    expect(escortFeePerShip(f)).toBeGreaterThan(0)
    expect(rawFee).toBeGreaterThan(0)
  })
})
