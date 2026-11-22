[English](0005-styling-install.md) | 中文

# ADR-0005：第二/三批修复与可安装交付

- 状态：Accepted
- 日期：2026-11-21
- 修订：ADR-0003/0004 的限制清单

## 1. 本轮交付

| 项 | 实现 | 验证 |
|---|---|---|
| 逐行样式 | 视图从纯文本改为 `StyledText` 分块：表头/分隔线/用户/助手/思考/系统/错误/工具状态/diff 行各自着色，含明暗与高对比三套调色板 | 全部冒烟（渲染路径）+ 手工 |
| 会话标题 | 读取日志中最后的 `session/title`，`/sessions` 显示 `id — 标题`，表头显示当前标题 | `resume-smoke` / `resume-history-smoke` |
| 崩溃自恢复 | 子进程异常退出 → 提示并以原会话重启；重启后 `session/resume`（未创建过会话则跳过） | `crash-smoke` |
| 取消回合 | 忙碌时 `Esc` 触发同一恢复路径（杀进程 → 重启 → 恢复会话），提示 turn cancelled | 与 crash 共用代码路径 |
| CJK 宽度 | `wrap()` 按 East Asian Wide 规则按显示宽度折行（CJK/emoji 计 2 列） | `tsc` + 手工 |
| 可安装交付 | `scripts/install.ps1`（Windows）/`install.sh`（Unix）：检查 Node/Bun、装依赖、写 `ashcode` 启动器并加入 PATH；`uninstall.ps1` 回滚 | 安装器 + `cmd /c ashcode.cmd` 冒烟 |

## 2. 关键决策

1. **取消 = 重启**。SDK 协议没有 cancel 方法；与其伪造“取消”，不如杀掉子进程并用持久化会话恢复。代价是当前回合的部分输出丢失，收益是行为诚实、实现简单。
2. **重启只在会话已知时恢复**。`sessionKnown` 在首次 `query` 或 `resume` 后置位，避免“新会话不存在”导致恢复失败并把 UI 打入 offline。
3. **安装不复制代码**。启动器指向当前 checkout，依赖只装一次；`-Copy` 留作后续，避免首装下载两份 node_modules。
4. **主题用调色板而非组件主题**。四类状态色 + 三套调色板覆盖 90% 可读性需求，逐字符语法高亮留待后续。

## 3. 仍未解决

| 项 | 原因 | 影响 |
|---|---|---|
| 单文件二进制 | `bun build --compile` 无法嵌入 OpenTUI 原生 DLL | 安装需要 Node + Bun + node_modules |
| 非 Windows 平台 | 只在 Windows 上跑过冒烟 | Linux/macOS 未验证 |
| 无 CI | 冒烟依赖 ConPTY 与本地终端 | 回归靠手动 `npm test` |
| 语法高亮/行内 diff 着色 | 需要按 token 切 chunk | diff 只有整行红绿 |
| 会话标题仅回填列表 | 日志没有索引 | 启动时不显示 |
