import { BUILDINGS, PLANETS, RESOURCE_KEYS, TECHS } from './data'
import {
  POST100_BUY_TARGET_SECONDS,
  POST100_GROWTH,
  POST100_THRESHOLD,
  TECH_MAX_LEVEL,
  UNIQUE_UPGRADE_GROWTH,
} from './balance'
import { netProduction } from './production'
import { canAfford, isEnded, zeroResources } from './core'
import { playMilestone } from './story'
import { formatNumber } from './format'
import { techLevel } from './tech'
import type { GameState, ResourceKey, ActionResult } from './types'

/**
 * 建筑域深层模块：成本曲线 + 解锁判定 + 建造/升级动作。
 * 从 engine.ts 拆出（engine hub 收窄）——「查询+动作」内聚，改成本曲线只动此处。
 * 依赖仅 data/types/balance/core/production/story/format/tech（无 engine 反向依赖）。
 */

/**
 * 建筑成本（post100 动态下限）：
 * - factor = (count+1)^costExponent：经典指数增长。
 * - ≤100 台（excess=0）：staticCost = max(1, floor(base × factor))，历史曲线不变。
 * - postFactor = POST100_GROWTH^(count - 100)：指数增长，使后期快速变贵。
 * - dynamicFloor = POST100_BUY_TARGET_SECONDS × netProduction[key]：挂当前产出，自动跟随
 *   NG+ ×64/×1024 等所有乘数，高加成下仍有摩擦。
 * - buyCost = max(staticCost, dynamicFloor) × postFactor：保证不低于静态曲线、不低于动态下限。
 * - ≤100 台 excess=0 → 完全不变（postFactor=1、dynamicFloor 不介入）。
 * - ADR-0036：等级因子（1 + LEVEL_COST_FACTOR×level）已删——普通建筑升级取消后 upgrades 恒 0，
 *   等级因子恒 1 失效（level-cost-factor spec 被 0036 推翻）。
 */
export function buildingCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  if (def.unique) {
    const cost = zeroResources()
    for (const key of RESOURCE_KEYS) {
      const base = def.baseCost[key] ?? 0
      cost[key] = base > 0 ? Math.max(1, Math.floor(base)) : 0
    }
    return cost
  }
  const count = state.buildings[id] ?? 0
  const excess = Math.max(0, count - POST100_THRESHOLD)
  const factor = Math.pow(count + 1, def.costExponent)
  const postFactor = excess > 0 ? Math.pow(POST100_GROWTH, excess) : 1
  const netProd = excess > 0 ? netProduction(state) : null
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def.baseCost[key] ?? 0
    if (base <= 0) continue
    const staticCost = Math.max(1, Math.floor(base * factor))
    if (excess === 0) {
      cost[key] = staticCost
    } else {
      const np = netProd![key]
      const dynamicFloor = np > 0 ? Math.floor(POST100_BUY_TARGET_SECONDS * np) : 0
      cost[key] = Math.max(1, Math.floor(Math.max(staticCost, dynamicFloor) * postFactor))
    }
  }
  return cost
}

/**
 * 建筑升级成本（ADR-0036 机制二分）：仅唯一大件有升级（baseCost × UNIQUE_UPGRADE_GROWTH^level）。
 * 普通可多次购买建筑无升级——调用方（upgradeBuilding）已封死拒绝；此处对非 unique 返回全 0
 * （canAffordUpgrade 语义 = 无成本可升，UI 不再渲染普通升级入口）。
 */
export function upgradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  if (!def?.unique) return zeroResources()
  const level = state.upgrades[id] ?? 0
  const factor = Math.pow(UNIQUE_UPGRADE_GROWTH, level)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def.baseCost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.ceil(base * factor)) : 0
  }
  return cost
}

/** 前置建筑/科技/星球是否已满足（建筑拥有 ≥1 台，科技已研发，星球已解锁）；
 * 星系间工程额外解锁链：通关后（requiresEnded）/ 建筑升级满级（requiresMaxLevel） */
export function isBuildingUnlocked(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  if (def.requires && !def.requires.every((req) => (state.buildings[req] ?? 0) > 0)) return false
  if (def.requiresTech && !def.requiresTech.every((t) => techLevel(state, t) > 0)) return false
  if (def.requiresPlanet && !def.requiresPlanet.every((p) => state.planets[p]?.unlocked)) return false
  if (def.requiresEnded && !isEnded(state)) return false
  if (def.requiresMaxLevel && !def.requiresMaxLevel.every((t) => (state.upgrades[t] ?? 0) >= TECH_MAX_LEVEL)) return false
  return true
}

/** 建筑锁定原因（UI 锁定卡片展示；返回 null = 未锁定）。优先级：通关 → 星球 → 建筑满级 → 前置建筑/科技 */
export function buildingLockReason(state: GameState, id: string): string | null {
  const def = BUILDINGS[id]
  if (!def) return '未知建筑'
  if (def.requiresEnded && !isEnded(state)) return '通关后解锁'
  if (def.requiresPlanet && !def.requiresPlanet.every((p) => state.planets[p]?.unlocked)) {
    return `需解锁星球：${def.requiresPlanet.map((p) => PLANETS[p]?.name ?? p).join('、')}`
  }
  if (def.requiresMaxLevel && !def.requiresMaxLevel.every((t) => (state.upgrades[t] ?? 0) >= TECH_MAX_LEVEL)) {
    return `需「${def.requiresMaxLevel.map((t) => BUILDINGS[t]?.name ?? t).join('、')}」升级满级`
  }
  if (def.requires && !def.requires.every((req) => (state.buildings[req] ?? 0) > 0)) {
    return `需先建造：${def.requires.map((r) => BUILDINGS[r]?.name ?? r).join('、')}`
  }
  if (def.requiresTech && !def.requiresTech.every((t) => techLevel(state, t) > 0)) {
    return `需先研发：${def.requiresTech.map((t) => TECHS[t]?.name ?? t).join('、')}`
  }
  return null
}

/** 终局工程前置是否满足：通关 && 三星系间建筑各 ≥1 级（终局工程区块入口判定，UI 不重写） */
export function megastructurePrereqsMet(state: GameState): boolean {
  if (!isEnded(state)) return false
  return ['starportMine', 'stellarArray', 'thinkTank'].every((id) => (state.buildings[id] ?? 0) >= 1)
}

/** 派生查询：当前是否买得起某建筑 */
export function canAffordBuilding(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, buildingCost(state, id))
}

/** 派生查询：当前是否升得起某建筑 */
export function canAffordUpgrade(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, upgradeCost(state, id))
}

/** 建造建筑（唯一大件：count 恒 1、禁重复建造） */
export function buyBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (!isBuildingUnlocked(state, id)) return { ok: false, reason: '前置建筑未解锁' }
  if (def.unique && (state.buildings[id] ?? 0) > 0) return { ok: false, reason: '唯一建筑已建造，无法重复建造' }
  const cost = buildingCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  const wasEmpty = Object.values(state.buildings).every((c) => c <= 0)
  state.buildings[id] = def.unique ? 1 : (state.buildings[id] ?? 0) + 1
  // 首次建造叙事
  if (wasEmpty) playMilestone(state, 'firstBuild')
  return { ok: true }
}

/** 升级建筑（唯一大件：每级产出 ×2，按 maxLevel 封顶；普通建筑无升级，ADR-0036 机制二分） */
export function upgradeBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if ((state.buildings[id] ?? 0) <= 0) return { ok: false, reason: '尚未建造该建筑' }
  // 普通可多次购买建筑无升级（ADR-0036：数量维度仅「买多少」）；跃迁枢纽 10 级化（ADR-0038）后为可升级 unique 大件
  if (!def.unique) return { ok: false, reason: '该建筑没有可升级效果' }
  // unique 建筑按 maxLevel 封顶（如船坞 Lv1-3）
  if (def.maxLevel != null && (state.upgrades[id] ?? 0) >= def.maxLevel) {
    return { ok: false, reason: `已达最高等级（Lv.${formatNumber(def.maxLevel)}）` }
  }
  const cost = upgradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.upgrades[id] = (state.upgrades[id] ?? 0) + 1
  return { ok: true }
}
