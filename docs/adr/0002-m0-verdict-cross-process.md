# ADR-0002：M0 结论——改为跨进程（Bun TUI + Node DSH）

- 状态：Accepted
- 日期：2026-11-21
- 修订：ADR-0001 的 D1（传输）与 D2（运行时）
- 环境：Windows 11、Node v24.16.0、Bun 1.4.5、`@deepseek-ai/dsh` 0.2.2-rc.5、`@opentui/core` 0.9.7

## 1. 实验结果（全部实跑）

| # | 实验 | 命令 | 结果 |
|---|---|---|---|
| 1 | DSH CLI 在 Bun 下加载 | `bun node_modules/@deepseek-ai/dsh/lib/bin.js --version` | ✅ `0.2.2-rc.5` |
| 2 | DSH profile 在 Bun 下启动 | `bun <bin> --profile acp` | ❌ `node-addon-require-builtin unsupported: Unsupported/no-context`（V8 current-context 符号缺失，boot 阶段即失败） |
| 3 | DSH profile 在 Node 下启动 | `node <bin> --profile acp` | ✅ `initialize` + `session/new` 返回模型/推理档位 |
| 4 | SDK profile 在 Node 下 | `node <bin> --profile sdk` | ✅ `initialize` + `session/query('/plan')`，事件流完整 |
| 5 | OpenTUI 在 Bun 下渲染 | ConPTY 80×24 | ✅ 标记文本渲染成功 |
| 6 | OpenTUI 在 Node 24 下渲染 | ConPTY 80×24 | ❌ native session 初始化失败（官方要求 Node ≥26.4 且 `--experimental-ffi`） |

第 4 项实际收到的通知：`permission/preset`、`sandbox/mode`、`approval/policy`、`command/run`、`plan/mode`、`command/done`、`session.query.completed`。

## 2. 决策

**D1′ 传输：SDK JSON-RPC over stdio（`dsh --profile sdk`）。**
不用 ACP，也不做进程内。原因：ACP 桥只映射思考/正文/工具/用量，DSH 的审批、结构化提问、plan、子代理在 ACP 里退化甚至缺失；而 SDK 协议（`@deepseek-ai/dsh-sdk-protocol`）明确承载 `approval/request`、`user-question/ask`、`session.event`、子代理通知。

**D2′ 运行时：TUI 用 Bun + OpenTUI，DSH 用 Node。**
这是两边各自唯一可用的组合，不是偏好：Bun 启动不了 DSH（原生 addon），Node 24 渲染不了 OpenTUI。

## 3. 影响

- `RuntimePort` 的 v1 实现只有一个：`StdioSdkPort`。接口保留，但进程内实现不再排期。
- 审批走 `approval/request`（服务端→客户端请求，回复 `allowed-once` / `rejected` / `cancelled`）。
- 结构化提问走 `user-question/ask`；plan 走 `plan/mode` 事件；斜杠命令走 `session/query`。
- 依赖门槛：Bun ≥1.3.14（本机 1.4.5 已验证）；DSH 在 Node 22+（本机 24.16 已验证）。
- 分发：TUI 用 `bun build --compile` 出单文件；DSH 运行时仍需 Node，按 ADR-0001 的“探测 → 校验 → 兜底”处理。

## 4. 遗留风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 双运行时 | 用户需要同时有 Bun 和 Node | TUI 单文件自带 Bun 运行时；Node 用探测 + 内置兜底 |
| 协议演进 | `serverInfo.version` 仍是 `0.0.1`，随 0.2.x 变动 | 锁 dsh 版本；协议层集中在 `src/runtime/stdio.ts` |
| 未验证真实回合 | `session/prompt` + 工具调用 + 审批往返需凭据 | M1 第一件事；先用只读工具降低风险 |

## 5. 下一步

1. M1：Bun TUI 进程 + `StdioSdkPort` + 最小对话视图，跑通一次真实模型回合。
2. 真实回合需要凭据：隔离 home（`./.dsh-home`）当前无凭据，需决定是复用 `~/.dsh` 还是单独配置。

## 6. M1 验证结果（补充）

- 无模型链路：ConPTY 内启动 TUI → 输入 `/plan` → 收到 `plan/mode` 与 `command/done`，冒烟通过。
- 真实回合：`write hello.txt` → `read hello.txt` → 助手确认，`turn/end {kind:"completed"}`，退出码 0。
- 结论：`StdioSdkPort` 的请求/事件/工具结果投影可用；D2′ 成立。
- 修正：`session.query.completed` 只用于命令类查询，普通 prompt 以 `turn/end` 作为回合结束信号。
