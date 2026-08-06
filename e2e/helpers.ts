import type { Page } from '@playwright/test'

/**
 * 跳过新手引导浮层（若存在）。引导浮层 `.tutorial`（样式类）会拦截面板/资源条点击，
 * 断言用语义化容器契约 [data-tutorial-card]（卡片随浮层同显同隐）。
 * 直接调元素 `.click()` 绕过 pointer-events 拦截（浮层自身覆盖面板）。
 */
export async function dismissTutorial(page: Page): Promise<void> {
  const tutorial = page.locator('[data-tutorial-card]')
  const appeared = await tutorial.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)
  if (!appeared) return
  await page.evaluate(() => {
    const btn = document.querySelector('[data-tutorial="skip"]') as HTMLButtonElement | null
    btn?.click()
  })
  await tutorial.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
}

/**
 * 锁定 IndexedDB 'save/current' 的写入：拦截后续 main.js 的 saveGame 覆盖。
 * 必须在 seedSave 之后调用（防止 beforeunload 把内存中的新游戏 state 覆盖注入的旧档）。
 */
export async function lockSaveStore(page: Page): Promise<void> {
  await page.addInitScript(saveLockScript)
  await page.evaluate(saveLockScript)
}

function saveLockScript(): void {
  const proto = IDBObjectStore.prototype as unknown as { put: (v: unknown, k: IDBValidKey) => IDBRequest }
  if ((proto as typeof proto & { __e2eSaveLock?: boolean }).__e2eSaveLock) return
  const origPut = proto.put
  proto.put = function (value: unknown, key: IDBValidKey) {
    if (this.name === 'save' && key === 'current' && !(window as Window & { __e2eSeeding?: boolean }).__e2eSeeding) {
      // 把覆盖请求重定向到废弃 key，保留注入存档
      return origPut.call(this, value, '__blocked_by_e2e__')
    }
    return origPut.call(this, value, key)
  }
  ;(proto as typeof proto & { __e2eSaveLock?: boolean }).__e2eSaveLock = true
}

/** 向 IndexedDB（idle-game/save/current）写入存档，并返回读取到的 schemaVersion 用于断言 */
export async function seedSave(page: Page, save: Record<string, unknown>): Promise<number> {
  // 先注册到下一次文档，避免当前页面 reload 的 beforeunload 覆盖注入存档。
  await page.addInitScript(saveLockScript)
  return await page.evaluate(async (s) => {
    ;(window as Window & { __e2eSeeding?: boolean }).__e2eSeeding = true
    // 先清空 store，避免残留旧存档污染
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('idle-game', 1)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('save')) open.result.createObjectStore('save')
      }
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('save', 'readwrite')
        tx.objectStore('save').clear()
        tx.objectStore('save').put(s, 'current')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      open.onerror = () => reject(open.error)
    })
    // 立即读回验证
    const schemaVersion = await new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('idle-game', 1)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('save', 'readonly')
        const get = tx.objectStore('save').get('current')
        get.onsuccess = () => resolve((get.result as { schemaVersion?: number } | undefined)?.schemaVersion ?? -1)
        get.onerror = () => reject(get.error)
      }
      open.onerror = () => reject(open.error)
    })
    ;(window as Window & { __e2eSeeding?: boolean }).__e2eSeeding = false
    return schemaVersion
  }, save)
}
