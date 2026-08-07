# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## 并发协作

### Worktree 隔离（2026-08-07 定稿）

**开始编辑任何文件前，先创建独立 git worktree（含独立 node_modules）。** 本仓库存在活跃并行 AI 会话（同 main 工作区），禁止在主工作区直接改动文件。

- 创建：`git worktree add ../game-wt-<feature> -b feat/<feature>`（基于最新 main 分叉）。
- 依赖：worktree 不继承 node_modules（已被 .gitignore 排除），进入后先 `pnpm install` 安装独立依赖。
- 工作流：所有编辑、测试、提交均在 worktree 内完成；commit 前先 `git status` 确认无交叉污染。
- 同步：合并前先 rebase 主仓库和远程主仓库——主工作区执行 `git fetch origin && git rebase origin/main` 将本地 main 对齐远程；worktree 分支再 `git rebase main` 到最新，确保合并基于最新基线、无分叉冲突。
- 集成：worktree 内 push 分支后，回主工作区 `git merge feat/<feature>` 或 `git pull`；禁止 stash/merge 交叉操作（对象库损坏事故教训）。
- 清理：合并完成后 `git worktree remove ../game-wt-<feature>`，保持仅 main 一个 worktree。

## Testing conventions

### E2E 断言：语义化优先（2026-08-06 定稿）

E2E 断言**优先使用语义化元素**（`data-*` 属性），不依赖具体样式类（`.tab`/`.panel`/`.hidden` 等）。

- 新 spec 一律 `data-*` 选择器，禁止类名断言。
- 混合选择器去类名：`.tab[data-tab="tech"]` → `[data-tab="tech"]`。
- 纯类名元素须有 data 属性承载：`.log-area` → `[data-log]`、`.buy-max-overlay` → `[data-overlay="buy-max"]`、`.event-card` → `[data-event-card]` 等。
- 状态用行为断言替代样式断言：`toHaveClass(/hidden/)` → `toBeHidden()` / `toBeVisible()`。
- 存量 33 处类名断言随 ui-restructure 阶段①一次性迁移（ticket 03）。
