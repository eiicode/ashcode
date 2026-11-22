[English](0013-sidebar-stats-attach.md) | 中文

# ADR-0013：侧栏、统计、选择器与附件

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.6.0

## 1. 需求与实现

| 需求 | 实现 | 数据来源 |
|---|---|---|
| 左侧会话栏 + 鼠标点击切换 | ≥100 列默认显示 22 列侧栏（标题、当前会话 `▸`），`Ctrl+B` 显隐；点击 `x∈[2,24)`、`y-2` 命中行 → `switchSession` | 本地 `sessions/` + `onMouse` 的 down 事件 |
| 状态折叠/计时 | 工具卡保留耗时与折叠结果；状态栏显示轮/步数与 tok/s | `turn/*`、`step/*`、`assistant/message.usage` |
| 用时统计 | `working Ns` 只统计回合；`lastTurnMs` 用于 tok/s | 同上 |
| 模型/等级选择器 | `/model`、`/effort` 无参时打开 modal，`↑/↓` + `Enter` 应用（重启 + 新会话） | provider 目录常量（`deepseek-flash`、`deepseek-v4-pro`） |
| 附件 | `/attach <path>` 读取图片 → base64 → `SdkEncodedImageBlock` 随下一条 prompt 发送 | `dsh-sdk-protocol` 的 image block |
| 权限展示 | 状态栏显示 `permission/preset` 事件里的 preset，只读 | 事件 |

## 2. 关键取舍

- **侧栏不占满高度**：只覆盖转录区（表头与状态栏保持整宽），避免把输入框也挤窄。
- **点击区域显式约束**：只有 `x∈[2,24)` 且 `y≥2` 才命中，正文区点击不触发切换。
- **附件只支持图片**：文本文件让 agent 用 read 工具读取更可靠；图片是唯一必须走 block 的输入。
- **权限只读**：SDK 协议没有切换 preset 的方法（Web 走 HTTP 网关），TUI 先展示，不做假切换。

## 3. 验证

- 新增 `sidebar-smoke`（侧栏渲染 + 鼠标点击切换）、`chooser-smoke`（模型/等级选择器）、`attach-smoke`（附件入队）。
- 全量 `npm test`：18 项通过；`tsc` 通过。
- 默认 `deepseek-flash` + `high` 的真实回合通过。

## 4. 已知限制

- 权限预设无法在 TUI 内切换（需上游给 SDK 加方法）。
- 侧栏不独立滚动，最多显示当前页行数；会话超过 12 个只列最近的。
- 附件不做缩略图/预览；发送后即清空队列。
- 状态折叠是“工具卡折叠 + 摘要”，不是 Web 那种任意区块折叠。
