# Ticket 02 — 虫洞建筑定义 + 解锁/升级 + 终局工程区块

**Status:** resolved

## What it delivers

虫洞（wormhole）作为第三座终局工程建筑可建造/升级，星际工程分组与终局工程区块正确展示，NG+ 遗产折算纳入。

## Tasks

1. `data.ts` `BUILDINGS` 新增 `wormhole`（unique，maxLevel 10，baseCost 5 兆矿 + 100 亿科技，requiresEnded，requiresTech ['wormholeTheory']，produces {}）。
2. `data.ts` `MEGASTRUCTURE_IDS` → `['ringSmelter', 'jumpgate', 'wormhole']`。
3. `build.ts` `upgradePreviewText` / `buyPreviewText` 新增 wormhole 分支（效果文案，仿 jumpgate 先例）。
4. `ui/render/interstellar.ts`：
   - 新增 `WORMHOLE_EFFECT_TEXT` 常量（效果合成文案，放 shared.ts 与 JUMPGATE_EFFECT_TEXT 并列）。
   - `renderMegastructureSection` 效果文本分支：ringSmelter / jumpgate / wormhole。
   - 区块内虫洞卡片锁定状态展示（复用 buildingLockReason）。
5. `icons.ts` 新增 `wormhole` symbol。
6. 测试：`buildings.test.ts`（虫洞解锁前置/升级封顶）、`dom-interstellar.test.ts`（终局工程区块含虫洞卡、锁定态、效果文案）、`ngplus.test.ts`（遗产折算含虫洞等级）、`build.test.ts`（升级预览文案）。

## Done when

- 研发虫洞理论后可建造虫洞，Lv1-10 升级曲线正确（baseCost × 2^level），终局工程区块显示第三张卡，NG+ 遗产 ×1.5%/级。
