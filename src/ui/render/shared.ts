// ui/render/shared.ts — 跨域共享 UI 工具（panels.ts 拆分专用；2026-08-08）
//
// 范围：跨 ≥2 个 render 域（build/tech/diplomacy/military/interstellar/archive/settings）
// 引用的纯函数/类型/常量。不含面板渲染逻辑本身。
//
// 重要：仅放「跨域共享」项；单域 helper 留在对应 render 文件内（Q4/A 决策）。

import type { GameState, ResourceKey } from '../../engine/types'
import { RESOURCE_META } from '../../engine/data'
import { formatMultiplier, formatNumber, formatPercent } from '../../engine/format'
import { BUILDINGS, MEGASTRUCTURE_BUILDINGS } from '../../engine/data'
import { canAffordBuilding, canAffordUpgrade, isBuildingUnlocked } from '../../engine/buildings'
import { JUMPGATE_HARVEST_PCT_PER_LEVEL, JUMPGATE_OFFLINE_EXTRA_SECONDS, OFFLINE_CAP_SECONDS } from '../../engine/balance'
import { JUMPGATE_SLOT_TABLE } from '../../engine/exploration'

// ============================================================================
// 类型
// ============================================================================

/** 建造面板渲染选项（building-cards：卡片化 + 锁定卡折叠） */
export interface BuildPanelRenderOptions {
  /** 分区 id：传入时启用锁定卡折叠（每区独立）；不传 = 不折叠（军事 tab 仅 2 建筑） */
  zoneId?: string
  /** 隐藏抽屉分区键（hidden-buildings，ADR-0043）：与 zoneId 解耦——军事区需独立抽屉键但保持「不启用锁定卡折叠」。
   * 缺省回退 zoneId，再回退 'build' */
  hiddenDrawerZone?: string
  /** 折叠展开态（UI 会话内存，不进存档；key = zoneId，刷新回默认收起） */
  lockedExpanded?: Record<string, boolean>
  /** 刚升级高亮 id（短暂窗口内卡片加 just-upgraded 类触发一次性动画，过期自动消失） */
  flashId?: string | null
  /** 归档折叠展开态（endless-expansion：军事/外交归档区，UI 会话内存不进存档；key = kind） */
  archivedExpanded?: Record<string, boolean>
  /** 已隐藏建造物抽屉展开态（hidden-buildings：UI 会话内存不进存档；key = hiddenDrawerZone/zoneId，各区独立；
   * 置位时在头部按钮下方渲染恢复列表） */
  hiddenBuildingsOpen?: Record<string, boolean>
}

/** 卡片主体点击的判定结果（building-cards ticket 03）：升级×1 / 建造×1 / 终局工程弹窗 */
export type BuildCardAction = { kind: 'upgrade' | 'buy' | 'megastructure' }

/** 设置页 UI 状态（由 main 层组装传入，纯展示） */
export interface SettingsStatus {
  isMuted: boolean
  statusText: string
  version: string
  state?: GameState
}

// ============================================================================
// 工具函数
// ============================================================================

/** 资源成本 → 符号化文本（建造面板/科技面板/攻占行/舰队等通用） */
export function formatCost(cost: Record<ResourceKey, number>): string {
  return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${RESOURCE_META[k as ResourceKey]?.symbol ?? k}${formatNumber(v)}`).join(' · ')
}

/** 纯 ASCII 进度条（好感度/产出进度/在线时长等通用；UI 行为合约） */
export function renderAsciiBar(ratio: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  return `<span class="ascii-bar" data-progress><span class="ascii-filled">${'█'.repeat(filled)}</span><span class="ascii-empty">${'░'.repeat(empty)}</span></span>`
}

/**
 * 卡片主体点击的纯函数判定（main.ts 委托调用；可测 seam）：
 * - 未解锁 / 满级 / 资源不足 → null（无副作用）
 * - 终局工程建筑（究极建筑）未建造 → megastructure（走确认弹窗）
 * - unique 且 count>0 且未满级 → upgrade；否则（未拥有）→ buy。
 *   ⚠️ ADR-0036：普通建筑无升级（升级入口仅 unique），count>0 的普通建筑卡片主体点击 = null
 *   （购买走独立 data-build 按钮，卡片主体点击不再触发隐式升级）。
 */
export function buildCardAction(state: GameState, id: string): BuildCardAction | null {
  const def = BUILDINGS[id]
  if (!def || !isBuildingUnlocked(state, id)) return null
  const count = state.buildings[id] ?? 0
  if (MEGASTRUCTURE_BUILDINGS[id] && count <= 0) return { kind: 'megastructure' }
  const level = state.upgrades[id] ?? 0
  const maxed = def.unique === true && def.maxLevel != null && level >= def.maxLevel
  if (count > 0 && def.unique === true && !maxed) {
    return canAffordUpgrade(state, id) ? { kind: 'upgrade' } : null
  }
  if (count <= 0) {
    return canAffordBuilding(state, id) ? { kind: 'buy' } : null
  }
  return null
}

// ============================================================================
// 常量
// ============================================================================

/** 跃迁枢纽效果文案单一真源（ADR-0038 枢纽 10 级化：槽位/倍率随等级；从 balance/exploration 常量拼装，改平衡只动常量） */
export const JUMPGATE_EFFECT_TEXT = `派遣槽 +${formatNumber(JUMPGATE_SLOT_TABLE[1])}~+${formatNumber(JUMPGATE_SLOT_TABLE[10])}（随等级） · 天体收获倍率 ${formatMultiplier(1 + JUMPGATE_HARVEST_PCT_PER_LEVEL)}→${formatMultiplier(1 + JUMPGATE_HARVEST_PCT_PER_LEVEL * 10)} · 离线封顶 ${(OFFLINE_CAP_SECONDS + JUMPGATE_OFFLINE_EXTRA_SECONDS) / 3600}h`

/** 虫洞效果文案单一真源（wormhole-empire：槽位/能源/权重/上限随等级；从 balance/exploration 常量拼装） */
export const WORMHOLE_EFFECT_TEXT = `派遣槽 +${formatNumber(1)}/级（Lv${formatNumber(10)} 满 ${formatNumber(20)} 槽） · 探索能源 −${formatPercent(5)}/级（封顶 −${formatPercent(50)}） · 发现权重 +${formatPercent(10)}/级 · 生成上限 +${formatNumber(1)}/级`