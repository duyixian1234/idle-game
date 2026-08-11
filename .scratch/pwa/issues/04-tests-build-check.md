# 04 — 测试：SW 注册单测 + manifest 配置断言 + 构建产物检查脚本

**What to build:** 测试层（vitest 为准，ADR-0019 无 E2E）：

1. **vitest 单测**（jsdom）：
   - `src/pwa.test.ts`（或对应文件）：mock `navigator.serviceWorker`——
     a. 正常路径：调用注册、scope 正确；
     b. 幂等：连续两次调用只注册一次；
     c. 容错：`navigator.serviceWorker` 为 undefined（删除属性）时不抛错、返回 undefined；
     d. 容错：`register()` reject 时不抛错（console.warn 可 stub）。
   - **manifest 配置断言**：将 PWA 配置（name/short_name/theme/display/icons 数量与 purpose）提取为可导入常量（或从 `vite.config.ts` 插件配置导出），单测断言关键字段与图标集覆盖（≥192、≥512、含 maskable）——防配置漂移。
2. **构建产物检查脚本**（`scripts/check-pwa-build.mjs`，Node ESM，无第三方依赖）：
   - 断言 `dist/sw.js` 存在非空、`dist/manifest.webmanifest` 存在且 JSON 可解析、`manifest.icons` 至少含 192 与 512（含 maskable purpose）、对应 PNG 文件存在于 `dist/`。
   - 退出码 0/1；供 CI 或本地 `pnpm build` 后手动执行。
3. **CI 接入**（`.github/workflows/ci.yml`）：build 步骤后追加 `node scripts/check-pwa-build.mjs`（若改 CI，保持 typecheck→build→test 顺序）。

**Blocked by:** 03

**Status:** resolved

- [x] `src/pwa.test.ts`（正常/幂等/两路容错）
- [x] manifest 配置常量 + 断言测试
- [x] `scripts/check-pwa-build.mjs` + CI 接入（或本地脚本说明）
- [x] `pnpm test` 全绿 + `tsc --noEmit` 零错误

## Answer

`src/pwa.test.ts` 5 例（正常注册/幂等/无 SW 容错/reject 容错 warn/默认 URL 解析）；`src/pwa-manifest.test.ts` 3 例（元数据与主题一致/start_url+scope 相对 ./ 与 base 一致/图标集 192+512+maskable）。`scripts/check-pwa-build.mjs`（零依赖）：断言 dist/sw.js 非空、manifest.webmanifest 可解析且含 192/512/maskable、图标文件真实存在；CI `pnpm build` 后追加 `node scripts/check-pwa-build.mjs`。坑：TS noUnusedLocals 下测试顶层 import 未用会报错（全走 await import）；manifest 断言遇 as-const 差异类型访问 purpose 报错（普通对象类型即可）。
