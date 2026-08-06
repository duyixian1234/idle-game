import { CONQUESTS } from './data'
import { playMilestone } from './story'
import type { ConquestState, GameState } from './types'

/**
 * 攻占系统深层模块：4 个第三方区域（虫群前哨/废弃船坞/星际残骸带/虫群母巢）。
 * - 发起 = 锁定投入军力 + 60 分钟倒计时（离线照常推进）
 * - 结算 = 成功率 min(100%, 投入/守卫强度)，足额投入必成；失败军力全损可立即重试
 * - 成功 = 一次性奖励 + 永久全局加成（permanentBonuses）+ 个别区域解锁军械科技
 * 惩罚语义（挂机铁律）：只动可再生资源流（军力/矿/能），绝不毁建筑/科技/区域/存档。
 */

export interface ConquestActionResult {
  ok: boolean
  reason?: string
}

/** 容错读取攻占状态（旧档迁移后 conquest 可能为空对象） */
export function conquestState(state: GameState, id: string): ConquestState {
  return state.conquest[id] ?? { status: 'locked' }
}

/** 区域是否可发起攻占：未攻占、不在进行中、前置星球已解锁、（通关后区域需 phase ≠ playing） */
export function isConquestAvailable(state: GameState, id: string): boolean {
  const def = CONQUESTS[id]
  if (!def) return false
  const cs = conquestState(state, id)
  if (cs.status === 'conquered') return false
  if (cs.startedAt != null) return false
  if (!state.planets[def.unlockPlanet]?.unlocked) return false
  if (def.afterEnding && state.phase === 'playing') return false
  return true
}

/** 发起攻占：投入军力（≥1）并锁定倒计时（startedAt/finishAt） */
export function startConquest(state: GameState, id: string, invest: number, nowMs: number): ConquestActionResult {
  const def = CONQUESTS[id]
  if (!def) return { ok: false, reason: '未知区域' }
  if (!isConquestAvailable(state, id)) return { ok: false, reason: '该区域当前无法攻占' }
  if (!Number.isFinite(invest) || invest <= 0) return { ok: false, reason: '投入军力无效' }
  if (state.resources.military < invest) return { ok: false, reason: '军力不足' }
  state.resources.military -= invest
  state.conquest[id] = { status: 'available', startedAt: nowMs, finishAt: nowMs + def.durationMs, invested: invest }
  return { ok: true }
}

/** 结算已到期的攻占（成功/失败），返回日志文本（由调用方 pushLog） */
export function settleConquests(state: GameState, nowMs: number, rng: () => number = Math.random): string[] {
  const logs: string[] = []
  for (const def of Object.values(CONQUESTS)) {
    const cs = state.conquest[def.id]
    if (!cs || cs.startedAt == null || cs.finishAt == null) continue
    if (nowMs < cs.finishAt) continue
    const invest = cs.invested ?? 0
    const chance = Math.min(1, invest / def.guard)
    const success = rng() < chance
    if (success) {
      cs.status = 'conquered'
      delete cs.startedAt
      delete cs.finishAt
      delete cs.invested
      const rewards: string[] = []
      if (def.rewardMineral) {
        state.resources.mineral += def.rewardMineral
        rewards.push(`${def.rewardMineral} 矿物`)
      }
      if (def.rewardTech) {
        state.resources.tech += def.rewardTech
        rewards.push(`${def.rewardTech} 科技点`)
      }
      if (def.bonus) {
        state.permanentBonuses[def.bonus.kind] = (state.permanentBonuses[def.bonus.kind] ?? 0) + def.bonus.value
        rewards.push(`全产出 +${def.bonus.value * 100}%`)
      }
      if (def.unlockTech) {
        state.techLevels[def.unlockTech] = 1
        rewards.push(`解锁「军械科技」`)
      }
      logs.push(`【军事捷报】「${def.name}」攻占成功！获得 ${rewards.join('、') || '无'}。`)
      // 首次攻占与全肃清叙事（storyFlags 防重复）
      playMilestone(state, 'firstConquest')
      if (Object.values(CONQUESTS).every((d) => state.conquest[d.id]?.status === 'conquered')) {
        playMilestone(state, 'conquestAll')
      }
    } else {
      // 失败：军力全损、区域回到可重试状态（不破坏任何建筑/科技/进度）
      state.conquest[def.id] = { status: 'available' }
      logs.push(`【军事战报】对「${def.name}」的攻势失利，投入的 ${invest} 军力全军覆没。可重整旗鼓再试。`)
    }
  }
  return logs
}
