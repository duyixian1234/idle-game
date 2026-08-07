import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { resolveEvent, triggerRandomEvent } from './events'
import { equivalentFleet, escortFee, escortFeePerShip, escortHarvestMult } from './exploration'
import { FLEET_HARVEST_PCT_PER_SHIP, TECH_UPGRADE_GROWTH } from './balance'

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
      expect(escortFee(s)).toBe(Math.floor(escortFeePerShip(s) * E))
      expect(escortHarvestMult(s)).toBeCloseTo(1 + FLEET_HARVEST_PCT_PER_SHIP * E)
    }
  })

  it('星舰线科技点出口容量量级：Lv1-20 累计 ≈ 11.6 亿（> 枢纽 5000 万 ×20，出口容量两个数量级）', () => {
    let total = 0
    for (let lv = 0; lv < 20; lv++) total += Math.ceil(20_000 * Math.pow(TECH_UPGRADE_GROWTH, lv))
    expect(total).toBeGreaterThan(1_000_000_000)
    expect(total).toBeLessThan(1_300_000_000)
  })
})
