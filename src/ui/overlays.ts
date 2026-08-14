import { t } from '../i18n'
import type { GameState } from '../engine/types'
import {BUILDINGS, CONQUESTS, FACTIONS, RESOURCE_META, TECHS, defName, defDesc} from '../engine/data'
import {formatMultiplier, formatNumber, formatPercent, formatPlayTime, formatRate} from '../engine/format'
import {currentTutorialStep, TUTORIAL_STEPS, tutorialDone} from '../engine/tutorial'
import type { NgPlusPreview } from '../engine/ngplus'
import {buildingCost} from '../engine/buildings'
import {formatCost, jumpgateEffectText} from './render/shared'
import {escapeHtml} from './helpers'

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
    <div class="boot-title">${t('ui.overlays.0')}<span class="boot-version">v${escapeHtml(version)}</span></div>
    <div class="boot-line">&gt; SYSTEM INIT...</div>
    <div class="boot-line">${t('ui.overlays.1')}</div>
    <div class="boot-line">${t('ui.overlays.2')}</div>
    <div class="boot-skip">${t('ui.overlays.3')}</div>`
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
        <button type="button" class="tutorial-btn ghost" data-tutorial="skip">${t('ui.overlays.4')}</button>
        <button type="button" class="tutorial-btn primary" data-tutorial="next">${t('ui.overlays.5')}</button>
      </div>
    </div>`
}

/** 终局工程确认弹窗（复用 ending overlay 卡片体系）：效果预览 + 建造消耗 + 双轨提示 + 确认/取消 */
export function renderMegastructureModal(el: HTMLElement, state: GameState, id: string): void {
  const def = BUILDINGS[id]
  if (!def) return
  const effectText =
    id === 'ringSmelter'
      ? t('ui.overlaysX.2', { a0: formatMultiplier(2), a1: formatRate(100, false) })
      : jumpgateEffectText()
  el.innerHTML = `
    <div class="megastructure-card" data-megastructure-modal>
      <div class="buy-max-title">${t('ui.overlaysX.0', { a0: escapeHtml(defName(def)) })}</div>
      <div class="buy-max-summary">${escapeHtml(defDesc(def))}</div>
      <table class="buy-max-table">
        <tr><th>${t('ui.overlays.6')}</th><td>${escapeHtml(effectText)}</td></tr>
        <tr><th>${t('ui.overlays.7')}</th><td>${formatCost(buildingCost(state, id)) || formatNumber(0)}</td></tr>
      </table>
      <div class="buy-max-warn" data-megastructure-warn>${t('ui.overlays.8')}</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-megastructure-confirm="${def.id}">${t('ui.overlays.9')}</button>
        <button type="button" class="ending-btn ghost" data-megastructure-cancel>${t('ui.overlays.10')}</button>
      </div>
    </div>`
}

/** 永久加成表文本（production → 全产出；其余键 → 军力容量；空表 → 无）——NG+ 确认弹窗与继承摘要共用 */
function formatBonusText(bonuses: Record<string, number>): string {
  return (
    Object.entries(bonuses)
      .map(([k, v]) => `${k === 'production' ? t('ui.overlaysX.5') : t('ui.overlaysX.6')} +${formatPercent(v * 100)}`)
      .join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  )
}

/** 渲染「开启新周目」确认弹窗（双清单：将失去 / 将继承，继承为预览值） */
export function renderNgPlusModal(el: HTMLElement, state: GameState, preview: NgPlusPreview): void {
  const { lost } = preview
  // 将失去（本周目内清零）
  const resText = lost.resources.map((k) => `${RESOURCE_META[k].symbol}${formatNumber(state.resources[k])}`).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  const bldText = lost.buildings.map((id) => `${(BUILDINGS[id] ? defName(BUILDINGS[id]) : id)} ×${formatNumber(state.buildings[id] ?? 0)}`).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  const techText = lost.techs.map((id) => `${(TECHS[id] ? defName(TECHS[id]) : id)} Lv.${formatNumber(state.techLevels[id] ?? 0)}`).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  const facText = lost.alliedFactions.map((id) => (FACTIONS[id] ? defName(FACTIONS[id]) : id)).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  // 将继承（NG+ 后生效，预览值）
  const codexText = preview.codexFactions.map((id) => (FACTIONS[id] ? defName(FACTIONS[id]) : id)).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  const bonusText = formatBonusText(preview.permanentBonuses)
  const achCount = Object.keys(state.achievements).length
  el.innerHTML = `
    <div class="ngplus-card" data-ngplus-card>
      <div class="buy-max-title">${t('ui.overlays.11')}</div>
      <div class="buy-max-summary">${t('ui.overlaysX.1', { a0: formatNumber(state.ngPlusLevel), a1: formatNumber(preview.nextLevel) })}</div>
      <div class="ngplus-section-title">${t('ui.overlays.12')}</div>
      <table class="buy-max-table">
        <tr><th>${t('ui.overlays.13')}</th><td>${resText}</td></tr>
        <tr><th>${t('ui.overlays.14')}</th><td>${bldText}</td></tr>
        <tr><th>${t('ui.overlays.15')}</th><td>${techText}</td></tr>
        <tr><th>${t('ui.overlays.16')}</th><td>${facText}</td></tr>
        <tr><th>${t('ui.overlays.17')}</th><td>${formatNumber(lost.conquered)}/${formatNumber(Object.keys(CONQUESTS).length)} 区域</td></tr>
        <tr><th>${t('ui.overlays.18')}</th><td>${formatNumber(lost.exploredCount)} 个发现物 · ${formatNumber(lost.activeExpeditions)} 支探索队（派遣中，将失去）</td></tr>
        <tr><th>${t('ui.overlays.19')}</th><td>${formatNumber(lost.fleetCount)} 艘护卫舰（随星际工程重置）</td></tr>
        <tr><th>${t('ui.overlays.20')}</th><td>${formatNumber(lost.reputation)}</td></tr>
        <tr><th>${t('ui.overlays.21')}</th><td>在线 ${formatPlayTime(lost.playSeconds)} · 累计矿物 ${formatNumber(lost.totalMineralEarned)}</td></tr>
      </table>
      <div class="ngplus-section-title">${t('ui.overlays.22')}</div>
      <table class="buy-max-table">
        <tr><th>${t('ui.overlays.23')}</th><td>第 ${formatNumber(preview.nextLevel)} 周目</td></tr>
        <tr><th>${t('ui.overlays.24')}</th><td>${formatMultiplier(preview.permanentMult)}</td></tr>
        <tr><th>${t('ui.overlays.25')}</th><td>${formatNumber(preview.carryTech)}</td></tr>
        <tr><th>${t('ui.overlays.26')}</th><td>${escapeHtml(codexText)}（初始好感 +${formatNumber(25)}）</td></tr>
        <tr><th>${t('ui.overlays.27')}</th><td>${bonusText}</td></tr>
        <tr><th>${t('ui.overlays.28')}</th><td>${formatNumber(achCount)} 个（跨周目保留）</td></tr>
      </table>
      <div class="buy-max-warn">${t('ui.overlays.29')}</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-ngplus-confirm>${t('ui.overlays.30')}</button>
        <button type="button" class="ending-btn ghost" data-ngplus-cancel>${t('ui.overlays.31')}</button>
      </div>
    </div>`
}

/** 渲染「继承摘要」弹窗（开启新周目后立即展示，2026-08-14 ngplus-experience）：
 * 上周目继承汇总——周目 / 永久产出加成 / 继承科技点 / 派系图鉴（含新增）/ 成就数 / 永久加成表；
 * 全部来自现有存档与 NG+ 后 state（零新增字段、零存档变更）。关闭：遮罩 / Escape / 「继续」按钮。 */
export function renderNgPlusSummaryModal(el: HTMLElement, state: GameState, prevCodexLength: number): void {
  const newCodexCount = Math.max(0, state.factionCodex.length - prevCodexLength)
  const codexText = state.factionCodex.map((id) => (FACTIONS[id] ? defName(FACTIONS[id]) : id)).join(t('ui.overlaysX.4')) || t('ui.overlaysX.3')
  const bonusText = formatBonusText(state.permanentBonuses)
  const achCount = Object.keys(state.achievements).length
  el.innerHTML = `
    <div class="ngplus-card" data-ngplus-summary-card>
      <div class="buy-max-title">${t('ui.overlays.32')}</div>
      <div class="buy-max-summary">${t('ui.overlays.33', { a0: formatNumber(state.ngPlusLevel) })}</div>
      <table class="buy-max-table">
        <tr><th>${t('ui.overlays.34')}</th><td>第 ${formatNumber(state.ngPlusLevel)} 周目</td></tr>
        <tr><th>${t('ui.overlays.35')}</th><td>${formatMultiplier(state.permanentMult)}</td></tr>
        <tr><th>${t('ui.overlays.36')}</th><td>${formatNumber(state.resources.tech)}</td></tr>
        <tr><th>${t('ui.overlays.37')}</th><td>${escapeHtml(codexText)}（${formatNumber(state.factionCodex.length)} 派系${newCodexCount > 0 ? ` · 新增 +${formatNumber(newCodexCount)}` : ''}）</td></tr>
        <tr><th>${t('ui.overlays.38')}</th><td>${formatNumber(achCount)} 个</td></tr>
        <tr><th>${t('ui.overlays.39')}</th><td>${bonusText}</td></tr>
      </table>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-ngplus-summary-close>${t('ui.overlays.40')}</button>
      </div>
    </div>`
}

