import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { resolveEvent, triggerRandomEvent } from './events'

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
