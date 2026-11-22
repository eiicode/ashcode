English | [中文](0003-m2-m3-delivery.zh.md)

# ADR-0003: M2/M3 Delivery Record and Deviations

- Status: Accepted
- Date: 2026-11-21
- Depends on: ADR-0001 (architecture), ADR-0002 (cross-process verdict)

## 1. Deliverables

| Capability | Implementation | Verification |
|---|---|---|
| Conversation stream | `session.event` → assistant/thinking lines | Real model turn |
| Tool cards | call/result paired by `toolCallId`; collapsed, errors auto-expanded; `Ctrl+O` expands all | `toolcard-smoke` |
| Approval panel | `approval/request` → three options (allow once / reject / cancel); result sent back over JSON-RPC | `approval-smoke` + real turn (ACL script approval) |
| Structured questions | `user-question/ask` → single-select/multi-select/custom input | `question-smoke` |
| Sessions | `/sessions` lists local sessions, `/resume <id>`, startup flag `--resume` | `resume-smoke` |
| plan switching | `Shift+Tab` → `/plan`; state driven by `plan/mode` events | `resume-smoke` |
| diff presentation | when a tool card is expanded, output `-`/`+` lines from `old_string`/`new_string`; `write` outputs `+` content lines | `toolcard-smoke` |
| Status bar | model, busy/idle, plan, session suffix, tool count, hints | All smoke tests |
| Theme | `ASHCODE_THEME=dark/light/contrast`, full-screen foreground/background | Manual |
| Distribution | `bin/ashcode.mjs` + `npm run tui` | `bin-wrapper` smoke test |

## 2. Verification Results

All six `npm test` items green (tui / approval / question / toolcard / resume / bin-wrapper), `tsc --noEmit` passes, and the `sdk-turn` real turn (write + read + approval) passes.

## 3. Deviations and Reasons

1. **D5 distribution method changed: no longer published as a dsh bundle.**
   ADR-0001 originally planned installation via `dsh plugin add`. In practice, the `bun build --compile` single-file binary fails at startup:
   `Failed to open library "B:/~BUN/root/opentui-*.dll"` — OpenTUI's native libraries are not embedded by `--compile`.
   Therefore v1 distribution = npm package + `bin/ashcode.mjs` (requires Bun and a local `node_modules`), using the installed DSH through a `dsh --profile sdk` child process.
2. **Themes only provide full-screen two-color.** The current view is a single `TextRenderable`; per-line coloring requires switching to `StyledText`/multiple renderables; left for later.
3. **Session titles unavailable.** Session logs are `session.v4.jsonl.zstd` and are not parsed; `/sessions` lists ids only.
4. **No cancel.** The SDK protocol request table has no cancel method; ACP has `session/cancel`, which can serve as one reason for a later migration.
5. **plan semantics**: `/plan` takes effect from the next step; the `plan/mode` event may arrive later than the command receipt; the UI relies on the event.

## 4. Follow-up Candidates

1. Per-line styling (`StyledText`): syntax highlighting, diff coloring, dimmed thinking lines.
2. Scrollback (`ScrollBoxRenderable`) and mouse.
3. Session titles: decompress zstd and read the header (Node 22+ `zlib.zstdDecompress`).
4. Serial handling of multiple questions (currently only the first is answered).
5. Single-file distribution: ship `opentui-*.dll` alongside the exe and set the library path, or move to Node 26 + `--experimental-ffi`.
