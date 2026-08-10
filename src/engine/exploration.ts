import { t } from '../i18n'
import { defDesc, defName } from './data'
import { ENDLESS_CONQUESTS, ENDLESS_FACTIONS, ENDLESS_PLANETS, EXPLORE_FACTIONS, EXPLORE_PLANETS } from './data'
import { createFactionState, factionDefFromTarget } from './diplomacy'
import {
  endlessBatchUnlocked,
  endlessTargetId,
  generateConquestTarget,
  generateFactionTarget,
  generatePlanetTarget,
  generatedCap,
  isEndlessTargetId,
  programmaticActiveCount,
} from './generate'
import {
  AUTO_EXPLORE_RETRY_MS,
  ESCORT_COMPENSATE_RATIO,
  ESCORT_ENERGY_SECONDS,
  ESCORT_FEE_ENERGY_CAP_PCT,
  EXPEDITION_CAP_GROWTH,
  EXPEDITION_COMPENSATE_RATIO,
  EXPEDITION_ENERGY,
  EXPEDITION_MILITARY_CAP,
  EXPEDITION_MILITARY_PCT,
  EXPEDITION_MINERAL,
  EXPEDITION_OUTPUT_BONUS_CAP,
  EXPEDITION_OUTPUT_BONUS_STEP,
  EXPEDITION_REPEAT_FAVOR_GAIN,
  FAVOR_CAP,
  FLEET_HARVEST_PCT_PER_SHIP,
  GEN_FACTION_GIFT_FAVOR,
  GEN_FACTION_GIFT_MINERAL_SECONDS,
  GEN_FACTION_GIFT_TECH_SECONDS,
  JUMPGATE_HARVEST_PCT_PER_LEVEL,
  MISSION_DURATION_MAX_MINUTES,
  MISSION_DURATION_MIN_MINUTES,
  POOL_WEIGHT_CONQUEST,
  POOL_WEIGHT_FACTION,
  POOL_WEIGHT_PLANET,
  SHIP_POWER_BASE,
  WARP_ESCORT_FEE_REDUCTION,
  WARP_EXPEDITION_COST_REDUCTION,
  WORMHOLE_DISCOVERY_MULT_PER_LEVEL,
  WORMHOLE_ENERGY_REDUCTION_PER_LEVEL,
  scaledClamp,
} from './balance'
import { fleetAvailablePower, fleetPowered } from './fleet'
import { playMilestone } from './story'
import { militaryCap, netProduction } from './production'
import { formatNumber, formatPercent } from './format'
import { rollDomain } from './rng'
import type { ExpeditionResult, ExpeditionState, GameState, LogType } from './types'

/**
 * 探索系统深层模块（通关后派遣）。
 *
 * 核心语义（exploration spec 定稿，2026-08-06；ADR-0038 修订探索队列门控）：
 * - 入口门控：`phase === 'ended' || 'infinite'` 才可派遣（`isExploreAvailable`）。
 * - 多槽：基础 5 槽，跃迁枢纽（jumpgate，Lv1-10）等级决定额外槽位（`JUMPGATE_SLOT_TABLE`，
 *   Lv1 解锁第 6 槽、Lv10 满 10 槽）——ADR-0038 删除深空导航/星际通信中继两科技后，
 *   探索队列增长由枢纽单一门控承接；每槽独立 10~30 分钟随机时长（duration 域掷出冻结），
 *   离线照常推进，不可取消。
 * - 全提交：出发时扣资源（矿物/能源动态缩放 + 军事点按槽位 ×N）+ 用 `explore` 域固定种子
 *   **roll 并固化结果**（每槽独立 rollDomain 闭包 → 计数器天然独立）；回归只入账（`settleExpeditions`），
 *   防 SL 在结构上成立。
 * - 成本自适应：军事点 = min(CAP, max(40, floor(militaryCap × 2%))) × (slotIndex+1)；矿物/能源 cap 随周目 ×1.5^level——
 *   成本与收益同源缩放 → 收益比锚点 1.083× 不漂移。
 * - 探索收获倍率：`explorationHarvestMult` = 1 + 0.3×枢纽等级（ADR-0038 原科技成长并入，Lv10 = ×4.0）
 *   只作用于 resource 分支补偿（矿物/能源/科技 × mult），不碰 60min 锚点、不作用于天体产出。
 * - 奖池剔除制：未发现势力（w2）+ 未发现天体（w1，含 3 个产出型）+ 资源补偿（w = max(2, 6-已收集)），
 *   轮盘同 `pickEventDef` 法；耗尽后只剩补偿 → 资源搬运器。
 * - 重复发现补偿：已收录势力再发现 → 好感 +5（封顶 100）；已收录天体再发现 → 产出增益 +10%（封顶 +50%）。
 *
 * 护航远征（fleet-dock-10 spec 定稿，2026-08-07；ADR-0044 修订费率，2026-08-09）：
 * - 派遣可附加「护航」：一次性扣能源远征费（单艘 = 能源净产出 × ESCORT_ENERGY_SECONDS × 等效舰数，
 *   锚定当期产出永不失效），换取收获倍率（每艘 +1%）与大额返还（锚定「基础成本 + 远征费」，
 *   能源分支压低、矿物/科技突出）。
 * - 护航费余额兜底（ADR-0044）：单次护航费 ≤ 当前能源 50%，不足暂缓（能源恢复后自动重试），防抽干生产停滞。
 * - 护航条件 = `fleetPowered`（有舰且能源 ≥ 总维护费）；停摆时护航请求被拒绝（可发起无护航派遣）。
 * - 出发时固化：远征费扣减、倍率、返还值全部固化进 result（`escort` 标记同步固化，成就/日志口径）；
 *   出发后造船/停摆不影响本笔——防 SL 契约结构上成立。
 * - 自动探索：`autoExploreDispatch`（在线 tick 补位续派）/ `settleOfflineAutoExplore`（离线 60min 循环续派），
 *   走同一 startExpedition 路径（含护航费扣减、rng 走 explore 域持久化计数器、结果固化）——防 SL 契约不破；
 *   资源不足 → 暂停（enabled 保持开，pausedAt 冷却重试），资源恢复自动继续。
 */

/** 自动探索暂停原因集合（startExpedition 失败 reason 判定）：资源不足类暂停、其余异常跳过；
 * 「护航费超出能源储备，暂缓」= 50% 余额兜底（ADR-0044），能源恢复后暂停冷却自动重试 */
export const AUTO_PAUSE_REASONS = new Set(['矿物不足', '能源不足', '军力不足', '舰队能源不足，护航不可用', '护航费超出能源储备，暂缓'])

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

/** 跃迁枢纽等级 → 派遣槽加成表（ADR-0038：原深空导航/星际通信中继两科技槽位并入枢纽，
 * Lv1 解锁第 6 信道、Lv10 满 10 槽；显式表仿 DOCK_SHIP_CAP，防非等差档位漂移） */
export const JUMPGATE_SLOT_TABLE: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5,
}

/** 虫洞等级 → 派遣槽加成表（wormhole-empire：每级 +1，Lv10 满 +10——与枢纽槽位并列叠加，总上限 20；
 * 显式表仿 JUMPGATE_SLOT_TABLE，防非等差档位漂移） */
export const WORMHOLE_SLOT_TABLE: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
}

/** 解锁第 slotNo 号探索信道所需的最小跃迁枢纽等级（0 = 基础 5 槽内，无需枢纽）；
 * UI 锁定提示数据驱动用，与 JUMPGATE_SLOT_TABLE 同源防漂移 */
export function jumpgateLevelForSlot(slotNo: number): number {
  if (slotNo <= 5) return 0
  const need = slotNo - 5
  for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    if (JUMPGATE_SLOT_TABLE[lv] >= need) return lv
  }
  return 10
}

/** 解锁第 slotNo 号探索信道所需的最小虫洞等级（0 = 基础 + 枢纽槽内，无需虫洞）：
 * 第 11-20 槽由虫洞承担（每级 +1），与 jumpgateLevelForSlot 同构；`explorationSlots` 组合求和为真值，
 * 此处为 UI 提示型近似（假设枢纽先满，与 jumpgateLevelForSlot 对称）。 */
export function wormholeLevelForSlot(slotNo: number): number {
  if (slotNo <= 10) return 0
  return Math.min(10, slotNo - 10)
}

/** 探索槽位数量：基础 5 + 跃迁枢纽等级槽位（Lv1 +1、Lv10 +5）+ 虫洞等级槽位（每级 +1、Lv10 +10），
 * 总上限 20。无虫洞时与 ADR-0038 现状逐字节一致（虫洞 0 级 → +0）。
 * 等级读 `state.upgrades.jumpgate` / `state.upgrades.wormhole`（unique 建筑等级惯例，buildings 字段恒 0/1） */
export function explorationSlots(state: GameState): number {
  const jumpgateLv = Math.min(state.upgrades.jumpgate ?? 0, 10)
  const wormholeLv = Math.min(state.upgrades.wormhole ?? 0, 10)
  return Math.min(20, 5 + (JUMPGATE_SLOT_TABLE[jumpgateLv] ?? 0) + (WORMHOLE_SLOT_TABLE[wormholeLv] ?? 0))
}

/** 虫洞探索能源减耗比例：每级 WORMHOLE_ENERGY_REDUCTION_PER_LEVEL，Lv10 封顶 50%（只作用基础派遣能源，不含护航费） */
export function wormholeEnergyReduction(state: GameState): number {
  const wormholeLv = Math.min(state.upgrades.wormhole ?? 0, 10)
  return Math.min(1, WORMHOLE_ENERGY_REDUCTION_PER_LEVEL * wormholeLv)
}

/** 虫洞「发现新目标」权重倍率：每级 +WORMHOLE_DISCOVERY_MULT_PER_LEVEL，Lv10 = ×2（只作用奖池非 resource 分支；resource 补偿不放大） */
export function wormholeDiscoveryMult(state: GameState): number {
  const wormholeLv = Math.min(state.upgrades.wormhole ?? 0, 10)
  return 1 + WORMHOLE_DISCOVERY_MULT_PER_LEVEL * wormholeLv
}

/** 第 N 槽军事点消耗：min(CAP, max(40, floor(militaryCap × PCT))) × (slotIndex+1)（第 N 槽 = base×N）；
 * 星舰推进 Lv≥10 时 ×(1 − WARP_EXPEDITION_COST_REDUCTION)（ADR-0026 质变，摩擦降低） */
export function expeditionMilitaryCost(state: GameState, slotIndex: number = 0): number {
  const base = Math.min(EXPEDITION_MILITARY_CAP, Math.max(40, Math.floor(militaryCap(state) * EXPEDITION_MILITARY_PCT)))
  const cost = base * (slotIndex + 1)
  return (state.techLevels?.warpDrive ?? 0) >= 10 ? Math.max(1, Math.floor(cost * (1 - WARP_EXPEDITION_COST_REDUCTION))) : cost
}

/** 探索收获倍率：1 + 0.3 × 跃迁枢纽等级（Lv0 = ×1、Lv10 = ×4.0，ADR-0038 原科技成长并入枢纽）；
 * 只作用于 resource 分支补偿。等级读 `state.upgrades.jumpgate`（unique 建筑等级惯例） */
export function explorationHarvestMult(state: GameState): number {
  const jumpgateLv = Math.min(state.upgrades.jumpgate ?? 0, 10)
  return 1 + JUMPGATE_HARVEST_PCT_PER_LEVEL * jumpgateLv
}

/** 当前第 N 槽派遣消耗：矿物/能源随每秒产出动态缩放（cap 随周目 ×1.5^level，能源另乘虫洞减耗），军事点随军力上限自适应（×槽位） */
export function expeditionCost(state: GameState, slotIndex: number = 0): { mineral: number; energy: number; military: number } {
  const prod = netProduction(state)
  const capGrowth = Math.pow(EXPEDITION_CAP_GROWTH, state.ngPlusLevel ?? 0)
  const energy = Math.max(
    1,
    Math.floor(scaledClamp(prod.energy, EXPEDITION_ENERGY.min, EXPEDITION_ENERGY.factor, Math.floor(EXPEDITION_ENERGY.cap * capGrowth)) * (1 - wormholeEnergyReduction(state))),
  )
  return {
    mineral: scaledClamp(prod.mineral, EXPEDITION_MINERAL.min, EXPEDITION_MINERAL.factor, Math.floor(EXPEDITION_MINERAL.cap * capGrowth)),
    energy,
    military: expeditionMilitaryCost(state, slotIndex),
  }
}

/**
 * 单次派遣时长（ms）：uniform 随机整数分钟 [10, 30]（探索/攻占共享范围，均值 20min = 原 60min 的 ×3 节奏）。
 * 走 duration 域持久计数器（确定性回放，防 SL 契约不破）；派遣时掷出并冻结 finishAt。
 * 测试显式传 rng → 覆盖掷值（结果 roll 先消费注入 rng、时长 roll 后消费；生产模式各自独立域）。
 */
export function rollExpeditionDuration(state: GameState, rng?: () => number): number {
  const roll = rng ?? rollDomain(state, 'duration')
  const minutes = MISSION_DURATION_MIN_MINUTES + Math.floor(roll() * (MISSION_DURATION_MAX_MINUTES - MISSION_DURATION_MIN_MINUTES + 1))
  return minutes * 60_000
}

// ---- 护航远征（fleet-dock-10：溢出能源 → 探索收益转换器；fleet-power-exploration：收益/费用改挂等效舰数）----

/** 护航可用：舰队运转（有舰且能源 ≥ 总维护费）——停摆语义一致（无战力即无护航） */
export function canEscort(state: GameState): boolean {
  return fleetPowered(state)
}

/** 等效舰数 E = 可用舰队战力 / 单舰基础战力（= 舰数 × 军械倍率 × 星舰倍率，扣除舰队压制锁定——锁定舰不护航）：
 * 护航倍率与费用共用同一杠杆——任何战力来源（买船/军械科技/星舰科技）涨倍率必涨费用，投入产出比例恒定，结构上无印钞路径；
 * 无科技/无锁定时 E = 舰数，行为与 fleet-dock-10 原式逐字节一致。 */
export function equivalentFleet(state: GameState): number {
  return fleetAvailablePower(state) / SHIP_POWER_BASE
}

/** 单艘护航远征费（能源）= 能源净产出 × ESCORT_ENERGY_SECONDS（锚定当期产出，永不失效） */
export function escortFeePerShip(state: GameState): number {
  return Math.max(1, Math.floor(netProduction(state).energy * ESCORT_ENERGY_SECONDS))
}

/** 总护航远征费（能源）= 单艘 × 等效舰数（0 舰/停摆 = 0）——加成与费用同一杠杆，权衡始终一致；
 * 星舰推进 Lv≥20 时 ×(1 − WARP_ESCORT_FEE_REDUCTION)（ADR-0026 质变，锚定产出不脱钩） */
export function escortFee(state: GameState): number {
  const fee = Math.floor(escortFeePerShip(state) * equivalentFleet(state))
  return (state.techLevels?.warpDrive ?? 0) >= 20 ? Math.floor(fee * (1 - WARP_ESCORT_FEE_REDUCTION)) : fee
}

/** 护航收获倍率 = 1 + FLEET_HARVEST_PCT_PER_SHIP × 等效舰数（与科技收获倍率乘法叠加，只作用 resource 分支） */
export function escortHarvestMult(state: GameState): number {
  return 1 + FLEET_HARVEST_PCT_PER_SHIP * equivalentFleet(state)
}

/** 奖池候选条目 */
export interface ExpeditionPoolEntry {
  kind: 'faction' | 'planet' | 'conquest' | 'resource'
  /** factionId / planetId / 生成目标 id（resource 无 id；conquest 为 targetId） */
  id?: string
  weight: number
}

/** 无尽模式程序生成占位条目（每类一条；id 为占位符，结算时实时生成具体目标；权重走 POOL_WEIGHT_* 同源常量） */
const ENDLESS_GEN_POOL: Array<{ kind: 'conquest' | 'faction' | 'planet'; weight: number }> = [
  { kind: 'conquest', weight: POOL_WEIGHT_CONQUEST },
  { kind: 'faction', weight: POOL_WEIGHT_FACTION },
  { kind: 'planet', weight: POOL_WEIGHT_PLANET },
]

/**
 * 探索奖池（剔除制）：未发现的探索势力（各 w2）+ 未发现的探索天体（各 w1，含产出型）
 * + 资源补偿（w = max(2, 6 - 已收集数)）。已发现的不再出现（收集有终点）。
 *
 * 无尽模式扩展池（endless-expansion，仅 phase==='infinite'）：
 * - 手写保底目标（ENDLESS_* 表）：批次已解锁（batch 1 进无尽即解锁 / batch 2 第 15 次探索后）且未获得 → 入池；
 * - 程序生成占位：每类一条，未归档活跃程序目标数 < generatedCap（数量上限按类型各计、只约束程序生成）→ 入池，
 *   roll 到后结算时实时生成（确定性走 generate 域持久计数器）。
 * ended 分支与现状逐字节一致（作用域隔离——普通通关不注入扩展池）。
 */
export function expeditionPool(state: GameState): ExpeditionPoolEntry[] {
  const pool: ExpeditionPoolEntry[] = []
  // 虫洞「发现新目标」权重放大（wormhole-empire）：只作用于非 resource 分支，resource 补偿不膨胀
  const disc = wormholeDiscoveryMult(state)
  const w = (base: number): number => base * disc
  for (const def of Object.values(EXPLORE_FACTIONS)) {
    if (!state.exploredFactions.includes(def.id)) pool.push({ kind: 'faction', id: def.id, weight: w(POOL_WEIGHT_FACTION) })
  }
  for (const def of Object.values(EXPLORE_PLANETS)) {
    if (!state.exploredPlanets.includes(def.id)) pool.push({ kind: 'planet', id: def.id, weight: w(POOL_WEIGHT_PLANET) })
  }
  if (state.phase === 'infinite') {
    for (const def of Object.values(ENDLESS_CONQUESTS)) {
      const id = endlessTargetId(def.id)
      if (endlessBatchUnlocked(state, def.batch) && !state.generatedTargets.some((t) => t.id === id)) {
        pool.push({ kind: 'conquest', id, weight: w(POOL_WEIGHT_CONQUEST) })
      }
    }
    for (const def of Object.values(ENDLESS_FACTIONS)) {
      const id = endlessTargetId(def.id)
      if (endlessBatchUnlocked(state, def.batch) && !state.generatedTargets.some((t) => t.id === id)) {
        pool.push({ kind: 'faction', id, weight: w(POOL_WEIGHT_FACTION) })
      }
    }
    for (const def of Object.values(ENDLESS_PLANETS)) {
      const id = endlessTargetId(def.id)
      if (endlessBatchUnlocked(state, def.batch) && !state.generatedTargets.some((t) => t.id === id)) {
        pool.push({ kind: 'planet', id, weight: w(POOL_WEIGHT_PLANET) })
      }
    }
    for (const g of ENDLESS_GEN_POOL) {
      if (programmaticActiveCount(state, g.kind) < generatedCap(state, g.kind)) {
        pool.push({ kind: g.kind, id: `gen:${g.kind}`, weight: w(g.weight) })
      }
    }
  }
  const collected = state.exploredFactions.length + state.exploredPlanets.length
  pool.push({ kind: 'resource', weight: Math.max(2, 6 - collected) })
  return pool
}

/** 探索收集进度（explore-endstate）：外交/天体已发现数与总数、是否尽览——单一事实源。
 * found = exploredFactions/exploredPlanets 长度；total = 静态探索表条目数（4 势力 + 5 天体）。
 * exhausted = 奖池无非 resource 条目（ended 静态池集齐 → true；infinite 扩展池仍有军事/外交/天体
 * 或程序生成占位 → false）——直接复用 expeditionPool 的剔除/作用域计算（含 endless-expansion
 * batch 门控与 generatedCap），不引入第二套口径。派生纯函数，不写存档。 */
export interface ExploreProgress {
  factions: { found: number; total: number }
  planets: { found: number; total: number }
  exhausted: boolean
  /** 无尽活跃目标（infinite 扩展池）：口径 = generatedTargets 未归档（archivedRounds==null），按 kind 分类；
   * 结盟/攻占成功归档后离开活跃集（ADR-0012 归档语义）。ended 阶段无生成目标 → 全 0。 */
  endless: { conquest: number; faction: number; planet: number }
}

export function exploreProgress(state: GameState): ExploreProgress {
  // found clamp 到 total：infinite 程序生成天体也会进 exploredPlanets，可能超过静态表条目数——
  // 显示口径保持"静态池收集进度"，超额不溢出（避免「天体 8/5」）
  const factions = { found: Math.min(state.exploredFactions.length, Object.keys(EXPLORE_FACTIONS).length), total: Object.keys(EXPLORE_FACTIONS).length }
  const planets = { found: Math.min(state.exploredPlanets.length, Object.keys(EXPLORE_PLANETS).length), total: Object.keys(EXPLORE_PLANETS).length }
  const exhausted = !expeditionPool(state).some((e) => e.kind !== 'resource')
  const endless = { conquest: 0, faction: 0, planet: 0 }
  // 仅 infinite 阶段统计（ended 无生成目标；A3 无尽模式口径守卫）
  if (state.phase === 'infinite') {
    for (const t of state.generatedTargets) {
      if (state.archivedRounds[t.id] == null) endless[t.kind] += 1
    }
  }
  return { factions, planets, exhausted, endless }
}

/** 资源补偿数值（按当前投入比例返还 + 科技点出口；mult 放大 resource 分支，与成本同源缩放保持收益比锚点）。
 * 护航（escortFee > 0）：返还锚定「基础成本 + 远征费」，走护航专属返还率（ESCORT_COMPENSATE_RATIO，能源分支压低、矿物/科技突出）——
 * 海量投入 → 海量回报。⚠️ 极后期防印钞锚定（balance-sim 校准定稿）：mineral 分支按「远征费的当期矿物等价」
 * （mineralFee = fee × 矿物产出/能源产出）折算——时间等价恒 = 返还率 × 倍率，与场景无关（能源产出 >> 矿物产出时
 * 不出现 240s 能源 → 数十万秒矿物的结构性印钞）；energy/tech 分支保持锚定远征费本身（能源返能源压低、
 * 科技点出口量级匹配，sim 验证不印钞）。非护航沿用 EXPEDITION_COMPENSATE_RATIO（与现状一致）。 */
function compensationFor(
  cost: { mineral: number; energy: number },
  mult: number,
  escortFee: number = 0,
  mineralFee: number = 0,
): { mineral: number; tech: number; energy: number } {
  const ratio = escortFee > 0 ? ESCORT_COMPENSATE_RATIO : EXPEDITION_COMPENSATE_RATIO
  const mineralBase = cost.mineral + mineralFee
  const energyBase = cost.energy + escortFee
  return {
    mineral: Math.floor(mineralBase * ratio.mineral * mult),
    energy: Math.floor(energyBase * ratio.energy * mult),
    // 科技点出口锚定远征费量级（cost.mineral + escortFee）：科技点无产线竞争（消耗型资源），
    // sim 验证满负荷 0.41× 科技产线/小时——大额但不印钞（spec「科技突出」达标）
    tech: Math.floor((cost.mineral + escortFee) * ratio.techPerMineral * mult),
  }
}

/**
 * 奖池轮盘 roll：`roll() * totalWeight` 逐项减权重（与 pickEventDef 同法）。
 * roll 由调用方提供（startExpedition 内 `rng ?? rollDomain(state, 'explore')`），
 * 测试可直接注入固定 rng 断言 result 固化。
 * escortFee / mineralFee 仅用于 resource 分支补偿锚定（faction/planet 分支不涉及补偿数值）。
 */
function rollFromPool(
  pool: ExpeditionPoolEntry[],
  roll: () => number,
  cost: { mineral: number; energy: number },
  mult: number = 1,
  escortFee: number = 0,
  mineralFee: number = 0,
): ExpeditionResult {
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let value = roll() * total
  for (const entry of pool) {
    value -= entry.weight
    if (value <= 0) {
      if (entry.kind === 'faction') return { kind: 'faction', factionId: entry.id! }
      if (entry.kind === 'planet') return { kind: 'planet', planetId: entry.id! }
      if (entry.kind === 'conquest') return { kind: 'conquest', targetId: entry.id! }
      return { kind: 'resource', ...compensationFor(cost, mult, escortFee, mineralFee) }
    }
  }
  // 浮点边界兜底：最后一项
  const last = pool[pool.length - 1]
  if (last.kind === 'faction') return { kind: 'faction', factionId: last.id! }
  if (last.kind === 'planet') return { kind: 'planet', planetId: last.id! }
  if (last.kind === 'conquest') return { kind: 'conquest', targetId: last.id! }
  return { kind: 'resource', ...compensationFor(cost, mult, escortFee, mineralFee) }
}

/**
 * 发起探索派遣（全提交语义）：
 * 校验（通关后 phase / 槽位余量 / 矿物/能源/兵力足够 / 护航条件）→ 扣资源（护航另扣一次结清的海量远征费）→
 * `explore` 域 roll 固化结果 → push。
 * rng 不传（undefined）→ 结果型随机走 explore 域持久化计数器（fixed-rng 防 SL，每槽独立闭包天然独立）；
 * 显式传 rng → 测试注入（跳过计数器）。
 * @param slotIndex 槽位数组索引（0-based；第 N 槽 = N-1，军事点 ×N）
 * @param escort 是否护航远征（默认 false = 无舰队行为与现状完全一致）；护航要求 fleetPowered，
 *   停摆时护航请求被拒绝（reason 明确，可改无护航派遣）——护航条件校验先于资源扣减
 */
export function startExpedition(state: GameState, nowMs: number, rng?: () => number, slotIndex: number = 0, escort: boolean = false): ExpeditionActionResult {
  if (!isExploreAvailable(state)) return { ok: false, reason: t('log.exploration.0') }
  if (state.expeditions.filter((e) => !e.resolved).length >= explorationSlots(state)) {
    return { ok: false, reason: t('log.exploration.1') }
  }
  const cost = expeditionCost(state, slotIndex)
  if (state.resources.mineral < cost.mineral) return { ok: false, reason: t('log.exploration.2') }
  if (state.resources.energy < cost.energy) return { ok: false, reason: t('log.exploration.3') }
  if (state.resources.military < cost.military) return { ok: false, reason: t('log.exploration.4') }
  const escortOn = escort && canEscort(state)
  if (escort && !escortOn) return { ok: false, reason: t('log.exploration.5') }
  const fee = escortOn ? escortFee(state) : 0
  if (escortOn && state.resources.energy < cost.energy + fee) return { ok: false, reason: t('log.exploration.6') }
  // 护航费余额兜底（ADR-0044）：单次护航费不得超过当前能源储备的 50%——付得起但会一次抽干
  // 过半储备时暂缓派遣（AUTO_PAUSE_REASONS 含此 reason，能源恢复后冷却自动重试），防生产停滞
  if (escortOn && fee > state.resources.energy * ESCORT_FEE_ENERGY_CAP_PCT) {
    return { ok: false, reason: t('log.exploration.7') }
  }
  state.resources.mineral -= cost.mineral
  state.resources.energy -= cost.energy + fee
  state.resources.military -= cost.military
  const pool = expeditionPool(state)
  // 护航：科技收获倍率 × 护航倍率（乘法叠加，只作用 resource 分支补偿）
  const mult = escortOn ? explorationHarvestMult(state) * escortHarvestMult(state) : explorationHarvestMult(state)
  // 极后期防印钞：远征费的当期矿物等价（mineral 分支锚定用；能源/科技分支锚定远征费本身）
  const prod = netProduction(state)
  const mineralFee = escortOn && prod.energy > 0 ? fee * (prod.mineral / prod.energy) : 0
  const result = rollFromPool(pool, rng ?? rollDomain(state, 'explore'), cost, mult, fee, mineralFee)
  const id = state.nextExpeditionId
  state.nextExpeditionId += 1
  const exp: ExpeditionState = {
    id,
    startedAt: nowMs,
    finishAt: nowMs + rollExpeditionDuration(state, rng),
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
    // 深空碑文叙事挂点（deepspace-unlock spec 方案 B）：通关后首次任意探索结算确定性触发。
    // 本函数是探索结算唯一入口（在线 tick / 离线回归 / 自动探索离线循环三路调用）→ 天然全覆盖；
    // playMilestone 内部 storyFlags 防重复 → 一次循环多笔结算仅第一笔生效（双保险）。
    // isExploreAvailable 守卫落实「通关后」语义（正常流程 playing 无在途派遣，防御性校验）；
    // 离线触发叙事、成就由回归后 tick checkAchievements 自然解锁（离线路径无 checkAchievements，行为有意如此）。
    if (!state.storyFlags.deepSpace && isExploreAvailable(state)) playMilestone(state, 'deepSpace')
  }
  state.expeditions = state.expeditions.filter((e) => !e.resolved)
  return logs
}

function settleOne(state: GameState, exp: ExpeditionState, nowMs: number): ExpeditionLog {
  const r = exp.result
  const escortNote = exp.escort ? t('expR.0') : ''
  if (r.kind === 'conquest') {
    return settleConquestResult(state, r.targetId, nowMs, escortNote)
  }
  if (r.kind === 'faction') {
    const def = EXPLORE_FACTIONS[r.factionId]
    if (def && !state.factions[r.factionId]) {
      state.factions[r.factionId] = createFactionState(def)
      if (!state.exploredFactions.includes(r.factionId)) state.exploredFactions.push(r.factionId)
      return { type: 'story', text: t('log.exploration.8', { a0: defName(def), a1: escortNote }) }
    }
    const cur = state.factions[r.factionId]
    if (cur) {
      cur.favor = Math.min(FAVOR_CAP, cur.favor + EXPEDITION_REPEAT_FAVOR_GAIN)
      return { type: 'story', text: t('log.exploration.9', { a0: (def ? defName(def) : r.factionId), a1: formatNumber(EXPEDITION_REPEAT_FAVOR_GAIN), a2: escortNote }) }
    }
    // 无尽外交对象（endless-expansion）：手写保底（endless:）或程序生成（gen:faction）
    const endless = settleEndlessFaction(state, r.factionId, escortNote)
    if (endless) return endless
    return { type: 'story', text: t('log.exploration.10', { a0: (def ? defName(def) : r.factionId), a1: escortNote }) }
  }
  if (r.kind === 'planet') {
    const def = EXPLORE_PLANETS[r.planetId]
    if (def && !state.planets[r.planetId]?.unlocked) {
      state.planets[r.planetId] = { unlocked: true, unlockedAt: nowMs }
      if (!state.exploredPlanets.includes(r.planetId)) state.exploredPlanets.push(r.planetId)
      return { type: 'story', text: t('log.exploration.11', { a0: defName(def), a1: escortNote }) }
    }
    const ps = state.planets[r.planetId]
    if (ps?.unlocked) {
      ps.outputBonus = Math.min(EXPEDITION_OUTPUT_BONUS_CAP, (ps.outputBonus ?? 0) + EXPEDITION_OUTPUT_BONUS_STEP)
      return { type: 'story', text: t('log.exploration.12', { a0: (def ? defName(def) : t('misc.unknownPlanet')), a1: formatPercent(EXPEDITION_OUTPUT_BONUS_STEP * 100), a2: escortNote }) }
    }
    // 无尽天体（endless-expansion）：手写保底（endless:）或程序生成（gen:planet）
    const endless = settleEndlessPlanet(state, r.planetId, nowMs, escortNote)
    if (endless) return endless
    return { type: 'story', text: t('log.exploration.13', { a0: (def ? defName(def) : t('misc.unknownPlanet')), a1: escortNote }) }
  }
  state.resources.mineral += r.mineral
  state.resources.energy += r.energy
  state.resources.tech += r.tech
  // 探索收获统计（ADR-0041）：resource 分支是「探索天体处获得资源」的唯一口径（含护航返还补偿）；
  // 探索三元组（explore*Earned）独立记录，同时并入全局累计（total*Earned）——档案展示的细分与全口径关系。
  state.stats.exploreMineralEarned = (state.stats.exploreMineralEarned ?? 0) + r.mineral
  state.stats.exploreEnergyEarned = (state.stats.exploreEnergyEarned ?? 0) + r.energy
  state.stats.exploreTechEarned = (state.stats.exploreTechEarned ?? 0) + r.tech
  state.stats.totalMineralEarned += r.mineral
  state.stats.totalEnergyEarned = (state.stats.totalEnergyEarned ?? 0) + r.energy
  state.stats.totalTechEarned = (state.stats.totalTechEarned ?? 0) + r.tech
  // 尽览宣告（explore-endstate）：奖池无未发现目标时，资源补偿日志由「未发现新文明」改为明确终态——
  // 自动探索每笔结算由此天然宣告"无新内容"，不额外加日志、不刷屏。实时计算反映同循环先前结算的最新集合。
  const headText = exploreProgress(state).exhausted ? t('expR.1') : t('expR.2')
  return {
    type: 'reward',
    text: exp.escort
      ? t('expR.3', { a0: headText, a1: formatNumber(r.mineral), a2: formatNumber(r.energy), a3: formatNumber(r.tech) })
      : t('expR.4', { a0: headText, a1: formatNumber(r.mineral), a2: formatNumber(r.energy), a3: formatNumber(r.tech) }),
  }
}

// ---- 无尽模式生成目标结算（endless-expansion）----

/** 军事目标结算：手写保底（endless:）直接创建快照；程序生成（gen:conquest）实时生成（generate 域持久计数器，确定性防 SL） */
function settleConquestResult(state: GameState, targetId: string, nowMs: number, escortNote: string): ExpeditionLog {
  void nowMs
  if (isEndlessTargetId(targetId)) {
    const defId = targetId.slice('endless:'.length)
    const def = ENDLESS_CONQUESTS[defId]
    if (def && !state.generatedTargets.some((t) => t.id === targetId)) {
      state.generatedTargets.push({
        kind: 'conquest',
        id: targetId,
        name: defName(def),
        desc: defDesc(def),
        batch: def.batch,
        guard: def.guard,
        rewardMineral: def.rewardMineral,
        rewardTech: def.rewardTech,
        bonus: def.bonus,
      })
      state.conquest[targetId] = { status: 'available' }
      return { type: 'story', text: t('log.exploration.14', { a0: defName(def), a1: escortNote }) }
    }
    return { type: 'story', text: t('log.exploration.15', { a0: (def ? defName(def) : targetId), a1: escortNote }) }
  }
  const target = generateConquestTarget(state, rollDomain(state, 'generate'))
  state.generatedTargets.push(target)
  state.conquest[target.id] = { status: 'available' }
  return { type: 'story', text: t('log.exploration.16', { a0: target.name, a1: escortNote }) }
}

/** 外交发现礼包（ADR-0028）：产能挂钩资源（矿+科技双发）+ 好感 +10（初始 0–29 → 最高 39 < 40 自动外交阈值，零钳制逻辑）。
 * 仅首次创建派系时发放——礼包即发现价值本体（结盟在 infinite 的机制收益趋零）。 */
function grantFactionGift(state: GameState, factionId: string): void {
  const prod = netProduction(state)
  state.resources.mineral += Math.floor(prod.mineral * GEN_FACTION_GIFT_MINERAL_SECONDS)
  state.resources.tech += Math.floor(prod.mineral * GEN_FACTION_GIFT_TECH_SECONDS)
  const f = state.factions[factionId]
  if (f) f.favor = Math.min(FAVOR_CAP, f.favor + GEN_FACTION_GIFT_FAVOR)
}

/** 外交对象结算：手写保底直接创建；程序生成实时生成；首次创建发礼包；重复发现（理论上不入池，防御分支）好感 +5 */
function settleEndlessFaction(state: GameState, factionId: string, escortNote: string): ExpeditionLog | undefined {
  if (isEndlessTargetId(factionId)) {
    const defId = factionId.slice('endless:'.length)
    const def = ENDLESS_FACTIONS[defId]
    if (def && !state.factions[factionId]) {
      state.factions[factionId] = createFactionState(def)
      state.generatedTargets.push({
        kind: 'faction',
        id: factionId,
        name: defName(def),
        desc: defDesc(def),
        batch: def.batch,
        initialFavor: def.initialFavor,
        initialThreat: def.initialThreat,
        tradeDiscount: def.tradeDiscount,
        techShareCostMult: def.techShareCostMult,
        intimidateCostMult: def.intimidateCostMult,
      })
      if (!state.exploredFactions.includes(factionId)) state.exploredFactions.push(factionId)
      grantFactionGift(state, factionId)
      return { type: 'story', text: t('log.exploration.17', { a0: defName(def), a1: escortNote }) }
    }
    const cur = state.factions[factionId]
    if (cur) {
      cur.favor = Math.min(FAVOR_CAP, cur.favor + EXPEDITION_REPEAT_FAVOR_GAIN)
      return { type: 'story', text: t('log.exploration.18', { a0: (def ? defName(def) : factionId), a1: formatNumber(EXPEDITION_REPEAT_FAVOR_GAIN), a2: escortNote }) }
    }
    return { type: 'story', text: t('log.exploration.19', { a0: (def ? defName(def) : factionId), a1: escortNote }) }
  }
  const target = generateFactionTarget(state, rollDomain(state, 'generate'))
  state.generatedTargets.push(target)
  state.factions[target.id] = createFactionState(factionDefFromTarget(target))
  if (!state.exploredFactions.includes(target.id)) state.exploredFactions.push(target.id)
  grantFactionGift(state, target.id)
  return { type: 'story', text: t('log.exploration.20', { a0: target.name, a1: escortNote }) }
}

/** 天体结算：手写保底直接创建；程序生成实时生成；一次性（机制型，无 output）天体发现即归档（不可再交互 → 折叠区）；产出型保留列表 */
function settleEndlessPlanet(state: GameState, planetId: string, nowMs: number, escortNote: string): ExpeditionLog | undefined {
  if (isEndlessTargetId(planetId)) {
    const defId = planetId.slice('endless:'.length)
    const def = ENDLESS_PLANETS[defId]
    if (def && !state.planets[planetId]?.unlocked) {
      state.planets[planetId] = { unlocked: true, unlockedAt: nowMs }
      state.generatedTargets.push({
        kind: 'planet',
        id: planetId,
        name: defName(def),
        desc: defDesc(def),
        batch: def.batch,
        output: def.output,
        outputPct: def.outputPct,
        mechanicId: def.mechanicId,
      })
      if (!state.exploredPlanets.includes(planetId)) state.exploredPlanets.push(planetId)
      if (!def.output) state.archivedRounds[planetId] = state.ngPlusLevel ?? 0
      return { type: 'story', text: t('log.exploration.21', { a0: defName(def), a1: escortNote }) }
    }
    const ps = state.planets[planetId]
    if (ps?.unlocked) {
      ps.outputBonus = Math.min(EXPEDITION_OUTPUT_BONUS_CAP, (ps.outputBonus ?? 0) + EXPEDITION_OUTPUT_BONUS_STEP)
      return { type: 'story', text: t('log.exploration.22', { a0: (def ? defName(def) : planetId), a1: formatPercent(EXPEDITION_OUTPUT_BONUS_STEP * 100), a2: escortNote }) }
    }
    return { type: 'story', text: t('log.exploration.23', { a0: (def ? defName(def) : planetId), a1: escortNote }) }
  }
  const target = generatePlanetTarget(state, rollDomain(state, 'generate'))
  state.generatedTargets.push(target)
  state.planets[target.id] = { unlocked: true, unlockedAt: nowMs }
  if (!state.exploredPlanets.includes(target.id)) state.exploredPlanets.push(target.id)
  return { type: 'story', text: t('log.exploration.24', { a0: target.name, a1: escortNote }) }
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
      logs.push({ type: 'story', text: t('log.exploration.25', { a0: i + 1, a1: r.value?.escort ? '（护航）' : '' }) })
      continue
    }
    if (AUTO_PAUSE_REASONS.has(r.reason ?? '')) {
      state.autoExplore.pausedAt = nowMs
      logs.push({ type: 'warning', text: t('log.exploration.26', { a0: r.reason ?? '' }) })
      break
    }
    logs.push({ type: 'warning', text: t('log.exploration.27', { a0: r.reason ?? '' }) })
  }
  return logs
}

/**
 * 离线自动探索续派（settleOffline 调用，在在途派遣按 nowMs 结算之后）：
 * 模拟「每轮结算 → 自动续派」循环（沿封顶时长推进，5-10 槽 × 8-48 轮）。
 * - 每轮步长 = 该轮掷出的派遣时长（uniform 10~30min，duration 域持久计数器；多槽各自 finishAt 略有差异，
 *   settleExpeditions 按 finishAt 判到期 → 早到期早结算、滞后不丢总量，与原固定 60min 步长近似度一致）；
 * - 派遣走同一 startExpedition 路径（含护航费扣减、rng 走 explore/duration 域持久化计数器、结果固化）——防 SL 契约不破；
 * - 资源不足 → 暂停该轮（enabled 保持开），离线结尾仍处派遣中的自动编队留待回归后在线续算（与手动派遣离线语义一致）。
 */
export function settleOfflineAutoExplore(state: GameState, nowMs: number, durationSeconds: number): ExpeditionLog[] {
  const logs: ExpeditionLog[] = []
  if (!state.autoExplore?.enabled) return logs
  if (!isExploreAvailable(state)) return logs
  const slots = explorationSlots(state)
  const escort = state.autoExplore.escort
  const startMs = nowMs - durationSeconds * 1000
  let tm = startMs
  while (true) {
    // 每轮步长 = 该轮派遣时长（原固定 60min → 随机 10~30min，与派遣冻结语义同源）
    tm += rollExpeditionDuration(state)
    if (tm > nowMs) break
    // 到点：结算该轮到期派遣（含上一轮续派出发的；resolved 幂等）
    for (const log of settleExpeditions(state, tm)) logs.push(log)
    // 暂停冷却：距暂停不足冷却时长则跳过本轮（离线节流，防每轮日志刷屏；步长最短 10min > 60s 冷却，实际不触发）
    if (state.autoExplore.pausedAt != null && tm - state.autoExplore.pausedAt < AUTO_EXPLORE_RETRY_MS) continue
    let paused = false
    for (let i = state.expeditions.length; i < slots; i++) {
      const r = startExpedition(state, tm, undefined, i, escort)
      if (r.ok) {
        state.autoExplore.pausedAt = undefined
        logs.push({ type: 'story', text: t('log.exploration.28', { a0: i + 1, a1: r.value?.escort ? '（护航）' : '' }) })
        continue
      }
      if (AUTO_PAUSE_REASONS.has(r.reason ?? '')) {
        state.autoExplore.pausedAt = tm
        logs.push({ type: 'warning', text: t('log.exploration.29', { a0: r.reason ?? '' }) })
        paused = true
        break
      }
      logs.push({ type: 'warning', text: t('log.exploration.30', { a0: r.reason ?? '' }) })
    }
    if (paused) break
  }
  return logs
}
