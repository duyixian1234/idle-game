import { EXPLORE_FACTIONS, EXPLORE_PLANETS } from './data'
import {
  AUTO_EXPLORE_RETRY_MS,
  ESCORT_COMPENSATE_RATIO,
  ESCORT_ENERGY_SECONDS,
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
  FLEET_HARVEST_PCT_PER_SHIP,
  JUMPGATE_HARVEST_MULT,
  JUMPGATE_SLOT_BONUS,
  scaledClamp,
} from './balance'
import { createFactionState } from './diplomacy'
import { fleetPowered } from './fleet'
import { militaryCap, netProduction } from './production'
import { formatNumber, formatPercent } from './format'
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
 *
 * 护航远征（fleet-dock-10 spec 定稿，2026-08-07）：
 * - 派遣可附加「护航」：一次性扣海量能源远征费（单艘 = 能源净产出 × 10s × 舰数，锚定当期产出永不失效），
 *   换取收获倍率（每艘 +1%）与大额返还（锚定「基础成本 + 远征费」，能源分支压低、矿物/科技突出）。
 * - 护航条件 = `fleetPowered`（有舰且能源 ≥ 总维护费）；停摆时护航请求被拒绝（可发起无护航派遣）。
 * - 出发时固化：远征费扣减、倍率、返还值全部固化进 result（`escort` 标记同步固化，成就/日志口径）；
 *   出发后造船/停摆不影响本笔——防 SL 契约结构上成立。
 * - 自动探索：`autoExploreDispatch`（在线 tick 补位续派）/ `settleOfflineAutoExplore`（离线 60min 循环续派），
 *   走同一 startExpedition 路径（含护航费扣减、rng 走 explore 域持久化计数器、结果固化）——防 SL 契约不破；
 *   资源不足 → 暂停（enabled 保持开，pausedAt 冷却重试），资源恢复自动继续。
 */

/** 自动探索暂停原因集合（startExpedition 失败 reason 判定）：资源不足类暂停、其余异常跳过 */
export const AUTO_PAUSE_REASONS = new Set(['矿物不足', '能源不足', '军力不足', '舰队能源不足，护航不可用'])

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

/** 探索槽位数量：1 + 深空导航阵列 Lv≥1 + 星际通信中继 Lv≥1 + 跃迁枢纽 +2（上限 5；枢纽与科技槽位叠加） */
export function explorationSlots(state: GameState): number {
  const nav = (state.techLevels?.['deepSpaceNav'] ?? 0) >= 1 ? 1 : 0
  const relay = (state.techLevels?.['interstellarRelay'] ?? 0) >= 1 ? 1 : 0
  const jumpgate = state.megastructureChoice === 'jumpgate' ? JUMPGATE_SLOT_BONUS : 0
  return Math.min(5, 1 + nav + relay + jumpgate)
}

/** 第 N 槽军事点消耗：min(CAP, max(40, floor(militaryCap × PCT))) × (slotIndex+1)（第 1/2/3 槽 = base×1/2/3） */
export function expeditionMilitaryCost(state: GameState, slotIndex: number = 0): number {
  const base = Math.min(EXPEDITION_MILITARY_CAP, Math.max(40, Math.floor(militaryCap(state) * EXPEDITION_MILITARY_PCT)))
  return base * (slotIndex + 1)
}

/** 探索收获倍率：1 + 0.1 × (deepSpaceNavLv + interstellarRelayLv)，满级两项 = ×2.0；
 * 跃迁枢纽把上限放宽到 ×4（科技倍率再 ×2）——只作用于 resource 分支补偿 */
export function explorationHarvestMult(state: GameState): number {
  const nav = state.techLevels?.['deepSpaceNav'] ?? 0
  const relay = state.techLevels?.['interstellarRelay'] ?? 0
  const tech = 1 + EXPLORATION_TECH_HARVEST_PCT * (nav + relay)
  return state.megastructureChoice === 'jumpgate' ? tech * JUMPGATE_HARVEST_MULT : tech
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

// ---- 护航远征（fleet-dock-10：溢出能源 → 探索收益转换器）----

/** 护航可用：舰队运转（有舰且能源 ≥ 总维护费）——停摆语义一致（无战力即无护航） */
export function canEscort(state: GameState): boolean {
  return fleetPowered(state)
}

/** 单艘护航远征费（能源）= 能源净产出 × ESCORT_ENERGY_SECONDS（锚定当期产出，永不失效） */
export function escortFeePerShip(state: GameState): number {
  return Math.max(1, Math.floor(netProduction(state).energy * ESCORT_ENERGY_SECONDS))
}

/** 总护航远征费（能源）= 单艘 × 当前舰数（0 舰 = 0）——加成与费用同一杠杆，权衡始终一致 */
export function escortFee(state: GameState): number {
  return Math.floor(escortFeePerShip(state) * state.fleet.count)
}

/** 护航收获倍率 = 1 + FLEET_HARVEST_PCT_PER_SHIP × 舰数（与科技收获倍率乘法叠加，只作用 resource 分支） */
export function escortHarvestMult(state: GameState): number {
  return 1 + FLEET_HARVEST_PCT_PER_SHIP * state.fleet.count
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

/** 资源补偿数值（按当前投入比例返还 + 科技点出口；mult 放大 resource 分支，与成本同源缩放保持收益比锚点）。
 * 护航（escortFee > 0）：返还锚定「基础成本 + 远征费」，走护航专属返还率（ESCORT_COMPENSATE_RATIO，能源分支压低、矿物/科技突出）——
 * 海量投入 → 海量回报；非护航沿用 EXPEDITION_COMPENSATE_RATIO（与现状一致）。 */
function compensationFor(
  cost: { mineral: number; energy: number },
  mult: number,
  escortFee: number = 0,
): { mineral: number; tech: number; energy: number } {
  const ratio = escortFee > 0 ? ESCORT_COMPENSATE_RATIO : EXPEDITION_COMPENSATE_RATIO
  const mineralBase = cost.mineral + escortFee
  const energyBase = cost.energy + escortFee
  return {
    mineral: Math.floor(mineralBase * ratio.mineral * mult),
    energy: Math.floor(energyBase * ratio.energy * mult),
    tech: Math.floor(mineralBase * ratio.techPerMineral * mult),
  }
}

/**
 * 奖池轮盘 roll：`roll() * totalWeight` 逐项减权重（与 pickEventDef 同法）。
 * roll 由调用方提供（startExpedition 内 `rng ?? rollDomain(state, 'explore')`），
 * 测试可直接注入固定 rng 断言 result 固化。
 * escortFee 仅用于 resource 分支补偿锚定（faction/planet 分支不涉及补偿数值）。
 */
function rollFromPool(
  pool: ExpeditionPoolEntry[],
  roll: () => number,
  cost: { mineral: number; energy: number },
  mult: number = 1,
  escortFee: number = 0,
): ExpeditionResult {
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let value = roll() * total
  for (const entry of pool) {
    value -= entry.weight
    if (value <= 0) {
      if (entry.kind === 'faction') return { kind: 'faction', factionId: entry.id! }
      if (entry.kind === 'planet') return { kind: 'planet', planetId: entry.id! }
      return { kind: 'resource', ...compensationFor(cost, mult, escortFee) }
    }
  }
  // 浮点边界兜底：最后一项
  const last = pool[pool.length - 1]
  if (last.kind === 'faction') return { kind: 'faction', factionId: last.id! }
  if (last.kind === 'planet') return { kind: 'planet', planetId: last.id! }
  return { kind: 'resource', ...compensationFor(cost, mult, escortFee) }
}

/**
 * 发起探索派遣（全提交语义）：
 * 校验（通关后 phase / 槽位余量 / 矿物/能源/兵力足够 / 护航条件）→ 扣资源（护航另扣一次结清的海量远征费）→
 * `explore` 域 roll 固化结果 → push。
 * rng 不传（undefined）→ 结果型随机走 explore 域持久化计数器（fixed-rng 防 SL，每槽独立闭包天然独立）；
 * 显式传 rng → 测试注入（跳过计数器）。
 * @param slotIndex 槽位数组索引（0-based；第 1/2/3 槽 = 0/1/2，军事点 ×1/×2/×3）
 * @param escort 是否护航远征（默认 false = 无舰队行为与现状完全一致）；护航要求 fleetPowered，
 *   停摆时护航请求被拒绝（reason 明确，可改无护航派遣）——护航条件校验先于资源扣减
 */
export function startExpedition(state: GameState, nowMs: number, rng?: () => number, slotIndex: number = 0, escort: boolean = false): ExpeditionActionResult {
  if (!isExploreAvailable(state)) return { ok: false, reason: '通关后开放探索' }
  if (state.expeditions.filter((e) => !e.resolved).length >= explorationSlots(state)) {
    return { ok: false, reason: '全部探索信道已占用，需等待返航' }
  }
  const cost = expeditionCost(state, slotIndex)
  if (state.resources.mineral < cost.mineral) return { ok: false, reason: '矿物不足' }
  if (state.resources.energy < cost.energy) return { ok: false, reason: '能源不足' }
  if (state.resources.military < cost.military) return { ok: false, reason: '军力不足' }
  const escortOn = escort && canEscort(state)
  if (escort && !escortOn) return { ok: false, reason: '舰队能源不足，护航不可用' }
  const fee = escortOn ? escortFee(state) : 0
  if (escortOn && state.resources.energy < cost.energy + fee) return { ok: false, reason: '能源不足' }
  state.resources.mineral -= cost.mineral
  state.resources.energy -= cost.energy + fee
  state.resources.military -= cost.military
  const pool = expeditionPool(state)
  // 护航：科技收获倍率 × 护航倍率（乘法叠加，只作用 resource 分支补偿）
  const mult = escortOn ? explorationHarvestMult(state) * escortHarvestMult(state) : explorationHarvestMult(state)
  const result = rollFromPool(pool, rng ?? rollDomain(state, 'explore'), cost, mult, fee)
  const id = state.nextExpeditionId
  state.nextExpeditionId += 1
  const exp: ExpeditionState = {
    id,
    startedAt: nowMs,
    finishAt: nowMs + EXPEDITION_DURATION_MS,
    cost,
    result,
    resolved: false,
    escort: escortOn,
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
 * 入账后 `resolved` 置位并从 expeditions 移除；`stats.explorations += 1`（周目口径，成就用）、
 * 护航派遣另计 `stats.escortedExpeditions += 1`（「编队护航」成就谓词同源）。
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
    if (exp.escort) state.stats.escortedExpeditions = (state.stats.escortedExpeditions ?? 0) + 1
  }
  state.expeditions = state.expeditions.filter((e) => !e.resolved)
  return logs
}

function settleOne(state: GameState, exp: ExpeditionState, nowMs: number): ExpeditionLog {
  const r = exp.result
  const escortNote = exp.escort ? '（护航编队）' : ''
  if (r.kind === 'faction') {
    const def = EXPLORE_FACTIONS[r.factionId]
    if (def && !state.factions[r.factionId]) {
      state.factions[r.factionId] = createFactionState(def)
      if (!state.exploredFactions.includes(r.factionId)) state.exploredFactions.push(r.factionId)
      return { type: 'story', text: `探索队返航：在偏远星区发现「${def.name}」的聚居舰队。外交频道已建立。${escortNote}` }
    }
    const cur = state.factions[r.factionId]
    if (cur) {
      cur.favor = Math.min(FAVOR_CAP, cur.favor + EXPEDITION_REPEAT_FAVOR_GAIN)
      return { type: 'story', text: `探索队返航：重新建立与「${def?.name ?? r.factionId}」的联系，好感 +${formatNumber(EXPEDITION_REPEAT_FAVOR_GAIN)}。${escortNote}` }
    }
    return { type: 'story', text: `探索队返航：重新建立与「${def?.name ?? r.factionId}」的联系。${escortNote}` }
  }
  if (r.kind === 'planet') {
    const def = EXPLORE_PLANETS[r.planetId]
    if (def && !state.planets[r.planetId]?.unlocked) {
      state.planets[r.planetId] = { unlocked: true, unlockedAt: nowMs }
      if (!state.exploredPlanets.includes(r.planetId)) state.exploredPlanets.push(r.planetId)
      return { type: 'story', text: `探索队返航：发现更佳的发展天体「${def.name}」，已进入可殖民范围。${escortNote}` }
    }
    const ps = state.planets[r.planetId]
    if (ps?.unlocked) {
      ps.outputBonus = Math.min(EXPEDITION_OUTPUT_BONUS_CAP, (ps.outputBonus ?? 0) + EXPEDITION_OUTPUT_BONUS_STEP)
      return { type: 'story', text: `探索队返航：确认「${def?.name ?? r.planetId}」殖民地运行正常，产出增益 +${formatPercent(EXPEDITION_OUTPUT_BONUS_STEP * 100)}。${escortNote}` }
    }
    return { type: 'story', text: `探索队返航：确认「${def?.name ?? r.planetId}」殖民地运行正常。${escortNote}` }
  }
  state.resources.mineral += r.mineral
  state.resources.energy += r.energy
  state.resources.tech += r.tech
  return {
    type: 'reward',
    text: exp.escort
      ? `护航编队返航：未发现新文明，回收了 ${formatNumber(r.mineral)} 矿物、${formatNumber(r.energy)} 能源与 ${formatNumber(r.tech)} 科技点。`
      : `探索队返航：未发现新文明，回收了 ${formatNumber(r.mineral)} 矿物、${formatNumber(r.energy)} 能源与 ${formatNumber(r.tech)} 科技点。`,
  }
}

// ---- 自动探索（fleet-dock-10：每 60min 自动续派，离线同样续派）----

/**
 * 在线自动探索续派（tick 内探索结算后调用）：
 * - enabled 且存在空槽 → 逐槽自动派遣（等价机器代按手动，走同一 startExpedition 路径）；
 * - autoExplore.escort 决定自动派遣是否带护航（默认关，避免离线抽干能源）；
 * - 资源不足（矿物/能源/军事点/护航费）→ 跳过该轮并暂停自动探索（enabled 保持开），
 *   pausedAt 冷却后（AUTO_EXPLORE_RETRY_MS）自动重试——资源恢复后自动继续，日志防刷屏；
 * - 无额外轮次上限：跑到资源耗尽或开关关闭为止。
 */
export function autoExploreDispatch(state: GameState, nowMs: number): ExpeditionLog[] {
  const logs: ExpeditionLog[] = []
  if (!state.autoExplore?.enabled) return logs
  if (!isExploreAvailable(state)) return logs
  const pausedAt = state.autoExplore.pausedAt
  if (pausedAt != null && nowMs - pausedAt < AUTO_EXPLORE_RETRY_MS) return logs
  const slots = explorationSlots(state)
  if (state.expeditions.length >= slots) return logs
  const escort = state.autoExplore.escort
  for (let i = state.expeditions.length; i < slots; i++) {
    const r = startExpedition(state, nowMs, undefined, i, escort)
    if (r.ok) {
      state.autoExplore.pausedAt = undefined
      logs.push({ type: 'story', text: `自动探索：派遣编队驶向深空信道 ${i + 1}${r.value?.escort ? '（护航）' : ''}。` })
      continue
    }
    if (AUTO_PAUSE_REASONS.has(r.reason ?? '')) {
      state.autoExplore.pausedAt = nowMs
      logs.push({ type: 'warning', text: `资源不足，自动探索暂停：${r.reason}。资源恢复后自动继续。` })
      break
    }
    logs.push({ type: 'warning', text: `自动探索：${r.reason}。` })
  }
  return logs
}

/**
 * 离线自动探索续派（settleOffline 调用，在在途派遣按 nowMs 结算之后）：
 * 模拟「每 60min 结算 → 自动续派」循环（沿封顶时长推进，3-5 槽 × 8-12 轮）。
 * - 派遣走同一 startExpedition 路径（含护航费扣减、rng 走 explore 域持久化计数器、结果固化）——防 SL 契约不破；
 * - 资源不足 → 暂停该轮（enabled 保持开），下一轮（60min 后）自动重试，资源耗尽自然停；
 * - 离线结尾仍处派遣中的自动编队留待回归后在线续算（与手动派遣离线语义一致）。
 */
export function settleOfflineAutoExplore(state: GameState, nowMs: number, durationSeconds: number): ExpeditionLog[] {
  const logs: ExpeditionLog[] = []
  if (!state.autoExplore?.enabled) return logs
  if (!isExploreAvailable(state)) return logs
  const slots = explorationSlots(state)
  const escort = state.autoExplore.escort
  const expMs = EXPEDITION_DURATION_MS
  const startMs = nowMs - durationSeconds * 1000
  let t = startMs
  while (true) {
    t += expMs
    if (t > nowMs) break
    // 到点：结算该轮到期派遣（含上一轮续派出发的；resolved 幂等）
    for (const log of settleExpeditions(state, t)) logs.push(log)
    // 暂停冷却：距暂停不足冷却时长则跳过本轮（离线节流，防每轮日志刷屏）
    if (state.autoExplore.pausedAt != null && t - state.autoExplore.pausedAt < AUTO_EXPLORE_RETRY_MS) continue
    let paused = false
    for (let i = state.expeditions.length; i < slots; i++) {
      const r = startExpedition(state, t, undefined, i, escort)
      if (r.ok) {
        state.autoExplore.pausedAt = undefined
        logs.push({ type: 'story', text: `自动探索（离线）：派遣编队驶向深空信道 ${i + 1}${r.value?.escort ? '（护航）' : ''}。` })
        continue
      }
      if (AUTO_PAUSE_REASONS.has(r.reason ?? '')) {
        state.autoExplore.pausedAt = t
        logs.push({ type: 'warning', text: `资源不足，自动探索暂停：${r.reason}。` })
        paused = true
        break
      }
      logs.push({ type: 'warning', text: `自动探索（离线）：${r.reason}。` })
    }
    if (paused) break
  }
  return logs
}
