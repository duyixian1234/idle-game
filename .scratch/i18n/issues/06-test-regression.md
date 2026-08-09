# 06 — 测试回归与收尾（存量全绿 + i18n 全量验证 + 提交）

**What to build:** 全部 key 化 + 翻译落地后，存量与新增测试全绿收尾——i18n 单元测试、语言切换 UI 冒烟、数字格式 en 分支、tsc 零错误；提交 i18n 功能分支。

**Blocked by:** 05 — 翻译与审计定稿

**Status:** ready-for-agent

- [ ] 存量 vitest 全量回归（落盘执行 `CI=1 pnpm test > log`，读 "Test Files/Tests" 汇总行 + EXIT 哨兵）
- [ ] `pnpm typecheck`（tsc --noEmit）零错误（TSC_EXIT 哨兵）
- [ ] 新增测试核对：i18n.test.ts（key 对称/t() 替换/语言持久化）、format.test.ts en 分支、dom-settings 语言切换冒烟
- [ ] 语言切换手工冒烟（dev server 或 jsdom 测试）：zh↔en 切换后建造页/日志/设置页关键文本变化；数字单位变化；存档数值不变
- [ ] 已知文案残留检查：`grep -r` 生产代码剩余中文字符串字面量（允许残留：注释、无 UI 语义的常量、测试断言），产出残留清单确认无 UI 可见遗漏
- [ ] `docs/` 无冲突；spec/issues 更新状态（全部 checked）
- [ ] 提交：feat(i18n) 消息按项目规范，含 ADR 编号（新 ADR-0045 i18n 架构）；推远程分支
