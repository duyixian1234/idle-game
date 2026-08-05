# 01 — 科技升级核心

**What to build:** 5 项产出类科技（行星钻探/太阳能效率/计算加速/聚变电池/纳米制造）可从 Lv1 反复升级到 Lv10；每级产出系数线性提升（基础 mult + 0.5×(lv−1)），成本指数递增（base × 1.5^(lv−1)）；科技面板显示当前等级、下一级效果与成本，Lv10 显示满级态；旧存档（researched: boolean 结构）无损迁移为 techLevels（已研发科技 = Lv1），存档 schema 版本升级。深层钻探等解锁类科技保持一次性研发，无升级入口。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 引擎：`upgradeTech` 成功/余额不足/已满级拒绝，返回可读原因；Lv1 行为与旧 researchTech 等价
- [ ] 引擎：生效系数按等级正确（基础 mult + 0.5×(lv−1)，Lv10 封顶），产出管线与科技点/矿物/能源累计均按新系数
- [ ] 引擎：升级成本 = base × 1.5^(lv−1)，矿物与科技点同比例递增
- [ ] 存档：techLevels 结构读写、schema 版本升级；旧档 migrated 测试（researched=true → level 1，全空 → 空对象）
- [ ] UI：科技面板条目显示「Lv X」+ 升级按钮 + 下一级效果/成本；未研发态/已满级态正确；资源不足禁用并提示原因
- [ ] NG+ 重置 techLevels（从头研发），继承策略不变
- [ ] 引擎单测 + UI 冒烟全绿；既有测试不破
