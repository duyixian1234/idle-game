/**
 * PWA 构建产物断言脚本（ticket 04，CI `pnpm build` 后执行）。
 *
 * 校验 `dist/` 中 PWA 关键产物齐全、manifest 可解析且图标引用真实存在——
 * 防 vite-plugin-pwa 配置漂移（如 globPatterns 漏掉图标、manifest 路径错位）。
 * 退出码 0/1；零第三方依赖。
 *
 * 用法：node scripts/check-pwa-build.mjs
 */
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

let failed = false

function fail(msg) {
  failed = true
  console.error(`✗ ${msg}`)
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  // 1. sw.js 存在非空
  const swPath = join(DIST, 'sw.js')
  if (!(await exists(swPath))) {
    fail('dist/sw.js 缺失')
  } else {
    const sw = await readFile(swPath, 'utf8')
    if (sw.trim().length === 0) fail('dist/sw.js 为空')
  }

  // 2. manifest.webmanifest 存在且 JSON 可解析
  const manifestPath = join(DIST, 'manifest.webmanifest')
  if (!(await exists(manifestPath))) {
    fail('dist/manifest.webmanifest 缺失')
  } else {
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (err) {
      fail(`dist/manifest.webmanifest 解析失败: ${String(err)}`)
    }
    if (manifest) {
      // 3. 图标覆盖：≥192、≥512、含 maskable，且对应文件真实存在
      const icons = manifest.icons ?? []
      const sizes = icons.map((i) => i.sizes)
      if (!sizes.includes('192x192')) fail('manifest 缺 192x192 图标')
      if (!sizes.includes('512x512')) fail('manifest 缺 512x512 图标')
      if (!icons.some((i) => i.purpose === 'maskable')) fail('manifest 缺 maskable 图标')
      for (const icon of icons) {
        const p = join(DIST, icon.src)
        if (!(await exists(p))) fail(`manifest 图标文件缺失: ${icon.src}`)
      }
    }
  }

  if (failed) {
    console.error('PWA 构建产物校验失败')
    process.exit(1)
  }
  console.log('✓ PWA 构建产物校验通过（sw.js / manifest.webmanifest / icons）')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
