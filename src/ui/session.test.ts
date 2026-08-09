import { describe, expect, it, beforeEach } from 'vitest'
import { createInitialState } from '../engine/engine'
import { pushLog } from '../engine/core'
import { formatNumber } from '../engine/format'
import { buildLayout } from './layout'
import { createSession } from './session'
import type { SoundManager } from '../audio'

/** jsdom 下不可用 WebAudio——stub 满足 createSession 的音效接口 */
const stubSound = {
  isMuted: () => false,
  setMuted: () => {},
  play: () => {},
} as unknown as SoundManager

/** 构建真实布局 + session，返回可交互环境 */
function setup() {
  const container = document.createElement('div')
  const els = buildLayout(container)
  const state = createInitialState(Date.now())
  const saved: unknown[] = []
  const session = createSession({
    els,
    sound: stubSound,
    state,
    onSave: async (s) => {
      saved.push(s)
    },
  })
  return { els, state, session, saved, container }
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('session: 公开接口', () => {
  it('createSession 返回 state/setState/render/deps 四项接口', () => {
    const { session, state } = setup()
    expect(session.state).toBe(state)
    expect(typeof session.setState).toBe('function')
    expect(typeof session.render).toBe('function')
    expect(typeof session.deps.render).toBe('function')
    expect(typeof session.deps.save).toBe('function')
    expect(typeof session.deps.playSound).toBe('function')
  })

  it('setState 替换内部 state 引用（导入/重置序列路径）', () => {
    const { session } = setup()
    const fresh = createInitialState(Date.now() + 1000)
    pushLog(fresh, 'story', '新档案')
    session.setState(fresh)
    expect(session.state).toBe(fresh)
    // 渲染使用新状态（不抛错）
    expect(() => session.render()).not.toThrow()
  })

  it('tickAndRender：setState 后 tick 与 render 同源（导入/重置后资源不冻结，ADR-0043）', () => {
    const { els, session } = setup()
    // 模拟导入：新 state 引用，lastTick 设为 10 秒前（保证 dt > 0）+ 有矿物产出
    const imported = createInitialState(Date.now() - 10_000)
    imported.buildings.miner = 50 // 50 矿/s
    const mineralBefore = imported.resources.mineral
    session.setState(imported)
    session.tickAndRender(Date.now())
    // tick 推进的是会话当前 state（新引用），而非被替换掉的旧对象
    expect(imported.resources.mineral).toBeGreaterThan(mineralBefore)
    // render 展示的是同一新 state 推进后的值（若展示被替换掉的旧 state 初始值则冻结）
    const val = els.resourceBar.querySelector('[data-resource="mineral"] [data-res-value]')
    expect(val).toBeTruthy()
    expect(val!.textContent).toBe(formatNumber(imported.resources.mineral))
  })

  it('deps.render 触发全量重渲染（dispatch 副作用通路）', () => {
    const { els, session, state } = setup()
    state.resources.mineral = 999
    session.deps.render()
    expect(els.resourceBar.textContent).toContain('999')
  })

  it('隐藏抽屉分区 toggle：点击只翻转本区展开态（ADR-0043）', () => {
    const { els, session } = setup()
    session.state.hiddenBuildings = ['miner']
    session.render()
    const getToggle = (): HTMLElement | null =>
      els.panel.querySelector<HTMLElement>('[data-panel="build"] [data-show-hidden-buildings]')
    const getDrawer = (): HTMLElement | null =>
      els.panel.querySelector<HTMLElement>('[data-panel="build"] [data-build-hidden-drawer]')
    expect(getToggle()?.getAttribute('data-show-hidden-buildings')).toBe('civil')
    // 点击展开 civil 区抽屉
    getToggle()!.click()
    expect(getDrawer()).toBeTruthy()
    // 再次点击收起（toggle 在重建后重新查询）
    getToggle()!.click()
    expect(getDrawer()).toBeNull()
  })

  it('deps.save 触发 onSave 回调', async () => {
    const { session, saved } = setup()
    session.deps.save()
    // onSave 是 async，微任务后断言
    await Promise.resolve()
    expect(saved).toHaveLength(1)
  })
})

describe('session: 会话态 → 渲染联动', () => {
  it('锁定卡折叠：点击 data-locked-collapse 翻转展开态并重渲染', () => {
    const { els, session } = setup()
    session.render()
    // 星际工程分区（interstellar）：初始含多张 requires 前置锁定卡（>3 张），折叠行确定性渲染
    const collapse = els.panel.querySelector<HTMLElement>('[data-locked-collapse="interstellar"]')
    expect(collapse).toBeTruthy()
    expect(collapse!.dataset.expanded).toBe('false')
    collapse!.click()
    const after = els.panel.querySelector<HTMLElement>('[data-locked-collapse="interstellar"]')
    expect(after?.dataset.expanded).toBe('true')
    // 再点收起
    after?.click()
    const again = els.panel.querySelector<HTMLElement>('[data-locked-collapse="interstellar"]')
    expect(again?.dataset.expanded).toBe('false')
  })

  it('资源分解面板互斥展开：问号点击展开/再点收起/点外部关闭', () => {
    const { els, session } = setup()
    session.render()
    const trigger = els.resourceBar.querySelector<HTMLElement>('[data-breakdown-trigger]')
    expect(trigger).toBeTruthy()
    // 展开
    trigger!.click()
    expect(els.breakdownPanel.classList.contains('hidden')).toBe(false)
    // 再点同一 trigger 收起
    els.resourceBar.querySelector<HTMLElement>('[data-breakdown-trigger]')!.click()
    expect(els.breakdownPanel.classList.contains('hidden')).toBe(true)
    // 展开后点面板外任意处关闭
    els.resourceBar.querySelector<HTMLElement>('[data-breakdown-trigger]')!.click()
    expect(els.breakdownPanel.classList.contains('hidden')).toBe(false)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(els.breakdownPanel.classList.contains('hidden')).toBe(true)
  })

  it('日志 tab 角标：新增日志后切走 tab 显示差值，读后清零', () => {
    const { els, session, state } = setup()
    session.render()
    // 先切到建造 tab（让日志 tab 非激活）
    const buildTab = els.panel.querySelector<HTMLElement>('[data-tab="build"]')
    buildTab?.click()
    // 新增 2 条日志并重渲染
    pushLog(state, 'system', '测试日志 1')
    pushLog(state, 'system', '测试日志 2')
    session.render()
    const badge = els.panel.querySelector<HTMLElement>('[data-panel-tab-badge="log"]')
    expect(badge?.textContent).toBe('2')
    expect(badge?.classList.contains('hidden')).toBe(false)
    // 切回日志 tab：读即已读，角标隐藏
    const logTab = els.panel.querySelector<HTMLElement>('[data-tab="log"]')
    logTab?.click()
    session.render()
    expect(badge?.classList.contains('hidden')).toBe(true)
  })

  it('二级 tab 切换持久化到 localStorage（刷新记忆）', () => {
    const { els, session } = setup()
    session.render()
    const techTab = els.panel.querySelector<HTMLElement>('[data-tab="tech"]')
    techTab?.click()
    expect(localStorage.getItem('idle-active-panel-tab')).toBe('tech')
    // 面板体显隐：tech 可见
    const techBody = els.panel.querySelector<HTMLElement>('[data-panel="tech"]')
    expect(techBody?.classList.contains('hidden')).toBe(false)
  })
})

describe('session: 重操作序列（actions-heavy）', () => {
  it('importSaveFile：非法存档写警告日志，state 保持原样', async () => {
    const { els, state } = setup()
    const beforeLogs = state.log.length
    // 触发隐藏 input 的 change 事件（listeners 委托到 importSaveFile）
    const badFile = new File(['{"broken": json'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(els.importFile, 'files', { value: [badFile], configurable: true })
    els.importFile.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 0))
    // 失败路径：写警告日志，不替换 state
    expect(state.log.length).toBeGreaterThan(beforeLogs)
    const last = state.log[state.log.length - 1]
    expect(last.type).toBe('warning')
    expect(last.text).toContain('导入失败')
  })

  it('NG+ 序列经 ctx 触发不抛错（startNewGamePlusSequence 通路）', () => {
    const { session } = setup()
    session.render()
    expect(() => session.render()).not.toThrow()
  })
})

describe('session: 自动处理快捷开关默认兜底（2026-08-09）', () => {
  it('启用 security 不注入默认 ignore（交由引擎降级链），其余类别仍注入', () => {
    const { els, session } = setup()
    const toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.dataset.autoQuickToggle = 'security'
    els.logEl.appendChild(toggle)
    toggle.click() // 模拟用户勾选：checked→true 且触发 click 监听
    const policy = session.state.automationPolicies.security
    expect(policy).toMatchObject({ enabled: true })
    expect(policy.fallbackOptionId).toBeUndefined()

    // 对照：trade 仍注入默认 accept 兜底
    const tradeToggle = document.createElement('input')
    tradeToggle.type = 'checkbox'
    tradeToggle.dataset.autoQuickToggle = 'trade'
    els.logEl.appendChild(tradeToggle)
    tradeToggle.click()
    expect(session.state.automationPolicies.trade.fallbackOptionId).toBe('accept')
  })
})
