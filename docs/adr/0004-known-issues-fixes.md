English | [中文](0004-known-issues-fixes.zh.md)

# ADR-0004: Known Issue Fixes (First Batch)

- Status: Accepted
- Date: 2026-11-21
- Revises: the limitation list in ADR-0003

## 1. Fixes and Evidence

| # | Issue | Implementation | Verification |
|---|---|---|---|
| 1 | Only the first of multiple questions is answered | Questions are asked serially from a queue, collecting answers one by one, with the final `{answers:[...]}` covering all ids | `question-smoke` (two questions, two ids, two values) |
| 2 | Paste/multi-character input lost | Subscribe to OpenTUI's `paste` event (bracketed paste), and accept non-control sequences that are not single characters | `paste-smoke` (paste `/help`, then press Enter to execute) |
| 3 | Restored session has no history | Decompress all zstd frames of `session.v4.jsonl.zstd` and replay `user/message` (only `source.kind === 'user'`), assistant, tool, and plan events | `resume-history-smoke` (173 events replayed) |
| 4 | No scrollback | `scroll` offset + `PgUp/PgDn` (`Ctrl+U/D`) paging; the header bar shows `↑N`; new events return to the bottom | `scroll-smoke` (80 lines injected, pgUp 5 times, maxScroll 65) |
| 5 | Home default undecided | Decided: **isolated by default** at `.dsh-home`; `--home <path>` or `ASHCODE_HOME` can switch to shared `~/.dsh`; when isolated and `~/.dsh` exists, show a startup hint | `bin-wrapper` + manual |

## 2. Implementation Notes

### Serial Multiple Questions
The SDK server requires the answer set to cover all question ids (`user-questions.ts:76`), otherwise the entire answer is invalidated. The panel was changed to `questions[] + index + answers[]`: on each confirmation it moves to the next question, and the Promise is resolved only on the last question.

### zstd Multiple Frames
Session logs are **append-only multi-frame zstd** (one frame per write). Node's `zstdDecompressSync` only decompresses the first frame, so all frame starts are located by the magic number `28 b5 2f fd`, each start is decompressed separately, and the results are concatenated. The `user/message` entries in the log include system reminders; replay takes only `source.kind === 'user'`.

### Scroll Model
The view is still a single `TextRenderable`: `scroll` is the number of lines from the bottom, and each frame takes a window by `body.length - scroll`; the upper bound converges with content length to avoid scrolling out of bounds.

## 3. Still Unresolved

1. Turn cancellation (the SDK protocol has no cancel).
2. Per-line styling (code highlighting, diff coloring, dimmed thinking).
3. Session titles (the log header has no title; `session/title` events are in the event stream but are not backfilled into the list).
4. Single-file distribution (OpenTUI native libraries cannot be embedded).
5. Non-Windows platforms unverified; CJK width is computed by character count.
6. Child process crashes do not trigger an automatic restart.
