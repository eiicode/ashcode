# ADR-0001：ashcode 架构决策

- 状态：Accepted；D1（传输）与 D2（运行时）已由 [ADR-0002](./0002-m0-verdict-cross-process.md) 修订
- 日期：2026-11-21
- 范围：`dsh --profile tui` 这一条产品线
- 依据：本机 `@deepseek-ai/dsh` 0.2.2-rc.5 源码与文档、MiMoCode（`@mimo-ai/cli` 0.1.17）仓库结构、社区实现 papachong/ashcode 与 cogine-ai/dsh-claude-tui

## 1. 背景与目标

**目标**：在终端里以“插件”的方式使用 DSH——复用 DSH 的 runtime（会话、工具、审批、模型、沙箱），TUI 只负责渲染与输入。

**非目标**：
- 不做 VSCode 集成（ADR-0002 另议）；
- 不重写 agent loop、工具、模型路由；
- 不复制 MiMoCode/OpenCode 源码，只借架构、依赖与交互。

**约束**：
- 宿主是 DSH 自身（Cordis），不是独立产品；
- Windows 优先支持，其次是 Linux/macOS；
- v1 面向个人日常使用，不追求上架。

## 2. 决策摘要

| 编号 | 决策 | 一句话理由 |
|---|---|---|
| **D1** | v1 走**进程内**（Cordis bundle，`dsh --profile tui`），所有 runtime 访问经 `RuntimePort` 适配器 | 直接拿全量服务与状态，开发最快；适配器保证 v2 可平移到 stdio |
| **D2** | 渲染用 **Bun + @opentui/solid**，与 MiMoCode 同栈；M0 验证 DSH 在 Bun 下可用，失败则降级 Node + Ink | 借生态省掉最难的渲染与 diff |
| **D3** | v1 只做四件事：对话流、工具卡、审批、结构化提问；外加会话恢复与 diff 渲染 | 安全路径优先于观感 |
| **D4** | TUI 是**瘦投影器**：唯一真相是 session log + projections，视图可重放 | 重连、恢复、多前端都靠它 |
| **D5** | 以 **dsh bundle** 分发（`dsh plugin add`），可选 Bun 单文件二进制；运行时发现顺序：显式路径 → `PATH` 上的 `dsh` → 内置 runtime | 和 DSH 生态一致，不引入新包管理器 |

## 3. 借鉴清单（MiMoCode / OpenCode 系）

| 借鉴点 | 出处 | 落到 ashcode | 方式 |
|---|---|---|---|
| OpenTUI + Solid 渲染栈 | `@opentui/core`、`@opentui/solid` | 视图层 | 直接依赖 |
| 终端 diff 渲染 | `@pierre/diffs` | 工具卡里的 edit/write 结果 | 直接依赖 |
| 瘦投影器 + 事件总线 | `src/bus` + `src/session` | 订阅 `ctx.sessions` 的 `session/event` | 照架构，不搬代码 |
| 运行时探测与降级 | launcher 模块 | `runtime/resolve.ts`：探测 → 版本校验 → 内置兜底 | 自研（同 dsh-claude-tui） |
| 能力内省 | TUI 从 runtime 读模型/effort/凭据/审批 | 读 `ctx.llm`、`ctx.agentPresets`、`ctx.approval`，不硬编码 | 照原则 |
| permission / question 一等模块 | `src/permission`、`src/question` | `ctx.approval`、`ctx.userQuestions` 的 UI 投影 | 照优先级 |
| plan/build 切换 | Tab 切换 | `ctx.planMode` + `Shift+Tab` | 照交互 |
| 状态行指标 | TTFT/吞吐/缓存命中 | `ctx.tokenMeter` + 回合事件 | 照信息设计 |

**明确不借**：
- OpenCode 的 permission/task/team/memory 服务对象图（DSH 有对应的 `approval`、`agent-team` 等，平行造会打架）；
- OpenCode 插件 API（DSH 是 Cordis）；
- SQLite FTS5 持久记忆（DSH 已有 JSONL session + projections，先不引入第二套真相）；
- Bun 专属底层 API（`bun:sqlite`、`bun-pty`），避免把整个项目锁死在 Bun——渲染除外。

## 4. DSH 服务映射（已核对 `src/index.ts` 声明）

| TUI 能力 | Cordis 服务 | 备注 |
|---|---|---|
| 会话创建/恢复/事件流 | `ctx.sessions`、`ctx.sessionPersistence` | `session/event` 是投影的数据源 |
| Agent 生命周期/状态 | `ctx.agents` | `agent/status`、`agent/inbox/claimed` |
| 模型与路由 | `ctx.llm`、`ctx.agentPresets` | `agent.model.current()/select()` |
| 审批 | `ctx.approval` | 缺失 answerer 时 fail closed |
| 结构化提问 | `ctx.userQuestions` | `tool-ask-user` 的 UI 端 |
| plan 模式 | `ctx.planMode` | 投影 `plan`，可随会话恢复 |
| 用量与状态行 | `ctx.tokenMeter` | 上下文占用、token 总量 |
| 命令与斜杠 | `ctx.commands` | `/plan`、`/compact` 等 |

> 核对方式：读取安装包内各包 `src/index.ts` 的 `declare module '@deepseek-ai/cordis'` 段；上表服务名均已逐条核对（`approval`、`planMode`、`userQuestions`、`agentPresets`、`commands`、`tokenMeter`、`agents`、`sessions`、`sessionPersistence`、`llm`）。

## 5. 模块划分

```
apps/tui/
├── src/runtime/     # RuntimePort 抽象 + cordis-port（v1）+ stdio-port（v2 预留）
├── src/core/        # 事件投影、状态 store、渲染节流
├── src/bridge/      # approval / userQuestions 的交互桥
├── src/view/        # Transcript、ToolCard、Diff、Approval、Question、Composer、StatusBar、Sessions
├── src/theme/       # 主题（v1 三套：深色/浅色/高对比）
└── src/bin.ts       # dsh 子命令入口（commander，参照 dsh-acp-app 的写法）
```

`RuntimePort` 只暴露六类能力：`sessions`、`prompt`、`cancel`、`approval`、`questions`、`models`。**任何视图组件不得直接 import DSH 包**，只能依赖 port 接口——这是 D2 降级和 D1 平移的前提。

## 6. 里程碑与验收

| 阶段 | 内容 | 估时 | 验收 |
|---|---|---|---|
| **M0** | DSH 跑在 Bun 下的可行性 spike | 1 人日 | 一次真实回合：bash + fs 写入 + session 落盘 + 审批弹窗 |
| **M1** | 对话流 + 工具卡 + 审批/取消 | 2 人日 | 完成一次“读文件→改文件→跑测试”全流程 |
| **M2** | 提问 + plan 切换 + 会话恢复 + diff | 2 人日 | 恢复昨天的会话继续干；plan 审批可见 |
| **M3** | 状态行、主题、键位、打包 | 1 人日 | `dsh plugin add` 后 `dsh --profile tui` 可启动 |

**M0 是门禁**：若 DSH 的工具链（沙箱、持久化、shell）在 Bun 下不可用，立即切 D2 的降级路径（Node + Ink），不在这上面恋战。

## 7. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| DSH 在 Bun 下不兼容（原生模块、PTY、沙箱） | 高 | M0 门禁；`RuntimePort` 隔离；降级 Node + Ink |
| 上游版本漂移（0.2.x 开发预览） | 高 | 锁 `dsh` 版本；适配层只在 `src/runtime/` |
| 终端兼容长尾（Windows ConPTY、CJK、IME） | 中 | v1 只承诺 Windows Terminal + tmux；其余标记实验性 |
| 审批 UI 写错导致默认放行 | 高 | 默认 `ask`；无 answerer 时 fail closed；M1 加专门测试 |
| 许可 | 低 | 只借库与思路；MiMoCode 有 `USE_RESTRICTIONS.md`，抄代码前必读；依赖逐个核对 license |

## 8. 待定问题（M0 前必须有答案）

1. `sdk` profile 的 JSON-RPC 事件覆盖度是否足以支撑 v2 平移（plan/subagent/token 是否可见）？
2. 是否复用 papachong/ashcode 的 bundle 结构（MIT，可参考，不复制）？
3. Bun 单文件二进制 vs 要求用户自备 Bun——分发策略二选一。
4. 会话存储位置：跟随 `$DSH_HOME`（推荐）还是项目内 `.sessions`（papachong 的做法）？
