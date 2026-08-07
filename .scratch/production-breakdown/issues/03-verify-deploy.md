# 03 — 验证收尾 + 提交部署

**What to build:** 本 feature 的交付收尾：全量验证、commit、push、部署。E2E 按项目铁律由用户手动验证，本 ticket 不跑 E2E。

**Blocked by:** 01, 02

**Status:** open

- [ ] `pnpm vitest run` 全量绿（引擎 01 新增 + UI 02 冒烟 + 全仓回归）
- [ ] `pnpm exec tsc --noEmit` typecheck clean
- [ ] `pnpm build`（vite build）产出 dist/
- [ ] commit（conventional）+ push main（先 `git status` 确认无并发冲突，遵循 Copilot 并发协作教训）
- [ ] `wrangler pages deploy dist/ --project-name idle-game --branch main`，报告 deployment URL（主域边缘缓存稍后同步，curl 需 `--compressed`）
- [ ] 告知用户验证点：打开面板看守恒、军力截断、能源不足、消耗折叠、移动端
