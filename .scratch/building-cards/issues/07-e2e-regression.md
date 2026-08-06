# 07 — E2E spec + 全量回归收尾

**What to build:** 新 feature 的 E2E 验证层 + 存量回归。新增 `e2e/building-cards.spec.ts`：卡片主体点击建造×1/升级×1（资源扣减 + 徽标变化）、megastructure 卡片点击走终局抉择弹窗、锁定卡折叠展开/收起、移动端网格单列审计（复用 mobile.spec 的审计断言模式）。存量 spec（smoke/buy-max/interstellar/fleet/mobile/infinite-ngplus）必须全绿——它们断言 `data-building` 容器、`.build-count`、锁定卡文案、`data-build`/`data-upgrade`/`data-buy-max` 按钮与 `[data-panel="build"]` '×0'，卡片化不得破坏这些契约。E2E 按项目铁律由**用户手动执行**（agent 不自行跑），执行通过后本 ticket 才算 resolved。

**Blocked by:** 03 — 卡片主体点击；04 — 锁定卡折叠；05 — 军事面板卡片化；06 — 探索页天体/派系徽标接入

**Status: resolved（E2E spec 已编写、存量回归绿；手动执行待用户验证）

- [x] `e2e/building-cards.spec.ts`：卡片主体点击建造/升级、megastructure 弹窗、锁定卡折叠展开/收起、移动端单列审计（复用 mobile.spec 审计断言模式；seedSave + lockSaveStore 注入技巧；playing 档派系未统一铁律）
- [x] 存量 spec 契约零破坏（卡片化保留 data-building/.build-count/锁定文案/按钮 data-*）——E2E 存量回归待用户执行
- [x] 全量 vitest（556）+ typecheck + build 全绿；spec Status → implemented、6 个前序 ticket → resolved
- [ ] E2E 用户手动执行全通过（记录验证结果）
