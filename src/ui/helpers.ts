import type { ActionFailure } from '../engine/engine'

/** HTML 转义（防注入；跨 panels/log/overlays/explore-page/bars 共用，唯一真源） */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

/** 动作结果失败判定（actions 注册表与调用方共用；type guard） */
export function isActionFailure(r: unknown): r is ActionFailure {
  return typeof r === 'object' && r !== null && (r as ActionFailure).ok === false
}
