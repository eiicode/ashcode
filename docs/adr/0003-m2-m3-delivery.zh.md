[English](0003-m2-m3-delivery.md) | 中文

# ADR-0003：M2/M3 交付记录与偏差

- 状态：Accepted
- 日期：2026-11-21
- 依赖：ADR-0001（架构）、ADR-0002（跨进程结论）

## 1. 交付内容

| 能力 | 实现 | 验证 |
|---|---|---|
| 对话流 | `session.event` → assistant/thinking 行 | 真实模型回合 |
| 工具卡 | call/result 按 `toolCallId` 配对；折叠、错误自动展开；`Ctrl+O` 全展开 | `toolcard-smoke` |
| 审批面板 | `approval/request` → 三选项（允许一次/拒绝/取消）；结果回传 JSON-RPC | `approval-smoke` + 真实回合（ACL 脚本审批） |
| 结构化提问 | `user-question/ask` → 单选/多选/自定义输入 | `question-smoke` |
| 会话 | `/sessions` 列出本地会话、`/resume <id>`、启动参数 `--resume` | `resume-smoke` |
| plan 切换 | `Shift+Tab` → `/plan`，`plan/mode` 事件驱动状态 | `resume-smoke` |
| diff 呈现 | 工具卡展开时按 `old_string`/`new_string` 输出 `-`/`+` 行；`write` 输出 `+` 内容行 | `toolcard-smoke` |
| 状态栏 | 模型、忙闲、plan、会话尾号、工具数、提示 | 全部冒烟 |
| 主题 | `ASHCODE_THEME=dark/light/contrast`，整屏前景/背景 | 手工 |
| 分发 | `bin/ashcode.mjs` + `npm run tui` | `bin-wrapper` 冒烟 |

## 2. 验证结果

`npm test` 六项全绿（tui / approval / question / toolcard / resume / bin-wrapper），`tsc --noEmit` 通过，`sdk-turn` 真实回合（write + read + 审批）通过。

## 3. 偏差与原因

1. **D5 分发方式改变：不发布为 dsh bundle。**
   ADR-0001 原计划 `dsh plugin add` 安装。实测 `bun build --compile` 单文件二进制在启动时失败：
   `Failed to open library "B:/~BUN/root/opentui-*.dll"` —— OpenTUI 的原生库不会被 `--compile` 嵌入。
   因此 v1 分发 = npm 包 + `bin/ashcode.mjs`（要求 Bun 与本地 `node_modules`），并通过 `dsh --profile sdk` 子进程使用已安装的 DSH。
2. **主题只做整屏两色。** 当前视图是单个 `TextRenderable`，逐行着色需要改为 `StyledText`/多 renderable；留作后续。
3. **会话标题不可用。** 会话日志为 `session.v4.jsonl.zstd`，未解析；`/sessions` 仅列 id。
4. **无取消。** SDK 协议请求表没有 cancel 方法；ACP 有 `session/cancel`，可作为后续迁移理由之一。
5. **plan 语义**：`/plan` 从下一步生效，`plan/mode` 事件可能晚于命令回执到达；UI 以事件为准。

## 4. 后续候选

1. 逐行样式（`StyledText`）：语法高亮、diff 着色、思考行弱化。
2. 滚动回看（`ScrollBoxRenderable`）与鼠标。
3. 会话标题：解压 zstd 读取 header（Node 22+ `zlib.zstdDecompress`）。
4. 多问题串行处理（当前只答第一个）。
5. 单文件分发：随 exe 附带 `opentui-*.dll` 并设置库路径，或转 Node 26 + `--experimental-ffi`。
