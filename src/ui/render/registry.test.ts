import { describe, expect, it } from 'vitest'
import { createRenderRegistry, RENDER_NODES, RENDER_PHASE_ORDER, type RenderCtx, type RenderNode } from './registry'

function makeNode(id: string, phase: RenderNode['phase']): RenderNode {
  return { id, phase, render: () => {} }
}

/** 桩 ctx（registry 不依赖具体字段；memo 测试单独构造） */
function stubCtx(): RenderCtx {
  return {} as RenderCtx
}

describe('render-registry', () => {
  it('phase 分组序执行：content → overlay → badge（乱序注册也正确）', () => {
    const calls: string[] = []
    const r = createRenderRegistry()
    const node = (id: string, phase: RenderNode['phase']) => ({
      id,
      phase,
      render: () => { calls.push(id) },
    })
    r.register(node('badge-x', 'badge'))
    r.register(node('overlay-a', 'overlay'))
    r.register(node('content-z', 'content'))
    r.register(node('overlay-b', 'overlay'))
    r.run(stubCtx())
    expect(calls).toEqual(['content-z', 'overlay-a', 'overlay-b', 'badge-x'])
  })

  it('同 phase 内按注册序', () => {
    const calls: string[] = []
    const r = createRenderRegistry()
    r.register({ id: 'a', phase: 'content', render: () => { calls.push('a') } })
    r.register({ id: 'b', phase: 'content', render: () => { calls.push('b') } })
    r.register({ id: 'c', phase: 'content', render: () => { calls.push('c') } })
    r.run(stubCtx())
    expect(calls).toEqual(['a', 'b', 'c'])
  })

  it('重复 id 注册抛错', () => {
    const r = createRenderRegistry()
    r.register(makeNode('build', 'content'))
    expect(() => r.register(makeNode('build', 'content'))).toThrow(/duplicate node/)
  })

  it('未知 phase 抛错', () => {
    const r = createRenderRegistry()
    expect(() => r.register({ id: 'x', phase: 'nope' as RenderNode['phase'], render: () => {} })).toThrow(/unknown phase/)
  })

  it('RENDER_PHASE_ORDER 是 overlay 在 content 后、badge 最后', () => {
    expect(RENDER_PHASE_ORDER).toEqual(['content', 'overlay', 'badge'])
  })
})

describe('render golden-order（ADR-0035）', () => {
  // 真值来源：session render() 重构前（index.ts 136-191）的线性调用序，
  // 按 phase 归属；任何注册顺序/节点增删导致偏离此序 → 红。
  // 注：renderLogInto / renderBadges / updatePanelTabs 是会话态同步
  // （游标/滚动/角标/tab），按 ADR-0035「状态副作用留主函数」不进注册表。
  it('RENDER_NODES 注册序 == 旧 render() 调用序展开', () => {
    expect(RENDER_NODES.list().map((n) => n.id)).toEqual([
      // content（旧序：资源条 → 星球条 → 机制条 → 建造 → 星际 → 科技 → 外交 → 军事 → 档案 → 探索 → 设置 → 待处理事件）
      'resources',
      'planet-bar',
      'planet-mechanic',
      'build',
      'interstellar',
      'tech',
      'diplomacy',
      'military',
      'archive',
      'explore',
      'settings',
      'pending-events',
      // overlay（z-order 末位：自动配置 → 结局 → 教程 → 分解）
      'auto-config',
      'ending',
      'tutorial',
      'breakdown',
    ])
  })

  it('阶段序不变式：overlay 节点恒在 content 之后', () => {
    const list = RENDER_NODES.list()
    const contentLast = list.reduce((acc, n, i) => (n.phase === 'content' ? i : acc), -1)
    const overlayFirst = list.findIndex((n) => n.phase === 'overlay')
    expect(overlayFirst).toBeGreaterThan(contentLast)
  })
})
