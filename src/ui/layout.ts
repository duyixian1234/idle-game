import { t } from '../i18n'
import { iconSpriteHtml, iconUse } from './icons'

/** 一级导航 id（B 架构 4 tab：星域 / 档案 / 探索 / 设置） */
export type NavId = 'sector' | 'archive' | 'explore' | 'settings'

export interface AppElements {
  root: HTMLElement
  resourceBar: HTMLElement
  planetBar: HTMLElement
  mechanicBar: HTMLElement
  logEl: HTMLElement
  panel: HTMLElement
  ngplusOverlay: HTMLElement
  megastructureOverlay: HTMLElement
  tutorial: HTMLElement
  navBar: HTMLElement
  navPages: Record<NavId, HTMLElement>
  importFile: HTMLInputElement
  boot: HTMLElement
  autoConfigOverlay: HTMLElement
  breakdownPanel: HTMLElement
}

/** 构建应用骨架（B 架构），返回各区域元素引用。
 *  header（资源条+星域条）与 footer（一级导航）一次性构建，不参与 250ms tick 重建；
 *  机制条移入内容区顶部随滚动；4 个 data-nav-page 页容器承载星域/档案/探索/设置。 */
export function buildLayout(container: HTMLElement): AppElements {
  container.innerHTML = ''
  container.className = 'game'
  container.innerHTML = `
    <header class="topbar">
      <div class="resource-bar" aria-label="${t('ui.layout.0')}"></div>
      <nav class="planet-bar" aria-label="${t('ui.layout.1')}"></nav>
    </header>
    <div class="breakdown-panel hidden" data-breakdown-panel aria-label="${t('ui.layout.2')}"></div>
    <main class="content">
      <section class="nav-page" data-nav-page="sector" aria-label="${t('ui.layout.3')}">
        <div class="mechanic-bar" data-mechanic aria-label="${t('ui.layout.4')}"></div>
        <section class="panel" aria-label="${t('ui.layout.5')}">
          <div class="panel-tabs">
            <button type="button" class="tab active" data-tab="log">${t('ui.layout.17')}<span class="tab-badge hidden" data-panel-tab-badge="log"></span></button>
            <button type="button" class="tab" data-tab="build">${t('ui.layout.18')}</button>
            <button type="button" class="tab" data-tab="tech">${t('ui.layout.19')}</button>
            <button type="button" class="tab" data-tab="diplomacy" disabled>${t('ui.layout.20')}</button>
            <button type="button" class="tab" data-tab="military" disabled>${t('ui.layout.21')}</button>
          </div>
          <div class="panel-body" data-panel="log">
            <div class="log-head"><span aria-hidden="true">${t('ui.layout.26')}<span class="log-cursor" data-log-cursor></span></span><span class="log-head-actions"><button type="button" class="log-dir-toggle" data-tool="logdir" title="${t('ui.layout.27')}">📜 ${t('ui.session.1')}</button><button type="button" class="log-auto-config" data-auto-config-trigger>${t('ui.layout.28')}</button></span></div>
            <div class="log-filter-row" data-log-filter-bar aria-label="${t('ui.layout.6')}"></div>
            <div class="log-area" data-log aria-label="${t('ui.layout.7')}"></div>
          </div>
          <div class="panel-body hidden" data-panel="build"></div>
          <div class="panel-body hidden" data-panel="tech"></div>
          <div class="panel-body hidden" data-panel="diplomacy"></div>
          <div class="panel-body hidden" data-panel="military"></div>
        </section>
      </section>
      <section class="nav-page hidden" data-nav-page="archive" aria-label="${t('ui.layout.8')}"></section>
      <section class="nav-page hidden" data-nav-page="explore" aria-label="${t('ui.layout.9')}"></section>
      <section class="nav-page hidden" data-nav-page="settings" aria-label="${t('ui.layout.10')}"></section>
    </main>
    <footer class="nav-bar" aria-label="${t('ui.layout.11')}">
      <button type="button" class="nav-item active" data-nav="sector">${iconUse('nav-sector', 'nav-icon')}>${t('ui.layout.22')}</span><span class="nav-badge hidden" data-nav-badge="sector"></span></button>
      <button type="button" class="nav-item" data-nav="archive">${iconUse('nav-archive', 'nav-icon')}>${t('ui.layout.23')}</span><span class="nav-badge hidden" data-nav-badge="archive"></span></button>
      <button type="button" class="nav-item" data-nav="explore">${iconUse('nav-explore', 'nav-icon')}>${t('ui.layout.24')}</span></button>
      <button type="button" class="nav-item" data-nav="settings">${iconUse('nav-settings', 'nav-icon')}>${t('ui.layout.25')}</span></button>
    </footer>
    <div class="ngplus-overlay hidden" data-overlay="ngplus" aria-label="${t('ui.layout.12')}"></div>
    <div class="megastructure-overlay hidden" data-overlay="megastructure" aria-label="${t('ui.layout.13')}"></div>
    <div class="auto-config-overlay hidden" data-auto-config-overlay aria-label="${t('ui.layout.14')}"></div>
    <div class="tutorial hidden" aria-label="${t('ui.layout.15')}"></div>
    <input type="file" class="hidden" id="import-file" accept=".json,application/json" />
    <div class="scanline" data-scanline aria-hidden="true"></div>
    <div class="boot-overlay hidden" data-boot aria-label="${t('ui.layout.16')}"></div>
    ${iconSpriteHtml()}
  `
  const root = container
  const pages = ['sector', 'archive', 'explore', 'settings'] as const
  const navPages = {} as Record<NavId, HTMLElement>
  for (const p of pages) navPages[p] = container.querySelector(`[data-nav-page="${p}"]`) as HTMLElement
  return {
    root,
    resourceBar: container.querySelector('.resource-bar') as HTMLElement,
    planetBar: container.querySelector('.planet-bar') as HTMLElement,
    mechanicBar: container.querySelector('.mechanic-bar') as HTMLElement,
    logEl: container.querySelector('[data-log]') as HTMLElement,
    panel: container.querySelector('.panel') as HTMLElement,
    ngplusOverlay: container.querySelector('[data-overlay="ngplus"]') as HTMLElement,
    megastructureOverlay: container.querySelector('[data-overlay="megastructure"]') as HTMLElement,
    tutorial: container.querySelector('.tutorial') as HTMLElement,
    navBar: container.querySelector('.nav-bar') as HTMLElement,
    navPages,
    importFile: container.querySelector('#import-file') as HTMLInputElement,
    boot: container.querySelector('[data-boot]') as HTMLElement,
    autoConfigOverlay: container.querySelector('[data-auto-config-overlay]') as HTMLElement,
    breakdownPanel: container.querySelector('[data-breakdown-panel]') as HTMLElement,
  }
}

