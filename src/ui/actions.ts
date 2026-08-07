import { BUILDINGS, PLANETS, RESOURCE_KEYS, RESOURCE_META, TECHS } from '../engine/data'
import {
  buyBuilding,
  researchTech,
  setActivePlanet,
  upgradeBuilding,
  upgradeTech,
} from '../engine/engine'
import { executeDiplomacyMax, executeLimitedBuy, executeLimitedDiplomacy, executeMaxBuy } from '../engine/bulk'
import type { BulkSpend } from '../engine/bulk'
import { formatNumber } from '../engine/format'
import { pushLog } from '../engine/core'
import { factionAlliance, factionDef, factionIntimidate, factionTechShare, factionTrade, isFederationUnified } from '../engine/diplomacy'
import { resolveEvent } from '../engine/events'
import { buyShip } from '../engine/engine'
import { fleetMaintenance } from '../engine/fleet'
import { conquestDef, startConquest } from '../engine/conquest'
import { startExpedition } from '../engine/exploration'
import type { ConquestActionResult } from '../engine/conquest'
import type { EventAutomationPolicy, GameState, LogType, ResourceKey } from '../engine/types'
import type { SoundName } from '../audio'
import { isActionFailure } from './dom'

/**
 * 动作注册表：把「引擎动作 → 日志/音效 → 渲染 → 保存」样板收敛为一个 dispatch。
 * 每个动作自描述：run 调引擎，feedback 把引擎结果映射为 UI 反馈（文案/音效/保存条件），
 * onFailure 可选补失败日志（默认失败静默）。main.ts 的委托只做 data-* → dispatch 映射。
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

export interface GameAction {
  id: string
  /** 执行引擎动作；payload 为 DOM data-* 原始值（string | number），动作内部自行解析 */
  run(state: GameState, payload: string | number): unknown
  /** 成功后的反馈：日志文本（依赖 run 后的状态）与音效 */
  feedback?(state: GameState, result: unknown, payload: string | number): ActionFeedback
  /** 失败钩子：返回需补写的日志（默认失败静默） */
  onFailure?(state: GameState, payload: string | number, reason: string): { logs: ActionLog[] }
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

function bulkOnFailure(_state: GameState, _payload: string | number, reason: string): { logs: ActionLog[] } {
  return { logs: [{ type: 'warning', text: `一键买满失败：${reason}。` }] }
}

/** payload 尾部固定段解析（探索发现的 endless:/gen: 目标 id 自身含 ':'，必须从右往左切）：
 * - "factionId:action"（tailCount=1）→ [factionId, action]
 * - "factionId:action:limit" / "conquestId:invest"（tailCount=2）→ 尾部两段为 action/limit 或 invest，其余全为 id
 * 段数不足 tailCount 时按旧 split 行为返回（缺段为 undefined）——如 'ferro:trade' 解析为 ['ferro','trade'] */
function splitActionPayload(payload: string | number, tailCount: 1 | 2): string[] {
  const parts = String(payload).split(':')
  if (parts.length <= tailCount) return parts
  const id = parts.slice(0, parts.length - tailCount).join(':')
  return [id, ...parts.slice(parts.length - tailCount)]
}

/** 外交批量：payload 为 "factionId:action[:limit]"（id 可含 ':'） */
function runDiplomacyMax(state: GameState, payload: string | number): unknown {
  const [factionId, action, limitText] = splitActionPayload(payload, 2)
  if (limitText) return executeLimitedDiplomacy(state, factionId, action === 'techshare' ? 'techShare' : 'trade', Number(limitText))
  return executeDiplomacyMax(state, factionId, action === 'techshare' ? 'techShare' : 'trade')
}

/** 外交动作分发：payload 为 "factionId:action"（id 可含 ':'） */
function runDiplomacy(state: GameState, payload: string | number): unknown {
  const [factionId, action] = splitActionPayload(payload, 1)
  if (action === 'trade') return factionTrade(state, factionId)
  if (action === 'alliance') return factionAlliance(state, factionId)
  if (action === 'techshare') return factionTechShare(state, factionId)
  return factionIntimidate(state, factionId)
}

function diplomacyFeedback(state: GameState, _result: unknown, payload: string | number): ActionFeedback {
  const [factionId, action] = splitActionPayload(payload, 1)
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
  } else {
    logs.push({ type: 'system', text: `对${def?.name}展示威慑，其军力下降，好感 -${formatNumber(8)}（当前 ${formatNumber(favor)}）。` })
  }
  return { logs, sound: action === 'alliance' ? 'success' : 'click' }
}

export const ACTIONS: Record<string, GameAction> = {
  setAutomationPolicy: {
    id: 'setAutomationPolicy',
    run: (state, payload) => {
      let input: { category: string; policy: EventAutomationPolicy }
      try {
        input = JSON.parse(String(payload)) as { category: string; policy: EventAutomationPolicy }
      } catch {
        return { ok: false, reason: '配置格式无效' }
      }
      if (!input.category || !input.policy || !Array.isArray(input.policy.rules)) return { ok: false, reason: '配置格式无效' }
      state.automationPolicies[input.category] = { ...input.policy, rules: input.policy.rules.slice().sort((a, b) => b.priority - a.priority) }
      return { ok: true, value: input.category }
    },
    feedback: () => ({ logs: [], save: true }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `自动处理配置失败：${reason}。` }] }),
  },
  buy: {
    id: 'buy',
    run: (state, id) => buyBuilding(state, String(id)),
    feedback: (state, _r, id) => {
      const buildingId = String(id).split(':')[0]
      const name = BUILDINGS[buildingId]?.name ?? buildingId
      return { logs: [{ type: 'system', text: `建造了 ${name}（第 ${formatNumber(state.buildings[String(id)] ?? 0)} 台）。` }], sound: 'click' }
    },
  },
  upgrade: {
    id: 'upgrade',
    run: (state, id) => upgradeBuilding(state, String(id)),
    feedback: (state, _r, id) => {
      const buildingId = String(id).split(':')[0]
      const name = BUILDINGS[buildingId]?.name ?? buildingId
      return { logs: [{ type: 'system', text: `${name} 升级至 Lv.${formatNumber(state.upgrades[String(id)] ?? 0)}，产出提升。` }], sound: 'upgrade' }
    },
  },
  research: {
    id: 'research',
    run: (state, id) => researchTech(state, String(id)),
    feedback: (_state, _r, id) => {
      const techId = String(id).split(':')[0]
      const name = TECHS[techId]?.name ?? techId
      return { logs: [{ type: 'reward', text: `科技「${name}」研发完成，新能力已生效。` }], sound: 'success' }
    },
  },
  upgradeTech: {
    id: 'upgradeTech',
    run: (state, id) => upgradeTech(state, String(id)),
    feedback: (state, _r, id) => {
      const name = TECHS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'reward', text: `科技「${name}」升级至 Lv.${formatNumber(state.techLevels[String(id)] ?? 0)}，产出提升。` }], sound: 'upgrade' }
    },
  },
  diplomacy: {
    id: 'diplomacy',
    run: runDiplomacy,
    feedback: diplomacyFeedback,
  },
  buyMax: {
    id: 'buyMax',
    run: (state, id) => {
      const [buildingId, limitText] = String(id).split(':')
      return limitText ? executeLimitedBuy(state, 'building', buildingId, Number(limitText)) : executeMaxBuy(state, 'building', buildingId)
    },
    feedback: (_state, _r, id) => {
      const [buildingId, limitText] = String(id).split(':')
      const name = BUILDINGS[buildingId]?.name ?? buildingId
      return bulkFeedbackText(_r, limitText ? `批量购买「${name}」` : `一键买满「${name}」：购买`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeMax: {
    id: 'upgradeMax',
    run: (state, id) => {
      const [buildingId, limitText] = String(id).split(':')
      return limitText ? executeLimitedBuy(state, 'buildingUpgrade', buildingId, Number(limitText)) : executeMaxBuy(state, 'buildingUpgrade', buildingId)
    },
    feedback: (_state, _r, id) => {
      const [buildingId, limitText] = String(id).split(':')
      const name = BUILDINGS[buildingId]?.name ?? buildingId
      return bulkFeedbackText(_r, limitText ? `批量升级「${name}」` : `一键升满「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeTechMax: {
    id: 'upgradeTechMax',
    run: (state, id) => {
      const [techId, limitText] = String(id).split(':')
      return limitText ? executeLimitedBuy(state, 'techUpgrade', techId, Number(limitText)) : executeMaxBuy(state, 'techUpgrade', techId)
    },
    feedback: (_state, _r, id) => {
      const [techId, limitText] = String(id).split(':')
      const name = TECHS[techId]?.name ?? techId
      return bulkFeedbackText(_r, limitText ? `批量升级科技「${name}」` : `一键升满科技「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  diplomacyMax: {
    id: 'diplomacyMax',
    run: runDiplomacyMax,
    feedback: (_state, _r, payload) => {
      const [factionId, action, limitText] = splitActionPayload(payload, 2)
      const name = factionDef(_state, factionId)?.name ?? factionId
      return bulkFeedbackText(_r, `与${name}${limitText ? '批量' : ''}${action === 'techshare' ? '技术共享' : '贸易'}`)
    },
    onFailure: bulkOnFailure,
  },
  resolveEvent: {
    id: 'resolveEvent',
    run: (state, payload) => {
      const [uid, optionId] = String(payload).split(':')
      return resolveEvent(state, Number(uid), optionId)
    },
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
    run: (state, id) => setActivePlanet(state, String(id)),
    feedback: (_state, _r, id) => {
      const name = PLANETS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'system', text: `舰队坐标锁定：前往「${name}」。` }] }
    },
  },
  conquest: {
    id: 'conquest',
    // payload: "区域id:投入军力"（军力数量由 UI 输入/默认全投；探索发现目标 id 可含 ':'）
    run: (state, payload) => {
      const [id, invest] = splitActionPayload(payload, 1)
      return startConquest(state, id, Number(invest), Date.now())
    },
    feedback: (_state, result, payload) => {
      const [id] = splitActionPayload(payload, 1)
      const name = conquestDef(_state, id)?.name ?? id
      const v = result as ConquestActionResult
      if (v.ok) {
        return { logs: [{ type: 'system', text: `远征军出发：对「${name}」发起攻占，预计 60 分钟结算。` }], sound: 'upgrade' }
      }
      return { logs: [] }
    },
    onFailure: (_state, payload, reason) => {
      const [id] = splitActionPayload(payload, 1)
      const name = conquestDef(_state, id)?.name ?? id
      return { logs: [{ type: 'warning', text: `攻占「${name}」失败：${reason}。` }] }
    },
  },
  explore: {
    id: 'explore',
    // 派遣探索队（结果出发时固化，回归自动入账；多槽）。payload = "槽位号[:护航0|1]"（UI data-explore-dispatch 值 = 槽位号 1|2|3，
    // 护航状态由 main 层从 data-escort-toggle 读取拼接；缺省按第 1 槽无护航）
    run: (state, payload) => {
      const [slotText, escortText] = String(payload).split(':')
      const slotNo = Number(slotText || '1')
      const slotIndex = Math.max(0, slotNo - 1)
      return startExpedition(state, Date.now(), undefined, slotIndex, escortText === '1')
    },
    feedback: (_state, result) => {
      const v = result as { ok: true; value?: { escort?: boolean } }
      const escortText = v.value?.escort ? '（护航编队）' : ''
      return { logs: [{ type: 'story', text: `探索队启程${escortText}：驶向偏远星区，预计 60 分钟后返航。结果已由导航计算机锁定。` }], sound: 'upgrade' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `派遣探索失败：${reason}。` }] }),
  },
  setAutoExplore: {
    id: 'setAutoExplore',
    // 自动探索设置（fleet-dock-10）：payload = JSON { enabled?: boolean; escort?: boolean }，更新 state.autoExplore（存档 v11 字段）
    run: (state, payload) => {
      let input: { enabled?: boolean; escort?: boolean }
      try {
        input = JSON.parse(String(payload)) as { enabled?: boolean; escort?: boolean }
      } catch {
        return { ok: false, reason: '配置格式无效' }
      }
      const auto = state.autoExplore ?? { enabled: false, escort: false }
      if (input.enabled != null) auto.enabled = input.enabled
      if (input.escort != null) auto.escort = input.escort
      state.autoExplore = auto
      if (input.enabled) state.autoExplore.pausedAt = undefined
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
    // 建造护卫舰（第 count+1 艘，成本逐艘 ×1.5）；硬约束与上限拦截在引擎 buyShip 内
    run: (state) => buyShip(state),
    feedback: (state) => ({
      logs: [{ type: 'system', text: `护卫舰入列：舰队现有 ${formatNumber(state.fleet.count)} 艘，总维护费 ${formatNumber(-fleetMaintenance(state))} 能源/秒。` }],
      sound: 'upgrade',
    }),
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `造舰失败：${reason}。` }] }),
  },
  megastructure: {
    id: 'megastructure',
    // 终局抉择：建造究极建筑（payload = buildingId，引擎内写入 megastructureChoice，互斥本周目生效）
    run: (state, id) => buyBuilding(state, String(id)),
    feedback: (state, _r, id) => {
      const name = BUILDINGS[String(id)]?.name ?? String(id)
      const choiceText = state.megastructureChoice === 'smelter' ? '铸成星环' : '推开星门'
      return { logs: [{ type: 'reward', text: `终局抉择落定：${name} 建成。你选择${choiceText}——另一条文明之路本周目已封锁，NG+ 可重选。` }], sound: 'success' }
    },
    onFailure: (_state, _payload, reason) => ({ logs: [{ type: 'warning', text: `终局抉择失败：${reason}。` }] }),
  },
}

/**
 * 统一执行「失败处理 → 日志 → 音效 → 渲染 → 保存」副作用顺序。
 * 失败时：onFailure 产生日志则写入并渲染；否则完全静默。
 */
export function dispatch(state: GameState, id: string, payload: string | number, deps: ActionDeps): void {
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
