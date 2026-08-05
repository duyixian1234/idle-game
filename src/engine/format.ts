/** 中文大数字单位（每 4 位十进制一级） */
export const BIG_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'] as const

/** 万以上数字保留 3 位有效数字 */
const SIG_DIGITS = 3

/**
 * 中文单位缩写格式化。
 * - n < 1e4：整数（千分位）
 * - n >= 1e4：`mantissa + 单位`，mantissa 保留最多 3 位有效数字
 */
export function formatBigNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  if (n < 0) return `-${formatBigNumber(-n)}`
  if (n < 10_000) return Math.floor(n).toLocaleString('zh-CN')
  const order = Math.min(Math.floor(Math.log10(n) / 4), BIG_UNITS.length - 1)
  const scaled = n / Math.pow(10, order * 4)
  const mantissa = formatMantissa(scaled, SIG_DIGITS)
  return `${mantissa}${BIG_UNITS[order]}`
}

/** 按有效位数格式化尾数，去掉多余小数零 */
function formatMantissa(scaled: number, sig: number): string {
  const digits = scaled < 100 ? (scaled < 10 ? sig - 1 : sig - 2) : 0
  const s = scaled.toFixed(digits)
  return digits > 0 ? s.replace(/\.?0+$/, '') : s
}

/** 兼容旧名：UI 资源值/成本统一走本函数 */
export function formatNumber(n: number): string {
  return formatBigNumber(n)
}
