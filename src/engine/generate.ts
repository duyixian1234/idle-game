import {
  ENDLESS_BATCH_2_EXPLORATIONS,
  GEN_CONQUEST_COST_ENERGY_SECONDS,
  GEN_CONQUEST_COST_MINERAL_SECONDS,
  GEN_CONQUEST_GUARD_MIN,
  GEN_CONQUEST_GUARD_PCT_MAX,
  GEN_CONQUEST_GUARD_PCT_MIN,
  GEN_CONQUEST_REWARD_MINERAL_SECONDS,
  GEN_CONQUEST_REWARD_TECH_SECONDS,
  GEN_FACTION_FAVOR_MAX,
  GEN_FACTION_THREAT_MAX,
  GEN_FACTION_THREAT_MIN,
  GEN_PLANET_OUTPUT_MAX,
  GEN_PLANET_OUTPUT_MIN,
  GEN_PLANET_PCT_MAX,
  GEN_PLANET_PCT_MIN,
  GENERATED_CAP_EXPLORATIONS_DIVISOR,
} from './balance'
import { militaryCap, netProduction } from './production'
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

const CONQUEST_PREFIX = ['掠夺者', '流亡', '狂怒', '幽影', '暴君', '亡潮', '赤潮', '虚空']
const CONQUEST_NOUN = ['舰队', '巢穴', '堡垒', '方舟', '军团', '尖塔', '船坞', '母舰']
const FACTION_PREFIX = ['星辉', '静默', '流浪', '共鸣', '苍蓝', '灰烬', '翡翠', '余烬']
const FACTION_NOUN = ['共同体', '行会', '教团', '同盟', '部落', '议会', '商会', '远征队']
const PLANET_PREFIX = ['碎星', '极光', '暗潮', '新星', '磁暴', '冻云', '晶矿', '等离子']
const PLANET_NOUN = ['带', '云', '场', '海', '域', '环', '平原', '墓场']
const PRODUCING_RESOURCES: ResourceKey[] = ['mineral', 'energy', 'tech']
const RESOURCE_LABEL: Record<ResourceKey, string> = { mineral: '矿物', energy: '能源', tech: '科技', military: '军力' }

/** 从词库取一项（roll 推进一位） */
function pick<T>(arr: T[], roll: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(roll() * arr.length))]
}

/** Fisher-Yates 洗牌（roll 驱动，确定性） */
function shuffle<T>(arr: T[], roll: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(roll() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---- 数量上限与批次 ----

/** 无尽模式生成目标数量上限（每类独立，不封顶）：
 * `max(2 + floor(探索次数/10), 2 + 周目数)`——探索次数为主驱动（Q7 推荐 B），周目数保底（A）；
 * `stats.explorations` 为周目内口径（NG+ 归零，engine.ts startNewGamePlus）→ 换周目后从 2+ngPlusLevel 起步。
 * 系数 GENERATED_CAP_EXPLORATIONS_DIVISOR 由 balance-sim 校准（ticket 05）。 */
export function generatedCap(state: GameState, kind: GeneratedTarget['kind']): number {
  const byProgress = 2 + Math.floor((state.stats?.explorations ?? 0) / GENERATED_CAP_EXPLORATIONS_DIVISOR)
  const byRound = 2 + (state.ngPlusLevel ?? 0)
  void kind // 每类独立上限语义体现在调用方按 kind 分别计数；cap 公式目前三类同构
  return Math.max(byProgress, byRound)
}

/** 程序生成目标（batch 0）未归档活跃计数——数量上限只约束程序生成（手写保底不受限，Q13 定稿）。
 * 注意：归档周目标记可为 0（第 0 周目归档），必须用 `== null` 判定，不能用 falsy。 */
export function programmaticActiveCount(state: GameState, kind: GeneratedTarget['kind']): number {
  return state.generatedTargets.filter((t) => t.kind === kind && t.batch === 0 && state.archivedRounds[t.id] == null).length
}

/** 保底批次解锁（Q16 方案 B）：batch 1 = 进入无尽即解锁；batch 2 = 第 ENDLESS_BATCH_2_EXPLORATIONS 次探索后解锁 */
export function endlessBatchUnlocked(state: GameState, batch: 1 | 2): boolean {
  if (batch === 1) return true
  return (state.stats?.explorations ?? 0) >= ENDLESS_BATCH_2_EXPLORATIONS
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
 * 军事目标生成：词库命名；guard = 军力容量 × [pct_min, pct_max]（clamp 500 下限，ADR-0033）——
 * 攻占军力成本随军港规模/军械科技上升，后期成真实门槛（挑战阈值语义）；
 * 一次性奖励/攻占成本统一锚定当期净产出（ADR-0028：成本与奖励同源缩放 → 净比值恒定防印钞）；
 * **永不生成 permanentBonus**（红线，单测锁定）
 */
export function generateConquestTarget(state: GameState, roll: () => number): GeneratedTarget {
  const name = `${pick(CONQUEST_PREFIX, roll)}${pick(CONQUEST_NOUN, roll)}`
  const guard = Math.max(
    GEN_CONQUEST_GUARD_MIN,
    Math.floor(militaryCap(state) * (GEN_CONQUEST_GUARD_PCT_MIN + roll() * (GEN_CONQUEST_GUARD_PCT_MAX - GEN_CONQUEST_GUARD_PCT_MIN))),
  )
  const seq = state.generatedTargets.length
  // 一次性奖励/成本：锚定目标创建（发现）时点的当期净产出，成本与奖励同源（ADR-0028）
  const prod = netProduction(state)
  return {
    kind: 'conquest',
    id: `gen:conquest:${seq}`,
    name,
    desc: `星际深处游荡的${name}，肃清后可回收大量资源。`,
    batch: 0,
    guard,
    rewardMineral: Math.floor(prod.mineral * GEN_CONQUEST_REWARD_MINERAL_SECONDS),
    rewardTech: Math.floor(prod.mineral * GEN_CONQUEST_REWARD_TECH_SECONDS),
    costMineral: Math.floor(prod.mineral * GEN_CONQUEST_COST_MINERAL_SECONDS),
    costEnergy: Math.floor(prod.energy * GEN_CONQUEST_COST_ENERGY_SECONDS),
  }
}

/** 外交对象生成：词库命名；初始 favor [0, GEN_FACTION_FAVOR_MAX]、threat [MIN, MAX]；
 * 特性从 3 类池随机抽 1-2 个（数值落在现有区间：tradeDiscount 0.05-0.08 / techShareCostMult 0.5 / intimidateCostMult 0.75） */
export function generateFactionTarget(state: GameState, roll: () => number): GeneratedTarget {
  const name = `${pick(FACTION_PREFIX, roll)}${pick(FACTION_NOUN, roll)}`
  const seq = state.generatedTargets.length
  const target: GeneratedTarget = {
    kind: 'faction',
    id: `gen:faction:${seq}`,
    name,
    desc: `在偏远星区活动的${name}，正等待与你建立外交联系。`,
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
  const name = `${pick(PLANET_PREFIX, roll)}${pick(PLANET_NOUN, roll)}`
  const seq = state.generatedTargets.length
  const resKey = pick(PRODUCING_RESOURCES, roll)
  const output = Math.round((GEN_PLANET_OUTPUT_MIN + roll() * (GEN_PLANET_OUTPUT_MAX - GEN_PLANET_OUTPUT_MIN)) * 100) / 100
  const outputPct = Math.round((GEN_PLANET_PCT_MIN + roll() * (GEN_PLANET_PCT_MAX - GEN_PLANET_PCT_MIN)) * 1000) / 1000
  return {
    kind: 'planet',
    id: `gen:planet:${seq}`,
    name,
    desc: `富含${RESOURCE_LABEL[resKey]}的${name}，可提供持续的${RESOURCE_LABEL[resKey]}产出。`,
    batch: 0,
    output: { [resKey]: output },
    outputPct: { [resKey]: outputPct },
  }
}
