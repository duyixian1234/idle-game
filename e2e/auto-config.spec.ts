import { test, expect } from '@playwright/test'
import { dismissTutorial } from './helpers'

/**
 * 自动处理配置回归（用户手动执行完整事件结算场景）。
 * 选择器全部使用 data-* 契约，便于后续补充固定种子事件流程。
 */
test.describe('自动处理配置', () => {
  test('日志头打开面板、展开五类并可关闭', async ({ page }) => {
    await page.goto('/')
    await dismissTutorial(page)

    await page.locator('[data-auto-config-trigger]').click()
    const panel = page.locator('[data-auto-config-panel]')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-auto-cat]')).toHaveCount(5)

    await panel.locator('[data-auto-cat-row="trade"]').click()
    await expect(panel.locator('[data-auto-details="trade"]')).toBeVisible()
    await panel.locator('[data-auto-config-close]').click()
    await expect(page.locator('[data-auto-config-overlay]')).toBeHidden()
  })

  test('配置开关即时保存并在重开面板时回填', async ({ page }) => {
    await page.goto('/')
    await dismissTutorial(page)

    await page.locator('[data-auto-config-trigger]').click()
    const enabled = page.locator('[data-auto-enabled="trade"]')
    await enabled.check()
    await page.locator('[data-auto-config-close]').click()
    await page.locator('[data-auto-config-trigger]').click()
    await expect(page.locator('[data-auto-enabled="trade"]')).toBeChecked()
  })
})
