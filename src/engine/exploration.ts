import { EXPLORE_FACTIONS, EXPLORE_PLANETS } from './data'
import {
  EXPEDITION_CAP_GROWTH,
  EXPEDITION_COMPENSATE_RATIO,
  EXPEDITION_DURATION_MS,
  EXPEDITION_ENERGY,
  EXPEDITION_MILITARY_CAP,
  EXPEDITION_MILITARY_PCT,
  EXPEDITION_MINERAL,
  EXPEDITION_OUTPUT_BONUS_CAP,
  EXPEDITION_OUTPUT_BONUS_STEP,
  EXPEDITION_REPEAT_FAVOR_GAIN,
  EXPLORATION_TECH_HARVEST_PCT,
  FAVOR_CAP,
  scaledClamp,
} from './balance'
import { createFactionState } from './diplomacy'
import { militaryCap, netProduction } from './production'
import { rollDomain } from './rng'
import type { ExpeditionResult, ExpeditionState, GameState, LogType } from './types'

/**
 * 探索系统深层模块（通关后派遣）。
 *
 * 核心语义（exploration spec 定稿，2026-08-06）：
 * - 入口门控：`phase === 'ended' || 'infinite'` 才可派遣（`isExploreAvailable`）。
 * - 多槽：起始 1 槽，深空导航阵列（deepSpaceNav）Lv1 解锁 2 槽、星际通信中继（interstellarRelay）Lv1
 *   解锁 3 槽（`explorationSlots`，上限 3）；每槽独立 60 分钟，离线照常推进，不可取消。
 * - 全提交：出发时扣资源（矿物/能源动态缩放 + 军事点按槽位 ×N）+ 用 `explore` 域固定种子
 *   **roll 并固化结果**（每槽独立 rollDomain 闭包 → 计数器天然独立）；回归只入账（`settleExpeditions`），
 *   防 SL 在结构上成立。
 * - 成本自适应：军事点 = min(CAP, max(40, floor(militaryCap × 2%))) × (slotIndex+1)；矿物/能源 cap 随周目 ×1.5^level——
 *   成本与收益同源缩放 → 收益比锚点 1.083× 不漂移。
 * - 探索收获倍率：`explorationHarvestMult` 只作用于 resource 分支补偿（矿物/能源/科技 × mult），
 *   不碰 60min 锚点、不作用于天体产出。
 * - 奖池剔除制：未发现势力（w2）+ 未发现天体（w1，含 3 个产出型）+ 资源补偿（w = max(2, 6-已收集)），
 *   轮盘同 `pickEventDef` 法；耗尽后只剩补偿 → 资源搬运器。
 * - 重复发现补偿：已收录势力再发现 → 好感 +5（封顶 100）；已收录天体再发现 → 产出增益 +10%（封顶 +50%）。
 */

export interface ExpeditionActionResult {
  ok: boolean
  reason?: string
  /** 成功出发时的派遣记录（测试断言用） */
  value?: ExpeditionState
}

/** 探索日志（type 供 tick/offline 调用方按语义 pushLog） */
export interface ExpeditionLog {
  type: LogType
  text: string
}

/** 探索是否可用：通关后（ended/infinite）；playing 阶段不可用 */
export function isExploreAvailable(state: GameState): boolean {
  return state.phase === 'ended' || state.phase === 'infinite'
}

/** 探索槽位数量：1 + 深空导航阵列 Lv≥1 + 星际通信中继 Lv≥1（上限 3） */
export function explorationSlots(state: GameState): number {
  const nav = (state.techLevels?.['deepSpaceNav'] ?? 0) >= 1 ? 1 : 0
  const relay = (state.techLevels?.['interstellarRelay'] ?? 0) >= 1 ? 1 : 0
  return Math.min(3, 1 + nav + relay)
}

/** 第 N 槽军事点消耗：min(CAP, max(40, floor(militaryCap × PCT))) × (slotIndex+1)（第 1/2/3 槽 = base×1/2/3） */
export function expeditionMilitaryCost(state: GameState, slotIndex: number = 0): number {
  const base = Math.min(EXPEDITION_MILITARY_CAP, Math.max(40, Math.floor(militaryCap(state) * EXPEDITION_MILITARY_PCT)))
  return base * (slotIndex + 1)
}

/** 探索收获倍率：1 + 0.1 × (deepSpaceNavLv + interstellarRelayLv)，满级两项 = ×2.0（只作用于 resource 分支补偿） */
export function explorationHarvestMult(state: GameState): number {
  const nav = state.techLevels?.['deepSpaceNav'] ?? 0
  const relay = state.techLevels?.['interstellarRelay'] ?? 0
  return 1 + EXPLORATION_TECH_HARVEST_PCT * (nav + relay)
}

/** 当前第 N 槽派遣消耗：矿物/能源随每秒产出动态缩放（cap 随周目 ×1.5^level），军事点随军力上限自适应（×槽位） */
export function expeditionCost(state: GameState, slotIndex: number = 0): { mineral: number; energy: number; military: number } {
  const prod = netProduction(state)
  const capGrowth = Math.pow(EXPEDITION_CAP_GROWTH, state.ngPlusLevel ?? 0)
  return {
    mineral: scaledClamp(prod.mineral, EXPEDITION_MINERAL.min, EXPEDITION_MINERAL.factor, Math.floor(EXPEDITION_MINERAL.cap * capGrowth)),
    energy: scaledClamp(prod.energy, EXPEDITION_ENERGY.min, EXPEDITION_ENERGY.factor, Math.floor(EXPEDITION_ENERGY.cap * capGrowth)),
    military: expeditionMilitaryCost(state, slotIndex),
  }
}

/** 奖池候选条目 */
export interface ExpeditionPoolEntry {
  kind: 'faction' | 'planet' | 'resource'
  /** factionId 或 planetId（resource 无 id） */
  id?: string
  weight: number
}

/**
 * 探索奖池（剔除制）：未发现的探索势力（各 w2）+ 未发现的探索天体（各 w1，含产出型）
 * + 资源补偿（w = max(2, 6 - 已收集数)）。已发现的不再出现（收集有终点）。
 */
export function expeditionPool(state: GameState): ExpeditionPoolEntry[] {
  const pool: ExpeditionPoolEntry[] = []
  for (const def of Object.values(EXPLORE_FACTIONS)) {
    if (!state.exploredFactions.includes(def.id)) pool.push({ kind: 'faction', id: def.id, weight: 2 })
  }
  for (const def of Object.values(EXPLORE_PLANETS)) {
    if (!state.exploredPlanets.includes(def.id)) pool.push({ kind: 'planet', id: def.id, weight: 1 })
  }
  const collected = state.exploredFactions.length + state.exploredPlanets.length
  pool.push({ kind: 'resource', weight: Math.max(2, 6 - collected) })
  return pool
}

/** 资源补偿数值（按当前投入比例返还 + 科技点出口；harvestMult 放大 resource 分支，与成本同源缩放保持收益比锚点） */
function compensationFor(cost: { mineral: number; energy: number }, harvestMult: number = 1): { mineral: number; tech: number; energy: number } {
  return {
    mineral: Math.floor(cost.mineral * EXPEDITION_COMPENSATE_RATIO.mineral * harvestMult),
    energy: Math.floor(cost.energy * EXPEDITION_COMPENSATE_RATIO.energy * harvestMult),
    tech: Math.floor(cost.mineral * EXPEDITION_COMPENSATE_RATIO.techPerMineral * harvestMult),
  }
}

/**
 * 奖池轮盘 roll：`roll() * totalWeight` 逐项减权重（与 pickEventDef 同法）。
 * roll 由调用方提供（startExpedition 内 `rng ?? rollDomain(state, 'explore')`），
 * 测试可直接注入固定 rng 断言 result 固化。
 */
function rollFromPool(
  pool: ExpeditionPoolEntry[],
  roll: () => number,
  cost: { mineral: number; energy: number },
  harvestMult: number = 1,
): ExpeditionResult {
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let value = roll() * total
  for (const entry of pool) {
    value -= entry.weight
    if (value <= 0) {
      if (entry.kind === 'faction') return { kind: 'faction', factionId: entry.id! }
      if (entry.kind === 'planet') return { kind: 'planet', planetId: entry.id! }
      return { kind: 'resource', ...compensationFor(cost, harvestMult) }
    }
  }
  // 浮点边界兜底：最后一项
  const last = pool[pool.length - 1]
  if (last.kind === 'faction') return { kind: 'faction', factionId: last.id! }
  if (last.kind === 'planet') return { kind: 'planet', planetId: last.id! }
  return { kind: 'resource', ...compensationFor(cost, harvestMult) }
}

/**
 * 发起探索派遣（全提交语义）：
 * 校验（通关后 phase / 槽位余量 / 矿物/能源/兵力足够）→ 扣资源 → `explore` 域 roll 固化结果 → push。
 * rng 不传（undefined）→ 结果型随机走 explore 域持久化计数器（fixed-rng 防 SL，每槽独立闭包天然独立）；
 * 显式传 rng → 测试注入（跳过计数器）。
 * @param slotIndex 槽位数组索引（0-based；第 1/2/3 槽 = 0/1/2，军事点 ×1/×2/×3）
 */
export function startExpedition(state: GameState, nowMs: number, rng?: () => number, slotIndex: number = 0): ExpeditionActionResult {
  if (!isExploreAvailable(state)) return { ok: false, reason: '通关后开放探索' }
  if (state.expeditions.filter((e) => !e.resolved).length >= explorationSlots(state)) {
    return { ok: false, reason: '全部探索信道已占用，需等待返航' }
  }
  const cost = expeditionCost(state, slotIndex)
  if (state.resources.mineral < cost.mineral) return { ok: false, reason: '矿物不足' }
  if (state.resources.energy < cost.energy) return { ok: false, reason: '能源不足' }
  if (state.resources.military < cost.military) return { ok: false, reason: '军力不足' }
  state.resources.mineral -= cost.mineral
  state.resources.energy -= cost.energy
  state.resources.military -= cost.military
  const pool = expeditionPool(state)
  const harvestMult = explorationHarvestMult(state)
  const result = rollFromPool(pool, rng ?? rollDomain(state, 'explore'), cost, harvestMult)
  const id = state.nextExpeditionId
  state.nextExpeditionId += 1
  const exp: ExpeditionState = {
    id,
    startedAt: nowMs,
    finishAt: nowMs + EXPEDITION_DURATION_MS,
    cost,
    result,
    resolved: false,
  }
  state.expeditions.push(exp)
  return { ok: true, value: exp }
}

/**
 * 结算已到期的探索派遣（倒计时到期自动入账），返回日志由调用方 pushLog。
 * - faction：首次发现 → 运行时创建派系（createFactionState，favor/threat 取 def 初值）+ 记录发现进度；
 *   重复发现 → 好感 +EXPEDITION_REPEAT_FAVOR_GAIN（封顶 FAVOR_CAP）。
 * - planet：首次发现 → 解锁天体（{ unlocked: true, unlockedAt }）+ 记录发现进度；
 *   重复发现 → 产出增益 +EXPEDITION_OUTPUT_BONUS_STEP（封顶 EXPEDITION_OUTPUT_BONUS_CAP，存 planets[id].outputBonus）。
 * - resource：按出发时固化的补偿值入账（含科技点，× 收获倍率）。
 * 入账后 `resolved` 置位并从 expeditions 移除；`stats.explorations += 1`（周目口径，成就用）。
 * 离线路径（settleOffline 调用）倒计时照常推进——回归自动入账。
 */
export function settleExpeditions(state: GameState, nowMs: number): ExpeditionLog[] {
  const logs: ExpeditionLog[] = []
  for (const exp of state.expeditions) {
    if (exp.resolved) continue
    if (nowMs < exp.finishAt) continue
    logs.push(settleOne(state, exp, nowMs))
    exp.resolved = true
    state.stats.explorations = (state.stats.explorations ?? 0) + 1
  }
  state.expeditions = state.expeditions.filter((e) => !e.resolved)
  return logs
}

function settleOne(state: GameState, exp: ExpeditionState, nowMs: number): ExpeditionLog {
  const r = exp.result
  if (r.kind === 'faction') {
    const def = EXPLORE_FACTIONS[r.factionId]
    if (def && !state.factions[r.factionId]) {
      state.factions[r.factionId] = createFactionState(def)
      if (!state.exploredFactions.includes(r.factionId)) state.exploredFactions.push(r.factionId)
      return { type: 'story', text: `探索队返航：在偏远星区发现「${def.name}」的聚居舰队。外交频道已建立。` }
    }
    const cur = state.factions[r.factionId]
    if (cur) {
      cur.favor = Math.min(FAVOR_CAP, cur.favor + EXPEDITION_REPEAT_FAVOR_GAIN)
      return { type: 'story', text: `探索队返航：重新建立与「${def?.name ?? r.factionId}」的联系，好感 +${EXPEDITION_REPEAT_FAVOR_GAIN}。` }
    }
    return { type: 'story', text: `探索队返航：重新建立与「${def?.name ?? r.factionId}」的联系。` }
  }
  if (r.kind === 'planet') {
    const def = EXPLORE_PLANETS[r.planetId]
    if (def && !state.planets[r.planetId]?.unlocked) {
      state.planets[r.planetId] = { unlocked: true, unlockedAt: nowMs }
      if (!state.exploredPlanets.includes(r.planetId)) state.exploredPlanets.push(r.planetId)
      return { type: 'story', text: `探索队返航：发现更佳的发展天体「${def.name}」，已进入可殖民范围。` }
    }
    const ps = state.planets[r.planetId]
    if (ps?.unlocked) {
      ps.outputBonus = Math.min(EXPEDITION_OUTPUT_BONUS_CAP, (ps.outputBonus ?? 0) + EXPEDITION_OUTPUT_BONUS_STEP)
      return { type: 'story', text: `探索队返航：确认「${def?.name ?? r.planetId}」殖民地运行正常，产出增益 +${Math.round(EXPEDITION_OUTPUT_BONUS_STEP * 100)}%。` }
    }
    return { type: 'story', text: `探索队返航：确认「${def?.name ?? r.planetId}」殖民地运行正常。` }
  }
  state.resources.mineral += r.mineral
  state.resources.energy += r.energy
  state.resources.tech += r.tech
  return {
    type: 'reward',
    text: `探索队返航：未发现新文明，回收了 ${r.mineral.toLocaleString('zh-CN')} 矿物、${r.energy.toLocaleString('zh-CN')} 能源与 ${r.tech.toLocaleString('zh-CN')} 科技点。`,
  }
}
