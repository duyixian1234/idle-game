# 02 — 资源 SVG 图标替代文字符号

**What to build:** 顶部资源条的资源类型标识从文字符号（◆⚡◎⚔）升级为 SVG 图标，与全站图标体系统一。新增 4 个资源图标 symbol，`RESOURCE_META` 加 `icon` 字段，资源条用 `<use>` 引用。

**Blocked by:** None — can start immediately（与 01 完全独立）

**Status:** ready-for-agent

**Spec:** ../spec.md（Q4/Q10/Q11/Q18）

## 目标

资源条当前用 `RESOURCE_META.symbol`（◆⚡◎⚔ 文字字符）表示资源类型。全站已有完整 SVG sprite 体系（`icons.ts`），建筑/天体/派系/成就/导航均用 SVG。资源条升级为 SVG 图标后视觉统一、重量感更强。

## 改动

- `src/ui/icons.ts` — `ICONS` 表新增 4 个资源 symbol：
  - `res-mineral`：多面体晶体（菱形截面 + 内部折射线）
  - `res-energy`：闪电符号（Z 形电弧 + 火花）
  - `res-tech`：神经网络节点（中心圆 + 三向外连线 + 小节点）
  - `res-military`：交叉剑盾（盾牌 + 后方交叉双剑）
  - 2px 描边、24px viewBox、`currentColor` 继承，与现有图标风格一致
- `src/engine/data.ts` — `RESOURCE_META` 每项加 `icon` 字段：
  - `mineral: { name: '矿物', symbol: '◆', icon: 'res-mineral' }`
  - `energy: { name: '能源', symbol: '⚡', icon: 'res-energy' }`
  - `tech: { name: '科技点', symbol: '◎', icon: 'res-tech' }`
  - `military: { name: '军力', symbol: '⚔', icon: 'res-military' }`
- `src/ui/bars.ts` — `renderResources()` 中 `.res-symbol` 用 `iconUse(meta.icon, 'res-symbol')` 替代 `meta.symbol` 文本
- `src/styles/shell.css` — `.res-symbol svg` 设 `width: 14px; height: 14px; vertical-align: middle;`，保持与原文字符号视觉重量一致
- 文字符号 `symbol` 字段保留（`formatEventHint` / `renderSettlementDetails` 等内联文本场景不变）

## 验收

- [ ] 资源条 4 项均显示 SVG 图标（`<svg class="res-symbol"><use href="#ic-res-mineral">` 等）
- [ ] 事件结算明细 `renderSettlementDetails` 仍用文字符号（◆⚡◎⚔ 不变）
- [ ] 事件 hint `formatEventHint` 仍用文字符号
- [ ] `icons.test.ts` 全绿：4 个新 symbol 存在、`RESOURCE_META` 每项 `icon` 对应 symbol 存在
- [ ] `tsc --noEmit` 通过
- [ ] `pnpm build` 通过
