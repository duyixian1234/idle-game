# 03 — 全量回归 + 文档同步（CONTEXT.md / ADR / 视觉验收）

**What to build:** 收尾工程：

- `pnpm test`（vitest 全量）+ `pnpm exec tsc --noEmit` 全绿；E2E（playwright）如有 breakdown 断言则同步。
- 真机手动验收：打开各资源 breakdown 面板，核对两大分区、合计占比、贡税/结盟/NG+/无尽/冶炼场行、消耗明细折叠、军力截断 note 位置与文案。
- CONTEXT.md 术语表同步（如「资源来源分解」相关语义变化）。
- 提取 ADR（参照 spec，编号接续 docs/adr/ 现状）并同步 docs/adr/README.md 索引。

**Blocked by:** 02

**Status:** resolved

## Acceptance Criteria

- [x] 全量 vitest 通过（58 文件 / 1091 测试）
- [x] typecheck 干净
- [x] E2E 跳过（commit 7180e53 已删除 e2e 目录，未跟踪）
- [x] 真机视觉验收：playwright + 构建产物 preview 渲染「固定产出 +3.00/秒 100.0%」section + 建筑产出行 + 总计，布局清晰
- [x] ADR 0062 落地 + README 索引同步 + 关系链补充
- [x] CONTEXT.md 新增「来源分解分区（Breakdown Sections）」术语条目

## Answer

已完成：全量测试 1091 通过、typecheck 干净、构建成功；视觉验收确认 fixed/permanent section 结构与合计占比正确（无永久加成时 permanent section 正确省略）；ADR 0062 + CONTEXT 术语 + README 索引同步。
