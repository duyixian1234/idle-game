# 01 - 建造面板迁移：星际工程分组并入建造 tab

**Status:** resolved
**Type:** task
**Blocked by:** —

## 任务

- `src/main.ts` render()：`renderBuildPanel(panels['build'], CIVIL_BUILDINGS, {zoneId:'civil'})` 后追加 `renderInterstellarPanel(panels['build'], state, {lockedExpanded, flashId})`（import 从 './ui/dom' 增加）
- `src/ui/panels.ts` renderInterstellarPanel：保持 data-interstellar 容器 + 「星际工程」header + `renderBuildPanel(INTERSTELLAR_BUILDINGS, {zoneId:'interstellar'})`；**移除** renderFleetSection 调用（舰队区块归军事 tab）
- 未解锁星际建造物锁定卡 + data-locked-collapse=interstellar 折叠机制原样保留（决策 7）

## 验收

- 建造 tab（data-tab="build"）渲染民用网格 + 星际工程分组；军事 tab 不再出现星际建造物卡片
- `data-locked-collapse="interstellar"` 折叠行为不变

## Answer

已实现（commit 见 04 聚合提交）。render() 组装 + renderInterstellarPanel 移除舰队调用。终局抉择挂回见 ticket 02。
