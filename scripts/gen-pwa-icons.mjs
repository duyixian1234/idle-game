/**
 * PWA 图标生成脚本（grill-log-pwa Q5：手写 SVG 源 → PNG 提交入库，CI 不依赖本脚本）。
 *
 * 用法：pnpm exec node scripts/gen-pwa-icons.mjs
 * 依赖：sharp（devDependency，仅本脚本使用）
 * 输出：public/pwa-192.png、public/pwa-512.png、public/pwa-maskable-512.png、public/apple-touch-icon.png
 * 幂等：可重复执行；PNG 产物提交入库（.gitignore 未排除 public/）。
 *
 * maskable 合规说明：SVG 源符号主体（钻头 26-106 纵向、星环 rx45）均落在
 * 中心 80% 直径圆（r=51.2/128）内，同一图像可直接作 maskable，无需二次缩放。
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public')

/** @type {{ name: string; size: number }[]} */
const TARGETS = [
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
  { name: 'pwa-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

async function main() {
  const svg = await readFile(join(ROOT, 'scripts', 'pwa-icon.svg'))
  await mkdir(OUT_DIR, { recursive: true })
  for (const t of TARGETS) {
    await sharp(svg, { density: 300 })
      .resize(t.size, t.size)
      .png({ compressionLevel: 9 })
      .toFile(join(OUT_DIR, t.name))
    console.log(`✓ ${t.name} (${t.size}×${t.size})`)
  }
  console.log(`done → ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
