// ui/render/diplomacy.ts — 外交面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderDiplomacyPanel + 内部 helpers（renderCoercionActions / renderFavorBar / factionPerkLabels）。
// 跨域共享项（formatCost/renderAsciiBar）从 shared 引入。
//
// 跨域 helper（Q4/A 决策：跟随首次使用面板所属域）：
// - renderArchiveCollapse / archiveRow / renderEndlessLockedHint：被 diplomacy+military 共用，
//   按「首次使用」归入本文件；military.ts 通过 import 引用。

import { t } from '../../i18n'
import type { GameState } from '../../engine/types'
import type { FactionDef } from '../../engine/data'
import {ENDLESS_FACTIONS, defName, defDesc} from '../../engine/data'
import {ALLIANCE_COST, ALLIANCE_FAVOR_THRESHOLD, COERCION_UNLOCK_MILITARY_CAP, ENDLESS_BATCH_2_EXPLORATIONS, TECH_SHARE_COST} from '../../engine/balance'
import {canFactionAlliance, canFactionAtone, canFactionExtort, canFactionIntimidate, canFactionSubjugate, canFactionTechShare, canFactionTrade, canFactionTreaty, coercionUnlocked, atoneCost, diplomacyAutoMode, diplomacyOverview, extortCost, factionDef, factionsVisible, intimidateCost, tradeCost, treatyCost} from '../../engine/diplomacy'
import {endlessBatchUnlocked, endlessTargetId} from '../../engine/generate'
import {formatMultiplier, formatNumber, formatPercent} from '../../engine/format'
import {iconUse} from '../icons'
import {escapeHtml} from '../helpers'
import {formatCost, renderAsciiBar} from './shared'

/** 好感度横条（收敛到通用 ASCII 进度条组件，行为等价） */
function renderFavorBar(favor: number): string {
  return renderAsciiBar(favor / 100, 10)
}

/** 派系特性徽标文案（探索势力专属特性：贸易折扣/共享半价/威慑折扣；无特性返回空数组不渲染） */
function factionPerkLabels(def: FactionDef): string[] {
  const labels: string[] = []
  if (def.tradeDiscount) labels.push(`贸易折扣 -${formatPercent(def.tradeDiscount * 100)}`)
  if (def.techShareCostMult) labels.push(def.techShareCostMult <= 0.6 ? '共享半价' : `技术共享 ${formatMultiplier(def.techShareCostMult)}`)
  if (def.intimidateCostMult) labels.push(`威慑折扣 -${formatPercent((1 - def.intimidateCostMult) * 100)}`)
  return labels
}

/** 归档折叠区（endless-expansion）：头部计数 + 明细行（名称 + 归档徽标 + 第 N 周目）。
 * 折叠状态走 UI 层会话态（archivedExpanded，main 层持有，不进存档）——与 data-locked-collapse 同构，250ms 重建不重置。 */
function renderArchiveCollapse(el: HTMLElement, kind: string, label: string, rows: string[], expanded: boolean): void {
  if (rows.length === 0) return
  const fold = document.createElement('div')
  fold.className = 'archive-collapse'
  fold.setAttribute('data-archived-collapse', kind)
  fold.innerHTML = `
    <div class="archive-summary" data-archived-toggle="${kind}" role="button" tabindex="0">${escapeHtml(label)}（${formatNumber(rows.length)}）<span class="archive-chevron">${expanded ? '▾' : '▸'}</span></div>
    <div class="archive-list" data-archived-list="${kind}" ${expanded ? '' : 'style="display:none"'}>${rows.join('')}</div>`
  el.appendChild(fold)
}

/** 归档明细行（endless-expansion）：名称 + 归档徽标 + 第 N 周目标记（Q17 方案 B）；
 * actions 可选——胁迫态折叠保留赎罪/续签入口（ADR-0031，防赎罪路径被折叠锁死） */
function archiveRow(name: string, badge: string, round: number | undefined, id: string, actions = ''): string {
  return `<div class="archive-row" data-archived-row="${id}"><span class="archive-name">${escapeHtml(name)}</span><span class="archive-badge">${escapeHtml(badge)}</span>${round != null ? `<span class="archive-round">第 ${formatNumber(round)} 周目</span>` : ''}${actions ? `<span class="archive-actions">${actions}</span>` : ''}</div>`
}

/** 保底锁定占位（endless-expansion）：batch 2 未解锁且未获得的目标提示（仅 infinite 渲染，「完成 N 次探索解锁」） */
function renderEndlessLockedHint(el: HTMLElement, kind: string, lockedCount: number): void {
  if (lockedCount <= 0) return
  const block = document.createElement('div')
  block.className = 'archive-collapse locked'
  block.setAttribute('data-explore-locked', kind)
  block.innerHTML = `<div class="archive-summary">？？？ · 完成 ${formatNumber(ENDLESS_BATCH_2_EXPLORATIONS)} 次探索解锁新${kind === 'conquest' ? '军事目标' : kind === 'diplomacy' ? '外交对象' : '天体'}</div>`
  el.appendChild(block)
}

/** 胁迫外交按钮区（diplomacy-coercion）：未解锁返回空；按派系状态渲染状态徽标与勒索/条约/臣服/赎罪按钮 */
function renderCoercionActions(state: GameState, id: string): string {
  const f = state.factions[id]
  if (!f || !coercionUnlocked(state)) return ''
  const parts: string[] = []
  // 状态徽标（臣服中 / 赎罪期 / 已洗白）
  if (f.subjugated) parts.push('<span class="faction-state-badge subjugated" data-faction-state="subjugated">臣服中 · 锁定军力维持</span>')
  if (f.atoningUntil !== undefined && f.atoningUntil > Date.now()) parts.push('<span class="faction-state-badge atoning" data-faction-state="atoning">赎罪期 · 贸易加成</span>')
  if (f.atoned) parts.push('<span class="faction-state-badge atoned" data-faction-state="atoned">已洗白 · 不可再胁迫</span>')
  const canExtort = canFactionExtort(state, id)
  const canTreaty = canFactionTreaty(state, id)
  const canSubjugate = canFactionSubjugate(state, id)
  const canAtone = canFactionAtone(state, id)
  if (canExtort) {
    parts.push(`<button type="button" class="build-btn diplo-btn extort-btn" data-diplomacy="${id}:extort" title="以军事力量敲诈资源——高收益，代价是好感暴跌与威胁飙升">勒索 ${formatCost(extortCost(state, id))}</button>`)
  }
  if (canTreaty) {
    parts.push(`<button type="button" class="build-btn diplo-btn treaty-btn" data-diplomacy="${id}:treaty" title="12 小时进贡条约：被动矿物税（离线结算），到期威胁反弹">条约 ${formatCost(treatyCost(state, id))}</button>`)
  }
  if (canSubjugate) {
    parts.push(`<button type="button" class="build-btn diplo-btn subjugate-btn" data-diplomacy="${id}:subjugate" title="武力压服：锁定军力维持臣服，双倍贡税；军力不足将叛变">臣服</button>`)
  }
  if (canAtone) {
    parts.push(`<button type="button" class="build-btn diplo-btn atone-btn" data-diplomacy="${id}:atone" title="赔偿洗白：解除臣服/条约并开启赎罪期，赎罪后不可再胁迫">赎罪 ${formatCost(atoneCost(state, id))}</button>`)
  }
  return parts.join('')
}

/** 渲染外交面板：遍历运行时全部已登场派系（初始 4 家 + 探索发现的势力 + 无尽生成对象；未发现的探索势力不渲染）。
 * 已结盟（archivedRounds 有记录）= 不可再交互 → 移列表末尾归档折叠区（endless-expansion）。 */
export function renderDiplomacyPanel(el: HTMLElement, state: GameState, opts: { archivedExpanded?: Record<string, boolean> } = {}): void {
  el.innerHTML = ''
  if (!factionsVisible(state)) {
    el.innerHTML = `<div class="diplo-empty">星域中尚未探测到其他文明信号。解锁「轨道工厂站·奥伯斯」后，派系将进入舞台。</div>`
    return
  }
  const ov = diplomacyOverview(state)
  const header = document.createElement('div')
  header.className = 'diplo-header'
  header.setAttribute('data-diplo-overview', '')
  header.innerHTML = `
    <div class="diplo-header-row" data-diplo-federation>星系统一联邦：${ov.satisfied}/${ov.total} 派系达成统一条件</div>
    <div class="diplo-header-row" data-diplo-threat>${ov.threatCount === 0 ? '星域安宁，无派系骚扰' : `${ov.threatCount} 家派系构成骚扰威胁`}</div>
    <div class="diplo-header-row" data-diplo-alliance>已结盟 ${ov.allied} / 已登场 ${ov.total}</div>`
  el.appendChild(header)
  // 胁迫外交解锁提示（diplomacy-coercion：军力上限达标或遭遇派系骚扰后解锁，双通道）
  if (!coercionUnlocked(state)) {
    const lockHint = document.createElement('div')
    lockHint.className = 'diplo-coercion-lock'
    lockHint.setAttribute('data-diplo-coercion-lock', '')
    lockHint.textContent = t('ui.diplomacy.0', { a0: COERCION_UNLOCK_MILITARY_CAP.toLocaleString('zh-CN') })
    el.appendChild(lockHint)
  }
  // 外交自动化（diplo-auto 纯全局迭代，2026-08-08）：全局开关 + 全局方向（友好/胁迫）；
  // 友好=自动贸易→结盟（仅通关后），胁迫=生成派系自动勒索→条约（raid 安全，静态/探索派系跳过）；挂机同步
  const autoCfg = state.diplomacyAuto
  const autoBar = document.createElement('div')
  autoBar.className = 'diplo-auto-bar'
  autoBar.setAttribute('data-diplo-auto-bar', '')
  autoBar.innerHTML = `
    <label class="diplo-auto-toggle">
      <input type="checkbox" data-diplo-auto-global ${autoCfg?.enabled ? 'checked' : ''} /> 自动外交
    </label>
    <label class="diplo-auto-toggle">方向
      <select data-diplo-auto-mode>
        <option value="ally" ${diplomacyAutoMode(state) === 'ally' ? 'selected' : ''}>友好（自动结盟）</option>
        <option value="coerce" ${diplomacyAutoMode(state) === 'coerce' ? 'selected' : ''}>胁迫（生成派系）</option>
      </select>
    </label>
    <span class="diplo-auto-hint">友好=自动贸易→结盟（仅通关后）；胁迫=生成派系自动勒索→条约（raid 安全，静态/探索派系跳过）；挂机同步</span>`
  el.appendChild(autoBar)

  const archived = opts.archivedExpanded ?? {}
  const archivedRows: string[] = []
  // 未结盟派系卡网格（faction-grid：复用 .build-grid 断点；已结盟对象不占网格槽，入下方归档折叠区）
  const grid = document.createElement('div')
  grid.className = 'build-grid faction-grid'
  grid.setAttribute('data-faction-grid', '')
  // 运行时派系集合（含无尽生成对象）；def 查不到（异常防御）跳过
  for (const id of Object.keys(state.factions)) {
    const def = factionDef(state, id)
    if (!def) continue
    const f = state.factions[id]
    if (!f) continue
    // 已解决 = 折叠（本周目语义）：结盟（archivedRounds / allied）、臣服、条约中（ADR-0031 派生判定，
    // 状态变化自动折/展；胁迫态折叠保留赎罪/续签入口——防赎罪路径被 UI 锁死）
    const treatyActive = f.treatyUntil !== undefined && Date.now() < f.treatyUntil
    if (state.archivedRounds?.[id] != null || f.allied || f.subjugated || treatyActive) {
      const coerced = f.subjugated || treatyActive
      const badge = f.subjugated ? '已臣服' : treatyActive ? '条约中' : '已结盟'
      archivedRows.push(archiveRow(defName(def), badge, state.archivedRounds?.[id], id, coerced ? renderCoercionActions(state, id) : ''))
      continue
    }
    const tradeC = tradeCost(state, id)
    const intC = intimidateCost(state, id)
    const shareC = TECH_SHARE_COST
    const canTrade = canFactionTrade(state, id)
    const canAlliance = canFactionAlliance(state, id)
    const canIntimidate = canFactionIntimidate(state, id)
    const canShare = canFactionTechShare(state, id)
    const perks = factionPerkLabels(def)
    // 胁迫按钮组（勒索/条约/臣服/赎罪 + 状态徽标）：独占一整行（faction-coercion-row，grid-column 1/-1）
    const coercionActions = renderCoercionActions(state, id)
    const coercionRowHtml = coercionActions ? `<div class="faction-coercion-row">${coercionActions}</div>` : ''

    const item = document.createElement('div')
    item.className = 'build-card faction-card'
    item.setAttribute('data-faction', id)
    item.innerHTML = `
      <div class="build-card-icon">${iconUse(id)}</div>
      <div class="build-card-body">
        <div class="build-info faction-info">
          <div class="build-name">
            ${escapeHtml(defName(def))}
            ${perks.length > 0 ? perks.map((p) => `<span class="faction-perk" data-faction-perk="${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('') : ''}
          </div>
          <div class="build-desc">${escapeHtml(defDesc(def))}</div>
          <div class="favor-row">
            <span class="favor-label">好感</span>
            ${renderFavorBar(f.favor)}
            <span class="favor-num">${formatNumber(f.favor)}/${formatNumber(100)}</span>
            <span class="favor-label threat-label">威胁</span>
            <span class="threat-num">${formatNumber(f.threat)}</span>
          </div>
        </div>
      </div>
      <div class="build-actions faction-actions">
        <button type="button" class="build-btn diplo-btn" data-diplomacy="${id}:trade" ${canTrade ? '' : 'disabled'} title="花费矿物提升好感">
          贸易 ${formatCost(tradeC)}
        </button>
        <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy="${id}:techshare" ${canShare ? '' : 'disabled'} title="分享技术情报，花费科技点直接提升好感">
          技术共享 ${formatCost(shareC)}
        </button>
        <button type="button" class="build-btn diplo-btn alliance-btn" data-diplomacy="${id}:alliance" ${canAlliance ? '' : 'disabled'} title="好感 ≥${formatNumber(ALLIANCE_FAVOR_THRESHOLD)} 后可结盟（消耗大量资源）">
          结盟 ${formatCost(ALLIANCE_COST)}
        </button>
        <button type="button" class="build-btn diplo-btn intimidate-btn" data-diplomacy="${id}:intimidate" ${canIntimidate ? '' : 'disabled'} title="消耗资源降低对方军力，但好感下降">
          威慑 ${formatCost(intC)}
        </button>
        ${coercionRowHtml}
      </div>`
    grid.appendChild(item)
  }
  el.appendChild(grid)
  // 归档折叠区（已结盟外交对象）
  renderArchiveCollapse(el, 'diplomacy', '已完成外交对象', archivedRows, Boolean(archived['diplomacy']))
  // 保底锁定占位（endless-expansion：batch 2 未解锁且未获得）
  if (state.phase === 'infinite') {
    const locked = Object.values(ENDLESS_FACTIONS).filter(
      (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
    )
    renderEndlessLockedHint(el, 'diplomacy', locked.length)
  }
}

// 导出 archive-row helpers 供 military.ts（issue 05）跨域引用
export { renderArchiveCollapse, archiveRow, renderEndlessLockedHint }