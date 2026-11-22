# ADR-0012：默认模型与推理等级

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.5.7

## 1. 决策

默认模型从 `deepseek-v4-flash` 改为 **`deepseek-flash`**（provider 目录里显示为 `DeepSeek-V4.1-Flash`），默认推理等级 **`high`**。

依据：`dsh-llm-deepseek` 的内置目录只有两个条目 —— `deepseek-flash`（名称 `DeepSeek-V4.1-Flash`）与 `deepseek-v4-pro`；`deepseek-v4-flash` 并不是目录里的 id。默认值与 Web UI 截图中显示的一致。

## 2. 实现

- `PortOptions.reasoningEffort` 传入 SDK `initialize` 的 `reasoningEffort`。
- 顶栏显示简写映射：`deepseek-flash → V4.1-Flash`、`deepseek-v4-pro → V4-Pro`，并追加等级，例如 `V4.1-Flash · high`。
- 新增 `/effort <off|low|high|max>`：更新等级 → 重启 harness → 开新会话；`/effort` 显示当前值。
- 环境变量 `ASHCODE_EFFORT` 覆盖默认等级。

## 3. 验证

- 真实模型回合在默认 `deepseek-flash` + `high` 下通过（读文件 → 工具卡 → 回答）。
- `/model` 与 `/effort` 切换后 harness 正常重启（代际计数避免误判崩溃）。
- `tsc` 通过。

## 4. 遗留

- 模型目录未自动发现：provider 有 `/models` 接口，可后续做成选择器并动态拉取；当前依赖显式 id 或 `ASHCODE_MODEL`。
- 切换模型/等级会新开会话，旧会话仍可用 `/sessions` 恢复。
