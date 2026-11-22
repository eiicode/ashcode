[English](USER-GUIDE.md) | 中文

# ashcode 安装与使用说明

版本 1.0.0 · Windows 为主（macOS/Linux 提供脚本，未做冒烟验证）

ashcode 是一个终端界面（TUI），用来操作本机的 DeepSeek Harness（DSH）。它不重写 agent：TUI 负责显示与输入，真正的会话、工具、审批、模型都在 DSH 运行时里。

```
Bun 进程（TUI 渲染）  ──stdio JSON-RPC──  Node 进程（dsh --profile sdk）
```

---

## 1. 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Windows | 10/11 | Windows Terminal 体验最佳 |
| Node.js | ≥ 24.9 | DSH 运行时（其原生插件要求） |
| Bun | ≥ 1.3.14 | TUI 渲染；缺失时安装器会 `npm install -g bun` |
| 网络 | 可访问 npm 与模型 API | 首次安装需要下载依赖 |

不需要 pnpm，不需要浏览器。

---

## 2. 安装

安装的默认位置：`%LOCALAPPDATA%\ashcode`（`app\` 是应用副本，`bin\` 是启动器）。

### 方式 A：从仓库安装

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

习惯 cmd 或想双击安装，用同目录下的入口（参数原样透传；无参数运行结束时暂停）：

```bat
install.cmd
```

### 方式 B：从发布包安装

```powershell
powershell -ExecutionPolicy Bypass -File scripts\pack.ps1
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Source dist\ashcode-<version>-win-x64.zip
```

### 方式 C：一行安装（推荐）

总是取最新版本，自动下载并安装：

```powershell
irm https://github.com/eiicode/ashcode/releases/latest/download/install.ps1 | iex
```

也可以先下 zip 再安装（适合需要固定版本的场景）：

```powershell
$zip = "$env:TEMP\ashcode.zip"
irm https://github.com/eiicode/ashcode/releases/latest/download/ashcode-latest-win-x64.zip -OutFile $zip
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Source $zip
```

> `install.ps1` 不带 `-Source` 且不在仓库内运行时，会自动回退到最新 Release，所以这一行对任何静态托管的副本同样有效。

### 安装器做了什么

1. 校验 Node ≥ 24.9；缺 Bun 时自动安装
2. 把应用复制到 `%LOCALAPPDATA%\ashcode\apps\app-<version>`
3. `npm install` 并在必要时补跑被 npm 11 拦截的依赖安装脚本
4. 生成 `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd`（使用 bun.exe 绝对路径）
5. 把 `bin` 目录加入**用户 PATH**
6. 记录 `install.json` 供卸载使用

### 安装参数

| 参数 | 作用 |
|---|---|
| `-Source <路径/URL>` | 从 zip 安装；省略则从当前仓库安装 |
| `-InstallDir <目录>` | 自定义安装目录，默认 `%LOCALAPPDATA%\ashcode` |
| `-Force` | 覆盖已有安装 |
| `-NoPath` | 不修改 PATH（测试用） |

### 验证安装

**新开一个终端**（PATH 需要新会话生效）：

```powershell
ashcode --version      # 1.0.0
ashcode --help
```

> 当前终端里找不到命令时，用完整路径：
> `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd --version`

---

## 3. 首次配置（API Key）

**TUI 内设置（推荐）**：没有检测到 `DEEPSEEK_API_KEY` 时，启动后会弹出 `API Key` 输入框（输入内容以 `*` 显示），`Enter` 保存到应用目录的 `.env.local` 并自动重启运行时。之后可用 `/key` 随时更换。

也可以手动任选一种：

**a) 写进应用目录的 `.env.local`**（推荐）

```
# %LOCALAPPDATA%\ashcode\app\.env.local
DEEPSEEK_API_KEY=sk-...
```

从仓库安装时，安装器会自动复制仓库里的 `.env.local`。

**b) 环境变量**

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
ashcode
```

**c) 复用桌面版 DSH 的配置**

```powershell
ashcode --home "$env:USERPROFILE\.dsh"
```

---

## 4. 数据目录

| 运行方式 | 默认数据目录 |
|---|---|
| 在仓库目录内运行 | `./.dsh-home` |
| 安装副本（任意目录） | `%USERPROFILE%\.ashcode` |
| `--home <path>` / `ASHCODE_HOME` | 指定目录（优先级最高） |

会话日志、凭据、设置都在数据目录里。想和桌面版 DSH 共用会话与凭据，就 `--home %USERPROFILE%\.dsh`。

---

## 5. 启动与命令行

```powershell
ashcode                        # 新会话
ashcode --resume <sessionId>   # 恢复会话（自动回放历史）
ashcode --home C:\some\dir     # 指定数据目录
ashcode --version
ashcode --help
```

未指定 `--resume` 时，启动后是空白转录；发第一条消息即创建会话。

---

## 6. 界面

```
ashcode · V4.1-Flash · high · BUILD · idle         58.7k↑ 13.6k↓ 94%c $0.012
──────────────────────────────────────────────────────────────────────────
                                          你发的内容（右对齐气泡）
  助手的 Markdown 回复（标题 / 列表 / 代码块 / 行内代码）

✓ Read  src/app.ts  0.4s  … +12
✓ Edit  src/app.ts  0.2s
  Edit src/app.ts  +1 −1
  - length = pack("<B", n)
  + length = pack("<H", n)

╭─ 修复协议不一致  1/3 ─────────────────────────────────────────────╮
│ ■ 修正帧头长度字段                                                │
│ □ 补校验和测试                                                    │
╰───────────────────────────────────────────────────────────────────╯

· turn finished: completed
ready                                                        ↑12
╭─ 输入 ──────────────────────── Enter 换行 · Ctrl+Enter 发送 ─╮
│ 输入消息…（Enter 换行，Ctrl+Enter 发送）                  ▌ │
╰──────────────────────────────────────────────────────────────╯
```

有审批或提问时，中间会浮出一个居中面板，转录自动变暗：

```
        ╭─ Approval · pwsh ──────────────╮
        │ approval: pwsh                 │
        │ ▸ 1) Allow once                │
        │   2) Reject                    │
        │   3) Cancel                    │
        │ ↑/↓ choose · Enter confirm     │
        ╰────────────────────────────────╯
```

状态含义：

| 状态 | 含义 |
|---|---|
| `idle` | 空闲 |
| `working Ns` | 回合进行中，已用时 |
| `plan` | plan 模式开启（顶栏显示 `PLAN` 徽标） |
| `↑N` | 正在向上回看 N 行（底部右侧） |
| `◐` / `✓` / `✗` | 工具运行中 / 成功 / 失败 |

顶栏右侧显示本会话的用量：

```
12.3k↑ 4.1k↓ 78%c $0.0012
```

- 顶栏始终显示当前模式：`BUILD`（默认）或 `PLAN`（`Shift+Tab` 切换）
- 顶栏同时显示模型简写与推理等级，例如 `V4.1-Flash · high`
- `working Ns` 只在**有回合进行**时计时（从你发送消息开始，到回合结束停止）；空闲时显示 `idle`

- `↑` 未命中缓存的输入 token，`↓` 输出 token
- `%c` 缓存命中率 = 缓存读取 /（输入 + 缓存读 + 缓存写）
- `$` 估算费用，只有配置了 `ASHCODE_PRICE_*` 才显示

底部状态栏：`会话[标题] · 权限[工作区可写] · 版本[1.5.0] · 上下文[38%] · 回合[31] · 步骤[233] · 工具[35次] · 速度[207t/s]`

终端变窄时，末尾的次要项会依次隐藏（`速度` → `工具` → …），`会话` / `权限` / `版本` 优先保留。
`上下文` 是最近一次消息占用 / 上下文窗口；`速度` 是本回合的平均吞吐（含工具等待时间）。

界面语言默认英文。`/language zh` 切回中文，`/language en` 再切回英文；选择保存在 `<DSH home>/tui/settings.json`。`ASHCODE_LANG=en|zh` 可对单次运行强制指定。

宽终端（≥100 列）左侧会显示会话栏：标题列表、当前会话 `▸` 高亮；**鼠标点击任意一行即可切换**，`Ctrl+B` 显隐。

---

## 7. 键位

| 键 | 作用 |
|---|---|
| `Enter` | 发送（`ASHCODE_ENTER=newline` 时改为换行） |
| `Alt+Enter` / `Shift+Enter` | 换行（多行输入） |
| `←` / `→` | 左右移动光标 |
| `Home` / `End` | 跳到行首 / 行尾 |
| `Delete` | 删除光标处字符 |
| `Shift+Tab` | 切换 plan 模式（顶部状态栏显示 `PLAN`） |
| `Ctrl+O` | 展开/折叠所有工具卡 |
| `Ctrl+B` | 显示/隐藏左侧会话栏（宽度 ≥ 100 列时默认显示，**鼠标点击可切换会话**） |
| `Ctrl+T` | 显示/隐藏模型的思考过程（默认隐藏） |
| `Ctrl+F` | 搜索转录：输入关键词，`Enter` 跳到匹配，`Esc` 退出 |
| `↑` / `↓` | 输入框为空时翻历史；面板内移动选择 |
| `Tab` | 接受 `@` 文件补全 / `/` 命令补全 |
| `PgUp` / `Ctrl+U` | 向上翻页（鼠标滚轮同样可用） |
| `PgDn` / `Ctrl+D` | 向下翻页 |
| `Esc` | 清空输入；关闭面板/搜索；**回合进行中则取消回合** |
| `1`–`9` | 面板内直接选择 |
| `Space` | 多选题勾选 |
| `Ctrl+C` | 有选区时复制（OSC 52）；否则提示退出（3 秒内再按一次退出） |
| 鼠标拖拽 | 选择转录文本（选区高亮），`Ctrl+C` 复制 |
| `Ctrl+点击` | 打开正文里的文件路径（OSC 8 链接） |

说明：

- 启动瞬间（运行时还在初始化）输入的提示会排队，就绪后自动发送。
- 输入 `@` 会弹出工作区文件补全；输入 `/` 会弹出命令补全。
- 鼠标滚轮可滚动转录（需终端支持鼠标上报）。

---

## 8. 斜杠命令

| 命令 | 作用 |
|---|---|
| `/help` | 命令与键位速查 |
| `/new` | 新建会话（清空当前转录，旧会话仍保留在磁盘） |
| `/model` | 打开模型选择器（`↑/↓` + `Enter`）；`/model <name>` 直接指定 |
| `/effort` | 打开推理等级选择器（off/low/high/max）；`/effort <level>` 直接指定 |
| `/attach <path>` | 附加图片（png/jpg/webp/gif，≤8 MiB），随下一条消息发送 |
| `/team` | 查看团队协作状态；`/team on` / `/team off` 切换（重启运行时并开新会话） |
| `/sessions` | 打开会话选择器：`↑/↓` 选择、`Enter` 切换、`n` 新建、`r` 重命名（存本地 `tui/titles.json`）、`d` 删除（按两次确认）、`Esc` 关闭 |
| `/resume <id>` | 直接恢复指定会话并回放历史 |
| `/key` | 重新输入 API Key（保存到应用目录 `.env.local` 并重启运行时） |
| `/plan` / `/plan off` | plan 模式开关（顶栏显示 `PLAN`） |

其余 DSH 原生命令（如 `/compact`）会原样交给运行时处理。

---

## 9. 配置项

| 变量 | 默认 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | 模型凭据 |
| `ASHCODE_HOME` | 见第 4 节 | 数据目录 |
| `ASHCODE_MODEL` | `deepseek-flash`（显示 V4.1-Flash） | 模型 id |
| `ASHCODE_ENTER` | `send` | `send`=`Enter` 发送；`newline`=`Enter` 换行、`Ctrl+Enter` 发送 |`n| `ASHCODE_EFFORT` | `high` | 推理等级：`off` / `low` / `high` / `max` |
| `ASHCODE_TEAM` | 未设置 | 设为 `1` 默认开启智能体团队协作 |
| `ASHCODE_THEME` | `dark` | `dark` / `light` / `contrast` / `ansi`（跟随终端 16 色） |
| `ASHCODE_DEBUG` | 未设置 | 写入 `.tui-debug.log` 便于排错 |
| `ASHCODE_MOUSE` | 开启 | 设为 `0` 关闭鼠标上报（强制结束进程可能残留鼠标模式，用 `--reset-terminal` 修复） |
| `ASHCODE_PRICE_INPUT` | 未设置 | 输入价（每百万 token，未命中缓存），设置后顶栏显示费用 |
| `ASHCODE_PRICE_CACHE` | 同输入价 | 缓存命中输入价（每百万 token） |
| `ASHCODE_PRICE_OUTPUT` | 未设置 | 输出价（每百万 token） |

---

## 10. 常见问题

**Q：新终端里 `ashcode` 不是内部或外部命令**
PATH 只在安装后新开的终端生效。重开终端，或用完整路径 `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd`。

**Q：提示找不到 bun / bun 版本过低**
```powershell
npm install -g bun
bun --version   # 需要 ≥ 1.3.14
```

**Q：启动报 `DSH CLI not found`**
应用副本缺少依赖：重跑安装器（不要加 `-NoPath` 之外的参数），或进入 `%LOCALAPPDATA%\ashcode\app` 手动 `npm install`。

**Q：工具执行报沙箱/权限错误**
先重跑安装器让原生安装脚本执行（npm 11 默认拦截）。仍失败时，在应用目录执行：
```powershell
npm approve-scripts --all
npm rebuild
```

**Q：终端一直打印 `^[[<35;91;30M` 之类的乱码**
原因：TUI 进程被强制结束（例如任务管理器 / 杀进程 / 升级时替换文件），终端仍停留在**鼠标上报模式**，鼠标移动就被当成输入打印出来。两种恢复方式：

1. 直接关掉这个终端标签页，重开一个（最简单）；
2. 或者在本终端里执行：

```powershell
ashcode --reset-terminal
```

0.5.2 起鼠标上报默认关闭（需要 `ASHCODE_MOUSE=1` 才启用），并且安装器改为版本化目录，升级不再需要结束正在运行的 TUI。

**Q：怎么切换模型**
输入 `/model` 看当前模型，`/model deepseek-v4-pro` 切换（会重启运行时并开一个新会话）。默认模型也可用 `ASHCODE_MODEL` 指定。

**Q：怎么切换 / 新建 / 删除会话**
输入 `/sessions` 打开选择器：`↑/↓` 选择、`Enter` 切换、`n` 新建、`d` 按两次删除、`Esc` 关闭。也可以直接 `/new`，或用 `ashcode --resume <id>` 启动时进入指定会话。

**Q：为什么看不到费用**
费用需要单价：设置 `ASHCODE_PRICE_INPUT`（未命中缓存输入）、`ASHCODE_PRICE_CACHE`（命中缓存输入，默认同输入价）、`ASHCODE_PRICE_OUTPUT`（单位：每百万 token）。不设置时只显示 token 与缓存命中率。

**Q：按 Enter 没发送**
这是设计如此：`Enter` 换行，`Ctrl+Enter` 发送。部分终端不上报 `Ctrl+Enter`，用 `Alt+Enter` 发送（效果相同）。

**Q：为什么思考过程/工具说明是英文**
那是模型的**推理内容（thinking）**，不是界面翻译。模型的推理习惯用英文，最终回答会跟随你的语言。0.5.1 起思考默认隐藏，按 `Ctrl+T` 可查看。若希望连推理也用中文，可在 DSH 的 system prompt 里追加语言偏好（后续会做成 `/lang` 命令）。

**Q：中文或边框错位**
建议使用 Windows Terminal（或 iTerm2），并确认字体等宽。conhost 对宽字符支持较差。

**Q：审批一直被拒**
面板默认选中 `allow once`，`↓` + `Enter` 可改选。审批只对当前动作生效，不会持久放行。

**Q：`Esc` 取消后回合内容不全**
取消的实现是“重启 harness + 恢复会话”，当前回合尚未落盘的部分输出会丢失，这是刻意取舍（DSH SDK 协议没有 cancel）。

**Q：想清理数据**
删除数据目录（默认 `%USERPROFILE%\.ashcode` 或 `./.dsh-home`）即可；不影响程序本身。

---

## 11. 升级与卸载

**升级**：重新运行安装器（会覆盖 app 副本，保留数据目录）。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Force
```

**卸载**：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

或 cmd 入口：`uninstall.cmd`。会删除启动器、应用副本与 PATH 条目，保留你的数据目录。

---

## 12. 已知限制

- 只在 Windows 上验证；macOS/Linux 的 `install.sh` 未跑冒烟。
- 没有单文件二进制：`bun build --compile` 无法嵌入 OpenTUI 原生库，安装依赖 Node + Bun。
- 无语法高亮：diff 只有整行红/绿。
- 取消回合等于重启运行时（见 FAQ）。
- 会话标题来自日志，仅用于列表与表头，不支持全文搜索。

---

## 13. 在 VS Code 集成终端里使用

可以。VS Code 的集成终端是真实终端（Windows 下走 ConPTY），TUI 能正常渲染与接收按键。

**最简单**：重启一次 VS Code（让它继承安装后的 PATH），在集成终端里进入项目目录后运行：

```powershell
ashcode
```

**用任务启动**（本仓库自带 `.vscode/tasks.json`）：`Terminal → Run Task…` 选择：

| 任务 | 作用 |
|---|---|
| `ashcode: Run here` | 以当前工作区为 agent 的 cwd 启动 |
| `ashcode: Resume session` | 输入会话 id 直接恢复 |
| `ashcode: Share desktop home` | 用 `--home ~/.dsh` 启动，看到桌面版的会话与凭据 |

**注意事项**

- 终端 profile 请用 PowerShell 或 cmd；**Git Bash** 里用 `cmd //c ashcode`；**WSL** profile 里不能用（那是 Linux 环境，需要另外在 WSL 内安装）。
- 字体建议 Cascadia Code / Consolas，等宽且含框线字符。
- 若某些键被 VS Code 抢走，可在设置里加：
  ```json
  "terminal.integrated.commandsToSkipShell": ["-workbench.action.quickOpen"]
  ```
  或临时打开 `"terminal.integrated.sendKeybindingsToShell": true`。
- 任务使用 `${env:LOCALAPPDATA}\ashcode\bin\ashcode.cmd`，安装到其他目录时请改这个路径。

---

## 14. 开发者参考

```powershell
npm install
npm run tui            # 直接从源码运行
npm test               # 10 项 ConPTY 冒烟
npm run typecheck
npm run pack           # 打发布包
```

- 架构决策：`docs/adr/`
- 源码：`src/ui/app.ts`（界面）、`src/runtime/stdio-sdk.ts`（与 DSH 的 JSON-RPC 传输）
