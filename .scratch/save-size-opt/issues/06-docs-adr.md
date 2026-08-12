# 06 文档：ADR-0058 + CONTEXT.md + ADR 索引

关联 spec：#29（save-size-opt）

## 任务

记录存档体积优化的架构决策，更新项目文档。

## 实现要点

- 新增 `docs/adr/0058-save-size-opt.md`，记录：
  - 决策 1：automationHistory 12h 窗口 + 保底 50 条（消费方仅 cooldown/审计，UI 零引用）
  - 决策 2：generatedTargets 归档条目白名单压缩（仅 conquest/faction，planet 全量保留——产出管线依赖）
  - 明确否决：log 窗口化（已有 200 条上限）、活跃条目压缩（UI 主列表消费 desc）、详情面板汇总/探索面板隐藏（收益≈0 伤可用性）
  - 语义：运行时行为，非结构变更，不 bump schema
- 同步 `docs/adr/README.md` 索引（追加 0058）。
- `CONTEXT.md` 存档/事件系统条目追加：体积优化说明。

## 验收

- ADR 文件符合现有模板（参考 0056/0057）。
- README 索引与 CONTEXT.md 同步，无死链。

