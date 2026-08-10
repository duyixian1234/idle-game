# 03 — 引擎/dom 测试：结盟加成语义

**What to build:** 结盟长期加成的行为测试，锁死数值口径与 ADR-0012 红线。

**引擎单测**（production.test.ts / diplomacy.test.ts，prior art：federationProgress 断言、贡税流断言）：

1. `alliedNamedFactionCount`：
   - 0 结盟 → 0
   - 静态 4 家全结盟 → 4
   - 探索势力（ashCommune 等）结盟 → 计入
   - **生成派系（gen:faction:N）结盟 → 不计入**（ADR-0012 红线回归）
   - 纯函数不改 state（调用前后浅比较）
2. 生产报告乘子：结盟 0/1/4/8 派系 → mineral/energy/tech 产出乘子 = 1 / 1.05 / 1.20 / 1.40
3. **military 不吃**：结盟后 nominal.military 不变
4. 与 NG+/攻占永久加成乘法叠加（permMult ≠ 1 时总乘子 = permMult × allianceMult）
5. `explorePlanetOutputs`：结盟后天体产出值 ×allianceMult
6. NG+ 归零：`startNewGamePlus` 后 alliedNamedFactionCount = 0、乘子回 1

**存量断言复核**：`diplomacy.test.ts:227` `'外交状态不干扰产出结算'`——旧语义断言结盟不影响产出，**现在结盟会通过全局乘子影响产出**，该测试需按新语义更新（改为断言结盟派系数正确驱动乘子，或移除该断言）。

**dom 冒烟**（dom-diplomacy.test.ts，prior art：总览卡三态断言）：

- 0 结盟：`[data-diplo-alliance-bonus]` 不渲染
- 1 家结盟：行渲染且文本含 `+5%`
- 4 家结盟：行渲染且文本含 `+20%`

**Blocked by:** 02 — UI 归因行（dom 断言依赖）+ 01 — 引擎实现

**Status:** resolved

- [ ] alliedNamedFactionCount 全分支引擎单测（含生成派系不计入红线回归）
- [ ] 生产报告乘子断言（0/1/4/8 → 1/1.05/1.20/1.40，military 不吃）
- [ ] explorePlanetOutputs ×allianceMult 断言
- [ ] NG+ 归零断言
- [ ] `'外交状态不干扰产出结算'` 存量断言按新语义复核更新
- [ ] dom：0 结盟不渲染 / 1 家 +5% / 4 家 +20%
- [ ] 全仓 vitest 全绿
