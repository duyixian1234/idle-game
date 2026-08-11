# 01 — PWA 图标资产：SVG 源 + PNG 生成脚本

**What to build:** 为 PWA 提供图标资产，终端风格（深色底 + 单色描边符号），PNG 提交入库。

1. **SVG 源**（`scripts/pwa-icon.svg`，单文件多用途）：深色背景 `#050505` + 白色/浅灰描边「星环 + 采矿符号」（如环形轨道 + ▲ 采矿塔，36×36 或 48×48 viewBox）；符号主体居中、占 viewBox 中心 40-60% 区域（maskable 安全区 ≥80% 半径内），避免贴边。
2. **生成脚本**（`scripts/gen-pwa-icons.mjs`，Node ESM，`sharp` 一次性工具）：读取 SVG 源，输出至 `public/`：
   - `pwa-192.png`（192×192）
   - `pwa-512.png`（512×512）
   - `pwa-maskable-512.png`（512×512，安全区内符号完整）
   - `apple-touch-icon.png`（180×180，iOS 用，无透明）
   - 脚本幂等可重跑；PNG 产物提交入库（CI 不依赖 sharp）。
3. **sharp 安装**：`pnpm add -D sharp`（devDependency，仅脚本期使用）。

**Blocked by:** —

**Status:** resolved

- [x] `scripts/pwa-icon.svg` 源（终端风、maskable 安全区合规）
- [x] `scripts/gen-pwa-icons.mjs`（sharp 生成 4 PNG）
- [x] `public/pwa-192.png` / `pwa-512.png` / `pwa-maskable-512.png` / `apple-touch-icon.png` 提交入库
- [x] 文件大小合理（PNG 每枚 < 100KB 量级）

## Answer

`scripts/pwa-icon.svg`（128 viewBox：`#050505→#0b0f0c` 渐变深底 + 磷光绿 `#33ff00` 倾斜双星环 + 中央钻头符号 + 卫星点，与 `--phosphor` 主题一致；符号主体落中心 80% 直径安全区内，同图可作 maskable）+ `scripts/gen-pwa-icons.mjs`（sharp，幂等）→ `public/` 4 PNG（192/512/maskable-512/apple-180，9-29 KB）。SVG 注释禁用 `--`（XML 规范，sharp 解析报 corrupt header 已踩）。
