import { BUILDINGS, FACTIONS, PLANETS, RESOURCE_KEYS, RESOURCE_META, TECHS, TECH_EXCHANGE_RATE } from '../engine/data'
import {
  buyBuilding,
  convertMineralToTech,
  maxConvertibleTechPoints,
  researchTech,
  setActivePlanet,
  upgradeBuilding,
  upgradeTech,
} from '../engine/engine'
import { executeDiplomacyMax, executeMaxBuy } from '../engine/bulk'
import type { BulkSpend } from '../engine/bulk'
import { formatNumber } from '../engine/format'
import { pushLog } from '../engine/core'
import { factionAlliance, factionIntimidate, factionTechShare, factionTrade, isFederationUnified } from '../engine/diplomacy'
import { resolveEvent } from '../engine/events'
import type { GameState, LogType, ResourceKey } from '../engine/types'
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

/** convert / convertMax 共享的成功反馈与失败日志 */
function convertFeedback(_state: GameState, result: unknown): ActionFeedback {
  const v = (result as { ok: true; value: { mineralSpent: number; techGained: number } }).value
  return { logs: [{ type: 'system', text: `兑换完成：-${v.mineralSpent} 矿物，+${v.techGained} 科技点。` }], sound: 'click' }
}

function convertOnFailure(_state: GameState, _payload: string | number, reason: string): { logs: ActionLog[] } {
  return { logs: [{ type: 'warning', text: `兑换失败：${reason}。` }] }
}

// ---- 一键买满（批量购买/升级） ----

/** 按资源逐项格式化（◆12,345 ⚡67） */
function formatCostText(spent: Record<ResourceKey, number>): string {
  return RESOURCE_KEYS.filter((k) => spent[k] > 0)
    .map((k) => `${RESOURCE_META[k].symbol}${formatNumber(spent[k])}`)
    .join(' ')
}

/** 批量成功反馈：次数 + 花费 + 剩余 */
function bulkFeedbackText(result: unknown, prefix: string): ActionFeedback {
  const v = (result as { ok: true; value: BulkSpend }).value
  return {
    logs: [{ type: 'system', text: `${prefix}：${v.count} 次，花费 ${formatCostText(v.spent)}，剩余 ${formatCostText(v.remaining)}。` }],
    sound: 'click',
  }
}

function bulkOnFailure(_state: GameState, _payload: string | number, reason: string): { logs: ActionLog[] } {
  return { logs: [{ type: 'warning', text: `一键买满失败：${reason}。` }] }
}

/** 外交批量：payload 为 "factionId:action"（trade | techshare） */
function runDiplomacyMax(state: GameState, payload: string | number): unknown {
  const [factionId, action] = String(payload).split(':')
  return executeDiplomacyMax(state, factionId, action === 'techshare' ? 'techShare' : 'trade')
}

/** 外交动作分发：payload 为 "factionId:action" */
function runDiplomacy(state: GameState, payload: string | number): unknown {
  const [factionId, action] = String(payload).split(':')
  if (action === 'trade') return factionTrade(state, factionId)
  if (action === 'alliance') return factionAlliance(state, factionId)
  if (action === 'techshare') return factionTechShare(state, factionId)
  return factionIntimidate(state, factionId)
}

function diplomacyFeedback(state: GameState, _result: unknown, payload: string | number): ActionFeedback {
  const [factionId, action] = String(payload).split(':')
  const def = FACTIONS[factionId]
  const f = state.factions[factionId]
  const favor = Math.floor(f?.favor ?? 0)
  const logs: ActionLog[] = []
  if (action === 'trade') {
    logs.push({ type: 'system', text: `与${def?.name}达成贸易，好感 +6（当前 ${favor}）。` })
  } else if (action === 'alliance') {
    logs.push({ type: 'reward', text: `与${def?.name}正式结盟！星系统一的版图再近一步。` })
    if (isFederationUnified(state)) {
      logs.push({ type: 'story', text: '【星系统一联邦】四个派系已全部达成统一条件。旧时代的裂痕正在愈合……' })
    }
  } else if (action === 'techshare') {
    logs.push({ type: 'system', text: `向${def?.name}共享技术情报，好感 +15（当前 ${favor}）。` })
  } else {
    logs.push({ type: 'system', text: `对${def?.name}展示威慑，其军力下降，好感 -8（当前 ${favor}）。` })
  }
  return { logs, sound: action === 'alliance' ? 'success' : 'click' }
}

export const ACTIONS: Record<string, GameAction> = {
  buy: {
    id: 'buy',
    run: (state, id) => buyBuilding(state, String(id)),
    feedback: (state, _r, id) => {
      const name = BUILDINGS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'system', text: `建造了 ${name}（第 ${state.buildings[String(id)]} 台）。` }], sound: 'click' }
    },
  },
  upgrade: {
    id: 'upgrade',
    run: (state, id) => upgradeBuilding(state, String(id)),
    feedback: (state, _r, id) => {
      const name = BUILDINGS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'system', text: `${name} 升级至 Lv.${state.upgrades[String(id)]}，产出提升。` }], sound: 'upgrade' }
    },
  },
  research: {
    id: 'research',
    run: (state, id) => researchTech(state, String(id)),
    feedback: (_state, _r, id) => {
      const name = TECHS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'reward', text: `科技「${name}」研发完成，新能力已生效。` }], sound: 'success' }
    },
  },
  upgradeTech: {
    id: 'upgradeTech',
    run: (state, id) => upgradeTech(state, String(id)),
    feedback: (state, _r, id) => {
      const name = TECHS[String(id)]?.name ?? String(id)
      return { logs: [{ type: 'reward', text: `科技「${name}」升级至 Lv.${state.techLevels[String(id)]}，产出提升。` }], sound: 'upgrade' }
    },
  },
  convert: {
    id: 'convert',
    run: (state, amount) => convertMineralToTech(state, Number(amount)),
    feedback: convertFeedback,
    onFailure: convertOnFailure,
  },
  convertMax: {
    id: 'convertMax',
    run: (state) => convertMineralToTech(state, maxConvertibleTechPoints(state) * TECH_EXCHANGE_RATE),
    feedback: convertFeedback,
    onFailure: convertOnFailure,
  },
  diplomacy: {
    id: 'diplomacy',
    run: runDiplomacy,
    feedback: diplomacyFeedback,
  },
  buyMax: {
    id: 'buyMax',
    run: (state, id) => executeMaxBuy(state, 'building', String(id)),
    feedback: (_state, _r, id) => {
      const name = BUILDINGS[String(id)]?.name ?? String(id)
      return bulkFeedbackText(_r, `一键买满「${name}」：购买`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeMax: {
    id: 'upgradeMax',
    run: (state, id) => executeMaxBuy(state, 'buildingUpgrade', String(id)),
    feedback: (_state, _r, id) => {
      const name = BUILDINGS[String(id)]?.name ?? String(id)
      return bulkFeedbackText(_r, `一键升满「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  upgradeTechMax: {
    id: 'upgradeTechMax',
    run: (state, id) => executeMaxBuy(state, 'techUpgrade', String(id)),
    feedback: (_state, _r, id) => {
      const name = TECHS[String(id)]?.name ?? String(id)
      return bulkFeedbackText(_r, `一键升满科技「${name}」：升级`)
    },
    onFailure: bulkOnFailure,
  },
  diplomacyMax: {
    id: 'diplomacyMax',
    run: runDiplomacyMax,
    feedback: (_state, _r, payload) => {
      const [factionId, action] = String(payload).split(':')
      const name = FACTIONS[factionId]?.name ?? factionId
      return bulkFeedbackText(_r, `与${name}${action === 'techshare' ? '技术共享' : '贸易'}`)
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
