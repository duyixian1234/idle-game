import { describe, expect, it } from 'vitest'
import { PWA_MANIFEST } from './pwa-manifest'

describe('PWA_MANIFEST（grill-log-pwa Q6 配置漂移断言）', () => {
  it('核心元数据与游戏主题一致', () => {
    expect(PWA_MANIFEST.name).toBe('深空拓荒 · 星系统一联邦')
    expect(PWA_MANIFEST.short_name).toBe('深空拓荒')
    expect(PWA_MANIFEST.lang).toBe('zh-CN')
    expect(PWA_MANIFEST.display).toBe('standalone')
    // 与 index.html / CSS 主题变量 --bg: #050505 一致（终端深色）
    expect(PWA_MANIFEST.theme_color).toBe('#050505')
    expect(PWA_MANIFEST.background_color).toBe('#050505')
  })

  it('start_url / scope 相对 ./（与 vite base 一致，Cloudflare Pages 根路径）', () => {
    expect(PWA_MANIFEST.start_url).toBe('./')
    expect(PWA_MANIFEST.scope).toBe('./')
  })

  it('图标集完整：192 + 512 + maskable 覆盖（PWA 安装硬性要求）', () => {
    const icons = PWA_MANIFEST.icons
    const sizes = icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })
})
