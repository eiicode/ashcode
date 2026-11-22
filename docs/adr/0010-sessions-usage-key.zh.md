[English](0010-sessions-usage-key.md) | 中文

# ADR-0010：会话管理、用量显示与 Key 设置

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.5.4

## 1. 需求

1. 能在 TUI 内切换、新建、删除会话；
2. 实时看到 token 消耗、缓存命中率、费用；
3. 让用户能在 TUI 内输入 API Key，而不是只能改文件。

## 2. 决策

| 需求 | 方案 |
|---|---|
| 切换会话 | `/sessions` 居中选择器（标题 + id 尾号，按 mtime 降序）；`Enter` 切换，`Esc` 关闭 |
| 新建会话 | `/new` 或选择器内 `n`：本地生成新 id，运行时按需创建，清空转录与用量 |
| 删除会话 | 选择器内 `d` 两次确认，删除 `sessions/<workspace>/<id>` 目录；删除前只做本地判断，不做回收站 |
| 用量 | 从 `assistant/message` 事件的 `usage` 累加：`inputTokens`（未缓存）、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`；命中率 = cacheRead / 三者之和 |
| 费用 | 单价由环境变量提供（每百万 token），未配置则只显示 token；避免内置过时价目表 |
| API Key | 无 Key 时启动弹窗；`/key` 重开；输入掩码显示，`Enter` 保存到应用目录 `.env.local`，`updateEnv` + 重启运行时生效 |

## 3. 实现要点

- `StdioSdkPort` 新增 `newSession()`（生成 id、清空 known）与 `updateEnv()`（写入子进程 env 并同步到 `process.env`）。
- 选择器与 Key 输入复用 `renderModal()`，按 `keyInput → 审批/提问 → picker` 的优先级处理按键。
- 删除只针对 `sessionDir(id)` 命中的目录，且需要两次 `d`。
- 切换/新建都会重置 `state.usage` 与转录；恢复会话会重放历史，用量随历史事件累加。

## 4. 验证

- 新增 `session-smoke`（打开选择器、`n` 新建）与 `key-smoke`（无 Key 时出现输入框）。
- `npm test`：14 项通过（含 cursor/quit/session/key）。
- `tsc` 通过；安装副本启动 + 真实回合通过。

## 5. 遗留

- 删除会话没有回收站；误删不可恢复。
- 会话列表只列当前工作区最近 20 个目录。
- 费用单价需手动配置，未内置各模型价目。
- Key 弹窗不支持粘贴（下一步补）。
