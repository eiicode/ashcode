# ADR-0007：UI 重做（块模型与信息层级）

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.5.0

## 1. 背景

0.4.0 的界面把转录摊平成一组行：角色、工具、系统消息共用一个样式，表头一行塞满信息，内部事件（如 `answer {...}`）原样外泄。可用，但读起来像日志。

## 2. 决策

| 决策 | 内容 | 理由 |
|---|---|---|
| 块模型 | `user / assistant / thinking / tool / plan / system / error`，块间留白，连续工具不空行 | 先有结构再谈样式 |
| 排版 | 左内边距 2 列，正文最多 100 列，右对齐元信息 | 长中文段落可读性 |
| 工具卡 | 一行：状态 + 动词 + 参数摘要 + 耗时 + 折叠计数（`… +12`）；`Ctrl+O` 展开 | 一屏能看到更多调用 |
| Diff | `+`/`-` 行带背景色，edit 显示 old/new，write 显示新增 | 改文件场景一眼看懂 |
| Plan | `□/■` 清单 + 完成度，边框盒 | plan 模式需要结构化呈现 |
| Modal | 审批/提问居中浮层，转录变暗 | 不再被滚动冲走 |
| 人化 | `answered q1=green`、`question skipped`、`approval allowed-once` | 不把协议 JSON 给用户看 |
| 主题 | 新增 `ansi`（`RGBA.fromIndex`，跟随终端 16 色） | 与用户终端主题协调 |
| 状态栏 | 底部固定：提示 / 滚动位置 / 搜索；顶栏只留模型、plan、运行时长 | 信息分层 |

## 3. 实现

- `src/ui/theme.ts`：语义调色板（dark / light / contrast / ansi）。
- `src/ui/markdown.ts`：标题、列表（含 `--`）、引用、代码块、粗体、行内代码；按显示宽度折行（CJK 计 2 列）。
- `src/ui/render.ts`：块渲染、工具卡、diff、plan、modal。
- `src/ui/app.ts`：状态机、事件投影、键位、搜索、历史、补全、鼠标、节流重绘。

StyledText 块直接用 `{ __isChunk, text, fg, bg, attributes }` 构造（`createTextAttributes`），不用样式辅助函数——后者组合时会产生原生编码器拒绝的块。

## 4. 验证

- `npm test`：10 项冒烟全绿（含审批、提问、工具卡、滚动、恢复、崩溃）。
- 真实模型回合：读文件 → 工具卡 → 回答，通过。
- 布局预览脚本 `scripts/layout-preview.mjs` 输出固定样例，用于快速目检。

## 5. 未做

- 语法高亮（按 token 着色）、行内 diff 词级高亮。
- 工具调用分组（同名连续调用合并为 `×N`）。
- 转录内搜索高亮（目前只跳转）。
- 鼠标点击展开工具卡。
