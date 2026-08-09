import {defName} from '../engine/data'
import { t } from '../i18n'
import {EXPLORE_PLANETS, PLANETS, RESOURCE_KEYS} from './data'
import {pushLog} from './core'
import {PLANET_STORIES, playMilestone} from './story'
import {techLevel} from './tech'
import type { GameState, ActionResult } from './types'

/**
 * 星球域深层模块：解锁判定 + 切换动作。
 * 从 engine.ts 拆出（engine hub 收窄）。
 * 依赖仅 data/types/core/story/tech（无 engine 反向依赖）。
 */

/** 派生查询：某星球是否已解锁 */
export function isPlanetUnlocked(state: GameState, id: string): boolean {
  return Boolean(state.planets[id]?.unlocked)
}

/** 派生查询：某星球的解锁条件是否已满足 */
export function planetRequirementsMet(state: GameState, id: string): boolean {
  const def = PLANETS[id]
  if (!def) return false
  // discoverOnly 天体只能由探索解锁，不响应常规解锁条件
  if (def.discoverOnly) return false
  const req = def.unlock.resources
  for (const k of RESOURCE_KEYS) {
    if ((req[k] ?? 0) > 0 && state.resources[k] < (req[k] ?? 0)) return false
  }
  if (def.unlock.techs && !def.unlock.techs.every((t) => techLevel(state, t) > 0)) return false
  return true
}

/**
 * 检查星球解锁：满足条件则解锁并播报叙事日志。
 * 返回本次解锁的星球 id 列表。
 */
export function checkPlanetUnlocks(state: GameState): string[] {
  const unlockedNow: string[] = []
  for (const def of Object.values(PLANETS)) {
    if (state.planets[def.id]?.unlocked) continue
    if (def.discoverOnly) continue
    if (!planetRequirementsMet(state, def.id)) continue
    state.planets[def.id] = { unlocked: true, unlockedAt: Date.now() }
    unlockedNow.push(def.id)
    pushLog(state, 'story', `【星域广播】探测信号确认：「${defName(def)}」已进入可殖民范围。`)
    // 播放该星球的多段解锁叙事
    const scenes = PLANET_STORIES[def.id] ?? []
    for (const scene of scenes) pushLog(state, 'story', t(scene))
    if (def.id === 'orbital') {
      pushLog(state, 'story', '星域扫描捕获四个文明信号：铁卫同盟、圣光议会、天鹅贸易联盟、沃克斯矿业集团。外交频道已开放。')
      playMilestone(state, 'orbitalUnlocked')
    }
  }
  return unlockedNow
}

/** 切换当前星球（仅已解锁星球），切换后重置停留时长。
 * discoverOnly 探索天体也接受（发现解锁后即可切换，见 EXPLORE_PLANETS）。 */
export function setActivePlanet(state: GameState, id: string): ActionResult {
  if (!PLANETS[id] && !EXPLORE_PLANETS[id]) return { ok: false, reason: '未知星球' }
  if (!state.planets[id]?.unlocked) return { ok: false, reason: '该星球尚未解锁' }
  if (state.activePlanet === id) return { ok: false, reason: '已在该星球' }
  state.activePlanet = id
  state.planetStaySeconds = 0
  // 首次抵达母星叙事（曲率引擎）
  if (id === 'dawn') playMilestone(state, 'firstWarp')
  return { ok: true }
}
