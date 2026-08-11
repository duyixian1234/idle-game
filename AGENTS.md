# AGENTS.md

## Agent skills

### Issue tracker

**Issues 通过 `gh` 客户端创建为 GitHub issues（repo: `duyixian1234/idle-game`）——2026-08-11 起定稿。** 本地 `.scratch/<feature-slug>/` 仅存 spec.md 与 issue body 草稿留档，**tracker 以 GitHub issues 为唯一事实源**。旧约定（纯本地 markdown tracker）见 `docs/agents/issue-tracker.md`（已废弃）。

铁律：

- 发布一律 `gh issue create --title "<title>" --body-file <file> --label ready-for-agent`——正文先落盘（Write）再 `--body-file`，防中文乱码。
- **blocked 依赖用 issue body 内 `## Blocked by` 文本引用**（`#<编号>` 自动渲染链接）；GitHub 无原生 block 关系，文本引用即事实。
- 发布顺序 = 依赖序：**先建无 blocker 的票，再建 blocked 的票**（后者引用前者的真实编号）。
- 创建后先 `gh issue list` 核对编号与 label，再更新本地留档文件中的 Blocked by 引用。
- label 词汇：`ready-for-agent`（triage 完成，agent 可抓取）——spec 与 tickets 一律打此 label。
- 新 feature 流程：grill → to-spec（创建 spec issue）→ to-tickets（创建 tickets，blocked 引用 spec 编号）→ implement（agent 按 frontier 抓取）。

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

### Windows 命令输出回显可能丢失——文件系统是唯一事实源（2026-08-08 定稿）

Git Bash 下工具调用 stdout 回显可能为空（vitest ANSI 彩色输出/进度条 `\r` 在管道捕获层被吞；`grep | head` 管道链还会掩盖真实退出码）。**命令跑完 ≠ 工具能看到输出**。铁律：

- 所有测试/长命令一律 `cmd > <log> 2>&1; echo "EXIT=$?" >> <log>`，随后**只用 Read 读日志判断结果**，不以工具 stdout 为准。
- 日志末尾带 `EXIT=` 哨兵行，先找哨兵再判断；读到半截日志=仍在运行或已中断，不是结论。
- vitest 加 `CI=1`（禁用颜色与进度刷新），输出稳定可解析。
- 工具返回空输出 → 直接读日志文件核实，不要重复执行命令（幂等副作用）。
