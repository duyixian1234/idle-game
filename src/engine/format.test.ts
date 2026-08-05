import { describe, expect, it } from 'vitest'
import { formatBigNumber, formatNumber } from './format'

describe('engine: 大数字中文缩写', () => {
  it('1 万以下按整数千分位显示', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(9999)).toBe('9,999')
  })

  it('1 万级显示 x.x万', () => {
    expect(formatNumber(12_000)).toBe('1.2万')
    expect(formatNumber(123_456)).toBe('12.3万')
  })

  it('亿/兆逐级进位', () => {
    expect(formatNumber(123_456_789)).toBe('1.23亿')
    expect(formatNumber(1_234_567_890_123)).toBe('1.23兆')
  })

  it('更高单位（京/垓）', () => {
    expect(formatNumber(1e16)).toBe('1京')
    expect(formatNumber(1.5e20)).toBe('1.5垓')
  })

  it('负数加负号', () => {
    expect(formatBigNumber(-12_000)).toBe('-1.2万')
  })

  it('尾数去除多余小数零', () => {
    expect(formatNumber(10_000)).toBe('1万')
    expect(formatNumber(100_000)).toBe('10万')
    expect(formatNumber(1_000_000)).toBe('100万')
  })

  it('非有限数显示 ∞', () => {
    expect(formatBigNumber(Infinity)).toBe('∞')
  })
})
