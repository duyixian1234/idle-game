import { describe, expect, it } from 'vitest'
import { renderAsciiBar } from './panels'

describe('ui: renderAsciiBar（ui-redesign ticket 05，Q14 定案）', () => {
  it('0 比例 → 全空（默认宽度 20）', () => {
    const s = renderAsciiBar(0)
    expect(s).toContain('data-progress')
    expect(s.match(/░/g)?.length).toBe(20)
    expect(s.match(/█/g) ?? []).toHaveLength(0)
  })

  it('1 比例 → 全满', () => {
    const s = renderAsciiBar(1)
    expect(s.match(/█/g)?.length).toBe(20)
    expect(s.match(/░/g) ?? []).toHaveLength(0)
  })

  it('0.5 比例 → 半满（宽度 16）', () => {
    const s = renderAsciiBar(0.5, 16)
    expect(s.match(/█/g)?.length).toBe(8)
    expect(s.match(/░/g)?.length).toBe(8)
  })

  it('比例 clamp 到 [0,1]', () => {
    expect(renderAsciiBar(-1)).toBe(renderAsciiBar(0))
    expect(renderAsciiBar(2)).toBe(renderAsciiBar(1))
  })

  it('宽度截断：filled 四舍五入后总长 = width', () => {
    const s = renderAsciiBar(0.333, 10)
    expect((s.match(/[█░]/g) ?? []).length).toBe(10)
  })
})
