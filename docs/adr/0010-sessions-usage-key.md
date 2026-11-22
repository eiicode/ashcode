English | [中文](0010-sessions-usage-key.zh.md)

# ADR-0010: Session Management, Usage Display, and Key Settings

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.4

## 1. Requirements

1. Be able to switch, create, and delete sessions inside the TUI;
2. See token consumption, cache hit rate, and cost in real time;
3. Let users enter the API Key inside the TUI, instead of only being able to edit files.

## 2. Decisions

| Requirement | Approach |
|---|---|
| Switch session | `/sessions` opens a centered picker (title + id suffix, sorted by mtime descending); `Enter` switches, `Esc` closes |
| New session | `/new` or `n` in the picker: generate a new id locally, create it on demand at runtime, clear the transcript and usage |
| Delete session | `d` twice to confirm in the picker, deleting the `sessions/<workspace>/<id>` directory; only a local check before deletion, no recycle bin |
| Usage | Accumulated from `usage` in `assistant/message` events: `inputTokens` (uncached), `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`; hit rate = cacheRead / sum of the three |
| Cost | Unit prices come from environment variables (per million tokens); when unconfigured, only tokens are shown; avoids a built-in stale price table |
| API Key | Pops up on startup when no key is set; `/key` reopens it; input is masked, `Enter` saves to `.env.local` in the app directory, and `updateEnv` + a runtime restart take effect |

## 3. Implementation Highlights

- `StdioSdkPort` gains `newSession()` (generates an id, clears known) and `updateEnv()` (writes to the child process env and syncs to `process.env`).
- The picker and Key input reuse `renderModal()`, handling keys in the priority order `keyInput → approval/question → picker`.
- Deletion targets only the directory matched by `sessionDir(id)`, and requires two `d` presses.
- Switching/creating both reset `state.usage` and the transcript; resuming a session replays history, and usage accumulates with the history events.

## 4. Verification

- Added `session-smoke` (open the picker, `n` to create) and `key-smoke` (input box appears when no key is set).
- `npm test`: 14 tests pass (including cursor/quit/session/key).
- `tsc` passes; the installed copy starts and a real turn passes.

## 5. Outstanding

- Deleting a session has no recycle bin; accidental deletion is unrecoverable.
- The session list only lists the 20 most recent directories in the current workspace.
- Cost unit prices must be configured manually; no per-model price table is built in.
- The Key dialog does not support pasting (to be added next).
