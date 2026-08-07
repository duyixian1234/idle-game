# 04 - 测试同步（dom.test.ts）

**Status:** resolved
**Spec:** ../spec.md（测试影响）

## 目标

布局结构变更后的冒烟断言同步 + 新增日志 tab 契约断言。

## 改动

- `src/ui/dom.test.ts`：
  - L:50 `.tab` 数量 4 → **5**；
  - 新增：`[data-tab="log"]` 存在且为首个 tab；`[data-panel="log"]` 内包含 `.log-head` 与 `[data-log]`；`[data-panel-tab-badge="log"]` 初始 hidden；
  - 原 `.log-head` 游离于 panel 外的断言（如有）改为 panel 内。

## 验收

- [ ] vitest 全绿（717 → 720+）
- [ ] `tsc --noEmit` 通过
- [ ] `pnpm build` 通过

## 备注

角标/持久化逻辑在 main.ts（jsdom 冒烟不可达），语义由 spec 02 覆盖；E2E 体系已终止（e2e/ 空），不新增。
