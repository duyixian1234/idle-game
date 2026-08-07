# Ticket 05: 测试校准（引擎 + UI + 存档）

**Spec:** `.scratch/megastructure-open/spec.md` | **前置:** 01-04 完成 | **依赖:** 无

## 目标
互斥语义的全部旧断言迁移为双轨开放断言；全量 vitest + typecheck 绿。

## 改动
1. **src/engine/interstellar.test.ts**：互斥相关用例
   - 例：「选定冶炼场后枢纽锁定」「选冶炼场 buyBuilding(jumpgate) 失败」→ 反转为「双轨可建」断言
2. **src/ui/dom.test.ts**
   - :1253 `ui: 星系间工程分组与终局抉择` 区块：:1334「双卡片并排、未选择均可点」保留；:1352「选定冶炼场：枢纽显示本周目锁定」→ 改为「选定冶炼场后枢纽仍可点/无锁定标识」；:1369「弹窗渲染互斥警告」→ 断言开放文案
   - :1570-1573 `megastructure` 相关断言（未建→megastructure、已选冶炼场后枢纽锁定→null 等）按新语义更新
   - :1045 槽位提示文案断言更新（若断言「终局抉择」）
3. **src/engine/ngplus.test.ts**（若存在或折算测试在别处）：折算断言不依赖 choice（构造 megastructureChoice 的用例改为直接构造 buildings/upgrades）
4. **核查**：bulk.test.ts / cost-softcap.test.ts / post100-cost-curve.test.ts / production-breakdown.test.ts / save.test.ts / dom.test.ts 中 `megastructureChoice` 引用——构造性引用（造状态）保留；语义断言（互斥）迁移
5. 新增覆盖：双轨建成 → 成就解锁（引擎层）

## 完成定义
- `pnpm vitest run` 全量绿（预期 ~484+ 用例）
- `pnpm typecheck` 绿
- 无任何测试断言"互斥/锁定"旧语义
