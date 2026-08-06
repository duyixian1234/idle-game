import { CONQUESTS, FACTIONS, RESOURCE_KEYS } from './data'
import { NG_PLUS_PERMANENT_BONUS, NG_PLUS_TECH_BASE } from './balance'
import { reputation } from './reputation'
import type { GameState, ResourceKey } from './types'

/**
 * NG+（周目继承）深层模块。
 * - `computeNgPlusInheritance`：共享继承计算（无副作用），`startNewGamePlus` 与 `previewNewGamePlus` 共用，
 *   保证「结局面板/无限模式确认弹窗预览的继承数值」与「实际执行」永远一致（避免双实现漂移）。
 * - `previewNewGamePlus`：纯函数（不修改状态），供 UI 确认弹窗渲染「将失去/将继承」双清单。
 *
 * 契约（infinite-ngplus spec 定稿）：引擎层不为 `startNewGamePlus` 设 phase 守卫（playing/ended/infinite
 * 均可调用），入口合法性由 UI 门控——ended → 结局面板；infinite → 工具栏「开启新周目」。
 */

/** NG+ 继承数值（科技点基数/永久加成/图鉴好感加成）集中见 balance.ts */

/** 共享继承计算结果（NG+ 执行后的新值，无副作用） */
export interface NgPlusInheritance {
  /** NG+ 后的周目数（当前 +1） */
  nextLevel: number
  /** 继承科技点（= 2000 × nextLevel） */
  carryTech: number
  /** 永久产出加成系数（= 1 + 0.15 × nextLevel） */
  permanentMult: number
  /** NG+ 后完整的派系图鉴（现有 codex + 本周目已结盟派系） */
  codexFactions: string[]
}

/** 「将失去」摘要（周目内清零项） */
export interface NgPlusLost {
  /** 当前余额 > 0 的资源键 */
  resources: ResourceKey[]
  /** 现有建筑 id 列表 */
  buildings: string[]
  /** 已研发/升级的科技 id 列表 */
  techs: string[]
  /** 本周目已结盟派系 id（好感/结盟状态将重置，派系进入图鉴） */
  alliedFactions: string[]
  /** 已攻占区域数 */
  conquered: number
  /** 当前周目声望（NG+ 后 unlockedInRound 不匹配 → 归零） */
  reputation: number
  /** 周目内累计采集矿物（NG+ 重置） */
  totalMineralEarned: number
  /** 周目内在线秒数（NG+ 重置） */
  playSeconds: number
}

/** 确认弹窗预览契约（纯数据，无方法） */
export interface NgPlusPreview {
  nextLevel: number
  carryTech: number
  permanentMult: number
  codexFactions: string[]
  /** NG+ 继承的永久加成表（区域攻占奖励等，原样继承） */
  permanentBonuses: Record<string, number>
  lost: NgPlusLost
}

/** 计算 NG+ 继承结果（无副作用，startNewGamePlus 与 previewNewGamePlus 共享） */
export function computeNgPlusInheritance(state: GameState): NgPlusInheritance {
  const nextLevel = state.ngPlusLevel + 1
  const codexFactions = [...state.factionCodex]
  for (const def of Object.values(FACTIONS)) {
    if (state.factions[def.id]?.allied && !codexFactions.includes(def.id)) {
      codexFactions.push(def.id)
    }
  }
  return {
    nextLevel,
    carryTech: NG_PLUS_TECH_BASE * nextLevel,
    permanentMult: 1 + NG_PLUS_PERMANENT_BONUS * nextLevel,
    codexFactions,
  }
}

/** 预览 NG+（纯函数：不修改 state，调用前后状态不变） */
export function previewNewGamePlus(state: GameState): NgPlusPreview {
  const inh = computeNgPlusInheritance(state)
  const alliedFactions = Object.values(FACTIONS).filter((d) => state.factions[d.id]?.allied).map((d) => d.id)
  const conquered = Object.values(CONQUESTS).filter((d) => state.conquest[d.id]?.status === 'conquered').length
  return {
    ...inh,
    permanentBonuses: { ...state.permanentBonuses },
    lost: {
      resources: RESOURCE_KEYS.filter((k) => state.resources[k] > 0),
      buildings: Object.keys(state.buildings),
      techs: Object.keys(state.techLevels),
      alliedFactions,
      conquered,
      reputation: reputation(state),
      totalMineralEarned: state.stats.totalMineralEarned,
      playSeconds: state.playSeconds,
    },
  }
}
