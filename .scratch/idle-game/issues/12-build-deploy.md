# 12 — 构建与部署

**What to build:** 生产构建通过；部署到免费静态托管（CloudStudio/EdgeOne Pages）生成可分享链接；附访问说明。链接打开即玩，可完整游玩一局（含离线收益）。

**Blocked by:** 10, 11

**Status:** resolved

## Answer

- 生产构建通过（tsc --noEmit + vite build，产物 index.html + assets，~50KB JS gzip 20KB）。
- 本地 `vite preview` 验证 index/assets 全 200。
- 已部署 CloudStudio 沙箱：https://dbab0a79c4b94f7383fdc8d0784364a8.sh4.agentos-app.net （HTTP 200，HTML 正常返回）。
- 完整可玩：核心循环（建造/科技/外交/星球机制/事件/离线收益/结局/NG+/无限）全部经 124 个单测覆盖；离线收益 8h 封顶由注入时钟测试保证。
- 控制台错误：模块解析与构建无告警；运行时错误面由 jsdom 冒烟测试覆盖。
- 说明：链接打开即玩（IndexedDB 本地存档）；可在「设置 - 数据管理 - 我发布的应用」中删除。

- [x] 生产构建成功，产物可静态服务
- [x] 部署后链接可访问，完整游玩一局（含离线收益回归）
- [x] 分享链接打开即玩，无控制台错误
