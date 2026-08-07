# E2E（Playwright）退役：vitest 全绿为准

端到端测试（Playwright）正式**退役**：GitHub Actions 移除 E2E 步骤（`ci: drop e2e steps`），损坏的 E2E 测试直接删除（`tests:remove broken e2e tests`），`playwright.config.ts` 保留但不再维护。事实基准收敛为 **vitest 全绿 + typecheck + build**。

**状态**: Accepted（supersedes 早期「引擎 Vitest + 用户手动 E2E」双轨）
**日期**: 2026-08-07
**证据**: commit `79aebd7`（ci: drop e2e steps from GitHub Actions, playwright retired）、`7180e53`（tests: remove broken e2e tests）；`e2e/` 目录清空；`.scratch/` 各 spec 中「E2E 用户手动验证，铁律不代跑」表述

## 背景

项目早期投入 Playwright E2E（20+ 用例），但现实约束逐渐显现：① Windows 环境下 E2E 稳定性差（管道输出丢失、`\r` 进度符、类名断言脆弱）；② 250ms 全量重建 + 事件委托下时序敏感，E2E 频繁误报；③ 游戏是纯前端单机，UI 行为已有三层覆盖（引擎行为测试 + session 行为测试 + jsdom 冒烟），E2E 的边际价值集中在「真实浏览器渲染」，而这一层由用户手动验证（铁律）承担；④ CI 上 E2E 成为合并噪音（挂机游戏无回归账号体系，E2E 收益不抵维护成本）。

## 决策

1. **退役而非保留**：删除损坏 E2E 用例，CI 移除 E2E 步骤——半维护状态的测试比没有测试更危险（误报会训练团队忽略红）。
2. **事实基准收敛**：`pnpm tsc --noEmit` 零错误 + `pnpm build` 通过 + `pnpm vitest run` 全仓绿 = merge 硬门槛。
3. **语义化断言遗产保留**：E2E 时代确立的 `data-*` 断言纪律（ADR-0020）继续适用于 UI 冒烟测试——退役的是「真实浏览器跑」，不是「语义化契约」。
4. **用户手动验证兜底**：视觉/交互终验由用户承担（spec 惯例「E2E 用户手动验证，铁律不代跑」）。

## 为什么

- 三层测试已覆盖逻辑与映射，E2E 是第四层但成本/收益比最差——单机纯前端游戏没有「跨服务集成」需要 E2E 守护的独特价值。
- 半维护 E2E 是负资产：误报噪音训练团队「红着也 merge」，最终连真正回归价值也丢掉。
- 退役决策保留了可逆性：若未来出现多端/多浏览器真值需求，`playwright.config.ts` 仍在，但回归前需重写断言体系。

## 后果

- 测试策略收敛为「引擎行为 + UI 冒烟 + session 行为」三层 Vitest，全绿为唯一基准——测试质量与重构安全完全绑定于 Vitest 层。
- Windows 执行约定（落盘 + 读日志判结果，见 AGENTS.md）成为 vitest 运行的标准姿势，规避管道输出丢失。
- `e2e/`、`test-results/` 目录残留为空壳，可随时清理（不影响构建）。
