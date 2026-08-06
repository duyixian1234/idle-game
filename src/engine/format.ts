/** 中文大数字单位（每 4 位十进制一级）。 */
export const BIG_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'] as const

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
 * Chinese unit formatting for game values.
 *
 * Values below 10000 keep zh-CN grouping; values from 10000 use one of the
 * four-digit Chinese units and retain two decimal places. Rounding is done
 * before choosing the unit so values such as 999999.995 carry into 100.00万.
 */
export function formatBigNumber(n: number): string {
  if (!Number.isFinite(n)) return formatPlainNumber(n)
  const absolute = Math.abs(n)
  const rounded = roundHalfAwayFromZero(absolute)
  const sign = n < 0 && rounded !== 0 ? '-' : ''
  if (rounded < 10_000) return `${sign}${formatPlainNumber(rounded)}`

  let order = Math.min(Math.floor(Math.log10(rounded) / 4), BIG_UNITS.length - 1)
  let scaled = rounded / 10 ** (order * 4)
  scaled = roundHalfAwayFromZero(scaled)
  if (scaled >= 10_000 && order < BIG_UNITS.length - 1) {
    order += 1
    scaled = roundHalfAwayFromZero(rounded / 10 ** (order * 4))
  }
  return `${sign}${formatPlainNumber(scaled)}${BIG_UNITS[order]}`
}

/** UI resource/cost values use the compact Chinese-unit form. */
export function formatNumber(n: number): string {
  return formatBigNumber(n)
}

/** Signed per-second rate with the localized business unit. */
export function formatRate(n: number, showPlus = true): string {
  const sign = showPlus && n > 0 ? '+' : ''
  return `${sign}${formatNumber(n)}/秒`
}

/** Percentage points with the localized business unit. */
export function formatPercent(n: number): string {
  return `${formatNumber(n)}%`
}

/** Multipliers with the localized business unit. */
export function formatMultiplier(n: number): string {
  return `${formatNumber(n)}倍`
}

/** 通关时长格式化 */
export function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h <= 0) return `${m}分钟`
  return `${h}小时${m}分`
}
