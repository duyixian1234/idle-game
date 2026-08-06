# 05 — UI（深空信道多槽列表 + 产出天体贡献 + 外交徽标接入）

**What to build:**
- `dom.ts renderExplorePage`（现 L228-256 单槽状态行）：改为深空信道 1/2/3 列表：
  - 每槽 `data-expedition-slot="1|2|3"`：
    - 空闲：派遣按钮 `data-explore-dispatch="N"` + 消耗预览（`expeditionMilitaryCost` 自适应值 + `scaledClamp` cap 随周目值）。
    - 派遣中：倒计时 `data-expedition-timer`（mm:ss）。
    - 锁定：`data-expedition-locked` + 解锁需求文案（「深空导航阵列 Lv1」/「星际通信中继 Lv1」）。
  - 已发现产出天体行：`data-planet-output="rubbleBelt|heliumNebula|riftChasm"` 显示当前贡献值（基础 + 比例 + outputBonus 实时，读 `productionReport` 或复用产出公式展示）。
- `actions.ts`：`ACTIONS['explore']` payload 带 slotIndex（`factionId` 类三元组扩展或新 action），校验槽位合法性（未锁定/未派遣/资源足够）。
- `main.ts`：事件委托更新（`data-explore-dispatch` 多槽）；外交面板 `data-faction-perk` 无需新委托（纯渲染）。
- `style.css`：槽位列表样式（复用 `.build-item` 族，窄屏不溢出——mobile.spec 审计）。

**Blocked by:** 01（多槽状态）、02（产出展示）、03（外交徽标）、04（锁定文案依赖科技）

**Status:** resolved

- [x] `dom.ts`：深空信道列表（3 态：空闲/派遣中/锁定）+ 产出天体行 + 消耗预览
- [x] `actions.ts`：explore action slotIndex + 校验
- [x] `main.ts`：事件委托
- [x] `style.css`：槽位列表样式
- [x] 测试：dom 冒烟（3 槽渲染/锁定态/派遣中倒计时/每槽独立按钮/产出贡献行）；actions（按槽派遣/非法槽拒绝）；mobile 布局不回归

**Acceptance:** 探索页显示 3 槽深空信道（各态正确）；每槽可独立派遣；产出天体贡献可见；外交面板含特性徽标；移动端无溢出回归。
