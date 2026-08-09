// ui/render/settings.ts — 设置页域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderSettingsPage（一级 tab：通用/存档/危险区/关于 四组）。
// 跨域依赖：type SettingsStatus（./shared）。

import { escapeHtml } from '../helpers'
import { getLanguage, t } from '../../i18n'
import type { SettingsStatus } from './shared'

/** 渲染设置页（一级 tab）：通用（音频 + 语言）/ 存档 / 危险区（重置 + NG+）/ 关于 四组。250ms 重建无 transition 干扰；
 * 日志方向已迁至日志页头部（data-tool="logdir"）、天体显隐已迁至探索页自动面板（data-planet-visibility）。 */
export function renderSettingsPage(el: HTMLElement, status: SettingsStatus): void {
  const state = status.state
  const lang = getLanguage()
  el.innerHTML = `
    <section class="settings-group">
      <h2 class="settings-title">通用</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="mute">${status.isMuted ? '🔇 已静音' : '🔊 静音'}</button>
      </div>
      <div class="settings-actions" data-lang-row>
        <span class="settings-label">${t('ui.settings.langLabel')}</span>
        <button type="button" class="tool-btn${lang === 'zh' ? ' active' : ''}" data-setting-action="lang-zh" aria-pressed="${lang === 'zh'}">${t('ui.settings.zh')}</button>
        <button type="button" class="tool-btn${lang === 'en' ? ' active' : ''}" data-setting-action="lang-en" aria-pressed="${lang === 'en'}">${t('ui.settings.en')}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">存档</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="export">导出存档</button>
        <button type="button" class="tool-btn" data-tool="import">导入存档</button>
      </div>
    </section>
    <section class="settings-group danger-zone">
      <h2 class="settings-title">危险区</h2>
      <p class="danger-hint">删除当前存档并重新开始，此操作不可撤销。</p>
      <div class="settings-actions">
        <button type="button" class="tool-btn danger" data-tool="reset">重置存档</button>
        ${state?.phase === 'infinite' ? '<button type="button" class="tool-btn danger" data-setting-action="ngplus">开启新周目</button>' : ''}
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">关于</h2>
      <div class="about-version">深空拓荒 · 星系统一联邦 v${escapeHtml(status.version)}</div>
      <div class="about-status">${escapeHtml(status.statusText)}</div>
    </section>`
}