English | [中文](0001-ashcode-architecture.zh.md)

# ADR-0001: ashcode Architecture Decisions

- Status: Accepted; D1 (transport) and D2 (runtime) revised by [ADR-0002](./0002-m0-verdict-cross-process.md)
- Date: 2026-11-21
- Scope: the `dsh --profile tui` product line
- Basis: source code and docs of the local `@deepseek-ai/dsh` 0.2.2-rc.5, the repository structure of MiMoCode (`@mimo-ai/cli` 0.1.17), and the community implementations papachong/ashcode and cogine-ai/dsh-claude-tui

## 1. Background and Goals

**Goal**: use DSH in the terminal as a "plugin" — reuse DSH's runtime (sessions, tools, approvals, models, sandbox), with the TUI responsible only for rendering and input.

**Non-goals**:
- No VSCode integration (to be discussed separately in ADR-0002);
- Do not rewrite the agent loop, tools, or model routing;
- Do not copy MiMoCode/OpenCode source code; only borrow architecture, dependencies, and interaction patterns.

**Constraints**:
- The host is DSH itself (Cordis), not a standalone product;
- Windows first, then Linux/macOS;
- v1 targets personal daily use; not aiming for an app-store listing.

## 2. Decision Summary

| No. | Decision | One-line rationale |
|---|---|---|
| **D1** | v1 goes **in-process** (Cordis bundle, `dsh --profile tui`), with all runtime access through the `RuntimePort` adapter | Gets the full set of services and state directly; fastest to develop; the adapter ensures v2 can migrate to stdio |
| **D2** | Rendering uses **Bun + @opentui/solid**, the same stack as MiMoCode; M0 verifies DSH works under Bun, falling back to Node + Ink if it fails | Borrowing the ecosystem removes the hardest parts: rendering and diff |
| **D3** | v1 does only four things: conversation stream, tool cards, approvals, structured questions; plus session restore and diff rendering | Safety paths take priority over aesthetics |
| **D4** | The TUI is a **thin projector**: the only source of truth is session log + projections; views can be replayed | Reconnection, restore, and multiple frontends all rely on it |
| **D5** | Distribute as a **dsh bundle** (`dsh plugin add`), optional Bun single-file binary; runtime discovery order: explicit path → `dsh` on `PATH` → bundled runtime | Consistent with the DSH ecosystem; introduces no new package manager |

## 3. Borrowing List (MiMoCode / OpenCode lineage)

| Borrowing point | Source | Landing in ashcode | Approach |
|---|---|---|---|
| OpenTUI + Solid rendering stack | `@opentui/core`, `@opentui/solid` | View layer | Direct dependency |
| Terminal diff rendering | `@pierre/diffs` | edit/write results in tool cards | Direct dependency |
| Thin projector + event bus | `src/bus` + `src/session` | Subscribe to `session/event` from `ctx.sessions` | Follow the architecture, don't move code |
| Runtime detection and fallback | launcher module | `runtime/resolve.ts`: detect → version check → built-in fallback | In-house (same as dsh-claude-tui) |
| Capability introspection | TUI reads models/effort/credentials/approvals from runtime | Read `ctx.llm`, `ctx.agentPresets`, `ctx.approval`; no hardcoding | Follow the principle |
| permission / question first-class modules | `src/permission`, `src/question` | UI projection of `ctx.approval`, `ctx.userQuestions` | Follow the priority |
| plan/build switching | Tab switching | `ctx.planMode` + `Shift+Tab` | Follow the interaction |
| Status line metrics | TTFT/throughput/cache hit | `ctx.tokenMeter` + turn events | Follow the information design |

**Explicitly not borrowed**:
- OpenCode's permission/task/team/memory service object graph (DSH has corresponding `approval`, `agent-team`, etc.; building a parallel one would conflict);
- OpenCode plugin API (DSH is Cordis);
- SQLite FTS5 persistent memory (DSH already has JSONL session + projections; don't introduce a second source of truth yet);
- Bun-specific low-level APIs (`bun:sqlite`, `bun-pty`), to avoid locking the whole project to Bun — except for rendering.

## 4. DSH Service Mapping (verified against declarations in `src/index.ts`)

| TUI capability | Cordis service | Notes |
|---|---|---|
| Session creation/restore/event stream | `ctx.sessions`, `ctx.sessionPersistence` | `session/event` is the data source for the projection |
| Agent lifecycle/status | `ctx.agents` | `agent/status`, `agent/inbox/claimed` |
| Models and routing | `ctx.llm`, `ctx.agentPresets` | `agent.model.current()/select()` |
| Approvals | `ctx.approval` | Fail closed when no answerer is available |
| Structured questions | `ctx.userQuestions` | UI side of `tool-ask-user` |
| plan mode | `ctx.planMode` | Projects `plan`; recoverable with the session |
| Usage and status line | `ctx.tokenMeter` | Context occupancy, total tokens |
| Commands and slashes | `ctx.commands` | `/plan`, `/compact`, etc. |

> Verification method: read the `declare module '@deepseek-ai/cordis'` section of `src/index.ts` in each package inside the installation; every service name in the table above has been checked one by one (`approval`, `planMode`, `userQuestions`, `agentPresets`, `commands`, `tokenMeter`, `agents`, `sessions`, `sessionPersistence`, `llm`).

## 5. Module Layout

```
apps/tui/
├── src/runtime/     # RuntimePort abstraction + cordis-port (v1) + stdio-port (v2 reserved)
├── src/core/        # event projection, state store, render throttling
├── src/bridge/      # interaction bridge for approval / userQuestions
├── src/view/        # Transcript, ToolCard, Diff, Approval, Question, Composer, StatusBar, Sessions
├── src/theme/       # themes (v1 three sets: dark/light/high-contrast)
└── src/bin.ts       # dsh subcommand entry (commander, following dsh-acp-app's approach)
```

`RuntimePort` exposes only six kinds of capabilities: `sessions`, `prompt`, `cancel`, `approval`, `questions`, `models`. **No view component may import DSH packages directly**; they may only depend on the port interface — this is the prerequisite for the D2 fallback and the D1 migration.

## 6. Milestones and Acceptance

| Phase | Content | Estimate | Acceptance |
|---|---|---|---|
| **M0** | Feasibility spike for DSH running under Bun | 1 person-day | One real turn: bash + fs write + session persisted to disk + approval dialog |
| **M1** | Conversation stream + tool cards + approval/cancel | 2 person-days | Complete one full "read file → edit file → run tests" flow |
| **M2** | Questions + plan switching + session restore + diff | 2 person-days | Resume yesterday's session and continue; plan approval is visible |
| **M3** | Status line, themes, keybindings, packaging | 1 person-day | `dsh --profile tui` starts after `dsh plugin add` |

**M0 is a gate**: if DSH's toolchain (sandbox, persistence, shell) is unavailable under Bun, immediately switch to the D2 fallback path (Node + Ink), and do not keep fighting it.

## 7. Risks and Mitigation

| Risk | Level | Mitigation |
|---|---|---|
| DSH incompatible under Bun (native modules, PTY, sandbox) | High | M0 gate; `RuntimePort` isolation; fall back to Node + Ink |
| Upstream version drift (0.2.x development preview) | High | Pin the `dsh` version; the adapter layer lives only in `src/runtime/` |
| Terminal compatibility long tail (Windows ConPTY, CJK, IME) | Medium | v1 commits only to Windows Terminal + tmux; the rest is marked experimental |
| Approval UI bug leads to default allow | High | Default `ask`; fail closed when no answerer; add dedicated tests in M1 |
| Licensing | Low | Only borrow libraries and ideas; MiMoCode has `USE_RESTRICTIONS.md`, read it before copying code; check licenses dependency by dependency |

## 8. Open Questions (must be answered before M0)

1. Is the JSON-RPC event coverage of the `sdk` profile sufficient to support the v2 migration (are plan/subagent/token visible)?
2. Should we reuse the bundle structure of papachong/ashcode (MIT; may reference, not copy)?
3. Bun single-file binary vs requiring users to bring their own Bun — choose one distribution strategy.
4. Session storage location: follow `$DSH_HOME` (recommended) or an in-project `.sessions` (papachong's approach)?
