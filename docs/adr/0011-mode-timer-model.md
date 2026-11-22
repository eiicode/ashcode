English | [中文](0011-mode-timer-model.zh.md)

# ADR-0011: Mode badge, timer semantics and model switching

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.6

## 1. Decision

| Feedback | Decision |
|---|---|
| BUILD should be shown after switching from PLAN | The header bar always shows the mode badge: `BUILD` by default, `PLAN` after `Shift+Tab` (different color) |
| Timing starts before any input | `working Ns` only counts while a turn is in progress: starts at `sendPrompt`, ends at `turn/end`, `session.query.completed` or an error; `session.status` is only used to set busy back to false and no longer sets it to true |
| Want to select a model proactively | Add `/model <name>`: updates the model used for runtime initialization → restarts the harness → opens a new session; `/model` shows the current value |

## 2. Incidental fix

`0 tools` on the right side of the header bar wraps to the next line: `lineChunks` adds an extra 2-column left padding, while the header/status/separator lines are calculated against the full terminal width, making every line actually 2 columns too wide. It is now uniformly calculated with `layoutWidth = min(100, width - 4)`, with padding added at render time.

## 3. Implementation notes

- Restart uses a **generation counter**: increment it first to invalidate the old process's exit callback, then kill/spawn, so that a "restart misjudged as a crash" does not trigger a second recovery.
- A failed `/model` switch shows an error and keeps the original state (it does not change runtime state other than busy/the model badge).
- Model names are not whitelist-validated: DSH only reports an unknown model on the first request, avoiding maintenance of a catalog that would go stale.

## 4. Verification

- Added `model-smoke`: after startup the header bar shows `idle`; after `/model deepseek-v4-pro` the model name and a new session appear.
- `crash-smoke` still passes after the generation change (crash recovery is not swallowed by the restart logic).
- Full `npm test`: 15 items pass; `tsc` passes.
