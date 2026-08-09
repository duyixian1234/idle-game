# 05 — 英文翻译全量校对 + 过时文案审计报告

**What to build:** en.ts 全量翻译定稿（02/03/04 初稿统一校对，含术语一致性）+ 生产代码全量过时文案审计报告 `docs/i18n-text-audit.md`（文件:行号 + 过时原因 + 建议新文案）——02/03/04 已顺路修正的在此核对闭环。

**Blocked by:** 02 + 03 + 04 — 数据层/引擎/UI 全部 key 化后 key 集合冻结，翻译与审计才可定稿

**Status:** ready-for-agent

- [ ] 术语表（zh→en 核心映射：矿物/Mineral、能源/Energy、科技点/Tech Points、军力/Military Power、周目/NG+ Run、星域/Sector、探索/Exploration、跃迁枢纽/Jumpgate、护航/Escort…）定稿并写入 en.ts 头注释
- [ ] en.ts 全量校对：覆盖 02/03/04 全部 key（含 `{n}` 占位符移位、语序本地化、长叙事完整翻译）；与 zh key 集合对称性测试通过
- [ ] 审计报告：生产代码 42 文件全部文本逐条核对（依据 CONTEXT.md 领域语言 + ADR-0036/37/38/39/42/43/44 + balance.ts/types.ts 现行实现），产出 `docs/i18n-text-audit.md`：每条例出文件:行号、原文案、过时原因（引 ADR）、建议新文案
- [ ] 审计发现的未修复项补齐修复（02/03/04 若遗漏）：普通建筑升级语义残留、探索信道槽位描述、护航费表述、移除机制（buyMax/+10/+100/avgProd）残留提及
- [ ] 审计报告关联：`i18n-text-audit.md` 中每项标记状态（已修/待修），待修项需解释（如属设计取舍非文案错误）
- [ ] 全量测试 + typecheck 回归（落盘执行，日志带 EXIT 哨兵）
