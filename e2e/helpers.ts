import type { Page } from '@playwright/test'

/**
 * 跳过新手引导浮层（若存在）。引导浮层 `.tutorial` 会拦截面板/资源条点击。
 * 直接调元素 `.click()` 绕过 pointer-events 拦截（浮层自身覆盖面板）。
 */
export async function dismissTutorial(page: Page): Promise<void> {
  const tutorial = page.locator('.tutorial')
  const appeared = await tutorial.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)
  if (!appeared) return
  await page.evaluate(() => {
    const btn = document.querySelector('.tutorial-btn[data-tutorial="skip"]') as HTMLButtonElement | null
    btn?.click()
  })
  await tutorial.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
}
