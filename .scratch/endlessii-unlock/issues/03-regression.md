# 03 — 全量回归验证

**What to build:** 验证成就重设计 + 叙事接线无回归：全量引擎测试、类型检查、构建通过；E2E 冒烟确认游戏可正常游玩（本改动为纯引擎行为 + 日志播报，不新增 E2E 用例）。收尾时更新 spec 状态并标记本组全部 ticket resolved。

**Blocked by:** 01 — 成就定义重设计、02 — 叙事接线

**Status:** resolved

- [x] 全量 vitest 绿（447 用例 / 23 文件，含 achievements / story / engine / reputation 相关）
- [x] typecheck clean + build 通过
- [x] E2E 冒烟（既有用例）通过——用户手动验证确认无回归（2026-08-06，按约定由用户执行 E2E）
- [x] spec.md Status 更新为 implemented，3 个 ticket 全部 resolved
