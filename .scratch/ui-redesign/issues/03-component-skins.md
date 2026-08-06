# 03 — 组件皮肤（按钮/资源条/chip/tab/浮层/设置页）

**What to build:** 在 token 基础上（←01）重绘全部组件的皮肤，含方括号按钮语言（Q10 定案）与 44px 触控基线：

1. **方括号按钮**（主操作类）：`.btn-cta::before { content: '[ ' }` + `.btn-cta::after { content: ' ]' }`；hover/active 磷光绿底黑字反转（`background: var(--phosphor); color: #000`）；**hover 保持 `transition: none`**（250ms 重建纪律），反转是瞬间生效
   - 应用面：`data-build`/`data-upgrade`/`data-research`/`data-upgrade-tech`/`data-buy-max`/`data-upgrade-max`/`data-upgrade-tech-max`/`data-diplomacy`/`data-conquest`/`data-fleet-build`/`data-explore-dispatch`/`data-ngplus` 等主操作按钮
   - 次要/危险/图标钮：矩形 0 圆角 + 1px 边框（危险钮 `--bad` 文字色）
   - disabled 态：`--text-faint` + `--border`
2. **资源条**：等宽数值、`◆ ⚡ ◎` 符号保留、`|` 分隔；语义色不变
3. **星球 chip**：0 圆角 + 1px 边框；**min-height 44px**（原 ~26px，触控达标）；`data-planet` 契约不动；锁定态文案/样式保留
4. **二级 tab**：0 圆角 + 1px 边框 + 选中态磷光绿文字 + 底边高亮；**min-height 44px**（原 ~31px）；`data-tab` 契约与 disabled 门控不动
5. **浮层×4 + 引导**：0 圆角 + 1px 边框 + 遮罩 `rgba(0,0,0,0.8)`；`data-overlay`/`data-tutorial` 契约不动
6. **设置页**：五组行式重皮肤（等宽/mono 标签 + 分隔线）；`.tool-btn` min-height **40 → 44px**；`data-tool` 契约不动
7. **事件卡/锁定折叠行/预览行**：皮肤重绘，`data-*` 契约不动
8. 组件分类标注：按钮按主/次/险分 CSS 类，全部通过既有类名继承（`.build-btn`/`.tech-btn` 等保留类名，只换皮肤）——**存量 E2E 无类名断言，安全**

**Blocked by:** 01

**Status: open

**Acceptance:**
- [ ] 主操作按钮 ::before/::after 内容含方括号（E2E ticket 08 会断言）
- [ ] 全量 vitest 回归绿 + typecheck clean
- [ ] 桌面视口无回归（不破坏任何 data-* 渲染）
