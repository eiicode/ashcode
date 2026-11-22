English | [中文](0002-m0-verdict-cross-process.zh.md)

# ADR-0002: M0 Verdict — Switching to Cross-Process (Bun TUI + Node DSH)

- Status: Accepted
- Date: 2026-11-21
- Revises: D1 (transport) and D2 (runtime) of ADR-0001
- Environment: Windows 11, Node v24.16.0, Bun 1.4.5, `@deepseek-ai/dsh` 0.2.2-rc.5, `@opentui/core` 0.9.7

## 1. Experiment Results (all actually run)

| # | Experiment | Command | Result |
|---|---|---|---|
| 1 | DSH CLI loads under Bun | `bun node_modules/@deepseek-ai/dsh/lib/bin.js --version` | ✅ `0.2.2-rc.5` |
| 2 | DSH profile starts under Bun | `bun <bin> --profile acp` | ❌ `node-addon-require-builtin unsupported: Unsupported/no-context` (V8 current-context symbol missing; fails at the boot stage) |
| 3 | DSH profile starts under Node | `node <bin> --profile acp` | ✅ `initialize` + `session/new` returns model/reasoning levels |
| 4 | SDK profile under Node | `node <bin> --profile sdk` | ✅ `initialize` + `session/query('/plan')`, event stream complete |
| 5 | OpenTUI renders under Bun | ConPTY 80×24 | ✅ markup text rendered successfully |
| 6 | OpenTUI renders under Node 24 | ConPTY 80×24 | ❌ native session initialization failed (officially requires Node ≥26.4 and `--experimental-ffi`) |

Notifications actually received in item 4: `permission/preset`, `sandbox/mode`, `approval/policy`, `command/run`, `plan/mode`, `command/done`, `session.query.completed`.

## 2. Decision

**D1′ Transport: SDK JSON-RPC over stdio (`dsh --profile sdk`).**
Not ACP, and not in-process. Reason: the ACP bridge only maps thinking/text/tools/usage; DSH's approvals, structured questions, plan, and subagents degrade or are even missing in ACP; whereas the SDK protocol (`@deepseek-ai/dsh-sdk-protocol`) explicitly carries `approval/request`, `user-question/ask`, `session.event`, and subagent notifications.

**D2′ Runtime: Bun + OpenTUI for the TUI, Node for DSH.**
This is the only workable combination for each side, not a preference: Bun cannot start DSH (native addon), and Node 24 cannot render OpenTUI.

## 3. Impact

- The v1 implementation of `RuntimePort` is only one: `StdioSdkPort`. The interface is retained, but the in-process implementation is no longer scheduled.
- Approvals go through `approval/request` (server→client request, reply with `allowed-once` / `rejected` / `cancelled`).
- Structured questions go through `user-question/ask`; plan goes through `plan/mode` events; slash commands go through `session/query`.
- Dependency floor: Bun ≥1.3.14 (1.4.5 verified on this machine); DSH on Node 22+ (24.16 verified on this machine).
- Distribution: the TUI is built into a single file with `bun build --compile`; the DSH runtime still needs Node, handled per ADR-0001's "detect → verify → fallback".

## 4. Outstanding Risks

| Risk | Description | Mitigation |
|---|---|---|
| Two runtimes | Users need both Bun and Node | The single-file TUI bundles the Bun runtime; Node is handled with detection + built-in fallback |
| Protocol evolution | `serverInfo.version` is still `0.0.1` and changes with 0.2.x | Pin the dsh version; the protocol layer is centralized in `src/runtime/stdio.ts` |
| Real turns not yet verified | `session/prompt` + tool calls + approval round-trips require credentials | First task in M1; use read-only tools first to reduce risk |

## 5. Next Steps

1. M1: Bun TUI process + `StdioSdkPort` + a minimal conversation view; get one real model turn working end to end.
2. Real turns require credentials: the isolated home (`./.dsh-home`) currently has no credentials; decide whether to reuse `~/.dsh` or configure separately.

## 6. M1 Verification Results (Addendum)

- Model-free path: start the TUI inside ConPTY → enter `/plan` → receive `plan/mode` and `command/done`; smoke test passes.
- Real turn: `write hello.txt` → `read hello.txt` → assistant confirms, `turn/end {kind:"completed"}`, exit code 0.
- Conclusion: `StdioSdkPort`'s request/event/tool-result projection is usable; D2′ holds.
- Correction: `session.query.completed` is only used for command-style queries; for ordinary prompts, `turn/end` is the turn-end signal.
