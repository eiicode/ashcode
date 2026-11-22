# ADR-0004：已知问题修复（第一批）

- 状态：Accepted
- 日期：2026-11-21
- 修订：ADR-0003 的限制清单

## 1. 修复项与证据

| # | 问题 | 实现 | 验证 |
|---|---|---|---|
| 1 | 多问题只答第一个 | 问题队列串行提问，逐个收集答案，最后一次 `{answers:[...]}` 覆盖全部 id | `question-smoke`（两题、两个 id、两个值） |
| 2 | 粘贴/多字符输入丢失 | 订阅 OpenTUI `paste` 事件（bracketed paste），并接受非单字符的非控制序列 | `paste-smoke`（粘贴 `/help` 后回车执行） |
| 3 | 恢复会话无历史 | 解压 `session.v4.jsonl.zstd` 的全部 zstd 帧，回放 `user/message`（仅 `source.kind === 'user'`）、assistant、tool、plan 事件 | `resume-history-smoke`（173 事件回放） |
| 4 | 无滚动回看 | `scroll` 偏移 + `PgUp/PgDn`（`Ctrl+U/D`）分页，表头显示 `↑N`，新事件回到底部 | `scroll-smoke`（80 行注入，pgUp 5 次，maxScroll 65） |
| 5 | home 默认值未定 | 定案：**默认隔离** `.dsh-home`；`--home <path>` 或 `ASHCODE_HOME` 可切共享 `~/.dsh`；隔离且存在 `~/.dsh` 时启动提示 | `bin-wrapper` + 手工 |

## 2. 实现要点

### 多问题串行
SDK 服务端要求答案集合覆盖全部 question id（`user-questions.ts:76`），否则整次回答作废。面板改为 `questions[] + index + answers[]`，每确认一题即进入下一题，最后一题才解析 Promise。

### zstd 多帧
会话日志是**追加式多帧 zstd**（一个写入一帧）。Node 的 `zstdDecompressSync` 只解第一帧，因此按魔数 `28 b5 2f fd` 找出所有帧起点，对每个起点单独解压再拼接。日志内 `user/message` 混有系统提醒，回放时只取 `source.kind === 'user'`。

### 滚动模型
视图仍是单个 `TextRenderable`：`scroll` 表示距底部的行数，每帧按 `body.length - scroll` 取窗口；上限随内容长度收敛，避免滚出边界。

## 3. 仍未解决

1. 回合取消（SDK 协议无 cancel）。
2. 逐行样式（代码高亮、diff 着色、思考弱化）。
3. 会话标题（日志 header 无标题，`session/title` 事件在事件流中但不回填列表）。
4. 单文件分发（OpenTUI 原生库无法嵌入）。
5. 非 Windows 平台未验证；CJK 宽度按字符数计算。
6. 子进程崩溃不自动重启。
