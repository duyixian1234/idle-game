import { getLanguage, t } from '../i18n'

/** 中文大数字单位（每 4 位十进制一级）——i18n：zh 语言分支。 */
const ZH_BIG_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'] as const
/** 英文大数字单位（每 3 位十进制一级，K/M/B/T…）——i18n：en 语言分支。 */
const EN_BIG_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const

const FRACTION_DIGITS = 2
const ROUNDING_EPSILON = 1e-9

/**
 * Round decimal values half-up, with ties away from zero.
 *
 * The game stores ordinary IEEE-754 numbers, so a small fixed epsilon keeps
 * decimal ties such as 1.005 on the expected side without shifting integers.
 */
function roundHalfAwayFromZero(n: number, digits = FRACTION_DIGITS): number {
  const factor = 10 ** digits
  const sign = n < 0 ? -1 : 1
  const absolute = Math.abs(n)
  return sign * Math.round((absolute + ROUNDING_EPSILON) * factor) / factor
}

/** Render a finite number with exactly two decimals and zh-CN grouping. */
export function formatPlainNumber(n: number): string {
  if (Number.isNaN(n)) return '—'
  if (n === Infinity) return '∞'
  if (n === -Infinity) return '-∞'
  const rounded = roundHalfAwayFromZero(n)
  const sign = rounded < 0 ? '-' : ''
  const absolute = Math.abs(rounded).toFixed(FRACTION_DIGITS)
  const [integer, fraction] = absolute.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${grouped}.${fraction}`
}

/**
 * Localized unit formatting for game values.
 *
 * Values below the localized threshold keep zh-CN/en grouping; larger values use
 * per-language units (zh: 万/亿/兆… 4-digit; en: K/M/B/T… 3-digit) with two
 * decimal places. Rounding is done before choosing the unit so values such as
 * 999999.995 carry into the next unit. Two-decimal contract (formatNumber(1)==='1.00',
 * ADR-0016) is language-independent.
 */
export function formatBigNumber(n: number): string {
  if (!Number.isFinite(n)) return formatPlainNumber(n)
  const lang = getLanguage()
  const units = lang === 'en' ? EN_BIG_UNITS : ZH_BIG_UNITS
  const base = lang === 'en' ? 3 : 4
  const threshold = 10 ** base
  const absolute = Math.abs(n)
  const rounded = roundHalfAwayFromZero(absolute)
  const sign = n < 0 && rounded !== 0 ? '-' : ''
  if (rounded < threshold) return `${sign}${formatPlainNumber(rounded)}`

  let order = Math.min(Math.floor(Math.log10(rounded) / base), units.length - 1)
  let scaled = rounded / 10 ** (order * base)
  scaled = roundHalfAwayFromZero(scaled)
  if (scaled >= threshold && order < units.length - 1) {
    order += 1
    scaled = roundHalfAwayFromZero(rounded / 10 ** (order * base))
  }
  return `${sign}${formatPlainNumber(scaled)}${units[order]}`
}

/** UI resource/cost values use the compact Chinese-unit form. */
export function formatNumber(n: number): string {
  return formatBigNumber(n)
}

/** Signed per-second rate with the localized business unit. */
export function formatRate(n: number, showPlus = true): string {
  const sign = showPlus && n > 0 ? '+' : ''
  return `${sign}${formatNumber(n)}${t('fmt.ratePerSec')}`
}

/** Percentage points with the localized business unit. */
export function formatPercent(n: number): string {
  return `${formatNumber(n)}%`
}

/** Multipliers with the localized business unit（zh: 2.00倍；en: ×2.00，乘号在前）。 */
export function formatMultiplier(n: number): string {
  return `${t('fmt.multiplierPrefix')}${formatNumber(n)}${t('fmt.multiplierSuffix')}`
}

/** 通关时长格式化（i18n：fmt.playTimeMinutes/Hours，裸数字占位）。 */
export function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h <= 0) return t('fmt.playTimeMinutes', { n: String(m) })
  return t('fmt.playTimeHours', { h: String(h), m: String(m) })
}

/**
 * 相对价格显示（cost-softcap Q10，ticket 02）：成本相对当前产出要攒多久（秒）。
 * 瓶颈资源口径：N = max(成本ᵢ / 产出ᵢ)，只统计成本 > 0 且有正产出的资源项；
 * 无有效资源项（全成本为 0 或产出全 ≤0）返回 null（调用方显示占位）。
 */
export function timeToSave(cost: Record<string, number>, production: Record<string, number>): number | null {
  let bottleneck = 0
  let hasValid = false
  for (const key of Object.keys(cost)) {
    const c = cost[key]
    const p = production[key] ?? 0
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(p) || p <= 0) continue
    hasValid = true
    const seconds = c / p
    if (seconds > bottleneck) bottleneck = seconds
  }
  return hasValid ? bottleneck : null
}

/** 秒数 → 「≈N 秒/分钟/小时」文案（s<60、分<3600、其余小时，向上取整，防「0 秒」误导；i18n：fmt.timeToSave.*） */
export function formatTimeToSave(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 60) return t('fmt.timeToSave.second', { n: String(s) })
  const minutes = Math.ceil(s / 60)
  if (minutes < 60) return t('fmt.timeToSave.minute', { n: String(minutes) })
  const hours = Math.ceil(minutes / 60)
  return t('fmt.timeToSave.hour', { n: String(hours) })
}
