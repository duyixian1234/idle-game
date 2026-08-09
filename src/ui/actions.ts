import { t } from '../i18n'
import {BUILDINGS,PLANETS,TECHS ,defName} from '../engine/data'
import { buyBuilding, upgradeBuilding } from '../engine/buildings'
import { setActivePlanet } from '../engine/planets'
import { researchTech, upgradeTech } from '../engine/tech'
import { formatNumber } from '../engine/format'
import { pushLog } from '../engine/core'
import { factionAlliance, factionAtone, factionDef, factionExtort, factionIntimidate, factionSubjugate, factionTechShare, factionTrade, factionTreaty, isFederationUnified } from '../engine/diplomacy'
import { resolveEvent } from '../engine/events'
import { buyShip } from '../engine/fleet'
import { fleetMaintenance } from '../engine/fleet'
import { conquestDef, startConquest } from '../engine/conquest'
import { startExpedition } from '../engine/exploration'
import type { ConquestActionResult } from '../engine/conquest'
import type { EventAutomationPolicy, GameState, LogType } from '../engine/types'
import type { SoundName } from '../audio'
import { isActionFailure } from './helpers'

/**
 * 动作注册表：把「引擎动作 → 日志/音效 → 渲染 → 保存」样板收敛为一个 dispatch。
 * 每个动作自描述：run 调引擎，feedback 把引擎结果映射为 UI 反馈（文案/音效/保存条件），
 * onFailure 可选补失败日志（默认失败静默）。调用点只做 data-* → 结构化 payload 映射。
 *
 * 载荷类型化（feat/action-typed）：payload 从 string|number 编码协议改为判别联合
 * ActionPayloads，id 与载荷在编译期匹配（PayloadFor<K> 映射）。DOM 契约解析
 * （split(':')/JSON.parse）收口在调用点，action 内部不再自解析。
 */

export interface ActionLog {
  type: LogType
  text: string
}

export interface ActionFeedback {
  logs: ActionLog[]
  sound?: SoundName
  /** 是否触发保存（默认 true；如事件未变更资源时跳过） */
  save?: boolean
}

/** 外交动作（diplomacy payload 的 action 字段；8 分支对应 runDiplomacy 分发） */
export type DiplomacyAction = 'trade' | 'alliance' | 'techshare' | 'extort' | 'treaty' | 'subjugate' | 'atone' | 'intimidate'

/** 各 action 的结构化载荷（单一事实源；dispatch 泛型据此约束 payload） */
export interface ActionPayloads {
  setAutomationPolicy: { category: string; policy: EventAutomationPolicy }
  buy: { id: string }
  upgrade: { id: string }
  research: { id: string }
  upgradeTech: { id: string }
  diplomacy: { factionId: string; action: DiplomacyAction }
  resolveEvent: { uid: number; optionId: string }
  setPlanet: { id: string }
  conquest: { id: string; invest: number }
  explore: { slot: number; escort: boolean }
  setAutoExplore: { enabled?: boolean; escort?: boolean }
  fleetBuild: Record<string, never>
  megastructure: { id: string }
}

export type ActionId = keyof ActionPayloads
export type PayloadFor<K extends ActionId> = ActionPayloads[K]

export interface GameAction<K extends ActionId = ActionId> {
  id: K
  /** 执行引擎动作；payload 为类型化载荷 */
  run(state: GameState, payload: PayloadFor<K>): unknown
  /** 成功后的反馈：日志文本（依赖 run 后的状态）与音效 */
  feedback?(state: GameState, result: unknown, payload: PayloadFor<K>): ActionFeedback
  /** 失败钩子：返回需补写的日志（默认失败静默） */
  onFailure?(state: GameState, payload: PayloadFor<K>, reason: string): { logs: ActionLog[] }
}

/** dispatch 依赖注入：测试注入假实现，断言副作用顺序 */
export interface ActionDeps {
  render: () => void
  save: () => void
  playSound: (name: SoundName) => void
}

// ---- 外交动作 ----

/** 外交动作分发（payload 结构化：factionId + action） */
function runDiplomacy(state: GameState, payload: ActionPayloads['diplomacy']): unknown {
  const { factionId, action } = payload
  if (action === 'trade') return factionTrade(state, factionId)
  if (action === 'alliance') return factionAlliance(state, factionId)
  if (action === 'techshare') return factionTechShare(state, factionId)
  if (action === 'extort') return factionExtort(state, factionId)
  if (action === 'treaty') return factionTreaty(state, factionId)
  if (action === 'subjugate') return factionSubjugate(state, factionId)
  if (action === 'atone') return factionAtone(state, factionId)
  return factionIntimidate(state, factionId)
}

function diplomacyFeedback(state: GameState, _result: unknown, payload: ActionPayloads['diplomacy']): ActionFeedback {
  const { factionId, action } = payload
  const def = factionDef(state, factionId)
  const f = state.factions[factionId]
  const favor = f?.favor ?? 0
  const logs: ActionLog[] = []
  if (action === 'trade') {
    logs.push({ type: 'system', text: t('log.actions.0', { a0: (def ? defName(def) : "?"), a1: formatNumber(6), a2: formatNumber(favor) }) })
  } else if (action === 'alliance') {
    logs.push({ type: 'reward', text: t('log.actions.1', { a0: (def ? defName(def) : "?") }) })
    if (isFederationUnified(state)) {
      logs.push({ type: 'story', text: t('log.actions.2') })
    }
  } else if (action === 'techshare') {
    logs.push({ type: 'system', text: t('log.actions.3', { a0: (def ? defName(def) : "?"), a1: formatNumber(15), a2: formatNumber(favor) }) })
  } else if (action === 'extort') {
    logs.push({ type: 'warning', text: t('log.actions.4', { a0: (def ? defName(def) : "?"), a1: formatNumber(30), a2: formatNumber(25), a3: formatNumber(favor) }) })
  } else if (action === 'treaty') {
    logs.push({ type: 'system', text: t('log.actions.5', { a0: (def ? defName(def) : "?") }) })
  } else if (action === 'subjugate') {
    logs.push({ type: 'warning', text: t('log.actions.6', { a0: (def ? defName(def) : "?") }) })
  } else if (action === 'atone') {
    logs.push({ type: 'story', text: t('log.actions.7', { a0: (def ? defName(def) : "?") }) })
  } else {
    logs.push({ type: 'system', text: t('log.actions.8', { a0: (def ? defName(def) : "?"), a1: formatNumber(8), a2: formatNumber(favor) }) })
  }
  return { logs, sound: action === 'alliance' ? 'success' : 'click' }
}

export const ACTIONS: { [K in ActionId]: GameAction<K> } = {
  setAutomationPolicy: {
    id: 'setAutomationPolicy',
    run: (state, payload) => {
      if (!payload.category || !payload.policy || !Array.isArray(payload.policy.rules)) return { ok: false, reason: t('log.actions.9') }
      state.automationPolicies[payload.category] = { ...payload.policy, rules: payload.policy.rules.slice().sort((a, b) => b.priority - a.priority) }
      return { ok: true, value: payload.category }
    },
    feedback: () => ({ logs: [], save: true }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: t('log.actions.10', { a0: reason }) }] }),
  },
  buy: {
    id: 'buy',
    run: (state, payload) => buyBuilding(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = (BUILDINGS[payload.id] ? defName(BUILDINGS[payload.id]) : payload.id)
      return { logs: [{ type: 'system', text: t('log.actions.11', { a0: name, a1: formatNumber(state.buildings[payload.id] ?? 0) }) }], sound: 'click' }
    },
  },
  upgrade: {
    id: 'upgrade',
    run: (state, payload) => upgradeBuilding(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = (BUILDINGS[payload.id] ? defName(BUILDINGS[payload.id]) : payload.id)
      return { logs: [{ type: 'system', text: t('log.actions.12', { a0: name, a1: formatNumber(state.upgrades[payload.id] ?? 0) }) }], sound: 'upgrade' }
    },
  },
  research: {
    id: 'research',
    run: (state, payload) => researchTech(state, payload.id),
    feedback: (_state, _r, payload) => {
      const name = (TECHS[payload.id] ? defName(TECHS[payload.id]) : payload.id)
      return { logs: [{ type: 'reward', text: t('log.actions.13', { a0: name }) }], sound: 'success' }
    },
  },
  upgradeTech: {
    id: 'upgradeTech',
    run: (state, payload) => upgradeTech(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = (TECHS[payload.id] ? defName(TECHS[payload.id]) : payload.id)
      return { logs: [{ type: 'reward', text: t('log.actions.14', { a0: name, a1: formatNumber(state.techLevels[payload.id] ?? 0) }) }], sound: 'upgrade' }
    },
  },
  diplomacy: {
    id: 'diplomacy',
    run: runDiplomacy,
    feedback: diplomacyFeedback,
  },
  resolveEvent: {
    id: 'resolveEvent',
    run: (state, payload) => resolveEvent(state, payload.uid, payload.optionId),
    feedback: (_state, result) => {
      const outcome = result as { logType: LogType; logText: string; changed: boolean }
      return {
        logs: outcome.logText ? [{ type: outcome.logType, text: outcome.logText }] : [],
        sound: 'click',
        save: outcome.changed,
      }
    },
  },
  setPlanet: {
    id: 'setPlanet',
    run: (state, payload) => setActivePlanet(state, payload.id),
    feedback: (_state, _r, payload) => {
      const name = (PLANETS[payload.id] ? defName(PLANETS[payload.id]) : payload.id)
      return { logs: [{ type: 'system', text: t('log.actions.15', { a0: name }) }] }
    },
  },
  conquest: {
    id: 'conquest',
    // payload: { id: 区域id, invest: 投入军力 }（探索发现目标 id 可含 ':'，结构化后无需解析）
    run: (state, payload) => startConquest(state, payload.id, payload.invest, Date.now()),
    feedback: (_state, result, payload) => {
      const cdef = conquestDef(_state, payload.id)
      const name = cdef ? defName(cdef) : payload.id
      const v = result as ConquestActionResult
      if (v.ok) {
        return { logs: [{ type: 'system', text: t('log.actions.16', { a0: name }) }], sound: 'upgrade' }
      }
      return { logs: [] }
    },
    onFailure: (_state, payload, reason) => {
      const cdef = conquestDef(_state, payload.id)
      const name = cdef ? defName(cdef) : payload.id
      return { logs: [{ type: 'warning', text: t('log.actions.17', { a0: name, a1: reason }) }] }
    },
  },
  explore: {
    id: 'explore',
    // 派遣探索队（结果出发时固化，回归自动入账；多槽）。payload: { slot, escort }（结构化）
    run: (state, payload) => startExpedition(state, Date.now(), undefined, Math.max(0, payload.slot - 1), payload.escort),
    feedback: (_state, result) => {
      const v = result as { ok: true; value?: { escort?: boolean; startedAt?: number; finishAt?: number } }
      const escortText = v.value?.escort ? t('ui.actions.0') : ''
      const minutes = v.value?.startedAt != null && v.value.finishAt != null ? Math.round((v.value.finishAt - v.value.startedAt) / 60_000) : null
      const eta = minutes != null ? t('ui.actions.1', { a0: minutes }) : t('ui.actions.2')
      return { logs: [{ type: 'story', text: t('log.actions.18', { a0: escortText, a1: eta }) }], sound: 'upgrade' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: t('log.actions.19', { a0: reason }) }] }),
  },
  setAutoExplore: {
    id: 'setAutoExplore',
    // 自动探索设置（fleet-dock-10）：payload { enabled?, escort? } 更新 state.autoExplore（存档 v11 字段）
    run: (state, payload) => {
      const auto = state.autoExplore ?? { enabled: false, escort: false }
      if (payload.enabled != null) auto.enabled = payload.enabled
      if (payload.escort != null) auto.escort = payload.escort
      state.autoExplore = auto
      if (payload.enabled) state.autoExplore.pausedAt = undefined
      return { ok: true, value: { enabled: auto.enabled, escort: auto.escort } }
    },
    feedback: (_state, result) => {
      const v = (result as { ok: true; value: { enabled: boolean; escort: boolean } }).value
      const logs: ActionLog[] = [
        v.enabled
          ? { type: 'system', text: t('log.actions.20', { a0: v.escort ? '（带护航）' : '' }) }
          : { type: 'system', text: t('log.actions.21') },
      ]
      return { logs, sound: 'click' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: t('log.actions.22', { a0: reason }) }] }),
  },
  fleetBuild: {
    id: 'fleetBuild',
    // 建造护卫舰（第 count+1 艘，成本逐艘 ×1.5）；硬约束与上限拦截在引擎 buyShip 内；无载荷
    run: (state) => buyShip(state),
    feedback: (state) => ({
      logs: [{ type: 'system', text: t('log.actions.23', { a0: formatNumber(state.fleet.count), a1: formatNumber(-fleetMaintenance(state)) }) }],
      sound: 'upgrade',
    }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: t('log.actions.24', { a0: reason }) }] }),
  },
  megastructure: {
    id: 'megastructure',
    // 终局工程：建造究极建筑（payload = buildingId；双轨开放，独立建造、互不影响）
    run: (state, payload) => buyBuilding(state, payload.id),
    feedback: (_state, _r, payload) => {
      const name = (BUILDINGS[payload.id] ? defName(BUILDINGS[payload.id]) : payload.id)
      return { logs: [{ type: 'reward', text: t('log.actions.25', { a0: name }) }], sound: 'success' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: t('log.actions.26', { a0: reason }) }] }),
  },
}

/**
 * 统一执行「失败处理 → 日志 → 音效 → 渲染 → 保存」副作用顺序。
 * payload 与 id 在编译期匹配（PayloadFor<K>）；动态分发点（DOM data-* 契约）
 * 需断言——运行时契约无法静态分辨，见 listeners.ts 注释。
 */
export function dispatch<K extends ActionId>(state: GameState, id: K, payload: PayloadFor<K>, deps: ActionDeps): void {
  const action = ACTIONS[id]
  if (!action) return
  const result = action.run(state, payload)

  if (isActionFailure(result)) {
    const failureLogs = action.onFailure?.(state, payload, result.reason)?.logs
    if (failureLogs && failureLogs.length > 0) {
      for (const l of failureLogs) pushLog(state, l.type, l.text)
      deps.render()
    }
    return
  }

  const feedback = action.feedback?.(state, result, payload) ?? { logs: [] as ActionLog[] }
  for (const l of feedback.logs) pushLog(state, l.type, l.text)
  if (feedback.sound) deps.playSound(feedback.sound)
  deps.render()
  if (feedback.save !== false) deps.save()
}
