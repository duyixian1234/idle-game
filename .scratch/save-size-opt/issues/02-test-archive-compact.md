# 02 测试：generatedTargets 归档压缩行为契约（TDD 红测试先行）

关联 spec：#29（save-size-opt）

## 任务

为 `compactTargetOnArchive`（归档条目字段压缩）编写行为契约测试（红 → 绿）。函数尚未实现，测试先行。

## 验收标准（测试断言）

1. **conquest/faction 归档即精简**（conquest.test.ts / diplomacy-auto.test.ts）：
   - 攻占成功归档后，对应 generatedTargets 条目字段 = `{kind, id, name, batch}` 白名单子集（desc/guard/rewardMineral 等消失）。
   - 派系结盟归档后同理。
2. **planet 全量保留**（exploration.test.ts）：机制型天体归档后，条目字段原样（含 mechanicId/output 等）。
3. **UI 消费字段完好**：归档折叠区渲染所需 `name` 仍在（defName 可解析）。
4. **引擎对已归档条目不读已删字段**：`conquestDef`/`planetOutputDef` 对已归档条目调用不抛错、返回 undefined 或安全兜底。
5. **存量幂等**（save.test.ts）：对已压缩条目重复执行压缩，结果不变（幂等）；serialize/deserialize 往返后 UI 所需字段不丢。

## 约束

- 只断言外部行为（归档后状态），不测压缩函数内部实现。
- 现有 conquest/diplomacy/exploration 测试的归档断言（archivedRounds 标记）不得回归。

