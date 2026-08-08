import { CONQUESTS } from './data'
import type { ConquestDef } from './data'
import { AUTO_CONQUEST_COOLDOWN_MS, AUTO_CONQUEST_MILITARY_RESERVE_PCT, MISSION_DURATION_MAX_MINUTES, MISSION_DURATION_MIN_MINUTES } from './balance'
import { playMilestone } from './story'
import { reputationBonuses } from './reputation'
import { militaryCap } from './production'
import { rollDomain } from './rng'
import { formatNumber, formatPercent } from './format'
import type { ConquestState, GameState } from './types'

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
    name: t.name,
    desc: t.desc,
    guard: t.guard ?? 0,
    unlockPlanet: 'dawn',
    afterEnding: false,
    rewardMineral: t.rewardMineral,
    rewardTech: t.rewardTech,
    bonus: t.bonus,
  }
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

/** 发起攻占：投入军力（≥1）并锁定倒计时（startedAt/finishAt；时长为 duration 域随机 10~30min，rng 可选注入供测试覆盖）。
 * 程序生成目标（gen:*）另扣发现时固化的产能挂钩资源费（ADR-0028，costMineral/costEnergy 快照；手写保底/静态区域无此字段 → 0） */
export function startConquest(state: GameState, id: string, invest: number, nowMs: number, rng?: () => number): ConquestActionResult {
  const def = conquestDef(state, id)
  if (!def) return { ok: false, reason: '未知区域' }
  if (!isConquestAvailable(state, id)) return { ok: false, reason: '该区域当前无法攻占' }
  if (!Number.isFinite(invest) || invest <= 0) return { ok: false, reason: '投入军力无效' }
  if (state.resources.military < invest) return { ok: false, reason: '军力不足' }
  const target = state.generatedTargets.find((x) => x.kind === 'conquest' && x.id === id)
  const costMineral = target?.costMineral ?? 0
  const costEnergy = target?.costEnergy ?? 0
  if (state.resources.mineral < costMineral) return { ok: false, reason: '矿物不足' }
  if (state.resources.energy < costEnergy) return { ok: false, reason: '能源不足' }
  state.resources.military -= invest
  state.resources.mineral -= costMineral
  state.resources.energy -= costEnergy
  state.conquest[id] = { status: 'available', startedAt: nowMs, finishAt: nowMs + rollConquestDuration(state, rng), invested: invest }
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
  const roll = rng ?? (() => rollDomain(state, 'conquest')())
  for (const def of Object.values(CONQUESTS)) {
    const log = settleOneConquest(state, def.id, def, nowMs, roll, true)
    if (log) logs.push(log)
  }
  // 无尽生成军事目标（动态）：快照守卫/奖励，与静态同机制；无 unlockTech/unlockPlanet/里程碑
  for (const t of state.generatedTargets) {
    if (t.kind !== 'conquest') continue
    const def = conquestDef(state, t.id)
    if (!def) continue
    const log = settleOneConquest(state, t.id, def, nowMs, roll, false)
    if (log) logs.push(log)
  }
  return logs
}

/** 单区域结算（静态/动态共用）：null = 未在结算窗口；成功/失败返回日志文本 */
function settleOneConquest(
  state: GameState,
  id: string,
  def: Pick<ConquestDef, 'guard' | 'rewardMineral' | 'rewardTech' | 'bonus' | 'unlockTech' | 'name'>,
  nowMs: number,
  roll: () => number,
  isStatic: boolean,
): string | null {
  const cs = state.conquest[id]
  if (!cs || cs.startedAt == null || cs.finishAt == null) return null
  if (nowMs < cs.finishAt) return null
  const invest = cs.invested ?? 0
  // 成功率 = min(100%, 投入/守卫 × (1 + 声望成功率加成))：薄投受益，足额投入仍必成（100% 封顶）
  const chance = Math.min(1, (invest / def.guard) * (1 + reputationBonuses(state).conquestSuccessBonus))
  const success = roll() < chance
  if (success) {
    cs.status = 'conquered'
    delete cs.startedAt
    delete cs.finishAt
    delete cs.invested
    const rewards: string[] = []
    if (def.rewardMineral) {
      state.resources.mineral += def.rewardMineral
      rewards.push(`${formatNumber(def.rewardMineral)} 矿物`)
    }
    if (def.rewardTech) {
      state.resources.tech += def.rewardTech
      rewards.push(`${formatNumber(def.rewardTech)} 科技点`)
    }
    if (def.bonus) {
      state.permanentBonuses[def.bonus.kind] = (state.permanentBonuses[def.bonus.kind] ?? 0) + def.bonus.value
      rewards.push(`全产出 +${formatPercent(def.bonus.value * 100)}`)
    }
    if (isStatic && def.unlockTech) {
      state.techLevels[def.unlockTech] = 1
      rewards.push(`解锁「军械科技」`)
    }
    // 归档周目标记（endless-expansion：征服 = 军事目标不可再交互 → 移列表末尾折叠；本周目语义，NG+ 清空）
    state.archivedRounds[id] = state.ngPlusLevel ?? 0
    if (isStatic) {
      // 首次攻占与全肃清叙事（storyFlags 防重复）——仅静态目标参与里程碑
      playMilestone(state, 'firstConquest')
      if (Object.values(CONQUESTS).every((d) => state.conquest[d.id]?.status === 'conquered')) {
        playMilestone(state, 'conquestAll')
      }
    }
    return `【军事捷报】「${def.name}」攻占成功！获得 ${rewards.join('、') || '无'}。`
  }
  // 失败：军力全损、区域回到可重试状态（不破坏任何建筑/科技/进度）
  state.conquest[id] = { status: 'available' }
  return `【军事战报】对「${def.name}」的攻势失利，投入的 ${formatNumber(invest)} 军力全军覆没。可重整旗鼓再试。`
}

/**
 * 自动攻占 tick（ADR-0033，2026-08-08）：每冷却周期（60s）对第一个可用生成军事目标投满守卫发起攻占。
 * - 目标 = generatedTargets kind='conquest' 且 status==='available' 未进行中（仅生成目标，静态主线区域保持手动）；
 * - 投入策略：投满守卫（必成）；
 * - 军力保底：投满后仍保留军力容量 × AUTO_CONQUEST_MILITARY_RESERVE_PCT（防耗尽影响 raid 击退/探索派遣）；
 * - 资源费不足（ADR-0028 costMineral/costEnergy）→ 暂停（pausedAt），冷却后重试；
 * - 离线由 settleOffline 按冷却周期批量推进（虚拟时钟）。
 */
export function autoConquestTick(state: GameState, nowMs: number): string[] {
  const cfg = state.autoConquest
  if (!cfg?.enabled) return []
  if (cfg.lastActionAt != null && nowMs - cfg.lastActionAt < AUTO_CONQUEST_COOLDOWN_MS) return []
  for (const t of state.generatedTargets) {
    if (t.kind !== 'conquest') continue
    const cs = state.conquest[t.id]
    if (cs?.status !== 'available' || cs.startedAt != null) continue
    const guard = t.guard ?? 0
    if (guard <= 0) continue
    const reserve = Math.floor(militaryCap(state) * AUTO_CONQUEST_MILITARY_RESERVE_PCT)
    if (state.resources.military < guard + reserve) continue
    const r = startConquest(state, t.id, guard, nowMs)
    if (r.ok) {
      cfg.lastActionAt = nowMs
      return [`自动攻占：对「${t.name}」投入 ${formatNumber(guard)} 军力发起攻占。`]
    }
    if (r.reason === '矿物不足' || r.reason === '能源不足') {
      cfg.pausedAt = nowMs
    }
  }
  return []
}
