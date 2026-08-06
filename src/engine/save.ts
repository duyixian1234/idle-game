import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'
import { ACHIEVEMENTS, achievementUnlocked } from './achievements'
import { randSeed } from './rng'
import type { MigrationSummary } from './types'
import { formatNumber } from './format'

/** 首个支持 techLevels 等级化的 schema 版本 */
const SCHEMA_V1 = 1
/** 首个支持军力资源/区域攻占的 schema 版本 */
const SCHEMA_V2 = 2
/** 首个支持成就系统的 schema 版本（v3 基础上加 achievements 解锁集合） */
const SCHEMA_V3 = 3
/** 首个支持固定随机种子/分域计数器的 schema 版本（v4 基础上加 seed + rngCounters） */
const SCHEMA_V4 = 4
/** 首个支持探索系统的 schema 版本（v5 基础上加 expeditions/exploredFactions/exploredPlanets/nextExpeditionId/stats.explorations） */
const SCHEMA_V5 = 5
/** 当前 schema 版本（写死，防未来升级后迁移函数标错版本导致跳级） */
const SCHEMA_V6 = 6
/** 首个支持终局抉择的 schema 版本（v6 基础上加 megastructureChoice，null = 未选择） */
const SCHEMA_V7 = 7
/** 首个支持舰队的 schema 版本（v7 基础上加 fleet.count，默认 0） */
const SCHEMA_V8 = 8
/** 首个支持无尽事件池状态的存档版本 */
const SCHEMA_V9 = 9
/** 首个支持虫群强度倍率的存档版本 */
const SCHEMA_V10 = 10
/** 当前事件统一契约版本（独立于存档主 schema，避免旧系统版本跳跃） */
const EVENT_CONFIG_VERSION = 1
/** 支持的最低版本（当前全部可迁移版本） */
const MIN_SUPPORTED_VERSION = 1

// ---- 字段值检查器（与历史守卫逻辑严格等价）----

const isNumber = (v: unknown): boolean => typeof v === 'number'
const isString = (v: unknown): boolean => typeof v === 'string'
const isBoolean = (v: unknown): boolean => typeof v === 'boolean'
const isPlainObject = (v: unknown): boolean => typeof v === 'object' && v !== null
const isArray = (v: unknown): boolean => Array.isArray(v)

/** 资源表：object 且三种资源均为有限数（全档唯一查 Number.isFinite 的字段） */
function isResourceMap(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  const res = v as Record<string, unknown>
  return (['mineral', 'energy', 'tech'] as const).every((k) => typeof res[k] === 'number' && Number.isFinite(res[k]))
}

interface FieldSpec {
  key: string
  /** 字段出现的起始版本（默认全部版本） */
  since?: number
  /** 字段存在的最后版本（含） */
  until?: number
  /** 值校验器（缺省只查存在性） */
  check?: (v: unknown) => boolean
}

/**
 * 存档字段表：字段校验与版本演化（since/until）单点记录。
 * 新字段加一行即可；v1→v2 的 researched→techLevels 值转换见 migrateV1ToV2（命令式迁移）。
 */
const SAVE_SCHEMA: FieldSpec[] = [
  { key: 'schemaVersion', check: isNumber },
  { key: 'phase', check: isString },
  { key: 'endingTriggered', check: isBoolean },
  { key: 'ngPlusLevel', check: isNumber },
  { key: 'factionCodex', check: isArray },
  { key: 'permanentMult', check: isNumber },
  { key: 'permanentBonuses', since: 3, check: isPlainObject },
  { key: 'conquest', since: 3, check: isPlainObject },
  { key: 'stats', check: isPlainObject },
  { key: 'achievements', since: 4, check: isPlainObject },
  { key: 'seed', since: 5, check: isNumber },
  { key: 'rngCounters', since: 5, check: isPlainObject },
  { key: 'expeditions', since: 6, check: isArray },
  { key: 'exploredFactions', since: 6, check: isArray },
  { key: 'exploredPlanets', since: 6, check: isArray },
  { key: 'nextExpeditionId', since: 6, check: isNumber },
  { key: 'megastructureChoice', since: 7, check: (v) => v === null || v === 'smelter' || v === 'jumpgate' },
  { key: 'fleet', since: 8, check: (v) => isPlainObject(v) && typeof (v as { count?: unknown }).count === 'number' },
  { key: 'bugEscalation', since: SCHEMA_V10, check: isNumber },
  { key: 'resources', check: isResourceMap },
  { key: 'buildings', check: isPlainObject },
  { key: 'upgrades', check: isPlainObject },
  { key: 'researched', until: SCHEMA_V1, check: isPlainObject },
  { key: 'techLevels', since: 2, check: isPlainObject },
  { key: 'planets', check: isPlainObject },
  { key: 'activePlanet', check: isString },
  { key: 'factions', check: isPlainObject },
  { key: 'planetStaySeconds', check: isNumber },
  { key: 'lastStormHarvestAt', check: isNumber },
  { key: 'storyFlags', check: isPlainObject },
  { key: 'tutorialStep', check: isNumber },
  { key: 'log', check: isArray },
  { key: 'nextLogId', check: isNumber },
  { key: 'playSeconds', check: isNumber },
  { key: 'pendingEvents', check: isArray },
  { key: 'nextEventId', check: isNumber },
  { key: 'nextEventAt', check: isNumber },
  { key: 'lastTick', check: isNumber },
  { key: 'createdAt', check: isNumber },
]

/**
 * 存档序列化：版本化 JSON 全量快照。
 * 导出/导入即该 JSON 的字符串形式。
 */
export function serializeSave(state: GameState): string {
  return JSON.stringify(state)
}

/** 校验反序列化后的存档对象结构是否合法（v1/v2 均可，v1 稍后迁移） */
export function isValidSave(raw: unknown): raw is GameState {
  if (typeof raw !== 'object' || raw === null) return false
  const s = raw as Record<string, unknown>
  // schemaVersion 范围校验保留显式：字段表过滤依赖它，无法在表内自引用
  if (typeof s.schemaVersion !== 'number') return false
  if (s.schemaVersion < MIN_SUPPORTED_VERSION || s.schemaVersion > SCHEMA_VERSION) return false
  for (const spec of SAVE_SCHEMA) {
    if (spec.since && s.schemaVersion < spec.since) continue
    if (spec.until && s.schemaVersion > spec.until) continue
    if (!(spec.key in s)) return false
    if (spec.check && !spec.check(s[spec.key])) return false
  }
  return true
}

/** v1 → v2：researched(boolean) 迁移为 techLevels(number)，true → 1 */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const researched = raw.researched as Record<string, boolean>
  const techLevels: Record<string, number> = {}
  for (const [id, researchedFlag] of Object.entries(researched)) {
    if (researchedFlag) techLevels[id] = 1
  }
  const next = { ...raw }
  delete next.researched
  next.techLevels = techLevels
  next.schemaVersion = SCHEMA_V2
  return next
}

/** v2 → v3：补齐军力资源、永久加成表与区域攻占状态（默认 0/空，区域表由引擎初始化兜底） */
function migrateV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  const resources = { ...(next.resources as Record<string, number>) }
  if (typeof resources.military !== 'number' || !Number.isFinite(resources.military)) resources.military = 0
  next.resources = resources
  next.permanentBonuses = (next.permanentBonuses as Record<string, number>) ?? {}
  next.conquest = (next.conquest as Record<string, unknown>) ?? {}
  next.schemaVersion = SCHEMA_V3
  return next
}

/**
 * v3 → v4：补齐成就解锁集合，并对存量存档做**回溯解锁**。
 * - 遍历成就定义按派生条件判定（旧档 tradeCount/conquest/storyFlags/ngPlusLevel 等历史值已在存档内）
 * - 满足则设 { unlockedAt: now, unlockedInRound: 当前周目 }——**不发资源奖励**（防「憋单等系统上线」刷双份）
 * - 声望由 reputation() 派生自动生效（unlockedInRound 匹配当前周目），符合「回溯解锁不补资源、声望照发」
 * ⚠️ 迁移链陷阱：schemaVersion 必须写死 SCHEMA_V4（不能用 SCHEMA_VERSION）——否则 SCHEMA_VERSION 升到 5
 * 后，v3 档会被直接标成 5 而跳过 v5 的 seed/rngCounters 补齐（v3→v4→v5 顺序迁移被破坏）。
 */
function migrateV3ToV4(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  const state = next as unknown as GameState
  // 先初始化 achievements（成就条件如 militaryCap5k 会经 reputation 读 achievements，防迁移中 undefined）
  const achievements: Record<string, { unlockedAt: number; unlockedInRound: number }> = {}
  next.achievements = achievements
  const round = state.ngPlusLevel ?? 0
  const now = Date.now()
  for (const def of Object.values(ACHIEVEMENTS)) {
    if (achievementUnlocked(state, def)) {
      achievements[def.id] = { unlockedAt: now, unlockedInRound: round }
    }
  }
  next.schemaVersion = SCHEMA_V4
  return next
}

/**
 * v4 → v5：补齐固定随机种子与分域计数器（fixed-rng）。
 * - 老档迁移补的 seed 是随机的：迁移前随机历史与 seed 无关，迁移后序列由新 seed 决定，无副作用。
 * - 条件补齐（字段已存在则保留）：幂等且允许测试注入固定 seed 验证迁移后引擎确定性。
 */
function migrateV4ToV5(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (typeof next.seed !== 'number') next.seed = randSeed()
  if (next.rngCounters == null) next.rngCounters = {}
  next.schemaVersion = SCHEMA_V5
  return next
}

/**
 * v5 → v6：补齐探索系统字段（exploration）。
 * - expeditions / exploredFactions / exploredPlanets 空数组、nextExpeditionId = 1、stats.explorations = 0
 * - ⚠️ 迁移链陷阱：schemaVersion 必须写死 SCHEMA_V6（不能用 SCHEMA_VERSION）——同 fixed-rng 教训，
 *   防 SCHEMA_VERSION 再升时旧档被误标当前版本而跳过后续迁移。
 */
function migrateV5ToV6(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  next.expeditions = (next.expeditions as unknown[]) ?? []
  next.exploredFactions = (next.exploredFactions as unknown[]) ?? []
  next.exploredPlanets = (next.exploredPlanets as unknown[]) ?? []
  if (typeof next.nextExpeditionId !== 'number') next.nextExpeditionId = 1
  const stats = { ...(next.stats as Record<string, number>), explorations: 0 }
  next.stats = stats
  next.schemaVersion = SCHEMA_V6
  return next
}

/**
 * v6 → v7：补齐终局抉择字段（interstellar-buildings）。
 * - megastructureChoice 缺省 null（未选择），建筑等级复用 buildings 宽松对象校验，无需额外迁移。
 * - ⚠️ 迁移链陷阱：schemaVersion 必须写死 SCHEMA_V7（不能用 SCHEMA_VERSION）——同 fixed-rng/exploration 教训。
 */
function migrateV6ToV7(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (next.megastructureChoice == null) next.megastructureChoice = null
  next.schemaVersion = SCHEMA_V7
  return next
}

/**
 * v7 → v8：补齐舰队字段（fleet spec）。
 * - fleet 缺省 { count: 0 }（字段已有则幂等保留，count 非数值补 0）。
 * - ⚠️ 迁移链陷阱：schemaVersion 必须写死 SCHEMA_V8（不能用 SCHEMA_VERSION）。
 */
function migrateV7ToV8(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (next.fleet == null || typeof next.fleet !== 'object') {
    next.fleet = { count: 0 }
  } else if (typeof (next.fleet as { count?: unknown }).count !== 'number') {
    ;(next.fleet as { count: number }).count = 0
  }

  next.schemaVersion = SCHEMA_V8
  return next
}

/** v8 → v9：补齐无尽事件池、阶段链与坏运气保护状态。 */
function migrateV8ToV9(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  const endless = isPlainObject(next.endless) ? { ...(next.endless as Record<string, unknown>) } : {}
  if (typeof endless.layer !== 'number') endless.layer = 0
  if (typeof endless.stage !== 'number') endless.stage = 0
  if (typeof endless.badLuck !== 'number') endless.badLuck = 0
  if (typeof endless.bossDefeated !== 'number') endless.bossDefeated = 0
  next.endless = endless
  next.migrationSourceVersion = SCHEMA_V8
  next.schemaVersion = SCHEMA_V9
  return next
}

/** v9 → v10：补齐虫群强度倍率，旧档从基线开始。 */
function migrateV9ToV10(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (typeof next.bugEscalation !== 'number' || !Number.isFinite(next.bugEscalation)) next.bugEscalation = 1
  if (typeof next.migrationSourceVersion !== 'number') next.migrationSourceVersion = SCHEMA_V9
  next.schemaVersion = SCHEMA_V10
  return next
}

/** 事件契约迁移：补齐统一版本，并迁移已排队的已知事件实例。 */
function migrateEventContract(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  const fromSchemaVersion =
    typeof next.migrationSourceVersion === 'number'
      ? next.migrationSourceVersion
      : typeof next.schemaVersion === 'number'
        ? next.schemaVersion
        : SCHEMA_VERSION
  delete next.migrationSourceVersion
  const hadContract = next.eventConfigVersion === EVENT_CONFIG_VERSION
  next.eventConfigVersion = EVENT_CONFIG_VERSION
  const defaultPolicies = {
    trade: { enabled: false, rules: [] },
    disaster: { enabled: false, rules: [] },
    security: { enabled: false, rules: [] },
    exploration: { enabled: false, rules: [] },
    investment: { enabled: false, rules: [] },
  }
  next.automationPolicies = isPlainObject(next.automationPolicies)
    ? { ...defaultPolicies, ...(next.automationPolicies as Record<string, unknown>) }
    : defaultPolicies
  next.automationHistory = Array.isArray(next.automationHistory) ? next.automationHistory : []
  next.hiddenPlanets = Array.isArray(next.hiddenPlanets) ? next.hiddenPlanets : []
  for (const [category, policy] of Object.entries(next.automationPolicies as Record<string, unknown>)) {
    if (!isPlainObject(policy)) {
      ;(next.automationPolicies as Record<string, unknown>)[category] = { enabled: false, rules: [] }
      continue
    }
    const normalized = policy as Record<string, unknown>
    normalized.enabled = typeof normalized.enabled === 'boolean' ? normalized.enabled : false
    normalized.rules = Array.isArray(normalized.rules) ? normalized.rules : []
  }
  const pending = Array.isArray(next.pendingEvents) ? next.pendingEvents : []
  next.pendingEvents = pending.map((item) => {
    if (!isPlainObject(item)) return item
    const event = { ...(item as Record<string, unknown>) }
    if (hadContract && event.contractVersion === EVENT_CONFIG_VERSION) return event
    if (typeof event.contractVersion !== 'number') event.contractVersion = EVENT_CONFIG_VERSION
    const metadata: Record<string, Record<string, unknown>> = {
      trade: { theme: 'trade', decisionType: 'exchange', riskLevel: 'low', priority: 'normal', handlingMode: 'queue' },
      meteor: { theme: 'disaster', decisionType: 'collect', riskLevel: 'medium', priority: 'urgent', handlingMode: 'alert' },
      bug: { theme: 'security', decisionType: 'defend', riskLevel: 'high', priority: 'urgent', handlingMode: 'blocking' },
      raid: { theme: 'security', decisionType: 'defend', riskLevel: 'high', priority: 'urgent', handlingMode: 'blocking' },
      'trade-frontier': { theme: 'trade', decisionType: 'exchange', riskLevel: 'medium', priority: 'urgent', handlingMode: 'alert', family: 'trade', variantId: 'frontier' },
      'storm-surge': { theme: 'disaster', decisionType: 'collect', riskLevel: 'high', priority: 'urgent', handlingMode: 'alert', family: 'disaster', variantId: 'surge' },
      'void-swarm': { theme: 'security', decisionType: 'defend', riskLevel: 'critical', priority: 'critical', handlingMode: 'blocking', family: 'security', variantId: 'void' },
      'endless-overseer': { theme: 'security', decisionType: 'defend', riskLevel: 'critical', priority: 'critical', handlingMode: 'blocking', family: 'boss', variantId: 'overseer', isBoss: true },
    }
    const known = metadata[String(event.defId)]
    if (known) {
      for (const [key, value] of Object.entries(known)) if (event[key] == null) event[key] = value
      event.migrationStatus = 'migrated'
    } else {
      event.priority = 'critical'
      event.handlingMode = 'blocking'
      event.migrationStatus = 'unknown'
      event.migrationNote = `未知事件 ${String(event.defId)} 已安全暂停，需人工处理`
    }
    if (event.defId === 'trade' && isPlainObject(event.payload)) {
      const payload = { ...(event.payload as Record<string, unknown>) }
      if (typeof payload.curveVersion !== 'number') payload.curveVersion = EVENT_CONFIG_VERSION
      event.payload = payload
    }
    return event
  })
  if (!hadContract) {
    const migratedEvents = (next.pendingEvents as Array<Record<string, unknown>>).filter((event) => event.migrationStatus === 'migrated').length
    const unknownEvents = (next.pendingEvents as Array<Record<string, unknown>>).filter((event) => event.migrationStatus === 'unknown').length
    const summary: MigrationSummary = {
      fromSchemaVersion,
      toSchemaVersion: SCHEMA_VERSION,
      migratedEvents,
      unknownEvents,
      compensation: {},
      notes: [
        migratedEvents > 0 ? `已迁移 ${formatNumber(migratedEvents)} 个待处理事件` : '没有需要转换的待处理事件',
        ...(unknownEvents > 0 ? [`${formatNumber(unknownEvents)} 个未知事件已安全暂停`] : []),
      ],
    }
    next.migrationSummary = summary
    const log = Array.isArray(next.log) ? (next.log as Array<Record<string, unknown>>) : []
    const nextLogId = typeof next.nextLogId === 'number' ? next.nextLogId : 1
    const time = typeof next.lastTick === 'number' ? next.lastTick : 0
    log.unshift({ id: nextLogId, type: 'system', text: `【存档迁移】${summary.notes.join('；')}。`, time })
    next.log = log.slice(0, 200)
    next.nextLogId = nextLogId + 1
  }
  next.schemaVersion = SCHEMA_V10
  return next
}

/**
 * 迁移旧版本存档到当前版本。
 * - v1 存档（有 researched 无 techLevels）→ 转 v2 → 转 v3 → 转 v4 → 转 v5 → 转 v6 → 转 v7 → 转 v8
 * - v2 存档（无军力/区域字段）→ 转 v3 → 转 v4 → 转 v5 → 转 v6 → 转 v7 → 转 v8
 * - v3 存档（无成就字段）→ 转 v4（含回溯解锁）→ 转 v5（补随机 seed）→ 转 v6（补探索字段）→ 转 v7 → 转 v8
 * - v4 存档（无 seed/rngCounters）→ 转 v5 → 转 v6 → 转 v7 → 转 v8
 * - v5 存档（无探索字段）→ 转 v6 → 转 v7 → 转 v8
 * - v6 存档（无终局抉择字段）→ 转 v7 → 转 v8
 * - v7 存档（无舰队字段）→ 转 v8
 * - 已是当前版本：原样返回
 *
 * loadGame（IndexedDB 加载路径）与 deserializeSave（导入路径）共用此入口，
 * 保证两条路径行为一致——老玩家升级 v2 后存档自动迁移（fix：线上崩溃
 *   Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'planetDrill')
 *   根因：loadGame 只校验不迁移，v1 raw.techLevels undefined → engine 读 techLevels[id] 抛错）。
 */
export function migrateSave(raw: GameState): GameState {
  let cur = raw as unknown as Record<string, unknown>
  if (cur.schemaVersion === SCHEMA_V1) cur = migrateV1ToV2(cur)
  if (cur.schemaVersion === SCHEMA_V2) cur = migrateV2ToV3(cur)
  if (cur.schemaVersion === SCHEMA_V3) cur = migrateV3ToV4(cur)
  if (cur.schemaVersion === SCHEMA_V4) cur = migrateV4ToV5(cur)
  if (cur.schemaVersion === SCHEMA_V5) cur = migrateV5ToV6(cur)
  if (cur.schemaVersion === SCHEMA_V6) cur = migrateV6ToV7(cur)
  if (cur.schemaVersion === SCHEMA_V7) cur = migrateV7ToV8(cur)
  if (cur.schemaVersion === SCHEMA_V8) cur = migrateV8ToV9(cur)
  if (cur.schemaVersion === SCHEMA_V9) cur = migrateV9ToV10(cur)
  if (cur.schemaVersion === SCHEMA_V10) cur = migrateEventContract(cur)
  return cur as unknown as GameState
}

/**
 * 反序列化：解析 JSON、校验结构并迁移旧版本。
 * 非法输入抛错，由调用方（导入入口）转为用户可读错误。
 */
export function deserializeSave(json: string): GameState {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('存档文件不是有效的 JSON')
  }
  if (!isValidSave(raw)) throw new Error('存档格式无效或版本不兼容')
  return migrateSave(raw as GameState)
}
