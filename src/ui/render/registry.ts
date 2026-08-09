import type { GameState, ResourceKey } from '../../engine/types'
import type { AppElements } from '../layout'
import type { SessionUiState } from '../session/listeners'
import type { SoundManager } from '../../audio'
import { CIVIL_BUILDINGS } from '../../engine/data'
import { renderBreakdownPanel, renderPlanetBar, renderPlanetMechanic, renderResources } from '../bars'
import { renderExplorePage } from '../explore-page'
import { renderAutoConfigPanel, renderPendingEvents } from '../log'
import { renderTutorial } from '../overlays'
import { renderArchivePanel } from './archive'
import { renderBuildPanel } from './build'
import { renderDiplomacyPanel } from './diplomacy'
import { renderInterstellarPanel } from './interstellar'
import { renderMilitaryPanel } from './military'
import { renderSettingsPage } from './settings'
import { renderTechPanel } from './tech'

/**
 * render 注册表（ADR-0035）：session.render() 集中调度 → RenderNode 阶段注册表。
 *
 * 节点带 3 段 phase（content / overlay / badge）：z-order 是唯一真约束——
 * overlay 强制在 content 之后绘制（ending/tutorial/autoConfig/breakdown），
 * badge（角标/tab 恢复）最后；phase 内按注册序执行。
 * 状态副作用（logdir 按钮/tab disabled/滚动/展开态）不节点化，留 render() 主函数。
 */
export type RenderPhase = 'content' | 'overlay' | 'badge'

export const RENDER_PHASE_ORDER: readonly RenderPhase[] = ['content', 'overlay', 'badge']

/**
 * 宽 ctx（复用 SessionCtx 系收敛方式）：渲染节点所需全部输入打包，
 * 惰性 memo 共享计算（netProduction 每 tick 只算一次，纯函数缓存无行为差异）。
 */
export interface RenderCtx {
  state: GameState
  els: AppElements
  /** 面板容器索引（build/tech/diplomacy/military，按 data-panel 键） */
  panels: Record<string, HTMLElement>
  ui: SessionUiState
  nowMs: number
  /** 惰性 memo：netProduction（renderResources 与 settings 页共享，只算 1 次） */
  netProduction(): Record<ResourceKey, number>
  /** settings 页派生状态文本（主函数计算注入） */
  settingsStatusText: string
  /** 升级高亮派生（主函数算：nowMs < justUpgradedUntil ? id : null） */
  flashId: string | null
  /** 成就 flash 窗口（主函数 diff 派生：新解锁成就 id 集合，过期后空集） */
  justUnlocked: Set<string>
  /** 成就高亮 seen 阈值（进入档案页时更新；unlockedAt > 该值 → NEW 角标） */
  seenAchievementMaxAt: number
  sound: SoundManager
  /** 游戏版本号（session 提供，settings 页显示） */
  version: string
}

export interface RenderNode {
  id: string
  phase: RenderPhase
  render(ctx: RenderCtx): void
}

export interface RenderRegistry {
  register(node: RenderNode): void
  /** 按 phase 分组序执行（content → overlay → badge），phase 内按注册序 */
  run(ctx: RenderCtx): void
  /** 注册序快照（只读副本）：golden-order 测试固化此序，防注册顺序漂移 */
  list(): RenderNode[]
}

export function createRenderRegistry(): RenderRegistry {
  const nodes: RenderNode[] = []
  const ids = new Set<string>()

  function register(node: RenderNode): void {
    if (ids.has(node.id)) {
      throw new Error(`render-registry: duplicate node: ${node.id}`)
    }
    if (!(RENDER_PHASE_ORDER as readonly string[]).includes(node.phase)) {
      throw new Error(`render-registry: unknown phase: ${String(node.phase)}`)
    }
    ids.add(node.id)
    nodes.push(node)
  }

  function run(ctx: RenderCtx): void {
    for (const phase of RENDER_PHASE_ORDER) {
      for (const node of nodes) {
        if (node.phase === phase) node.render(ctx)
      }
    }
  }

  function list(): RenderNode[] {
    return [...nodes]
  }

  return { register, run, list }
}

/**
 * 生产节点表（ADR-0035 hub 集中注册）：面板清单单一可见点。
 * session/index.ts 只 import RENDER_NODES，不再知道具体面板。
 * golden-order 测试固化此注册序（content/overlay 各按旧 render() 调用序）。
 * 注：renderLogInto / renderBadges / updatePanelTabs 属会话态同步（游标/滚动/角标/tab），
 * 按 ADR-0035「状态副作用留主函数」原则不进注册表。
 */
export const RENDER_NODES = createRenderRegistry()
RENDER_NODES.register({
  id: 'resources',
  phase: 'content',
  render: (ctx) => renderResources(ctx.els.resourceBar, ctx.state, ctx.netProduction()),
})
RENDER_NODES.register({
  id: 'planet-bar',
  phase: 'content',
  render: (ctx) => renderPlanetBar(ctx.els.planetBar, ctx.state),
})
RENDER_NODES.register({
  id: 'planet-mechanic',
  phase: 'content',
  render: (ctx) => renderPlanetMechanic(ctx.els.mechanicBar, ctx.state),
})
RENDER_NODES.register({
  id: 'build',
  phase: 'content',
  render: (ctx) =>
    renderBuildPanel(ctx.panels['build'], ctx.state, CIVIL_BUILDINGS, {
      zoneId: 'civil',
      lockedExpanded: ctx.ui.lockedExpanded,
      flashId: ctx.flashId,
      hiddenBuildingsOpen: ctx.ui.hiddenBuildingsOpen,
    }),
})
RENDER_NODES.register({
  id: 'interstellar',
  phase: 'content',
  render: (ctx) =>
    renderInterstellarPanel(ctx.panels['build'], ctx.state, {
      lockedExpanded: ctx.ui.lockedExpanded,
      flashId: ctx.flashId,
      hiddenBuildingsOpen: ctx.ui.hiddenBuildingsOpen,
    }),
})
RENDER_NODES.register({
  id: 'tech',
  phase: 'content',
  render: (ctx) => renderTechPanel(ctx.panels['tech'], ctx.state),
})
RENDER_NODES.register({
  id: 'diplomacy',
  phase: 'content',
  render: (ctx) => renderDiplomacyPanel(ctx.panels['diplomacy'], ctx.state, { archivedExpanded: ctx.ui.archivedExpanded }),
})
RENDER_NODES.register({
  id: 'military',
  phase: 'content',
  render: (ctx) =>
    renderMilitaryPanel(ctx.panels['military'], ctx.state, {
      flashId: ctx.flashId,
      archivedExpanded: ctx.ui.archivedExpanded,
      // ADR-0043：军事区隐藏抽屉展开态独立（此前漏传致抽屉条件恒 falsy、恢复入口不可见）
      hiddenBuildingsOpen: ctx.ui.hiddenBuildingsOpen,
    }),
})
RENDER_NODES.register({
  id: 'archive',
  phase: 'content',
  render: (ctx) =>
    renderArchivePanel(ctx.els.navPages.archive, ctx.state, {
      justUnlocked: ctx.justUnlocked,
      seenAchievementMaxAt: ctx.seenAchievementMaxAt,
    }),
})
RENDER_NODES.register({
  id: 'explore',
  phase: 'content',
  render: (ctx) =>
    renderExplorePage(ctx.els.navPages.explore, ctx.state, ctx.nowMs, ctx.ui.exploreEscortChecked, ctx.ui.archivedExpanded),
})
RENDER_NODES.register({
  id: 'settings',
  phase: 'content',
  render: (ctx) =>
    renderSettingsPage(ctx.els.navPages.settings, {
      isMuted: ctx.sound.isMuted(),
      statusText: ctx.settingsStatusText,
      version: ctx.version,
      state: ctx.state,
    }),
})
RENDER_NODES.register({
  id: 'pending-events',
  phase: 'content',
  render: (ctx) => renderPendingEvents(ctx.els.logEl, ctx.state, ctx.ui.typedEvents),
})
RENDER_NODES.register({
  id: 'auto-config',
  phase: 'overlay',
  render: (ctx) => renderAutoConfigPanel(ctx.els.autoConfigOverlay, ctx.state, ctx.ui.autoExpandedCategory),
})
RENDER_NODES.register({
  id: 'tutorial',
  phase: 'overlay',
  render: (ctx) => renderTutorial(ctx.els.tutorial, ctx.state),
})
RENDER_NODES.register({
  id: 'breakdown',
  phase: 'overlay',
  render: (ctx) => {
    if (ctx.ui.openBreakdown) renderBreakdownPanel(ctx.els.breakdownPanel, ctx.state, ctx.ui.openBreakdown)
  },
})
