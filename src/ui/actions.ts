import { BUILDINGS, PLANETS, RESOURCE_KEYS, RESOURCE_META, TECHS } from '../engine/data'
import { buyBuilding, upgradeBuilding } from '../engine/buildings'
import { setActivePlanet } from '../engine/planets'
import { researchTech, upgradeTech } from '../engine/tech'
import { executeDiplomacyMax, executeLimitedBuy, executeLimitedDiplomacy, executeMaxBuy } from '../engine/bulk'
import type { BulkSpend } from '../engine/bulk'
import { formatNumber } from '../engine/format'
import { pushLog } from '../engine/core'
import { factionAlliance, factionAtone, factionDef, factionExtort, factionIntimidate, factionSubjugate, factionTechShare, factionTrade, factionTreaty, isFederationUnified } from '../engine/diplomacy'
import { resolveEvent } from '../engine/events'
import { buyShip } from '../engine/fleet'
import { fleetMaintenance } from '../engine/fleet'
import { conquestDef, startConquest } from '../engine/conquest'
import { startExpedition } from '../engine/exploration'
import type { ConquestActionResult } from '../engine/conquest'
import type { EventAutomationPolicy, GameState, LogType, ResourceKey } from '../engine/types'
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
  buyMax: { id: string; limit?: number }
  upgradeMax: { id: string; limit?: number }
  upgradeTechMax: { id: string; limit?: number }
  diplomacyMax: { factionId: string; action: 'trade' | 'techshare'; limit?: number }
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

// ---- 一键买满（批量购买/升级） ----

/** 按资源逐项格式化（◆12,345 ⚡67） */
function formatCostText(spent: Record<ResourceKey, number>): string {
  return RESOURCE_KEYS.filter((k) => spent[k] > 0)
    .map((k) => `${RESOURCE_META[k].symbol}${formatNumber(spent[k])}`)
    .join(' ') || formatNumber(0)
}

/** 批量成功反馈：次数 + 花费 + 剩余 */
function bulkFeedbackText(result: unknown, prefix: string): ActionFeedback {
  const v = (result as { ok: true; value: BulkSpend }).value
  return {
    logs: [{ type: 'system', text: `${prefix}：${formatNumber(v.count)} 次，花费 ${formatCostText(v.spent)}，剩余 ${formatCostText(v.remaining)}。` }],
    sound: 'click',
  }
}

/** 批量失败反馈（buyMax/upgradeMax/upgradeTechMax/diplomacyMax 共享；payload 仅取 id/factionId 命名用） */
function bulkOnFailure(_state: GameState, _payload: { id?: string; factionId?: string }, reason: string): { logs: ActionLog[] } {
  return { logs: [{ type: 'warning', text: `一键买满失败：${reason}。` }] }
}

/** 外交批量执行（payload 结构化：factionId + action + 可选 limit） */
function runDiplomacyMax(state: GameState, payload: ActionPayloads['diplomacyMax']): unknown {
  if (payload.limit != null) return executeLimitedDiplomacy(state, payload.factionId, payload.action === 'techshare' ? 'techShare' : 'trade', payload.limit)
  return executeDiplomacyMax(state, payload.factionId, payload.action === 'techshare' ? 'techShare' : 'trade')
}

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
    logs.push({ type: 'system', text: `与${def?.name}达成贸易，好感 +${formatNumber(6)}（当前 ${formatNumber(favor)}）。` })
  } else if (action === 'alliance') {
    logs.push({ type: 'reward', text: `与${def?.name}正式结盟！星系统一的版图再近一步。` })
    if (isFederationUnified(state)) {
      logs.push({ type: 'story', text: '【星系统一联邦】四个派系已全部达成统一条件。旧时代的裂痕正在愈合……' })
    }
  } else if (action === 'techshare') {
    logs.push({ type: 'system', text: `向${def?.name}共享技术情报，好感 +${formatNumber(15)}（当前 ${formatNumber(favor)}）。` })
  } else if (action === 'extort') {
    logs.push({ type: 'warning', text: `你对${def?.name}展示舰队，勒索了一笔资源——好感 -${formatNumber(30)}，威胁 +${formatNumber(25)}（当前 ${formatNumber(favor)}）。` })
  } else if (action === 'treaty') {
    logs.push({ type: 'system', text: `${def?.name}签署进贡条约：12 小时内持续进贡矿物（离线照常结算）。` })
  } else if (action === 'subjugate') {
    logs.push({ type: 'warning', text: `${def?.name}在军力面前臣服——但你需要持续派驻军力维持，否则将叛变。` })
  } else if (action === 'atone') {
    logs.push({ type: 'story', text: `你向${def?.name}支付赔偿，解除胁迫并开启赎罪期——洗白之路开启。` })
  } else {
    logs.push({ type: 'system', text: `对${def?.name}展示威慑，其军力下降，好感 -${formatNumber(8)}（当前 ${formatNumber(favor)}）。` })
  }
  return { logs, sound: action === 'alliance' ? 'success' : 'click' }
}

export const ACTIONS: { [K in ActionId]: GameAction<K> } = {
  setAutomationPolicy: {
    id: 'setAutomationPolicy',
    run: (state, payload) => {
      if (!payload.category || !payload.policy || !Array.isArray(payload.policy.rules)) return { ok: false, reason: '配置格式无效' }
      state.automationPolicies[payload.category] = { ...payload.policy, rules: payload.policy.rules.slice().sort((a, b) => b.priority - a.priority) }
      return { ok: true, value: payload.category }
    },
    feedback: () => ({ logs: [], save: true }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `自动处理配置失败：${reason}。` }] }),
  },
  buy: {
    id: 'buy',
    run: (state, payload) => buyBuilding(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = BUILDINGS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'system', text: `建造了 ${name}（第 ${formatNumber(state.buildings[payload.id] ?? 0)} 台）。` }], sound: 'click' }
    },
  },
  upgrade: {
    id: 'upgrade',
    run: (state, payload) => upgradeBuilding(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = BUILDINGS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'system', text: `${name} 升级至 Lv.${formatNumber(state.upgrades[payload.id] ?? 0)}，产出提升。` }], sound: 'upgrade' }
    },
  },
  research: {
    id: 'research',
    run: (state, payload) => researchTech(state, payload.id),
    feedback: (_state, _r, payload) => {
      const name = TECHS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'reward', text: `科技「${name}」研发完成，新能力已生效。` }], sound: 'success' }
    },
  },
  upgradeTech: {
    id: 'upgradeTech',
    run: (state, payload) => upgradeTech(state, payload.id),
    feedback: (state, _r, payload) => {
      const name = TECHS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'reward', text: `科技「${name}」升级至 Lv.${formatNumber(state.techLevels[payload.id] ?? 0)}，产出提升。` }], sound: 'upgrade' }
    },
  },
  diplomacy: {
    id: 'diplomacy',
    run: runDiplomacy,
    feedback: diplomacyFeedback,
  },
  buyMax: {
    id: 'buyMax',
    run: (state, payload) => {
      return payload.limit != null ? executeLimitedBuy(state, 'building', payload.id, payload.limit) : executeMaxBuy(state, 'building', payload.id)
    },
    feedback: (_state, _r, payload) => {
      const name = BUILDINGS[payload.id]?.name ?? payload.id
      return bulkFeedbackText(_r, payload.limit != null ? `批量购买「${name}」` : `一键买满「${name}」：购买`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeMax: {
    id: 'upgradeMax',
    run: (state, payload) => {
      return payload.limit != null ? executeLimitedBuy(state, 'buildingUpgrade', payload.id, payload.limit) : executeMaxBuy(state, 'buildingUpgrade', payload.id)
    },
    feedback: (_state, _r, payload) => {
      const name = BUILDINGS[payload.id]?.name ?? payload.id
      return bulkFeedbackText(_r, payload.limit != null ? `批量升级「${name}」` : `一键升满「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeTechMax: {
    id: 'upgradeTechMax',
    run: (state, payload) => {
      return payload.limit != null ? executeLimitedBuy(state, 'techUpgrade', payload.id, payload.limit) : executeMaxBuy(state, 'techUpgrade', payload.id)
    },
    feedback: (_state, _r, payload) => {
      const name = TECHS[payload.id]?.name ?? payload.id
      return bulkFeedbackText(_r, payload.limit != null ? `批量升级科技「${name}」` : `一键升满科技「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  diplomacyMax: {
    id: 'diplomacyMax',
    run: runDiplomacyMax,
    feedback: (_state, _r, payload) => {
      const name = factionDef(_state, payload.factionId)?.name ?? payload.factionId
      return bulkFeedbackText(_r, `与${name}${payload.limit != null ? '批量' : ''}${payload.action === 'techshare' ? '技术共享' : '贸易'}`)
    },
    onFailure: bulkOnFailure,
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
      const name = PLANETS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'system', text: `舰队坐标锁定：前往「${name}」。` }] }
    },
  },
  conquest: {
    id: 'conquest',
    // payload: { id: 区域id, invest: 投入军力 }（探索发现目标 id 可含 ':'，结构化后无需解析）
    run: (state, payload) => startConquest(state, payload.id, payload.invest, Date.now()),
    feedback: (_state, result, payload) => {
      const name = conquestDef(_state, payload.id)?.name ?? payload.id
      const v = result as ConquestActionResult
      if (v.ok) {
        return { logs: [{ type: 'system', text: `远征军出发：对「${name}」发起攻占，预计 10~30 分钟后结算。` }], sound: 'upgrade' }
      }
      return { logs: [] }
    },
    onFailure: (_state, payload, reason) => {
      const name = conquestDef(_state, payload.id)?.name ?? payload.id
      return { logs: [{ type: 'warning', text: `攻占「${name}」失败：${reason}。` }] }
    },
  },
  explore: {
    id: 'explore',
    // 派遣探索队（结果出发时固化，回归自动入账；多槽）。payload: { slot, escort }（结构化）
    run: (state, payload) => startExpedition(state, Date.now(), undefined, Math.max(0, payload.slot - 1), payload.escort),
    feedback: (_state, result) => {
      const v = result as { ok: true; value?: { escort?: boolean; startedAt?: number; finishAt?: number } }
      const escortText = v.value?.escort ? '（护航编队）' : ''
      const minutes = v.value?.startedAt != null && v.value.finishAt != null ? Math.round((v.value.finishAt - v.value.startedAt) / 60_000) : null
      const eta = minutes != null ? `${minutes} 分钟` : '10~30 分钟'
      return { logs: [{ type: 'story', text: `探索队启程${escortText}：驶向偏远星区，预计 ${eta} 后返航。结果已由导航计算机锁定。` }], sound: 'upgrade' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `派遣探索失败：${reason}。` }] }),
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
          ? { type: 'system', text: `自动探索已开启${v.escort ? '（带护航）' : ''}：空信道自动续派，离线同样续派。` }
          : { type: 'system', text: '自动探索已关闭。' },
      ]
      return { logs, sound: 'click' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `自动探索设置失败：${reason}。` }] }),
  },
  fleetBuild: {
    id: 'fleetBuild',
    // 建造护卫舰（第 count+1 艘，成本逐艘 ×1.5）；硬约束与上限拦截在引擎 buyShip 内；无载荷
    run: (state) => buyShip(state),
    feedback: (state) => ({
      logs: [{ type: 'system', text: `护卫舰入列：舰队现有 ${formatNumber(state.fleet.count)} 艘，总维护费 ${formatNumber(-fleetMaintenance(state))} 能源/秒。` }],
      sound: 'upgrade',
    }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `造舰失败：${reason}。` }] }),
  },
  megastructure: {
    id: 'megastructure',
    // 终局工程：建造究极建筑（payload = buildingId；双轨开放，独立建造、互不影响）
    run: (state, payload) => buyBuilding(state, payload.id),
    feedback: (_state, _r, payload) => {
      const name = BUILDINGS[payload.id]?.name ?? payload.id
      return { logs: [{ type: 'reward', text: `终局工程落定：${name} 建成。文明双轨并进，星环与星门同辉。` }], sound: 'success' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `终局工程失败：${reason}。` }] }),
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
