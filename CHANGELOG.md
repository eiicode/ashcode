# Changelog

本项目从 0.1.0 起记录。版本号与 `package.json` 保持一致；发布包命名 `ashcode-<version>-win-x64.zip`。

## 1.1.0 — 2026-11-22

对话区与状态栏向 DSH Web UI 靠拢：区分度更好，运行状态可见。

### Added

- 用户消息渲染为右对齐气泡（深色 / 浅色 / 高对比 / ANSI 四套配色）
- 状态栏新增「上下文占用百分比」与「回合吞吐 t/s」

### Changed

- `USER-GUIDE.md` 的界面示意与状态栏字段说明同步更新

## 1.0.0 — 2026-11-22

首个公开发行版本，作为独立开源客户端发布。

### Changed

- 包名、可执行入口（`bin/ashcode.mjs`）、启动器与安装目录统一为 `ashcode`
- 环境变量统一使用 `ASHCODE_*` 前缀
- 安装器校验 Bun ≥ 1.3.14；冒烟脚本的 bun 路径可通过 `ASHCODE_BUN` 覆盖
- 安装目录为 `%LOCALAPPDATA%\ashcode`；升级安装会保留已有的 `.env.local`
- 仓库迁移为 GitHub 主仓

### Added

- `LICENSE`（MIT）与 `THIRD-PARTY-NOTICES.md`
- 发布包补齐 `LICENSE` 与第三方声明

### Notes

- 历史版本（0.1.0–0.8.4）为内部迭代记录，未单独对外发布

## 0.8.4 — 2026-11-21

- 状态栏按中文分组显示，终端宽度不足时回退到紧凑格式

## 0.8.3 — 2026-11-21

- bin 冒烟改为校验 ashcode 头部

## 0.8.2 — 2026-11-21

- 更新头部检查与发布包 zip 命名

## 0.8.1 — 2026-11-21

- 修复 rebrand 后无效的 `package.json`

## 0.8.0 — 2026-11-21

- 重命名为 ashcode；新增 LICENSE 与第三方组件声明

## 0.7.4 — 2026-11-21

- 切换到当前会话为空操作；恢复已打开的会话时不再报错

## 0.7.3 — 2026-11-21

- 界面不再显示会话 id；补全列表中按 Enter 直接执行选中项

## 0.7.2 — 2026-11-21

- Enter 直接执行斜杠命令，而不仅是补全

## 0.7.1 — 2026-11-21

- 命令补全显示选中标记

## 0.7.0 — 2026-11-21

- 输入 / 后用上下键在命令补全中选择，Enter/Tab 应用
- 会话列表只显示名称，不再追加 id 数字
- 状态栏显示当前会话标题（含自定义名），重命名后立即生效

## 0.6.9 — 2026-11-21

- 会话列表显示  重命名 提示，并优先显示自定义名称
- 状态栏显示当前会话名称（有自定义名时）

## 0.6.8 — 2026-11-21

- 会话选择器支持  重命名（本地覆盖，存 <DSH_HOME>/tui/titles.json，不改会话日志）
- 侧栏与选择器优先显示自定义标题

## 0.6.7 — 2026-11-21

- 修复弹层中文按字符截断导致右侧出现竖线、边框错位
- 状态栏默认显示权限预设（未收到事件时用 DSH_PERMISSION_MODE，默认 workspace-write）

## 0.6.6 — 2026-11-21

- Ctrl+C 退出提示改为全宽高亮横幅（反色）
- 退出待确认时按 Esc 可取消

## 0.6.5 — 2026-11-21

- 修复侧栏中文标题按字符而非显示宽度截断导致整行超宽、界面错乱
- 侧栏默认显示阈值提高到 120 列

## 0.6.4 — 2026-11-21

- 默认改为 Enter 发送、Alt+Enter 换行；ASHCODE_ENTER=newline 可切回 Enter 换行、Ctrl+Enter 发送

## 0.6.3 — 2026-11-21

- 状态栏右侧显示当前 TUI 版本（`v0.6.3`）

## 0.6.2 — 2026-11-21

可点击路径与文本选择复制。

### Added

- 正文里的文件路径渲染为 OSC 8 链接（`file:///…`），可 `Ctrl+点击` 在 VS Code 打开
- “已保存到: path” 这类行会把路径**另起一行**，便于点击
- 转录支持鼠标拖拽选择；有选区时 `Ctrl+C` 复制到剪贴板（OSC 52），无选区时才触发退出确认

## 0.6.1 — 2026-11-21

智能体团队（Agent Teams）开关。

### Added

- `/team` 查看状态；`/team on` / `/team off` 切换（写入 profile patch、重启运行时、开新会话）
- `ASHCODE_TEAM=1` 可默认开启
- 顶栏显示 `TEAM` 徽标

### Notes

- 团队模式通过 `--patch` 覆盖 `agent-team.defaultEnabled`，不改用户 profile 文件
- 开启后新建会话才会启用团队协作；已恢复的会话保留自己的选择

## 0.6.0 — 2026-11-21

补齐 Web UI 的核心信息与操作。

### Added

- 左侧会话栏（宽度 ≥ 100 列时默认显示，`Ctrl+B` 切换）：标题、当前会话高亮、**鼠标点击切换**
- 状态统计：轮数/步数、tok/s、工具数、审批预设（preset）、token/缓存/费用
- 模型与等级选择器：`/model` 与 `/effort` 无参数时打开列表，`↑/↓` + `Enter` 应用
- 图片附件：`/attach <path>`（png/jpg/webp/gif，≤8 MiB），随下一条消息发送

### Changed

- 顶栏专注模型、等级、模式与运行时长；统计与预设移到状态栏

## 0.5.7 — 2026-11-21

默认模型与推理等级。

### Changed

- 默认模型改为 `deepseek-flash`（DeepSeek-V4.1-Flash），默认推理等级 `high`
- 顶栏显示模型简写与等级：`V4.1-Flash · high`
- 新增 `/effort` / `/effort off|low|high|max` 切换推理等级（重启运行时并开新会话）
- 新增 `ASHCODE_EFFORT` 环境变量

## 0.5.6 — 2026-11-21

模式徽标、计时语义与模型切换。

### Added

- `/model <name>` 切换模型（重启运行时并开新会话）；`/model` 查看当前模型
- 顶栏始终显示模式：`BUILD` / `PLAN`

### Fixed

- 空闲时顶栏仍显示 `working Ns`：计时改为只在回合进行中统计（发送 → 回合结束）
- 顶栏右侧内容折行到下一行（宽度计算未扣除左右内边距）

## 0.5.5 — 2026-11-21

- API Key 输入框支持粘贴（掩码显示）

## 0.5.4 — 2026-11-21

会话管理、用量显示与 Key 设置。

### Added

- `/sessions` 会话选择器：`↑/↓` 切换、`n` 新建、`d`（按两次）删除、`Esc` 关闭
- `/new` 新建会话；`/resume <id>` 直接恢复
- 顶栏实时用量：`12.3k↑ 4.1k↓ 78%c $0.0012`（token / 缓存命中 / 可选费用）
- 费用单价配置：`ASHCODE_PRICE_INPUT`、`ASHCODE_PRICE_CACHE`、`ASHCODE_PRICE_OUTPUT`
- 首次启动无 Key 时自动弹出 API Key 输入框；`/key` 可随时更换，保存到 `.env.local` 并重启运行时

### Changed

- 会话号与工具数移到底部状态栏右侧，顶栏右侧留给用量

## 0.5.3 — 2026-11-21

输入体验与状态呈现。

### Added

- 输入框支持光标：`←/→`、`Home/End`、`Delete`，可在多行间移动与插入
- `Ctrl+C` 退出确认：第一次提示“再按一次 Ctrl+C 退出”，3 秒内再按才退出
- plan 模式改为顶部状态栏常驻 `PLAN` 徽标，不再往转录里写两行提示
- 斜杠命令不再作为用户消息回显

### Changed

- 鼠标滚轮恢复默认开启；`ASHCODE_MOUSE=0` 可关闭（配合 `--reset-terminal`）

### Fixed

- `plan mode on/off` 与命令回执重复显示
- 长输入行换行后光标位置错位

## 0.5.2 — 2026-11-21

修复升级中断导致的终端残留。

### Fixed

- 鼠标上报默认关闭（`ASHCODE_MOUSE=1` 才启用）：进程被强制结束时，终端不会再持续打印 `^[[<…M` 鼠标事件
- 新增 `ashcode --reset-terminal`：一键关闭鼠标上报、恢复光标与主屏幕
- 进程正常退出时兜底发送终端复位序列；补充 `SIGBREAK` 处理
- 安装器改为 `apps\app-<version>` 版本化目录，升级不再需要结束正在运行的 TUI

## 0.5.1 — 2026-11-21

输入区与信息噪声的针对性优化。

### Changed

- 输入区改为带边框的独立区块（标题 + 右侧快捷键提示 + 占位文案），与转录之间加空行和状态栏，边界清晰
- 键位：`Enter` 换行、`Ctrl+Enter` 发送（`Alt+Enter` 同效）；支持多行输入，超出 8 行折叠
- 模型思考默认隐藏，`Ctrl+T` 显示/隐藏
- Markdown 支持管道表格（按显示宽度对齐，兼容中文）与可点击链接（OSC 8）
- 移除启动时的隔离目录提示等一次性噪音

### Fixed

- 表格中行内代码/链接导致列宽错位

## 0.5.0 — 2026-11-21

UI 重做：从“日志流”改为“块模型 + 可视层级”。

### Added

- 块模型转录：user / assistant / thinking / tool / plan / system / error，块间留白、左侧 2 列内边距
- Markdown 渲染：标题、列表（含模型常用的 `--`）、有序列表、引用、代码块、粗体、行内代码
- 工具卡：动词 + 参数摘要 + 状态 + 耗时（`✓ Read  src/app.ts  0.4s  … +12`），连续工具不再空行分隔
- Diff 卡：`+`/`-` 行带背景色，`edit` 显示 old/new，`write` 显示新增内容
- Plan 面板：`□/■` 清单 + 完成度
- 审批 / 结构化提问改为**居中 modal**，转录自动变暗；结果人化（`answered q1=green`、`question skipped`、`approval allowed-once`）
- 交互：`Ctrl+F` 搜索、`↑/↓` 历史、`@` 文件补全、`/` 命令补全、`Shift+Enter` 换行、鼠标滚轮
- 主题新增 `ansi`（跟随终端 16 色）；正文限宽 100 列

### Changed

- 顶栏瘦身：模型 / plan / 运行状态在左，会话尾号与工具数右对齐；底部状态栏显示提示、滚动位置与搜索
- 输入框支持多行与块状光标

### Fixed

- 取消回合、崩溃恢复、会话回放、审批/提问链路在重构后保持通过（10 项冒烟）

## 0.4.0 — 2026-11-21

首个可安装版本：跨进程架构稳定，具备审批、提问、会话恢复、样式与打包安装。

### Added

- TUI：流式对话、思考摘要、工具卡（折叠 / 错误自动展开）、状态栏（模型、忙闲、plan、会话尾号、标题、工具数）
- 审批面板（`approval/request`）：允许一次 / 拒绝 / 取消，结果回传运行时
- 结构化提问（`user-question/ask`）：多题串行、单选 / 多选 / 自定义输入
- 会话：`/sessions`（id + 标题）、`/resume <id>`、`--resume`，恢复时回放持久化历史
- plan 模式：`Shift+Tab` 走 `/plan`，以 `plan/mode` 事件为准
- 滚动回看：`PgUp`/`PgDn`、`Ctrl+U`/`Ctrl+D`，表头显示 `↑N`
- 粘贴：bracketed paste 与多字符输入
- 主题：`dark` / `light` / `contrast`，逐行着色（用户、助手、思考、工具状态、diff 行）
- 崩溃自恢复：子进程异常退出后自动重启并恢复会话
- 取消回合：忙碌时 `Esc`（重启运行时 + 恢复会话）
- 安装：`scripts/install.ps1` / `install.cmd`、`scripts/install.sh`、`scripts/uninstall.ps1`、`scripts/pack.ps1`
- 文档：`README.md`、`docs/USER-GUIDE.md`、`docs/adr/0001–0006`

### Changed

- 传输：从 ACP 改为 DSH SDK JSON-RPC（`dsh --profile sdk`），审批与提问才能完整可见
- 运行时分界：TUI 用 Bun + OpenTUI 渲染，DSH 用 Node 运行（Bun 无法加载 DSH 的原生插件）
- 数据目录：checkout 内用 `./.dsh-home`，安装副本用 `~/.ashcode`；`--home` / `ASHCODE_HOME` 可覆盖
- 安装器优先普通 `npm install`（正确解析 peer），失败才回退 `--legacy-peer-deps`

### Fixed

- 启动完成前的输入丢失（改为排队）
- 多问题只答第一个（SDK 要求覆盖全部 question id）
- 恢复会话无历史回放（按 zstd 魔数逐帧解压后回放）
- 大段粘贴无响应
- CJK 折行按显示宽度计算
- `bun.ps1` 被写入启动器导致 cmd 无法执行（改用 `bun.exe` 绝对路径）
- 相对 `-InstallDir` 导致启动器含相对路径、换目录即失败（统一 `GetFullPath`）
- 安装副本缺少 `@deepseek-ai/cordis-plugin-group` 导致 DSH 启动失败（显式依赖 + 安装后校验）

### Known limitations

- 单文件二进制不可用（OpenTUI 原生库无法被 `bun build --compile` 嵌入）
- 仅在 Windows 验证；macOS/Linux 脚本未做冒烟
- 取消回合会丢失当前回合未落盘的部分输出
- 无语法高亮；diff 仅整行红绿
- 无自动更新（重跑安装器覆盖）

## 0.3.0 — 2026-11-21

- M2：审批、提问、工具卡、会话恢复、plan 切换、diff 行、状态栏、主题
- 验证：6 项 ConPTY 冒烟 + 真实模型回合

## 0.2.0 — 2026-11-21

- M1：`StdioSdkPort`、最小 TUI、真实回合贯通（write/read + `turn/end`）
- 确定跨进程架构（ADR-0002）

## 0.1.0 — 2026-11-21

- M0：可行性验证（DSH on Node/Bun、OpenTUI on Node/Bun、ACP/SDK 握手）
- 决策记录 ADR-0001
