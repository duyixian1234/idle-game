import { t } from '../i18n'
import { RESOURCE_META } from './data'
import {
  ENDLESS_BATCH_2_EXPLORATIONS,
  ENDLESS_BATCH_LAYER_INTERVAL,
  GEN_CONQUEST_COST_ENERGY_CAP,
  GEN_CONQUEST_COST_ENERGY_SECONDS,
  GEN_CONQUEST_COST_MINERAL_CAP,
  GEN_CONQUEST_COST_MINERAL_SECONDS,
  GEN_CONQUEST_GUARD_CAP_PCT,
  GEN_CONQUEST_GUARD_MAX_SECONDS,
  GEN_CONQUEST_GUARD_MIN,
  GEN_CONQUEST_GUARD_SECONDS,
  GEN_CONQUEST_REWARD_MINERAL_CAP,
  GEN_CONQUEST_REWARD_MINERAL_SECONDS,
  GEN_CONQUEST_REWARD_TECH_CAP,
  GEN_CONQUEST_REWARD_TECH_SECONDS,
  GEN_FACTION_FAVOR_MAX,
  GEN_FACTION_THREAT_MAX,
  GEN_FACTION_THREAT_MIN,
  GEN_PLANET_OUTPUT_MAX,
  GEN_PLANET_OUTPUT_MIN,
  GEN_PLANET_PCT_MAX,
  GEN_PLANET_PCT_MIN,
  GENERATED_CAP_EXPLORATIONS_DIVISOR,
  EXPEDITION_CAP_GROWTH,
  WORMHOLE_GENCAP_PER_LEVEL,
  scaledClamp,
} from './balance'
import { militaryCap, nominalMilitaryProduction, netProduction } from './production'
import { conquestCostMult } from './conquest'
import type { GeneratedTarget, GameState, ResourceKey } from './types'

/**
 * 无尽模式程序生成目标（endless-expansion spec 定稿，2026-08-07）。
 *
 * 设计红线（全部在测试中锁定）：
 * - **军事目标奖励仅一次性资源（矿物/科技），永不生成 permanentBonus**——程序生成目标随探索次数近无限，
 *   给永久加成会无限叠加直接摧毁 balance；bonus 仅存在于手写保底池（data.ts ENDLESS_CONQUESTS）。
 * - 确定性：所有 roll 走调用方注入的 roll 函数（生产路径 = `rollDomain(state, 'generate')` 持久计数器），
 *   同 seed + 同 rngCounters → 同结果（防 SL 与 fixed-rng 体系一致）。
 * - 区间边界封死（guard/favor/threat/output/outputPct 均落在常量区间内，不破现有数值天花板）。
 *
 * 数量上限语义（Q13/Q14 定稿）：`generatedCap` 按类型各计、只约束**程序生成目标（batch 0）**的
 * 未归档活跃数（手写保底不受限）；驱动 = 探索完成次数为主（每 GENERATED_CAP_EXPLORATIONS_DIVISOR 次 +1）、
 * 周目保底取高者、不封顶。
 */

// ---- 生成词库（命名/描述素材，程序生成专用） ----

// 词库 key 引用 i18n 资源顶层数组（cqPre/cqNoun/facPre/facNoun/plPre/plNoun；修复：原误用 gen. 前缀导致 t() 返回 key 本身）
// as const：保留字面量联合类型，使 t() 的 DeepKey<Zh> 约束直接通过（无需强转）
const CONQUEST_PREFIX = ['cqPre.0', 'cqPre.1', 'cqPre.2', 'cqPre.3', 'cqPre.4', 'cqPre.5', 'cqPre.6', 'cqPre.7'] as const
const CONQUEST_NOUN = ['cqNoun.0', 'cqNoun.1', 'cqNoun.2', 'cqNoun.3', 'cqNoun.4', 'cqNoun.5', 'cqNoun.6', 'cqNoun.7'] as const
const FACTION_PREFIX = ['facPre.0', 'facPre.1', 'facPre.2', 'facPre.3', 'facPre.4', 'facPre.5', 'facPre.6', 'facPre.7'] as const
const FACTION_NOUN = ['facNoun.0', 'facNoun.1', 'facNoun.2', 'facNoun.3', 'facNoun.4', 'facNoun.5', 'facNoun.6', 'facNoun.7'] as const
const PLANET_PREFIX = ['plPre.0', 'plPre.1', 'plPre.2', 'plPre.3', 'plPre.4', 'plPre.5', 'plPre.6', 'plPre.7'] as const
const PLANET_NOUN = ['plNoun.0', 'plNoun.1', 'plNoun.2', 'plNoun.3', 'plNoun.4', 'plNoun.5', 'plNoun.6', 'plNoun.7'] as const
const PRODUCING_RESOURCES: ResourceKey[] = ['mineral', 'energy', 'tech']

/** 从词库取一项（roll 推进一位） */
function pick<T>(arr: readonly T[], roll: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(roll() * arr.length))]
}

/** Fisher-Yates 洗牌（roll 驱动，确定性） */
function shuffle<T>(arr: readonly T[], roll: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(roll() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---- 数量上限与批次 ----

/** 无尽模式生成目标数量上限（每类独立，不封顶）：
 * `max(2 + floor(探索次数/10), 2 + 周目数) + 虫洞等级 × WORMHOLE_GENCAP_PER_LEVEL`——探索次数为主驱动（Q7 推荐 B），周目数保底（A），
 * 虫洞等级叠加放大（wormhole-empire：每级 +1，Lv10 +10）；
 * `stats.explorations` 为周目内口径（NG+ 归零，engine.ts startNewGamePlus）→ 换周目后从 2+ngPlusLevel 起步。
 * 系数 GENERATED_CAP_EXPLORATIONS_DIVISOR 由 balance-sim 校准（ticket 05）。 */
export function generatedCap(state: GameState, kind: GeneratedTarget['kind']): number {
  const byProgress = 2 + Math.floor((state.stats?.explorations ?? 0) / GENERATED_CAP_EXPLORATIONS_DIVISOR)
  const byRound = 2 + (state.ngPlusLevel ?? 0)
  const wormholeLv = Math.min(state.upgrades?.wormhole ?? 0, 10)
  void kind // 每类独立上限语义体现在调用方按 kind 分别计数；cap 公式目前三类同构
  return Math.max(byProgress, byRound) + wormholeLv * WORMHOLE_GENCAP_PER_LEVEL
}

/** 程序生成目标（batch 0）未归档活跃计数——数量上限只约束程序生成（手写保底不受限，Q13 定稿）。
 * boss 军力挑战（boss:L*，ADR-0053）不占生成名额（每 3 层固定一个，不计入 generatedCap）。
 * 注意：归档周目标记可为 0（第 0 周目归档），必须用 `== null` 判定，不能用 falsy。 */
export function programmaticActiveCount(state: GameState, kind: GeneratedTarget['kind']): number {
  return state.generatedTargets.filter((t) => t.kind === kind && t.batch === 0 && !t.id.startsWith('boss:L') && state.archivedRounds[t.id] == null).length
}

/** 保底批次解锁（endless-expansion Q16 方案 B + endless-progression 关键层批次）：
 * batch 1 = 进入无尽即解锁；batch 2 = 第 ENDLESS_BATCH_2_EXPLORATIONS 次探索后解锁；
 * batch 3+ = 层数 ≥ ENDLESS_BATCH_LAYER_INTERVAL×(batch−2) 后解锁（每 10 层解锁一档，ticket 05 加深） */
export function endlessBatchUnlocked(state: GameState, batch: 1 | 2 | 3): boolean {
  if (batch === 1) return true
  if (batch === 2) return (state.stats?.explorations ?? 0) >= ENDLESS_BATCH_2_EXPLORATIONS
  const layer = Math.max(0, Math.floor(state.endless?.layer ?? 0))
  return layer >= ENDLESS_BATCH_LAYER_INTERVAL * (batch - 2)
}

/** 手写保底目标快照 id（endless:<defId>；探索奖池与 generatedTargets 共用标识） */
export function endlessTargetId(defId: string): string {
  return `endless:${defId}`
}

/** 判断 id 是否为手写保底目标（endless: 前缀） */
export function isEndlessTargetId(id: string): boolean {
  return id.startsWith('endless:')
}

// ---- 程序生成器（纯函数：输入 state + roll，无副作用；确定性由 roll 序列保证）----

/**
 * 军事目标生成：词库命名；guard = min(max(500, ⌊军力名义产出 × 40s⌋), ⌊军力上限/3⌋, ⌊名义产出×180s⌋)
 * （conquest-guard-cap 2026-08-11 双上限：攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间，grill Q1-Q5）——
 * 守卫锚回充速度（产出高时回充 40s 语义保留）且受容量/3 硬约束（上限优先：早期容量/3 < 500 时守卫 = 容量/3）；
 * 一次性奖励/攻占成本统一锚定当期净产出（ADR-0028：成本与奖励同源缩放 → 净比值恒定防印钞；消耗另乘攻占科技折扣，ticket 04）；
 * **永不生成 permanentBonus**（红线，单测锁定）
 */
export function generateConquestTarget(state: GameState, roll: () => number): GeneratedTarget {
  const name = `${t(pick(CONQUEST_PREFIX, roll))}${t(pick(CONQUEST_NOUN, roll))}`
  const prod = netProduction(state)
  // 守卫锚军力名义产能（不被容量截断）：满员截断不压低守卫（否则军力越满守卫越小，攻占反而变便宜——设计悖论）；
  // byProd = 产出×40s 回充口径；prodCap = 产出×180s 上限（产能 0 时取 500 保底防守卫压到 0）；capCap = 容量/3 硬上限（上限优先）
  const byProd = Math.floor(nominalMilitaryProduction(state) * GEN_CONQUEST_GUARD_SECONDS)
  const prodCap = Math.max(GEN_CONQUEST_GUARD_MIN, Math.floor(nominalMilitaryProduction(state) * GEN_CONQUEST_GUARD_MAX_SECONDS))
  const capCap = Math.floor(militaryCap(state) * GEN_CONQUEST_GUARD_CAP_PCT)
  const guard = Math.min(Math.max(GEN_CONQUEST_GUARD_MIN, byProd), prodCap, capCap)
  const seq = state.generatedTargets.length
  // 攻占一次性经济封顶（ADR-0028 未决项落地，ticket 08）：奖励/成本随当期净产出缩放但带 cap（cap × 1.5^ng 随周目增长），
  // 与探索侧 scaledClamp 同构；ROI 锚点（奖励 120s / 成本 60s×折扣 ≈ 4×）比例保持，仅上限约束。
  const capGrowth = Math.pow(EXPEDITION_CAP_GROWTH, state.ngPlusLevel ?? 0)
  const rewardMineralCap = Math.floor(GEN_CONQUEST_REWARD_MINERAL_CAP * capGrowth)
  const rewardTechCap = Math.floor(GEN_CONQUEST_REWARD_TECH_CAP * capGrowth)
  const costMineralCap = Math.floor(GEN_CONQUEST_COST_MINERAL_CAP * capGrowth)
  const costEnergyCap = Math.floor(GEN_CONQUEST_COST_ENERGY_CAP * capGrowth)
  return {
    kind: 'conquest',
    id: `gen:conquest:${seq}`,
    name,
    desc: t('gen.0', { a0: name }),
    batch: 0,
    guard,
    rewardMineral: scaledClamp(prod.mineral, 0, GEN_CONQUEST_REWARD_MINERAL_SECONDS, rewardMineralCap),
    rewardTech: scaledClamp(prod.mineral, 0, GEN_CONQUEST_REWARD_TECH_SECONDS, rewardTechCap),
    // 攻占消耗折扣（conquest-guard-cap，Q10 生成时固化）：按生成时科技等级乘 conquestCostMult（Lv10 ×0.5），升级后新目标立享
    costMineral: Math.floor(scaledClamp(prod.mineral, 0, GEN_CONQUEST_COST_MINERAL_SECONDS, costMineralCap) * conquestCostMult(state)),
    costEnergy: Math.floor(scaledClamp(prod.energy, 0, GEN_CONQUEST_COST_ENERGY_SECONDS, costEnergyCap) * conquestCostMult(state)),
  }
}

/** 外交对象生成：词库命名；初始 favor [0, GEN_FACTION_FAVOR_MAX]、threat [MIN, MAX]；
 * 特性从 3 类池随机抽 1-2 个（数值落在现有区间：tradeDiscount 0.05-0.08 / techShareCostMult 0.5 / intimidateCostMult 0.75） */
export function generateFactionTarget(state: GameState, roll: () => number): GeneratedTarget {
  const name = `${t(pick(FACTION_PREFIX, roll))}${t(pick(FACTION_NOUN, roll))}`
  const seq = state.generatedTargets.length
  const target: GeneratedTarget = {
    kind: 'faction',
    id: `gen:faction:${seq}`,
    name,
    desc: t('gen.1', { a0: name }),
    batch: 0,
    initialFavor: Math.floor(roll() * GEN_FACTION_FAVOR_MAX),
    initialThreat: GEN_FACTION_THREAT_MIN + Math.floor(roll() * (GEN_FACTION_THREAT_MAX - GEN_FACTION_THREAT_MIN)),
  }
  // 特性 1-2 个（抽 2 个时用洗牌取前 2，保证同轮内不重复）
  const traits = shuffle(['tradeDiscount', 'techShareCostMult', 'intimidateCostMult'] as const, roll)
  const traitCount = roll() < 0.5 ? 1 : 2
  for (const t of traits.slice(0, traitCount)) {
    if (t === 'tradeDiscount') target.tradeDiscount = Math.round((0.05 + roll() * 0.03) * 100) / 100
    if (t === 'techShareCostMult') target.techShareCostMult = 0.5
    if (t === 'intimidateCostMult') target.intimidateCostMult = 0.75
  }
  return target
}

/** 天体生成：词库命名；单种产出（mineral/energy/tech 均匀抽 1 种）；
 * output ∈ [MIN, MAX]、outputPct ∈ [PCT_MIN, PCT_MAX]（封死不破现有天花板，Q10 定稿） */
export function generatePlanetTarget(state: GameState, roll: () => number): GeneratedTarget {
  const name = `${t(pick(PLANET_PREFIX, roll))}${t(pick(PLANET_NOUN, roll))}`
  const seq = state.generatedTargets.length
  const resKey = pick(PRODUCING_RESOURCES, roll)
  const output = Math.round((GEN_PLANET_OUTPUT_MIN + roll() * (GEN_PLANET_OUTPUT_MAX - GEN_PLANET_OUTPUT_MIN)) * 100) / 100
  const outputPct = Math.round((GEN_PLANET_PCT_MIN + roll() * (GEN_PLANET_PCT_MAX - GEN_PLANET_PCT_MIN)) * 1000) / 1000
  return {
    kind: 'planet',
    id: `gen:planet:${seq}`,
    name,
    desc: t('gen.2', { a0: t(RESOURCE_META[resKey].nameKey), a1: name }),
    batch: 0,
    output: { [resKey]: output },
    outputPct: { [resKey]: outputPct },
  }
}
