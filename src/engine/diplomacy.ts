import { t } from '../i18n'
import { ALL_FACTIONS, EXPLORE_FACTIONS, FACTIONS, RESOURCE_KEYS } from './data'
import type { FactionDef } from './data'
import { isEndlessTargetId } from './generate'
import { compactTargetOnArchive } from './archive'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  COERCION_UNLOCK_FLAG,
  COERCION_UNLOCK_MILITARY_CAP,
  EXTORT_COST_GROWTH,
  EXTORT_ENERGY_COST,
  EXTORT_FAVOR_LOSS,
  EXTORT_MILITARY_PCT,
  EXTORT_MINERAL_BASE,
  EXTORT_OFFER_MULT,
  EXTORT_OFFER_PCT,
  EXTORT_THREAT_GAIN,
  FAVOR_CAP,
  FEDERATION_FAVOR_THRESHOLD,
  INTIMIDATE_BASE_COST,
  INTIMIDATE_COST_GROWTH,
  INTIMIDATE_FAVOR_LOSS,
  INTIMIDATE_THREAT_LOSS,
  TECH_SHARE_COST,
  TECH_SHARE_FAVOR_GAIN,
  TRADE_BASE_COST,
  TRADE_COST_GROWTH,
  TRADE_FAVOR_GAIN,
  DIPLO_AUTO_FAVOR_THRESHOLD,
  DIPLO_AUTO_COOLDOWN_MS,
  DIPLO_AUTO_BUDGET_RATIO,
  TREATY_COST_GROWTH,
  TREATY_DURATION_MS,
  TREATY_ENERGY_COST,
  TREATY_EXPIRE_THREAT_GAIN,
  SUBJUGATE_FAVOR_MAX,
  SUBJUGATE_THREAT_MIN,
  SUBJUGATE_MILITARY_PCT,
  SUBJUGATE_LOCK_PCT,
  REVOLT_THREAT_GAIN,
  REVOLT_FAVOR_RESET,
  ATONE_MINERAL_BASE,
  ATONE_COST_GROWTH,
  ATONE_DURATION_MS,
  ATONE_TRADE_FAVOR_MULT,
} from './balance'
import { playMilestone } from './story'
import { pushLog } from './core'
import { militaryCap } from './production'
import { raidThreshold, reputationBonuses } from './reputation'
import type { DiplomacyAutoMode, FactionState, GameState, GeneratedTarget, ResourceKey } from './types'

/** 外交数值策略（结盟阈值/好感上限/成本与增长倍率）集中见 balance.ts */

/** 已结盟派系数（周目内口径）——定义在 core.ts（零依赖核心，achievements/diplomacy 同源引用，防环依赖）；此处 re-export 供既有调用方 */
export { alliedCount } from './core'

/** 无尽生成目标 → FactionDef（程序生成外交对象与手写保底外交对象的运行时 def，接入现有外交动作；
 * 文本为生成时语言快照（nameText/descText），语言切换后保持——与日志快照语义一致） */
export function factionDefFromTarget(t: GeneratedTarget): FactionDef {
  return {
    id: t.id,
    nameText: t.name,
    descText: t.desc,
    initialFavor: t.initialFavor ?? 0,
    initialThreat: t.initialThreat ?? 0,
    tradeDiscount: t.tradeDiscount,
    techShareCostMult: t.techShareCostMult,
    intimidateCostMult: t.intimidateCostMult,
  }
}

/** 派系 def 查询：静态 ALL_FACTIONS 优先，未命中查无尽生成目标（endless 前缀 / gen 前缀——外交动作统一入口） */
export function factionDef(state: GameState, id: string): FactionDef | undefined {
  const staticDef = ALL_FACTIONS[id]
  if (staticDef) return staticDef
  const t = state.generatedTargets?.find((x) => x.kind === 'faction' && x.id === id)
  return t ? factionDefFromTarget(t) : undefined
}

/** 创建初始派系状态表 */
export function createFactions(): Record<string, FactionState> {
  const out: Record<string, FactionState> = {}
  for (const def of Object.values(FACTIONS)) {
    out[def.id] = createFactionState(def)
  }
  return out
}

/** 单派系状态构造（初始 4 家与探索发现的新势力共用；favor/threat 取 def 初值） */
export function createFactionState(def: FactionDef): FactionState {
  return {
    favor: def.initialFavor,
    allied: false,
    tradeCount: 0,
    intimidateCount: 0,
    threat: def.initialThreat,
  }
}

function clampFavor(n: number): number {
  return Math.max(0, Math.min(FAVOR_CAP, n))
}

/** 贸易成本（随次数递增；声望高 = 信誉好 = 商人给折扣；探索势力专属 tradeDiscount 再乘 (1 - 折扣)，与声望折扣乘法叠加） */
export function tradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.tradeCount ?? 0
  const discount = reputationBonuses(state).tradeDiscount
  const extraDiscount = factionDef(state, id)?.tradeDiscount ?? 0
  return {
    mineral: Math.floor(TRADE_BASE_COST * Math.pow(TRADE_COST_GROWTH, n) * (1 - discount) * (1 - extraDiscount)),
    energy: 0,
    tech: 0,
    military: 0,
  }
}

/** 威慑成本（随次数递增，含科技点；探索势力专属 intimidateCostMult 折扣，如黑曜协议 0.75 = 威慑成本 -25%） */
export function intimidateCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.intimidateCount ?? 0
  const mult = Math.pow(INTIMIDATE_COST_GROWTH, n)
  const defMult = factionDef(state, id)?.intimidateCostMult ?? 1
  return {
    mineral: Math.floor(INTIMIDATE_BASE_COST.mineral * mult * defMult),
    energy: Math.floor(INTIMIDATE_BASE_COST.energy * mult * defMult),
    tech: Math.floor(INTIMIDATE_BASE_COST.tech * mult * defMult),
    military: 0,
  }
}

/** 技术共享成本（基础 TECH_SHARE_COST 20_000 科技点；探索势力专属 techShareCostMult 折扣，如节点智械 0.5 = 半价） */
export function techShareCost(state: GameState, id: string): Record<ResourceKey, number> {
  const mult = factionDef(state, id)?.techShareCostMult ?? 1
  return {
    mineral: 0,
    energy: 0,
    tech: Math.floor(TECH_SHARE_COST.tech * mult),
    military: 0,
  }
}

/** 统一联邦判定：全部**已登场**派系好感达标（=100）或已结盟。
 * 遍历 state.factions（运行时集合）而非静态 FACTIONS——探索发现的新势力自动纳入
 * （通关后新目标 = 把新势力也纳入联邦）；发现瞬间若此前已统一 → 重新变为未统一。
 * infinite 阶段恒真（ADR-0029：统一是历史状态，不被新发现派系动摇；checkEnding 由 endingTriggered 保证单次触发）。 */
export function isFederationUnified(state: GameState): boolean {
  if (state.phase === 'infinite') return true
  const ids = Object.keys(state.factions)
  if (ids.length === 0) return false
  return ids.every((id) => {
    const f = state.factions[id]
    if (!f) return false
    return f.allied || f.favor >= FEDERATION_FAVOR_THRESHOLD
  })
}

export interface ActionResult {
  ok: boolean
  reason?: string
}

function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= (cost[k] ?? 0))
}

/** 派生查询：当前可否对某派系贸易 */
export function canFactionTrade(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, tradeCost(state, id))
}

/** 派生查询：当前可否与某派系结盟 */
export function canFactionAlliance(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return false
  return canAfford(state.resources, ALLIANCE_COST)
}

/** 派生查询：当前可否威慑某派系 */
export function canFactionIntimidate(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, intimidateCost(state, id))
}

/** 派生查询：当前可否对某派系技术共享 */
export function canFactionTechShare(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, techShareCost(state, id))
}

/** 贸易：花费矿物提升好感（赎罪期内好感增益 ×ATONE_TRADE_FAVOR_MULT；nowMs 可注入便于测试） */
export function factionTrade(state: GameState, id: string, nowMs = Date.now()): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.0') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.1') }
  const cost = tradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.2') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  const atoning = f.atoningUntil !== undefined && nowMs < f.atoningUntil
  f.favor = clampFavor(f.favor + Math.floor(TRADE_FAVOR_GAIN * (atoning ? ATONE_TRADE_FAVOR_MULT : 1)))
  f.tradeCount += 1
  // 贸易网络成型叙事（累计 10 次）
  if (f.tradeCount === 10) playMilestone(state, 'tradeRich')
  return { ok: true }
}

/** 结盟：好感达标后消耗大量资源正式结盟 */
export function factionAlliance(state: GameState, id: string): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.3') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.4') }
  if (f.subjugated) return { ok: false, reason: t('log.diplomacy.5') }
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return { ok: false, reason: t('log.diplomacy.6') }
  if (!canAfford(state.resources, ALLIANCE_COST)) return { ok: false, reason: t('log.diplomacy.7') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (ALLIANCE_COST[k] ?? 0)
  f.allied = true
  f.favor = FAVOR_CAP
  // 记录派系图鉴（NG+ 继承）
  if (!state.factionCodex.includes(id)) state.factionCodex.push(id)
  // 归档周目标记（endless-expansion：结盟 = 外交对象不可再交互 → 移列表末尾折叠；本周目语义，NG+ 清空）
  state.archivedRounds[id] = state.ngPlusLevel ?? 0
  // save-size-opt：生成派系结盟归档即压缩（conquest/faction 白名单；静态派系不在 generatedTargets）
  const gtIdx = state.generatedTargets.findIndex((x) => x.id === id)
  if (gtIdx >= 0) state.generatedTargets[gtIdx] = compactTargetOnArchive(state.generatedTargets[gtIdx])
  // 首次结盟叙事
  playMilestone(state, 'firstAlliance')
  return { ok: true }
}

/** 威慑：消耗资源降低对方军力（威胁度），代价是好感下降 */
export function factionIntimidate(state: GameState, id: string): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.8') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.9') }
  const cost = intimidateCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.10') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.favor = clampFavor(f.favor - INTIMIDATE_FAVOR_LOSS)
  f.threat = Math.max(0, f.threat - INTIMIDATE_THREAT_LOSS)
  f.intimidateCount += 1
  // 首次威慑叙事
  if (f.intimidateCount === 1) playMilestone(state, 'firstIntimidate')
  return { ok: true }
}

/** 技术共享：花费科技点直接提升派系好感（成本按 techShareCost 含探索势力折扣） */
export function factionTechShare(state: GameState, id: string): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.11') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.12') }
  const cost = techShareCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.13') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.favor = clampFavor(f.favor + TECH_SHARE_FAVOR_GAIN)
  return { ok: true }
}

// ---- 胁迫外交（diplomacy-coercion） ----

/** 解锁叙事文案（按通道区分；首次解锁播报，幂等） */

/** 解锁查询：storyFlags 标记（由 raid 遭遇或军力达标置位，见 ensureCoercionUnlocked） */
export function coercionUnlocked(state: GameState): boolean {
  return state.storyFlags[COERCION_UNLOCK_FLAG] === true
}

/** 军力达标即解锁（与 raid 遭遇双通道）：军力上限 ≥ COERCION_UNLOCK_MILITARY_CAP 时幂等置位，
 * 返回是否本次新解锁（供 ensureCoercionUnlocked 播报叙事）。 */
export function maybeUnlockCoercionByMilitary(state: GameState): boolean {
  if (state.storyFlags[COERCION_UNLOCK_FLAG]) return false
  if (militaryCap(state) < COERCION_UNLOCK_MILITARY_CAP) return false
  return unlockCoercion(state)
}

/**
 * 胁迫外交统一解锁入口（双通道收敛，2026-08-07 code-review）：
 * - via='raid'：遭遇即解锁（调用方已保证 raid 发生；applyRaid / settleOfflineRaids / tryAutoIntercept）
 * - via='military'：军力上限达标才解锁（tick / settleOffline 推进点，存量存档回归自动生效）
 * 首次解锁播报对应通道的叙事日志，返回是否本次新解锁（幂等）。
 */
export function ensureCoercionUnlocked(state: GameState, via: 'raid' | 'military'): boolean {
  const unlocked = via === 'military' ? maybeUnlockCoercionByMilitary(state) : unlockCoercion(state)
  if (unlocked) {
    pushLog(state, 'story', via === 'military' ? t('diploCo.1') : t('diploCo.0'))
  }
  return unlocked
}

/** 征服者统一判定：任一派系曾被胁迫（everCoerced 跨周目保留）→ 结局文本分支（Q10 叙事痕迹） */
export function isConquerorEnding(state: GameState): boolean {
  return Object.values(state.factions).some((f) => f.everCoerced)
}

/** 勒索成本（能源 ×1.5^extortCount 递增） */
export function extortCost(state: GameState, id: string): Record<ResourceKey, number> {
  const n = state.factions[id]?.extortCount ?? 0
  return { mineral: 0, energy: Math.floor(EXTORT_ENERGY_COST * Math.pow(EXTORT_COST_GROWTH, n)), tech: 0, military: 0 }
}

/** 勒索收益（矿物）；军力 ≥ 上限×EXTORT_OFFER_PCT 时触发"威慑报价" ×1.5 */
export function extortReward(state: GameState): number {
  const cap = militaryCap(state)
  const offer = state.resources.military >= Math.floor(cap * EXTORT_OFFER_PCT)
  return Math.floor(EXTORT_MINERAL_BASE * (offer ? EXTORT_OFFER_MULT : 1))
}

/** 派生查询：当前可否勒索某派系（解锁 + 未结盟/臣服/赎罪 + 军力门槛 + 资源） */
export function canFactionExtort(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied || f.subjugated || f.atoned) return false
  if (!coercionUnlocked(state)) return false
  if (state.resources.military < Math.floor(militaryCap(state) * EXTORT_MILITARY_PCT)) return false
  return canAfford(state.resources, extortCost(state, id))
}

/** 勒索：以军事力量敲诈派系资源——高收益，代价是好感暴跌 + 威胁飙升（raid 风险） */
export function factionExtort(state: GameState, id: string): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.14') }
  const f = state.factions[id]
  if (!coercionUnlocked(state)) return { ok: false, reason: t('log.diplomacy.15') }
  if (f.allied) return { ok: false, reason: t('log.diplomacy.16') }
  if (f.subjugated) return { ok: false, reason: t('log.diplomacy.17') }
  if (f.atoned) return { ok: false, reason: t('log.diplomacy.18') }
  if (state.resources.military < Math.floor(militaryCap(state) * EXTORT_MILITARY_PCT)) return { ok: false, reason: t('log.diplomacy.19') }
  const cost = extortCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.20') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  state.resources.mineral += extortReward(state)
  f.favor = clampFavor(f.favor - EXTORT_FAVOR_LOSS)
  f.threat = Math.max(0, f.threat + EXTORT_THREAT_GAIN)
  f.extortCount = (f.extortCount ?? 0) + 1
  f.everCoerced = true
  return { ok: true }
}

/** 条约成本（能源 ×1.5^treatyCount 续签递增） */
export function treatyCost(state: GameState, id: string): Record<ResourceKey, number> {
  const n = state.factions[id]?.treatyCount ?? 0
  return { mineral: 0, energy: Math.floor(TREATY_ENERGY_COST * Math.pow(TREATY_COST_GROWTH, n)), tech: 0, military: 0 }
}

/** 派生查询：当前可否对某派系签进贡条约（需已被勒索过、无进行中条约、未臣服/赎罪/结盟） */
export function canFactionTreaty(state: GameState, id: string, nowMs = Date.now()): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied || f.subjugated || f.atoned) return false
  if ((f.extortCount ?? 0) < 1) return false
  if (f.treatyUntil !== undefined && nowMs < f.treatyUntil) return false
  return canAfford(state.resources, treatyCost(state, id))
}

/** 进贡条约：派系被威慑后定期进贡——12h 固定时长矿物税流，到期 threat 反弹，续签成本递增 */
export function factionTreaty(state: GameState, id: string, nowMs = Date.now()): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.21') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.22') }
  if (f.subjugated) return { ok: false, reason: t('log.diplomacy.23') }
  if (f.atoned) return { ok: false, reason: t('log.diplomacy.24') }
  if ((f.extortCount ?? 0) < 1) return { ok: false, reason: t('log.diplomacy.25') }
  if (f.treatyUntil !== undefined && nowMs < f.treatyUntil) return { ok: false, reason: t('log.diplomacy.26') }
  const cost = treatyCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.27') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.treatyUntil = nowMs + TREATY_DURATION_MS
  f.treatyCount = (f.treatyCount ?? 0) + 1
  f.everCoerced = true
  return { ok: true }
}

/** 贡税流已迁至 production.ts（tributePerSec，避免 production↔diplomacy 循环依赖；diplomacy 侧契约以 production 导出为准） */

/** 解锁胁迫外交（events.ts 首次 raid 调用）：幂等置位，返回是否首次解锁 */
export function unlockCoercion(state: GameState): boolean {
  if (state.storyFlags[COERCION_UNLOCK_FLAG]) return false
  state.storyFlags[COERCION_UNLOCK_FLAG] = true
  return true
}

/** 每 tick 推进（engine.tick 与 offline.settleOffline 末尾调用）：
 * - 条约到期：threat 反弹并清空
 * - 臣服叛变：当前军力低于锁定量 → 好感清零、threat 爆炸、解除臣服并返还锁定军力 */
export function coercionTick(state: GameState, nowMs = Date.now()): void {
  for (const f of Object.values(state.factions)) {
    if (f.treatyUntil !== undefined && nowMs >= f.treatyUntil) {
      f.threat = Math.min(100, f.threat + TREATY_EXPIRE_THREAT_GAIN)
      f.treatyUntil = undefined
    }
    if (f.subjugated) {
      const locked = subjugateLockedMilitary(state)
      if (state.resources.military < locked) {
        f.subjugated = false
        f.favor = REVOLT_FAVOR_RESET
        f.threat = Math.min(100, f.threat + REVOLT_THREAT_GAIN)
        state.resources.military += locked // 返还锁定军力
      }
    }
  }
}

/** 臣服锁定军力量（= 军力上限 × SUBJUGATE_LOCK_PCT） */
export function subjugateLockedMilitary(state: GameState): number {
  return Math.floor(militaryCap(state) * SUBJUGATE_LOCK_PCT)
}

/** 派生查询：当前可否臣服某派系（好感低 + 威胁高 + 军力碾压 + 未结盟/赎罪/臣服） */
export function canFactionSubjugate(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.allied || f.subjugated || f.atoned) return false
  if (f.favor > SUBJUGATE_FAVOR_MAX) return false
  if (f.threat < SUBJUGATE_THREAT_MIN) return false
  return state.resources.military >= Math.floor(militaryCap(state) * SUBJUGATE_MILITARY_PCT)
}

/** 臣服：武力压服派系——锁定军力防叛变，双倍贡税；军力不足即叛变（好感清零 + threat 爆炸） */
export function factionSubjugate(state: GameState, id: string): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.28') }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: t('log.diplomacy.29') }
  if (f.subjugated) return { ok: false, reason: t('log.diplomacy.30') }
  if (f.atoned) return { ok: false, reason: t('log.diplomacy.31') }
  if (f.favor > SUBJUGATE_FAVOR_MAX) return { ok: false, reason: t('log.diplomacy.32') }
  if (f.threat < SUBJUGATE_THREAT_MIN) return { ok: false, reason: t('log.diplomacy.33') }
  if (state.resources.military < Math.floor(militaryCap(state) * SUBJUGATE_MILITARY_PCT)) return { ok: false, reason: t('log.diplomacy.34') }
  const locked = subjugateLockedMilitary(state)
  state.resources.military -= locked
  f.subjugated = true
  f.everCoerced = true
  return { ok: true }
}

/** 赎罪赔偿金（×ATONE_COST_GROWTH^extortCount 递增：勒索越多越贵，赎罪总成本 > 直刷好感） */
export function atoneCost(state: GameState, id: string): Record<ResourceKey, number> {
  const n = state.factions[id]?.extortCount ?? 0
  return { mineral: Math.floor(ATONE_MINERAL_BASE * Math.pow(ATONE_COST_GROWTH, n)), energy: 0, tech: 0, military: 0 }
}

/** 派生查询：当前可否赎罪（有胁迫史且未赎罪） */
export function canFactionAtone(state: GameState, id: string): boolean {
  const def = factionDef(state, id)
  if (!def) return false
  const f = state.factions[id]
  if (f.atoned) return false
  if (f.allied) return false
  const coerced = f.subjugated || f.treatyUntil !== undefined || (f.extortCount ?? 0) >= 1
  if (!coerced) return false
  return canAfford(state.resources, atoneCost(state, id))
}

/** 三重赎罪：赔偿金解除臣服/条约并进入赎罪期（贸易加成窗口）；赎罪后该派系永久不可再胁迫 */
export function factionAtone(state: GameState, id: string, nowMs = Date.now()): ActionResult {
  const def = factionDef(state, id)
  if (!def) return { ok: false, reason: t('log.diplomacy.35') }
  const f = state.factions[id]
  if (f.atoned) return { ok: false, reason: t('log.diplomacy.36') }
  if (f.allied) return { ok: false, reason: t('log.diplomacy.37') }
  const coerced = f.subjugated || f.treatyUntil !== undefined || (f.extortCount ?? 0) >= 1
  if (!coerced) return { ok: false, reason: t('log.diplomacy.38') }
  const cost = atoneCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.diplomacy.39') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  if (f.subjugated) {
    state.resources.military += subjugateLockedMilitary(state) // 返还锁定军力
    f.subjugated = false
  }
  f.treatyUntil = undefined
  f.atoned = true
  f.atoningUntil = nowMs + ATONE_DURATION_MS
  return { ok: true }
}

/** 派系登场检查：解锁第 2 星后派系进入舞台（写日志由调用方处理） */
export function factionsVisible(state: GameState): boolean {
  return Boolean(state.planets.orbital?.unlocked)
}

/** 统一联邦进度 + 部分派系检查辅助（total = 已登场派系数：初始 4 家 + 探索发现自动纳入）。
 * infinite 阶段只统计「已解决」派系（total = satisfied = 已结盟或满好感的既有集合）——新派系不计入，
 * 进度恒 100% 不回退（ADR-0029）。 */
export function federationProgress(state: GameState): { total: number; satisfied: number } {
  const ids = Object.keys(state.factions)
  const satisfied = ids.filter((id) => {
    const f = state.factions[id]
    return f && (f.allied || f.favor >= FEDERATION_FAVOR_THRESHOLD)
  }).length
  if (state.phase === 'infinite') return { total: satisfied, satisfied }
  return { total: ids.length, satisfied }
}

/** 已结盟的有名派系数（alliance-perpetual-output）：静态 4 家 + 探索势力 4 家 = 封顶 8。
 * 程序生成派系（gen:/endless:）不计入——ADR-0012 红线（infinite 生成目标零永久加成，防无限叠加）。
 * 纯派生自周目内 state.factions[].allied，零写入、零 schema；NG+ 派系重置 → 自然归零（周目内语义）。
 * 驱动结盟全局产出加成（production.ts allianceMult，+5%/派系）。 */
export function alliedNamedFactionCount(state: GameState): number {
  let n = 0
  for (const id of Object.keys(state.factions)) {
    if (!state.factions[id]?.allied) continue
    if (id in FACTIONS || id in EXPLORE_FACTIONS) n++
  }
  return n
}

/** 外交面板总览（diplomacy-overview）：联邦统一进度 + 威胁安宁 + 盟约图鉴，全派生纯查询。
 * threatCount 与 raidableFaction 同阈值口径（未结盟且 threat ≥ 当前骚扰阈值；结盟派系不构成威胁源）。
 * 注意：raid 候选集仅静态派系（ALL_FACTIONS，events.ts raidableFaction 遍历对象）；生成派系（endless:/gen:）
 * 威胁 ≥ 阈值时计入总览计数（威慑可降 threat），但不会被 raid 事件选中——docstring 不承诺 raid 行为一致。 */
export function diplomacyOverview(state: GameState): { total: number; satisfied: number; allied: number; threatCount: number } {
  const prog = federationProgress(state)
  let allied = 0
  let threatCount = 0
  const threshold = raidThreshold(state)
  for (const id of Object.keys(state.factions)) {
    const f = state.factions[id]
    if (!f) continue
    if (f.allied) {
      allied += 1
      continue
    }
    if (f.threat >= threshold) threatCount += 1
  }
  return { total: prog.total, satisfied: prog.satisfied, allied, threatCount }
}

/**
 * 外交自动化 tick（diplo-auto 纯全局迭代，2026-08-08）：每冷却周期（20s）对第一个满足条件的派系执行一次动作。
 * 全局方向（mode）+ 自动完成前置：
 * - 友好线（ally，默认）：任何好感 < 100 的派系自动贸易/技术共享（预算内，好感阈值已降至 0——发现礼包后
 *   新派系好感 10–39 也自动启动）→ favor ≥ 80 且可付 → 自动结盟（**仅 ended/infinite**：playing 自动结盟
 *   会触发 checkEnding 自动通关，禁止）；
 * - 胁迫线（coerce）：仅 raid 安全的生成派系（endless:/gen:）自动勒索 → 条约；静态/探索派系（raid 候选）
 *   自动跳过（2026-08-08 用户确认，挂机不被骚扰循环）；臣服/赎罪保持手动；
 * 预算口径：单次花费 ≤ 当前资源 × DIPLO_AUTO_BUDGET_RATIO（成本递增天然自稳）；结盟为一次性大额，
 * 走 canFactionAlliance 全额可付判定。
 * nowMs 可注入（测试）；离线由 settleOffline 按冷却周期批量推进（虚拟时钟）。
 */
export function autoDiplomacyTick(state: GameState, nowMs: number): void {
  const cfg = state.diplomacyAuto
  if (!cfg?.enabled) return
  if (cfg.lastActionAt != null && nowMs - cfg.lastActionAt < DIPLO_AUTO_COOLDOWN_MS) return
  const mode = diplomacyAutoMode(state)
  for (const id of Object.keys(state.factions)) {
    if (!factionDef(state, id)) continue
    const f = state.factions[id]
    if (!f || f.allied) continue
    // 胁迫线（coerce）：仅生成派系（raid 安全），静态/探索派系跳过
    if (mode === 'coerce') {
      if (!coercionUnlocked(state)) continue
      if (!isGeneratedFactionId(id)) continue
      if (f.treatyUntil !== undefined && nowMs < f.treatyUntil) continue // 条约期等待，到期后 threat 反弹再续
      if (canFactionTreaty(state, id, nowMs)) {
        if (factionTreaty(state, id, nowMs).ok) {
          cfg.lastActionAt = nowMs
          return
        }
      } else if (canFactionExtort(state, id)) {
        if (factionExtort(state, id).ok) {
          cfg.lastActionAt = nowMs
          return
        }
      }
      continue
    }
    // 友好线（ally）：自动结盟阶段门控（playing 不自动结盟，防自动通关）
    if (state.phase !== 'playing' && f.favor >= ALLIANCE_FAVOR_THRESHOLD && canFactionAlliance(state, id)) {
      if (factionAlliance(state, id).ok) {
        cfg.lastActionAt = nowMs
        return
      }
    }
    if (f.favor >= FAVOR_CAP || f.favor < DIPLO_AUTO_FAVOR_THRESHOLD) continue
    let acted = false
    // 预算内批量贸易（≤10 次；每次重算成本并校验预算，首次不满足即停）
    for (let i = 0; i < 10; i++) {
      const tCost = tradeCost(state, id)
      if (tCost.mineral <= 0 || tCost.mineral > state.resources.mineral * DIPLO_AUTO_BUDGET_RATIO) break
      if (!factionTrade(state, id, nowMs).ok) break
      acted = true
    }
    // 贸易预算不可行 → 尝试技术共享（同样批量 ≤10 次、科技预算内）
    if (!acted) {
      for (let i = 0; i < 10; i++) {
        const sCost = techShareCost(state, id)
        if (sCost.tech <= 0 || sCost.tech > state.resources.tech * DIPLO_AUTO_BUDGET_RATIO) break
        if (!factionTechShare(state, id).ok) break
        acted = true
      }
    }
    if (acted) {
      cfg.lastActionAt = nowMs
      return // 每冷却周期只处理一个派系，避免一轮全刷
    }
  }
}

/** 全局外交自动化方向（纯全局，2026-08-08 迭代）：mode 缺省 'ally'；「关」由全局 enabled 表达 */
export function diplomacyAutoMode(state: GameState): DiplomacyAutoMode {
  return state.diplomacyAuto?.mode === 'coerce' ? 'coerce' : 'ally'
}

/** 生成派系 id 判定（raid 安全边界：raidableFaction 只遍历 ALL_FACTIONS，endless:/gen: 永不成为 raid 源） */
function isGeneratedFactionId(id: string): boolean {
  return isEndlessTargetId(id) || id.startsWith('gen:')
}
