# 贡献指南

感谢参与。这个项目只做一件事：把 DSH 运行时**显示**在终端里并接收输入。会话、工具、审批、模型、沙箱都在 `@deepseek-ai/dsh` 里——涉及这些能力的改动通常应该做成 dsh 插件，而不是改本仓库。

## 环境

| 依赖 | 版本 | 说明 |
|---|---|---|
| Windows | 10/11 | 唯一验证过的平台 |
| Node.js | ≥ 24.9.0 | 运行 DSH 运行时（其原生插件要求） |
| Bun | ≥ 1.3.14 | 渲染 TUI |
| PowerShell | 5.1+ | 安装 / 打包 / 发布脚本按 5.1 兼容编写 |

macOS / Linux 有 `scripts/install.sh`，但未做冒烟验证。相关 PR 欢迎，但请说明你实测到了哪一步。

## 本地开发

```powershell
npm install          # 依赖较多，首次几分钟；peer 冲突时加 --legacy-peer-deps
npm run typecheck    # tsc --noEmit，提交前必须通过
npm run tui          # 直接启动 TUI（= bun src/ui/app.ts）
```

> `npm run tui` 不经过 `bin/ashcode.mjs`，所以**不会**读取 `.env.local`。请先设置环境变量 `DEEPSEEK_API_KEY`。
> 想跑安装态，用 `npm run install:local`，之后用 `ashcode` 启动。

## 测试

`npm test` 会串行跑 19 个 ConPTY 冒烟（`scripts/run-smokes.mjs`）。它有硬性前提：

- Windows + 真实终端（ConPTY）；
- 已安装的 ashcode（`%LOCALAPPDATA%\ashcode\bin\ashcode.cmd`）；
- 真实可用的 `DEEPSEEK_API_KEY`；
- `bun.exe` 位于 `%APPDATA%\npm\node_modules\bun\bin\bun.exe`（路径写死在 `scripts/run-smokes.mjs`）。

因此**这些冒烟无法在 CI 运行**。CI 只跑 `typecheck` 与 `pack` 两个不依赖 PTY 的检查。提交 PR 时请至少跑 `npm run typecheck`，并说明你手工验证过哪些交互。

单个冒烟：`npm run smoke:tui`、`npm run smoke:approval` 等（见 `package.json`）。

## 代码结构

| 路径 | 职责 |
|---|---|
| `src/ui/app.ts` | 主渲染循环、状态机、面板、输入处理（单文件，约 1600 行） |
| `src/ui/render.ts` | 行 / span 模型与布局辅助 |
| `src/ui/markdown.ts` | 终端 Markdown 渲染 |
| `src/ui/theme.ts` | 语义调色板（`dark` / `light` / `contrast` / `ansi`） |
| `src/runtime/stdio-sdk.ts` | 拉起 `dsh --profile sdk` 并走 stdio JSON-RPC |
| `bin/ashcode.mjs` | 入口：加载 `.env.local`、`--help` / `--version` |
| `scripts/` | 安装、打包、发布、冒烟 |

架构决策见 `docs/adr/`。**改动传输层或运行时分工前，请先读 ADR-0002**——双进程不是设计偏好，是两边唯一可用的组合。

## 提交与发版

- 提交信息用 conventional commits 前缀（`feat:` / `fix:` / `test:` / `chore:` / `docs:`）。
- `CHANGELOG.md` 手写；发版时 `scripts/release.ps1` 会把对应版本小节抽出来作为 Release 说明，所以小节标题必须严格是 `## <version> — <date>`。
- 不要在 PR 里改 `package.json` 的 `version`。

## 语言

中文或英文都可以，issue / PR / 注释均不限。
