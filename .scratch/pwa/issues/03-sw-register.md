# 03 — SW 注册模块（容错 + 幂等）与启动接入

**What to build:** 提供 PWA Service Worker 注册模块，注册失败绝不阻断游戏启动。

1. **注册模块**（`src/pwa.ts`，或并入现有结构）：
   - 若使用 `vite-plugin-pwa` 的 `registerSW`（`virtual:pwa-register`），在其外包裹 try/catch；或自管 `navigator.serviceWorker.register('/sw.js', { scope: '/' })`。
   - **幂等**：重复调用不重复注册（模块级 guard / `registrationReady` 单例）。
   - **容错**：`navigator.serviceWorker` 不存在（非安全上下文/旧浏览器/private 模式）或 `register()` reject → console.warn 后静默返回，**不得抛出影响 main() 启动链**。
   - 与插件 `registerType: 'autoUpdate'` 配合：不做手动版本比对/刷新提示。
2. **启动接入**：`src/main.ts` 调用注册模块（`void registerSW()`，不 await 阻断首帧；SW 注册与游戏循环并行，IndexedDB 存档不受 SW 影响）。
3. **注意**：`sw.js` 产物路径与 `base: './'` 一致（`register('/sw.js')` 相对 scope 解析，实际以产物为准——若插件注入注册脚本则无需手写 URL）。

**Blocked by:** 02

**Status:** resolved

- [x] `src/pwa.ts` 注册模块（幂等 + try/catch 容错）
- [x] `src/main.ts` 接入（不阻断启动链）
- [x] vitest 覆盖（见 ticket 04）

## Answer

`src/pwa.ts`：模块级幂等 guard + **truthy 检查** `navigator.serviceWorker`（非 `in` 探测——属性存在但为 undefined 会同步 TypeError 逃过 catch，已踩坑修复）+ `register()` reject → console.warn 静默返回；swUrl 默认 `new URL('./sw.js', location.href)`（兼容子路径部署）。`src/main.ts` 自动保存 interval 后 `void registerPwa()`（不 await，不阻断首帧）。`injectRegister: false` 防插件默认注入双注册。更新策略由 workbox generateSW 侧 skipWaiting+clientsClaim 承担（registerType autoUpdate），本模块零版本比对逻辑。
