import type { GameState } from '../engine/types'
import { BUILDINGS, CONQUESTS, FACTIONS, RESOURCE_META, TECHS } from '../engine/data'
import { formatMultiplier, formatNumber, formatPercent, formatPlayTime, formatRate } from '../engine/format'
import { currentTutorialStep, TUTORIAL_STEPS, tutorialDone } from '../engine/tutorial'
import type { NgPlusPreview } from '../engine/ngplus'
import type { BulkPreview } from '../engine/bulk'
import { buildingCost } from '../engine/engine'
import { formatCost, JUMPGATE_EFFECT_TEXT } from './panels'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '\"': return '&quot;'
      default: return '&#39;'
    }
  })
}

/** boot 浮层内容（Q13 定案）：ASCII 标题 + 3 行 SYSTEM INIT；
 *  容器由 buildLayout 一次性构建（非重建元素），显隐由 main 层控制。 */
export function renderBootOverlay(el: HTMLElement, version: string): void {
  el.innerHTML = `
    <pre class="boot-art" aria-hidden="true">  ██╗██████╗ ██╗     ███████╗
  ██║██╔══██╗██║     ██╔════╝
  ██║██║  ██║██║     █████╗
  ██║██║  ██║██║     ██╔══╝
  ██║██████╔╝███████╗███████╗
  ╚═╝╚═════╝ ╚══════╝╚══════╝</pre>
    <div class="boot-title">深空拓荒 · 星系统一联邦 <span class="boot-version">v${escapeHtml(version)}</span></div>
    <div class="boot-line">&gt; SYSTEM INIT...</div>
    <div class="boot-line">&gt; 导航阵列就绪</div>
    <div class="boot-line">&gt; 采矿协议加载</div>
    <div class="boot-skip">[ 任意键跳过 ]</div>`
}

/** 渲染新手引导浮层（未完成时显示） */
export function renderTutorial(el: HTMLElement, state: GameState): void {
  if (tutorialDone(state)) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  const step = currentTutorialStep(state)
  if (!step) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  el.innerHTML = `
    <div class="tutorial-card" data-tutorial-card>
      <div class="tutorial-step">${formatNumber(state.tutorialStep + 1)}/${formatNumber(TUTORIAL_STEPS.length)}</div>
      <div class="tutorial-title">${escapeHtml(step.title)}</div>
      <div class="tutorial-text">${escapeHtml(step.text)}</div>
      <div class="tutorial-actions">
        <button type="button" class="tutorial-btn ghost" data-tutorial="skip">跳过引导</button>
        <button type="button" class="tutorial-btn primary" data-tutorial="next">下一步</button>
      </div>
    </div>`
}

/** 渲染结局面板（含通关统计与无限/NG+ 入口） */
export function renderEndingOverlay(el: HTMLElement, state: GameState, visible: boolean): void {
  if (!visible || state.phase !== 'ended') {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  const codex = state.factionCodex.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  el.innerHTML = `
    <div class="ending-card">
      <h1 class="ending-title">星系统一联邦</h1>
      <p class="ending-stats">
        统一历时 ${formatPlayTime(state.playSeconds)} · 累计采集矿物 ${formatNumber(state.stats.totalMineralEarned)}
      </p>
      <p class="ending-stats">派系图鉴：${escapeHtml(codex)} · NG+ 周目：${formatNumber(state.ngPlusLevel)}</p>
      <div class="ending-actions">
        <button type="button" class="ending-btn primary" data-ending="infinite">进入无限模式</button>
        <button type="button" class="ending-btn ghost" data-ending="close">继续查看</button>
      </div>
    </div>`
}

/** 终局工程确认弹窗（复用 ending overlay 卡片体系）：效果预览 + 建造消耗 + 双轨提示 + 确认/取消 */
export function renderMegastructureModal(el: HTMLElement, state: GameState, id: string): void {
  const def = BUILDINGS[id]
  if (!def) return
  const effectText =
    id === 'ringSmelter'
      ? `全局产出 ${formatMultiplier(2)}^等级（矿/能源/科技全吃）；耗能 ${formatRate(100, false)} 能源 × 等级（能源不足时按现有结算打折）`
      : JUMPGATE_EFFECT_TEXT
  el.innerHTML = `
    <div class="megastructure-card" data-megastructure-modal>
      <div class="buy-max-title">终局工程：${escapeHtml(def.name)}</div>
      <div class="buy-max-summary">${escapeHtml(def.desc)}</div>
      <table class="buy-max-table">
        <tr><th>效果</th><td>${escapeHtml(effectText)}</td></tr>
        <tr><th>建造消耗</th><td>${formatCost(buildingCost(state, id)) || formatNumber(0)}</td></tr>
      </table>
      <div class="buy-max-warn" data-megastructure-warn>双轨工程：星环与星门皆可铸就，二者独立建造、互不影响。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-megastructure-confirm="${def.id}">确认建造</button>
        <button type="button" class="ending-btn ghost" data-megastructure-cancel>取消</button>
      </div>
    </div>`
}

/** 买满确认弹窗数据（summary 由调用方组装，preview 为引擎预演结果） */export interface BuyMaxModalData {
  title: string
  summary: string
  preview: BulkPreview
}

/** 渲染一键买满确认弹窗（复用 ending overlay 卡片体系） */
export function renderBuyMaxModal(el: HTMLElement, data: BuyMaxModalData): void {
  const { preview } = data
  const spendText = formatCost(preview.spent)
  const remainText = formatCost(preview.remaining) || formatNumber(0)
  const emptyText = preview.emptyWarnings.map((k) => RESOURCE_META[k].name).join('、')
  const energy = preview.energyWarning
  const energyWarn =
    energy && energy.bought > energy.maxDriven
      ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 能源平衡：当前产出 ${formatRate(energy.production)} · 需求 ${formatRate(energy.consumption)} · 最多可驱动 ${formatNumber(energy.maxDriven)} 台 · 本次将买 ${formatNumber(energy.bought)} 台，超出部分无产出。</div>`
      : ''
  const emptyWarn = emptyText
    ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 将清空资源：${escapeHtml(emptyText)}（执行后剩余不足 1）</div>`
    : ''
  el.innerHTML = `
    <div class="buy-max-card">
      <div class="buy-max-title">${escapeHtml(data.title)}</div>
      <div class="buy-max-body">
        <div class="buy-max-summary">${escapeHtml(data.summary)}</div>
        <table class="buy-max-table">
          <tr><th>总花费</th><td>${spendText || '0'}</td></tr>
          <tr><th>执行后剩余</th><td>${remainText}</td></tr>
        </table>
        ${emptyWarn}
        ${energyWarn}
      </div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-buy-max-confirm>确认花光</button>
        <button type="button" class="ending-btn ghost" data-buy-max-cancel>取消</button>
      </div>
    </div>`
}

/** 渲染「开启新周目」确认弹窗（双清单：将失去 / 将继承，继承为预览值） */
export function renderNgPlusModal(el: HTMLElement, state: GameState, preview: NgPlusPreview): void {
  const { lost } = preview
  // 将失去（本周目内清零）
  const resText = lost.resources.map((k) => `${RESOURCE_META[k].symbol}${formatNumber(state.resources[k])}`).join('、') || '无'
  const bldText = lost.buildings.map((id) => `${BUILDINGS[id]?.name ?? id} ×${formatNumber(state.buildings[id] ?? 0)}`).join('、') || '无'
  const techText = lost.techs.map((id) => `${TECHS[id]?.name ?? id} Lv.${formatNumber(state.techLevels[id] ?? 0)}`).join('、') || '无'
  const facText = lost.alliedFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  // 将继承（NG+ 后生效，预览值）
  const codexText = preview.codexFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  const bonusText =
    Object.entries(preview.permanentBonuses)
      .map(([k, v]) => `${k === 'production' ? '全产出' : '军力上限'} +${formatPercent(v * 100)}`)
      .join('、') || '无'
  const achCount = Object.keys(state.achievements).length
  el.innerHTML = `
    <div class="ngplus-card" data-ngplus-card>
      <div class="buy-max-title">开启新周目</div>
      <div class="buy-max-summary">第 ${formatNumber(state.ngPlusLevel)} 周目 → 第 ${formatNumber(preview.nextLevel)} 周目。此操作不可逆。</div>
      <div class="ngplus-section-title">将失去（本周目）</div>
      <table class="buy-max-table">
        <tr><th>资源</th><td>${resText}</td></tr>
        <tr><th>建筑</th><td>${bldText}</td></tr>
        <tr><th>科技</th><td>${techText}</td></tr>
        <tr><th>派系</th><td>${facText}</td></tr>
        <tr><th>攻占</th><td>${formatNumber(lost.conquered)}/${formatNumber(Object.keys(CONQUESTS).length)} 区域</td></tr>
        <tr><th>探索</th><td>${formatNumber(lost.exploredCount)} 个发现物 · ${formatNumber(lost.activeExpeditions)} 支探索队（派遣中，将失去）</td></tr>
        <tr><th>舰队</th><td>${formatNumber(lost.fleetCount)} 艘护卫舰（随星际工程重置）</td></tr>
        <tr><th>声望</th><td>${formatNumber(lost.reputation)}</td></tr>
        <tr><th>统计</th><td>在线 ${formatPlayTime(lost.playSeconds)} · 累计矿物 ${formatNumber(lost.totalMineralEarned)}</td></tr>
      </table>
      <div class="ngplus-section-title">将继承</div>
      <table class="buy-max-table">
        <tr><th>周目</th><td>第 ${formatNumber(preview.nextLevel)} 周目</td></tr>
        <tr><th>产出加成</th><td>${formatMultiplier(preview.permanentMult)}</td></tr>
        <tr><th>科技点</th><td>${formatNumber(preview.carryTech)}</td></tr>
        <tr><th>图鉴派系</th><td>${escapeHtml(codexText)}（初始好感 +${formatNumber(25)}）</td></tr>
        <tr><th>永久加成</th><td>${bonusText}</td></tr>
        <tr><th>成就图鉴</th><td>${formatNumber(achCount)} 个（跨周目保留）</td></tr>
      </table>
      <div class="buy-max-warn">⚠ 确认后无法撤销：本周目资源、建筑、科技、派系好感、攻占进度与声望将全部清零。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-ngplus-confirm>开启新周目</button>
        <button type="button" class="ending-btn ghost" data-ngplus-cancel>取消</button>
      </div>
    </div>`
}

