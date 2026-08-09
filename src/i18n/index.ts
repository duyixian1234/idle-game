/**
 * i18n 运行时：语言单例 + 类型安全翻译函数（t）。
 *
 * - 语言是**会话 UI 偏好**：localStorage 持久化（`idle-game-lang`，与 LOG_DIR_KEY 同模式），
 *   不进存档（存档零迁移，SCHEMA 不变）。切换语言即全量重渲染，不影响 GameState。
 * - `initLanguage(storage, navigatorLang)` 由 main.ts 启动早期调用：localStorage 优先，
 *   无记录则跟随浏览器语言（`en*` → en，其余 → zh）；storage 参数注入（可传 null），
 *   本模块不直接依赖 window/localStorage，保持引擎零 DOM 约束（ADR-0001）兼容。
 * - `t(key, params?)`：key 为 `DeepKey<Zh>` 字面量联合（写错 key 编译期报错）；
 *   `{name}` 占位符替换；en 缺 key 回退 zh，zh 缺 key 返回 key 本身（防白屏）。
 * - format.ts（引擎层）经本模块读语言与 `fmt.*` 后缀——引擎 → i18n 为只读依赖。
 */
import { zh } from './zh'
import type { Zh } from './zh'
import { en } from './en'

export type { Zh } from './zh'
export type Lang = 'zh' | 'en'
export const LANGS: readonly Lang[] = ['zh', 'en']
export const LANG_STORAGE_KEY = 'idle-game-lang'

/** 深层点分路径 key：`ui.settings.langLabel` 这类字符串字面量联合；数组字段用 `${number}` 数字段（如 `story.opening.0`） */
export type DeepKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly unknown[]
      ? `${K}.${number}`
      : `${K}.${DeepKey<T[K]>}`
}[keyof T & string]

let currentLang: Lang = 'zh'

export function getLanguage(): Lang {
  return currentLang
}

/** 设置语言并持久化（persist=false 供测试/非浏览器环境） */
export function setLanguage(lang: Lang, persist = true): void {
  currentLang = lang === 'en' ? 'en' : 'zh'
  if (persist) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, currentLang)
    } catch {
      /* 非浏览器环境（引擎单测无 DOM）静默跳过持久化 */
    }
  }
}

/**
 * 启动初始化：localStorage 优先；无记录跟随浏览器语言（en* → en，其余 → zh）。
 * 返回最终语言（测试可断言）。
 */
export function initLanguage(storage: Pick<Storage, 'getItem'> | null | undefined, navigatorLang: string): Lang {
  const stored = storage?.getItem(LANG_STORAGE_KEY)
  if (stored === 'zh' || stored === 'en') {
    currentLang = stored
  } else if (navigatorLang.toLowerCase().startsWith('en')) {
    currentLang = 'en'
  } else {
    currentLang = 'zh'
  }
  return currentLang
}

function getByPath(dict: unknown, path: string): string | undefined {
  let node: unknown = dict
  for (const seg of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[seg]
  }
  return typeof node === 'string' ? node : undefined
}

export interface TranslateParams {
  [name: string]: string | number
}

/** 翻译：key 类型约束（DeepKey<Zh>）；params 中 `{name}` 占位符替换（已格式化值，翻译层不重算数字） */
export function t<K extends DeepKey<Zh>>(key: K, params?: TranslateParams): string {
  const dict = currentLang === 'en' ? en : zh
  let raw = getByPath(dict, key)
  if (raw === undefined) raw = getByPath(zh, key) // en 缺 key 回退 zh（05 翻译未全时的兜底）
  if (raw === undefined) return key // 真源缺 key：返回 key 防白屏
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
  )
}
