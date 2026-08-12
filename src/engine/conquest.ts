import { t } from '../i18n'
import { CONQUESTS, TECHS, defName } from './data'
import type { ConquestDef } from './data'
import { AUTO_CONQUEST_COOLDOWN_MS, AUTO_CONQUEST_MILITARY_RESERVE_PCT, BOSS_GUARD_CAP_LAYER_GROWTH, BOSS_GUARD_CAP_PCT, BOSS_GUARD_MAX_SECONDS, BOSS_GUARD_PROD_LAYER_GROWTH, BOSS_GUARD_PROD_SECONDS, BOSS_REWARD_LAYER_GROWTH, BOSS_REWARD_MINERAL_SECONDS, BOSS_REWARD_TECH_SECONDS, CONQUEST_MILITARY_REFUND_PCT, ENDLESS_CONQUEST_LAYER_PROGRESS, FLEET_CONQUEST_CAP_PCT, MISSION_DURATION_MAX_MINUTES, MISSION_DURATION_MIN_MINUTES } from './balance'
import { advanceEndlessLayer, endlessBossAvailable, endlessLayer } from './events'
import { playMilestone } from './story'
import { reputationBonuses } from './reputation'
import { militaryCap, netProduction, nominalMilitaryProduction } from './production'
import { fleetAvailablePower } from './fleet'
import { rollDomain } from './rng'
import { techLevel } from './tech'
import { formatNumber, formatPercent } from './format'
import { compactTargetOnArchive } from './archive'
import type { ConquestState, GameState, GeneratedTarget } from './types'

/**
 * 攻占系统深层模块：4 个第三方区域（虫群前哨/废弃船坞/星际残骸带/虫群母巢）。
 * - 发起 = 锁定投入军力 + 10~30 分钟随机倒计时（离线照常推进）
 * - 结算 = 成功率 min(100%, 投入/守卫强度)，足额投入必成；失败军力全损可立即重试
 * - 成功 = 一次性奖励 + 永久全局加成（permanentBonuses）+ 个别区域解锁军械科技
 * 惩罚语义（挂机铁律）：只动可再生资源流（军力/矿/能），绝不毁建筑/科技/区域/存档。
 */

export interface ConquestActionResult {
  ok: boolean
  reason?: string
}

/**
 * 单次攻占时长（ms）：uniform 随机整数分钟 [10, 30]（与探索共享范围常量，均值 20min = 原 60min 的 ×3 节奏）。
 * 走 duration 域持久计数器（确定性回放，防 SL 契约不破）；发起时掷出并冻结 finishAt。
 * 测试显式传 rng → 覆盖掷值（生产模式走持久域；startConquest 无其他 rng 消费点，顺序固定）。
 */
export function rollConquestDuration(state: GameState, rng?: () => number): number {
  const roll = rng ?? rollDomain(state, 'duration')
  const minutes = MISSION_DURATION_MIN_MINUTES + Math.floor(roll() * (MISSION_DURATION_MAX_MINUTES - MISSION_DURATION_MIN_MINUTES + 1))
  return minutes * 60_000
}

/** 容错读取攻占状态（旧档迁移后 conquest 可能为空对象） */
export function conquestState(state: GameState, id: string): ConquestState {
  return state.conquest[id] ?? { status: 'locked' }
}

/** 攻占区域 def 查询：静态 CONQUESTS 优先，未命中查无尽生成目标（endless 前缀 / gen 前缀——动态军事目标统一入口）。
 * 动态目标无前置星球（无尽模式已通关），unlockPlanet 取 'dawn'（必解锁）、afterEnding false（不额外门控）。 */
export function conquestDef(state: GameState, id: string): ConquestDef | undefined {
  const staticDef = CONQUESTS[id]
  if (staticDef) return staticDef
  const t = state.generatedTargets?.find((x) => x.kind === 'conquest' && x.id === id)
  if (!t) return undefined
  return {
    id: t.id,
    nameText: t.name,
    descText: t.desc,
    guard: t.guard ?? 0,
    unlockPlanet: 'dawn',
    afterEnding: false,
    rewardMineral: t.rewardMineral,
    rewardTech: t.rewardTech,
    bonus: t.bonus,
  }
}

// ---- boss 军力挑战（endless-progression，ADR-0053，2026-08-11）----

/** boss 守卫公式（ADR-0053）：`min(产能×40s×(1+0.15×(layer-1)), ⌊军力上限×1/3⌋×(1+0.10×(layer-1)), 产能×180s×2)`
 * - 产能项 × 层数系数（产出越高、层数越高 → 守卫越强）
 * - 容量项受攻占双上限硬约束（≤ 军力上限 1/3），随层数放大
 * - 末项 = GEN_CONQUEST_GUARD_MAX_SECONDS×2 安全阀（boss 强于普通生成目标）
 * 产能 0（无兵营）时取 500 保底（与生成目标同构防守卫塌 0） */
export function endlessBossGuard(state: GameState, layer: number): number {
  const byProd = Math.floor(nominalMilitaryProduction(state) * BOSS_GUARD_PROD_SECONDS * (1 + BOSS_GUARD_PROD_LAYER_GROWTH * (layer - 1)))
  const byCap = Math.floor(Math.floor(militaryCap(state) * BOSS_GUARD_CAP_PCT) * (1 + BOSS_GUARD_CAP_LAYER_GROWTH * (layer - 1)))
  const byMax = Math.floor(nominalMilitaryProduction(state) * BOSS_GUARD_MAX_SECONDS)
  return Math.max(500, Math.min(byProd, byCap, byMax))
}

/** boss 一次性奖励（层数系数）：奖励锚定当期净产出（ADR-0028 同源），× (1 + 0.15×(layer-1)) */
export function endlessBossReward(state: GameState, layer: number): { rewardMineral?: number; rewardTech?: number } {
  const prod = netProduction(state)
  const growth = 1 + BOSS_REWARD_LAYER_GROWTH * (layer - 1)
  return {
    rewardMineral: Math.floor(prod.mineral * BOSS_REWARD_MINERAL_SECONDS * growth),
    rewardTech: Math.floor(prod.mineral * BOSS_REWARD_TECH_SECONDS * growth),
  }
}

/** 当前 boss 目标 id（`boss:L<layer>`，每 3 层一个；已攻克则下次同层不再生成，层推进后新层出现新 boss） */
export function endlessBossId(state: GameState): string | null {
  if (!endlessBossAvailable(state)) return null
  const layer = endlessLayer(state)
  return `boss:L${layer}`
}

/** 确保当前层 boss 目标存在（幂等）：layer%3===0 且未获得时注入 generatedTargets + conquest 可用态。
 * boss 复用攻占结算管线（发起/守卫/结算/奖励）；autoBoss 开启后由自动系统按冷却发起。 */
export function ensureEndlessBoss(state: GameState): string | null {
  const id = endlessBossId(state)
  if (!id) return null
  if (state.generatedTargets.some((x) => x.kind === 'conquest' && x.id === id)) return id
  const layer = endlessLayer(state)
  const guard = endlessBossGuard(state, layer)
  const { rewardMineral, rewardTech } = endlessBossReward(state, layer)
  const target: GeneratedTarget = {
    kind: 'conquest',
    id,
    name: t('cq.10', { a0: formatNumber(layer) }),
    desc: t('cq.11', { a0: formatNumber(layer), a1: formatNumber(guard) }),
    batch: 0,
    guard,
    rewardMineral,
    rewardTech,
  }
  state.generatedTargets.push(target)
  state.conquest[id] = { status: 'available' }
  return id
}

/** boss 是否被当前层已攻克（归档）：判定当前 boss 层是否已归档 */
export function endlessBossDefeated(state: GameState): boolean {
  const id = endlessBossId(state)
  if (!id) return false
  return state.archivedRounds[id] != null || state.conquest[id]?.status === 'conquered'
}

/** 区域是否可发起攻占：未攻占、不在进行中、前置星球已解锁、（通关后区域需 phase ≠ playing） */
export function isConquestAvailable(state: GameState, id: string): boolean {
  const def = conquestDef(state, id)
  if (!def) return false
  const cs = conquestState(state, id)
  if (cs.status === 'conquered') return false
  if (cs.startedAt != null) return false
  if (!state.planets[def.unlockPlanet]?.unlocked) return false
  if (def.afterEnding && state.phase === 'playing') return false
  return true
}

/**
 * 攻占产出乘数（conquest-guard-cap，2026-08-11）：1 + conquestTheory 等级 × rewardMult（0.1/级，Lv10 ×2）。
 * 结算时按当前等级实时乘（Q10）；科技未研发/效果非 conquest → 1.0（零影响）。
 */
export function conquestRewardMult(state: GameState): number {
  const def = TECHS.conquestTheory
  if (!def || def.effect.kind !== 'conquest') return 1
  return 1 + techLevel(state, def.id) * def.effect.rewardMult
}

/**
 * 攻占消耗乘数（conquest-guard-cap，2026-08-11）：max(0.5, 1 − conquestTheory 等级 × costMult)（0.05/级，Lv10 ×0.5 半价封顶）。
 * 目标生成时按当前等级固化快照（Q10）；科技未研发/效果非 conquest → 1.0（零影响）。
 */
export function conquestCostMult(state: GameState): number {
  const def = TECHS.conquestTheory
  if (!def || def.effect.kind !== 'conquest') return 1
  return Math.max(0.5, 1 - techLevel(state, def.id) * def.effect.costMult)
}

/** 发起攻占：投入军力（≥1）并锁定倒计时（startedAt/finishAt；时长为 duration 域随机 10~30min，rng 可选注入供测试覆盖）。
 * 程序生成目标（gen:*）另扣发现时固化的产能挂钩资源费（ADR-0028，costMineral/costEnergy 快照；手写保底/静态区域无此字段 → 0）。
 * useFleet（默认 true，conquest-fleet）：手动攻占「舰队压制」——舰队战力折算计入攻占（≤ 守卫 × FLEET_CONQUEST_CAP_PCT，
 * 防满配舰队碾压），发起时锁定 cs.fleetLocked、结算（成功/失败）释放；自动攻占传 false 保持纯军力（不替玩家做防御取舍）。 */
export function startConquest(state: GameState, id: string, invest: number, nowMs: number, rng?: () => number, useFleet = true): ConquestActionResult {
  const def = conquestDef(state, id)
  if (!def) return { ok: false, reason: t('log.conquest.0') }
  if (!isConquestAvailable(state, id)) return { ok: false, reason: t('log.conquest.1') }
  if (!Number.isFinite(invest) || invest <= 0) return { ok: false, reason: t('log.conquest.2') }
  if (state.resources.military < invest) return { ok: false, reason: t('log.conquest.3') }
  const target = state.generatedTargets.find((x) => x.kind === 'conquest' && x.id === id)
  const costMineral = target?.costMineral ?? 0
  const costEnergy = target?.costEnergy ?? 0
  if (state.resources.mineral < costMineral) return { ok: false, reason: t('log.conquest.4') }
  if (state.resources.energy < costEnergy) return { ok: false, reason: t('log.conquest.5') }
  state.resources.military -= invest
  state.resources.mineral -= costMineral
  state.resources.energy -= costEnergy
  const cs: ConquestState = { status: 'available', startedAt: nowMs, finishAt: nowMs + rollConquestDuration(state, rng), invested: invest }
  if (useFleet) {
    // 舰队压制：折算锁定 = min(可用战力, 守卫 × 封顶比例)；>0 才写字段（结算释放 = 删除字段）
    const contrib = Math.floor(Math.min(fleetAvailablePower(state), def.guard * FLEET_CONQUEST_CAP_PCT))
    if (contrib > 0) cs.fleetLocked = contrib
  }
  state.conquest[id] = cs
  return { ok: true }
}

/**
 * 结算已到期的攻占（成功/失败），返回日志文本（由调用方 pushLog）。
 * rng 不传（undefined）→ 结果型随机走 conquest 域持久化计数器（fixed-rng 防 SL）；
 * 显式传 rng → 测试注入（跳过计数器，行为与现状一致）。
 *
 * 双遍历（endless-expansion）：静态 CONQUESTS + 无尽生成目标（generatedTargets kind='conquest'）。
 * - 动态目标由探索发现创建（status 'available'），复用同一守卫/成功率/失败重试机制；
 * - 成功一律写归档周目标记（archivedRounds[id] = ngPlusLevel，本周目语义，NG+ 清空）；
 * - 动态目标**不参与 conquestAll 里程碑**（仅静态表检查，天然成立，注释声明）。
 */
export function settleConquests(state: GameState, nowMs: number, rng?: () => number): string[] {
  const logs: string[] = []
  // 确保当前层 boss 目标存在（ADR-0053：layer%3===0 时注入；幂等）
  ensureEndlessBoss(state)
  const roll = rng ?? (() => rollDomain(state, 'conquest')())
  for (const def of Object.values(CONQUESTS)) {
    const log = settleOneConquest(state, def.id, def, nowMs, roll, true)
    if (log) logs.push(log)
  }
  // 无尽生成军事目标（动态）：快照守卫/奖励，与静态同机制；无 unlockTech/unlockPlanet/里程碑
  for (const gt of state.generatedTargets) {
    if (gt.kind !== 'conquest') continue
    const def = conquestDef(state, gt.id)
    if (!def) continue
    const log = settleOneConquest(state, gt.id, def, nowMs, roll, false)
    if (log) logs.push(log)
  }
  return logs
}

/** 单区域结算（静态/动态共用）：null = 未在结算窗口；成功/失败返回日志文本 */
function settleOneConquest(
  state: GameState,
  id: string,
  def: Pick<ConquestDef, 'guard' | 'rewardMineral' | 'rewardTech' | 'bonus' | 'unlockTech' | 'nameKey' | 'nameText'>,
  nowMs: number,
  roll: () => number,
  isStatic: boolean,
): string | null {
  const cs = state.conquest[id]
  if (!cs || cs.startedAt == null || cs.finishAt == null) return null
  if (nowMs < cs.finishAt) return null
  const invest = cs.invested ?? 0
  // 成功率 = min(100%, (投入军力 + 舰队压制锁定)/守卫 × (1 + 声望成功率加成))：薄投受益，足额投入仍必成（100% 封顶）
  const chance = Math.min(1, ((invest + (cs.fleetLocked ?? 0)) / def.guard) * (1 + reputationBonuses(state).conquestSuccessBonus))
  const success = roll() < chance
  if (success) {
    cs.status = 'conquered'
    delete cs.startedAt
    delete cs.finishAt
    delete cs.invested
    delete cs.fleetLocked // 舰队压制锁定释放（conquest-fleet）
    const rewards: string[] = []
    // 攻占产出乘数（conquest-guard-cap）：结算时按当前科技等级实时乘（Q10；静态+动态全适用 Q12）
    const rewardMult = conquestRewardMult(state)
    // 军力返还（conquest-refund，ADR-0056）：残兵归队——成功时返还 ⌊投入军力 × 返还率⌋，
    // 受军力容量截断（返还量 clamp 到剩余容量，溢出浪费）；失败分支无返还（全损保留）。
    // 按 invested 实际投入而非守卫（防薄投刷军力）；fleetLocked 是舰队战力折算、非军力消耗，不参与。
    // 截断实现：min(refund, 剩余容量) —— 存量已超 cap（异常态）时返还 0，不压低既有存量。
    const refund = Math.floor(invest * CONQUEST_MILITARY_REFUND_PCT)
    if (refund > 0) {
      const room = Math.max(0, militaryCap(state) - state.resources.military)
      const actual = Math.min(refund, room)
      if (actual > 0) {
        state.resources.military += actual
        rewards.push(t('cq.12', { a0: formatNumber(actual) }))
      }
    }
    if (def.rewardMineral) {
      state.resources.mineral += Math.floor(def.rewardMineral * rewardMult)
      rewards.push(t('cq.0', { a0: formatNumber(Math.floor(def.rewardMineral * rewardMult)) }))
    }
    if (def.rewardTech) {
      state.resources.tech += Math.floor(def.rewardTech * rewardMult)
      rewards.push(t('cq.1', { a0: formatNumber(Math.floor(def.rewardTech * rewardMult)) }))
    }
    if (def.bonus) {
      state.permanentBonuses[def.bonus.kind] = (state.permanentBonuses[def.bonus.kind] ?? 0) + def.bonus.value
      rewards.push(`全产出 +${formatPercent(def.bonus.value * 100)}`)
    }
    if (isStatic && def.unlockTech) {
      state.techLevels[def.unlockTech] = 1
      rewards.push(t('cq.2'))
    }
    // 归档周目标记（endless-expansion：征服 = 军事目标不可再交互 → 移列表末尾折叠；本周目语义，NG+ 清空）
    state.archivedRounds[id] = state.ngPlusLevel ?? 0
    // save-size-opt：动态军事目标归档即压缩（conquest/faction 白名单；planet 原样；静态目标不在 generatedTargets）
    const gtIdx = state.generatedTargets.findIndex((x) => x.id === id)
    if (gtIdx >= 0) state.generatedTargets[gtIdx] = compactTargetOnArchive(state.generatedTargets[gtIdx])
    if (isStatic) {
      // 首次攻占与全肃清叙事（storyFlags 防重复）——仅静态目标参与里程碑
      playMilestone(state, 'firstConquest')
      if (Object.values(CONQUESTS).every((d) => state.conquest[d.id]?.status === 'conquered')) {
        playMilestone(state, 'conquestAll')
      }
    }
    // endless 层推进（endless-progression）：每次征服 +0.04（平滑进度制，跨 NG+ 继承）
    advanceEndlessLayer(state, ENDLESS_CONQUEST_LAYER_PROGRESS)
    // boss 军力挑战（ADR-0053）：攻克当前层 boss → bossDefeated 计数 + 层数 +1（boss 击败路径保留）
    if (id.startsWith('boss:L')) {
      state.endless.bossDefeated = (state.endless.bossDefeated ?? 0) + 1
      advanceEndlessLayer(state, 1)
      // 下一层 boss 由 ensureEndlessBoss 在后续 tick 注入（当前层已归档）
    }
    return t('cq.3', { a0: defName(def), a1: rewards.join(t('cq.6')) || t('cq.7') })
  }
  // 失败：军力全损、区域回到可重试状态（不破坏任何建筑/科技/进度）
  state.conquest[id] = { status: 'available' }
  return t('cq.4', { a0: defName(def), a1: formatNumber(invest) })
}

/** 自动攻占排序键：军力投入（守卫）——每次自动攻占恒全额消耗 */
function consumeOf(gt: GeneratedTarget): number {
  return gt.guard ?? 0
}

/** 自动攻占排序键（平局打破）：快照资源费（ADR-0028 costMineral/costEnergy，矿+能合计） */
function feeOf(gt: GeneratedTarget): number {
  return (gt.costMineral ?? 0) + (gt.costEnergy ?? 0)
}

/**
 * 自动攻占 tick（ADR-0033，2026-08-08；auto-conquest-priority 2026-08-11；auto-conquest-batch 2026-08-12）：
 * 每冷却周期（60s）对可用生成军事目标**批量发起**（军力充足时一次多个；军力不足停止、经济费不足跳过，直到无目标可发）。
 * - 目标 = generatedTargets kind='conquest' 且 status==='available' 未进行中（仅生成目标，静态主线区域保持手动）；
 * - 投入策略：投满守卫（必成）；
 * - **目标优先级（auto-conquest-priority）**：先对「可立即发起」候选排序——守卫（军力投入）升序为主序、
 *   快照资源费（costMineral+costEnergy）升序为平局打破——资源消耗更少的目标优先处理；只作用于候选数组
 *   （filter 后新数组 sort，不改 generatedTargets 展示顺序；Array.prototype.sort 稳定 → 等键保持发现顺序）；
 * - **批量发起（auto-conquest-batch）**：一次冷却内沿升序连续发起，直到军力不足（break，升序单调屏障）或
 *   经济费不足（continue + pausedAt，非单调屏障）；批量成功数由军力保底逐目标判定自然约束（主档实测 2-3 个）；
 * - 军力保底：投满后仍保留军力容量 × AUTO_CONQUEST_MILITARY_RESERVE_PCT（防耗尽影响 raid 击退/探索派遣）；
 * - 资源费不足（ADR-0028 costMineral/costEnergy）→ 暂停（pausedAt），冷却后重试；
 * - 离线由 settleOffline 按冷却周期批量推进（虚拟时钟）。
 */
export function autoConquestTick(state: GameState, nowMs: number): string[] {
  const cfg = state.autoConquest
  if (!cfg?.enabled) return []
  if (cfg.lastActionAt != null && nowMs - cfg.lastActionAt < AUTO_CONQUEST_COOLDOWN_MS) return []
  // 确保当前层 boss 目标存在（autoBoss 开启时由本函数纳入候选）
  ensureEndlessBoss(state)
  const candidates = state.generatedTargets
    .filter((gt) => {
      if (gt.kind !== 'conquest') return false
      // boss 军力挑战（ADR-0053）：仅 autoBoss 开启时纳入自动候选（默认关 = 手动发起）
      if (gt.id.startsWith('boss:L') && state.endless?.autoBoss !== true) return false
      const cs = state.conquest[gt.id]
      if (cs?.status !== 'available' || cs.startedAt != null) return false
      return (gt.guard ?? 0) > 0
    })
    // 排序键：军力投入（守卫）升序为主序；快照资源费（mineral+energy）升序为平局打破（稳定排序 → 等键保持发现顺序）
    .sort((a, b) => consumeOf(a) - consumeOf(b) || feeOf(a) - feeOf(b))
  const logs: string[] = []
  for (const gt of candidates) {
    const guard = gt.guard ?? 0
    const reserve = Math.floor(militaryCap(state) * AUTO_CONQUEST_MILITARY_RESERVE_PCT)
    // 军力不足：候选已按守卫升序 → 当前打不起则后续守卫更大更打不起（单调屏障），break 结束本冷却周期
    if (state.resources.military < guard + reserve) break
    // 自动攻占纯军力（useFleet=false，conquest-fleet Q6）：舰队锁定 = 防御真空取舍，自动系统不替玩家做
    const r = startConquest(state, gt.id, guard, nowMs, undefined, false)
    if (r.ok) {
      logs.push(t('cq.5', { a0: gt.name, a1: formatNumber(guard) }))
      continue // 批量发起：军力充足时继续扫下一个候选（同冷却周期内多目标）
    }
    if (r.reason === t('cq.8') || r.reason === t('cq.9') || r.reason === '矿物不足' || r.reason === '能源不足') {
      // 经济费不足：非单调屏障（后续目标资源费可能更低）→ continue + pausedAt，冷却后重试
      cfg.pausedAt = nowMs
    }
  }
  if (logs.length > 0) cfg.lastActionAt = nowMs // 批量成功后统一更新（本 tick 只进一次冷却判定）
  return logs
}
