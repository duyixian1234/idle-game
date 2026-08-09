import { describe, expect, it, afterEach } from 'vitest'
import { formatBigNumber, formatMultiplier, formatNumber, formatPercent, formatPlainNumber, formatPlayTime, formatRate, formatTimeToSave } from './format'
import { setLanguage } from '../i18n'

afterEach(() => {
  setLanguage('zh', false)
})

describe('engine: 用户可见数值格式化', () => {
  it('固定两位小数并使用千位分隔符', () => {
    expect(formatNumber(0)).toBe('0.00')
    expect(formatNumber(999)).toBe('999.00')
    expect(formatNumber(9999)).toBe('9,999.00')
    expect(formatPlainNumber(12.345)).toBe('12.35')
    expect(formatPlainNumber(1.005)).toBe('1.01')
    expect(formatPlainNumber(-1.005)).toBe('-1.01')
  })

  it('从 10000 起使用中文四位单位并固定两位小数', () => {
    expect(formatNumber(10_000)).toBe('1.00万')
    expect(formatNumber(123_456)).toBe('12.35万')
    expect(formatNumber(123_456_789)).toBe('1.23亿')
  })

  it('舍入进位会提升中文单位', () => {
    expect(formatNumber(999_999.995)).toBe('100.00万')
    expect(formatNumber(99_999_999.995)).toBe('1.00亿')
  })

  it('负数、极小值和特殊值遵循约定', () => {
    expect(formatBigNumber(-12_000)).toBe('-1.20万')
    expect(formatNumber(-0.001)).toBe('0.00')
    expect(formatPlainNumber(Infinity)).toBe('∞')
    expect(formatPlainNumber(-Infinity)).toBe('-∞')
    expect(formatPlainNumber(Number.NaN)).toBe('—')
  })

  it('业务单位使用本地化后缀', () => {
    expect(formatRate(1.2)).toBe('+1.20/秒')
    expect(formatRate(-1.2)).toBe('-1.20/秒')
    expect(formatPercent(12.5)).toBe('12.50%')
    expect(formatMultiplier(1.5)).toBe('1.50倍')
  })

  it('通关时长与相对价格（zh 契约不变）', () => {
    expect(formatPlayTime(45)).toBe('0分钟')
    expect(formatPlayTime(3_600 + 1_200)).toBe('1小时20分')
    expect(formatTimeToSave(30)).toBe('≈30 秒产出')
    expect(formatTimeToSave(300)).toBe('≈5 分钟产出')
    expect(formatTimeToSave(3_600 * 2)).toBe('≈2 小时产出')
  })

  it('i18n en：三位单位 + 英文后缀，两位小数定式不变', () => {
    setLanguage('en', false)
    // 英文三位进制：K/M/B/T（<1000 保留千分位）
    expect(formatNumber(999)).toBe('999.00')
    expect(formatNumber(12345)).toBe('12.35K')
    expect(formatNumber(999_999.995)).toBe('1.00M')
    expect(formatNumber(1_234_567_890)).toBe('1.23B')
    expect(formatNumber(1.2e12)).toBe('1.20T')
    expect(formatRate(1.2)).toBe('+1.20/s')
    expect(formatRate(-1.2)).toBe('-1.20/s')
    expect(formatMultiplier(1.5)).toBe('×1.50')
    expect(formatPlayTime(45)).toBe('0 min')
    expect(formatPlayTime(3_600 + 1_200)).toBe('1h 20m')
    expect(formatTimeToSave(300)).toBe('≈5 min of production')
    expect(formatTimeToSave(3_600 * 2)).toBe('≈2 h of production')
  })
})
