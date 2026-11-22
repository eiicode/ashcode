[English](0011-mode-timer-model.md) | 中文

# ADR-0011：模式徽标、计时语义与模型切换

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.5.6

## 1. 决策

| 反馈 | 决策 |
|---|---|
| PLAN 切换后应显示 BUILD | 顶栏始终显示模式徽标：默认 `BUILD`，`Shift+Tab` 后 `PLAN`（颜色不同） |
| 未输入就开始计时 | `working Ns` 只在回合进行中计时：`sendPrompt` 开始，`turn/end`、`session.query.completed` 或错误结束；`session.status` 只用于把 busy 置回 false，不再置 true |
| 希望主动选模型 | 新增 `/model <name>`：更新运行时初始化用的模型 → 重启 harness → 开新会话；`/model` 显示当前值 |

## 2. 顺带修复

顶栏右侧 `0 tools` 折行到下一行：`lineChunks` 会额外加左侧 2 列内边距，而 header/status/分隔线按整个终端宽度计算，导致每行实际超宽 2 列。现在统一用 `layoutWidth = min(100, width - 4)` 计算，渲染时再加内边距。

## 3. 实现要点

- 重启采用**代际计数**（generation）：先递增使旧进程的 exit 回调失效，再 kill/spawn，避免“重启被误判为崩溃”而触发二次恢复。
- `/model` 切换失败会显示错误并保持原状态（不改变 busy/模型徽标以外的运行态）。
- 模型名未做白名单校验：DSH 在首次请求时才会报未知模型，避免维护一份会过时的目录。

## 4. 验证

- 新增 `model-smoke`：启动后顶栏为 `idle`，`/model deepseek-v4-pro` 后模型名与新会话出现。
- `crash-smoke` 在代际改动后仍通过（崩溃恢复没有被重启逻辑吞掉）。
- 全量 `npm test`：15 项通过；`tsc` 通过。
