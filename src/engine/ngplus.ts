import { CONQUESTS, MEGASTRUCTURE_IDS, RESOURCE_KEYS } from './data'
import { NG_PLUS_MEGASTRUCTURE_BONUS, NG_PLUS_PERMANENT_BONUS, NG_PLUS_TECH_BASE } from './balance'
import { reputation } from './reputation'
import type { GameState, ResourceKey } from './types'
/**
 * NG+（周目继承）深层模块。
 * - `computeNgPlusInheritance`：共享继承计算（无副作用），`startNewGamePlus` 与 `previewNewGamePlus` 共用，
 *   保证「结局面板/无限模式确认弹窗预览的继承数值」与「实际执行」永远一致（避免双实现漂移）。
 * - `previewNewGamePlus`：纯函数（不修改状态），供 UI 确认弹窗渲染「将失去/将继承」双清单。
 *
 * 契约（infinite-ngplus spec 定稿 + auto-infinite-entry 修订）：引擎层不为 `startNewGamePlus` 设 phase 守卫
 * （playing/ended/infinite 均可调用），入口合法性由 UI 门控——通关后自动进入无限（phase 不再停留 ended），
 * NG+ 入口 = 工具栏「开启新周目」/探索页终局卡（仅 phase === 'infinite' 渲染）。
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
  /** 已发现的探索势力/天体数（NG+ 重置，派遣中任务静默丢弃） */
  exploredCount: number
  /** 派遣中探索队数量（NG+ 将静默丢弃不退款；多槽下数量化） */
  activeExpeditions: number
  /** 本周目舰队护卫舰数量（NG+ 随星际工程一并重置） */
  fleetCount: number
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
  // 遍历运行时派系集合（state.factions 含初始 4 家 + 探索发现 + 无尽生成对象：结盟历史同样继承）
  // 注：无尽生成派系（gen:*/endless:*）结盟后进 codex；NG+ 清空 generatedTargets 后 codex 中其 id 仅作历史记录
  for (const id of Object.keys(state.factions)) {
    if (state.factions[id]?.allied && !codexFactions.includes(id)) {
      codexFactions.push(id)
    }
  }
  return {
    nextLevel,
    carryTech: NG_PLUS_TECH_BASE * nextLevel,
    permanentMult: 1 + NG_PLUS_PERMANENT_BONUS * nextLevel,
    codexFactions,
  }
}

/**
 * 究极建筑 NG+ 遗产折算（双轨开放）：两座究极建筑等级之和 × NG_PLUS_MEGASTRUCTURE_BONUS（每级 +1.5% 全产出）。
 * - 跃迁枢纽无升级（恒 0 级，贡献 0）；未建造建筑 0 级；
 * - 共享函数：previewNewGamePlus 与 startNewGamePlus 同源引用，保证预览与执行一致（防双实现漂移）。
 */
export function megastructureLegacyBonus(state: GameState): number {
  return MEGASTRUCTURE_IDS.reduce((sum, id) => {
    const level = state.buildings[id] ? (state.upgrades[id] ?? 0) : 0
    return sum + level * NG_PLUS_MEGASTRUCTURE_BONUS
  }, 0)
}

/** 预览 NG+（纯函数：不修改 state，调用前后状态不变） */
export function previewNewGamePlus(state: GameState): NgPlusPreview {
  const inh = computeNgPlusInheritance(state)
  // 运行时派系集合（含无尽生成对象）——与 computeNgPlusInheritance 同口径
  const alliedFactions = Object.keys(state.factions).filter((id) => state.factions[id]?.allied)
  const conquered = Object.values(CONQUESTS).filter((d) => state.conquest[d.id]?.status === 'conquered').length
  // 继承的永久加成表 = 现有 + 究极建筑等级折算（预览与执行同源引用 megastructureLegacyBonus）
  const permanentBonuses = { ...state.permanentBonuses }
  const legacy = megastructureLegacyBonus(state)
  if (legacy > 0) permanentBonuses.production = (permanentBonuses.production ?? 0) + legacy
  return {
    ...inh,
    permanentBonuses,
    lost: {
      resources: RESOURCE_KEYS.filter((k) => state.resources[k] > 0),
      buildings: Object.keys(state.buildings),
      techs: Object.keys(state.techLevels),
      alliedFactions,
      conquered,
      reputation: reputation(state),
      totalMineralEarned: state.stats.totalMineralEarned,
      playSeconds: state.playSeconds,
      exploredCount: state.exploredFactions.length + state.exploredPlanets.length,
      activeExpeditions: state.expeditions.filter((e) => !e.resolved).length,
      fleetCount: state.fleet.count,
    },
  }
}
