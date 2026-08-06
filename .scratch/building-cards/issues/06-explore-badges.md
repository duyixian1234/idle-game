# 06 — 探索页天体/派系徽标接入 SVG 资产

**What to build:** 探索页的天体卡片与派系徽标从 emoji 迁移到统一 SVG 资产——EXPLORE_PLANETS 5 个天体（碎星矿带/氦闪气云/深空裂谷/星际物流港/殖民前哨）与 ALL_FACTIONS 8 家派系徽标用 `<use>` 引用 01 的 symbol sprite。派遣按钮 🚀 保留不换。探索页派遣卡/终局卡结构不动，`data-explore-dispatch`/`data-ngplus` 契约零破坏。

**Blocked by:** 01 — 图标资产

**Status: resolved

- [ ] renderExplorePage：天体卡片 + 派系徽标换 `<use>` 图标（8 家派系：初始 4 + 探索 4）
- [ ] `data-explore-dispatch`/`data-ngplus`/派遣卡结构契约保留；派遣按钮 🚀 不动
- [ ] dom 冒烟：探索页图标渲染；全量 vitest 回归绿 + typecheck clean
