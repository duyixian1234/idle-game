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
  endingOverlay: HTMLElement
  buyMaxOverlay: HTMLElement
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
      <div class="resource-bar" aria-label="资源条"></div>
      <nav class="planet-bar" aria-label="星域总览"></nav>
    </header>
    <div class="breakdown-panel hidden" data-breakdown-panel aria-label="资源来源分解"></div>
    <main class="content">
      <section class="nav-page" data-nav-page="sector" aria-label="星域">
        <div class="mechanic-bar" data-mechanic aria-label="星球机制"></div>
        <section class="panel" aria-label="操作面板">
          <div class="panel-tabs">
            <button type="button" class="tab active" data-tab="log">日志<span class="tab-badge hidden" data-panel-tab-badge="log"></span></button>
            <button type="button" class="tab" data-tab="build">建造</button>
            <button type="button" class="tab" data-tab="tech">科技</button>
            <button type="button" class="tab" data-tab="diplomacy" disabled>外交</button>
            <button type="button" class="tab" data-tab="military" disabled>军事</button>
          </div>
          <div class="panel-body" data-panel="log">
            <div class="log-head"><span aria-hidden="true">[ 航行日志 ]<span class="log-cursor" data-log-cursor></span></span><button type="button" class="log-auto-config" data-auto-config-trigger>自动处理</button></div>
            <div class="log-area" data-log aria-label="日志流"></div>
          </div>
          <div class="panel-body hidden" data-panel="build"></div>
          <div class="panel-body hidden" data-panel="tech"></div>
          <div class="panel-body hidden" data-panel="diplomacy"></div>
          <div class="panel-body hidden" data-panel="military"></div>
        </section>
      </section>
      <section class="nav-page hidden" data-nav-page="archive" aria-label="档案"></section>
      <section class="nav-page hidden" data-nav-page="explore" aria-label="探索"></section>
      <section class="nav-page hidden" data-nav-page="settings" aria-label="设置"></section>
    </main>
    <footer class="nav-bar" aria-label="一级导航">
      <button type="button" class="nav-item active" data-nav="sector">${iconUse('nav-sector', 'nav-icon')}<span class="nav-label">星域</span><span class="nav-badge hidden" data-nav-badge="sector"></span></button>
      <button type="button" class="nav-item" data-nav="archive">${iconUse('nav-archive', 'nav-icon')}<span class="nav-label">档案</span><span class="nav-badge hidden" data-nav-badge="archive"></span></button>
      <button type="button" class="nav-item" data-nav="explore">${iconUse('nav-explore', 'nav-icon')}<span class="nav-label">探索</span></button>
      <button type="button" class="nav-item" data-nav="settings">${iconUse('nav-settings', 'nav-icon')}<span class="nav-label">设置</span></button>
    </footer>
    <div class="ending-overlay hidden" data-overlay="ending" aria-label="结局"></div>
    <div class="buy-max-overlay hidden" data-overlay="buy-max" aria-label="批量购买确认"></div>
    <div class="ngplus-overlay hidden" data-overlay="ngplus" aria-label="开启新周目确认"></div>
    <div class="megastructure-overlay hidden" data-overlay="megastructure" aria-label="终局抉择确认"></div>
    <div class="auto-config-overlay hidden" data-auto-config-overlay aria-label="自动处理配置"></div>
    <div class="tutorial hidden" aria-label="新手引导"></div>
    <input type="file" class="hidden" id="import-file" accept=".json,application/json" />
    <div class="scanline" data-scanline aria-hidden="true"></div>
    <div class="boot-overlay hidden" data-boot aria-label="开机序列"></div>
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
    endingOverlay: container.querySelector('[data-overlay="ending"]') as HTMLElement,
    buyMaxOverlay: container.querySelector('[data-overlay="buy-max"]') as HTMLElement,
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

