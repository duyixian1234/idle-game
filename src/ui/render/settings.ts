// ui/render/settings.ts — 设置页域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderSettingsPage（一级 tab：通用/存档/危险区/关于 四组）。
// 跨域依赖：type SettingsStatus（./shared）。

import { getLanguage, t } from '../../i18n'
import { escapeHtml } from '../helpers'
import type { SettingsStatus } from './shared'

/** 渲染设置页（一级 tab）：通用（音频 + 语言）/ 存档 / 危险区（重置 + NG+）/ 关于 四组。250ms 重建无 transition 干扰；
 * 日志方向已迁至日志页头部（data-tool="logdir"）、天体显隐已迁至探索页自动面板（data-planet-visibility）。 */
export function renderSettingsPage(el: HTMLElement, status: SettingsStatus): void {
  const state = status.state
  const lang = getLanguage()
  el.innerHTML = `
    <section class="settings-group">
      <h2 class="settings-title">${t('ui.settingsPage.0')}</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="mute">${status.isMuted ? t('ui.settingsPage.1') : t('ui.settingsPage.2')}</button>
      </div>
      <div class="settings-actions" data-lang-row>
        <span class="settings-label">${t('ui.settings.langLabel')}</span>
        <button type="button" class="tool-btn${lang === 'zh' ? ' active' : ''}" data-setting-action="lang-zh" aria-pressed="${lang === 'zh'}">${t('ui.settings.zh')}</button>
        <button type="button" class="tool-btn${lang === 'en' ? ' active' : ''}" data-setting-action="lang-en" aria-pressed="${lang === 'en'}">${t('ui.settings.en')}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">${t('ui.settingsPage.3')}</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="export">${t('ui.settingsPage.4')}</button>
        <button type="button" class="tool-btn" data-tool="import">${t('ui.settingsPage.5')}</button>
      </div>
    </section>
    <section class="settings-group danger-zone">
      <h2 class="settings-title">${t('ui.settingsPage.6')}</h2>
      <p class="danger-hint">${t('ui.settingsPage.7')}</p>
      <div class="settings-actions">
        <button type="button" class="tool-btn danger" data-tool="reset">${t('ui.settingsPage.8')}</button>
        ${state?.phase === 'infinite' ? `<button type="button" class="tool-btn danger" data-setting-action="ngplus">${t('ui.settingsPage.9')}</button>` : ''}
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">${t('ui.settingsPage.10')}</h2>
      <div class="about-version">${t('ui.settingsPage.11', { a0: escapeHtml(status.version) })}</div>
      <div class="about-status">${escapeHtml(status.statusText)}</div>
    </section>`
}