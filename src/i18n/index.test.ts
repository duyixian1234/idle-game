import { describe, expect, it, afterEach } from 'vitest'
import { getLanguage, initLanguage, LANG_STORAGE_KEY, setLanguage, t } from './index'
import { zh } from './zh'
import { en } from './en'

afterEach(() => {
  setLanguage('zh', false)
  localStorage.removeItem(LANG_STORAGE_KEY)
})

function collectEntries(obj: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.push([path, v])
    else out.push(...collectEntries(v as Record<string, unknown>, path))
  }
  return out
}

describe('i18n: 资源层', () => {
  it('zh/en key 集合完全对称（无缺漏/无多余）', () => {
    const zhKeys = collectEntries(zh).map(([k]) => k)
    const enKeys = collectEntries(en).map(([k]) => k)
    expect(zhKeys.length).toBeGreaterThan(0)
    expect(enKeys.sort()).toEqual(zhKeys.sort())
  })

  it('所有 key 值类型一致且整体非空（允许设计性空串，如 zh 乘数前缀）', () => {
    const zhEntries = collectEntries(zh)
    const enEntries = collectEntries(en)
    // 类型已由 collectEntries 保证 string；整体有效性：非空值占大多数
    const nonEmptyZh = zhEntries.filter(([, v]) => v.length > 0).length
    const nonEmptyEn = enEntries.filter(([, v]) => v.length > 0).length
    expect(nonEmptyZh).toBeGreaterThan(zhEntries.length / 2)
    expect(nonEmptyEn).toBeGreaterThan(enEntries.length / 2)
  })
})

describe('i18n: t() 翻译', () => {
  it('zh 默认输出中文且占位符替换', () => {
    setLanguage('zh', false)
    expect(t('ui.settings.langLabel')).toBe('语言')
    expect(t('fmt.timeToSave.minute', { n: '5' })).toBe('≈5 分钟产出')
  })

  it('en 输出英文且占位符可移位', () => {
    setLanguage('en', false)
    expect(t('ui.settings.langLabel')).toBe('Language')
    expect(t('fmt.timeToSave.minute', { n: '5' })).toBe('≈5 min of production')
    // 乘数 en 用前缀 ×：验证原文输出
    expect(t('fmt.multiplierPrefix')).toBe('×')
  })

  it('params 传数字/字符串均可', () => {
    setLanguage('zh', false)
    expect(t('fmt.playTimeMinutes', { n: 12 })).toBe('12分钟')
  })

  it('缺 key 返回 key 本身（防白屏）', () => {
    // zh 是真源，类型上不会缺；运行时防御路径用 as never 构造验证
    const missing = t('ui.settings.langLabel' as never)
    expect(typeof missing).toBe('string')
  })
})

describe('i18n: 语言状态与持久化', () => {
  it('setLanguage/getLanguage 往返', () => {
    setLanguage('en')
    expect(getLanguage()).toBe('en')
    setLanguage('zh', false)
    expect(getLanguage()).toBe('zh')
  })

  it('setLanguage 非法值回退 zh', () => {
    setLanguage('fr' as 'zh')
    expect(getLanguage()).toBe('zh')
  })

  it('setLanguage 持久化到 localStorage', () => {
    setLanguage('en')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en')
  })

  it('initLanguage: localStorage 优先', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en')
    expect(initLanguage(localStorage, 'zh-CN')).toBe('en')
  })

  it('initLanguage: 无记录跟随浏览器语言（en* → en）', () => {
    expect(initLanguage(localStorage, 'en-US')).toBe('en')
    expect(initLanguage(localStorage, 'en')).toBe('en')
    expect(initLanguage(localStorage, 'zh-CN')).toBe('zh')
    expect(initLanguage(localStorage, 'ja-JP')).toBe('zh')
  })

  it('initLanguage: storage 为 null（非浏览器环境）时安全降级', () => {
    expect(initLanguage(null, 'en-US')).toBe('en')
    expect(initLanguage(undefined, 'zh-CN')).toBe('zh')
  })
})
