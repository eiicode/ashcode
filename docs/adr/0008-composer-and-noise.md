English | [中文](0008-composer-and-noise.zh.md)

# ADR-0008: Composer Separation and Information Noise Reduction

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.1

## 1. Problems

1. Only a single status line separates the composer from the transcript, so the boundary is unclear; the input box is just `> ▌` and does not stand out.
2. `Enter` sends directly, and multi-line input requires `Shift+Enter`, the opposite of user habits.
3. Model thinking (in English) is rendered by default, which visually looks like “Chinese translated into English”.
4. The transcript is mixed with noise such as one-off hints, raw tables, and long links.

## 2. Decisions

| Item | Decision |
|---|---|
| Composer | A separate bordered box (`╭─ 输入 … ─╮`) with persistent shortcut hints on the right and placeholder text for empty input; a blank line + status bar separate it from the transcript |
| Send key | `Enter` inserts a newline, `Ctrl+Enter` sends; `Alt+Enter` is an equivalent compatibility key (used when the terminal does not support the kitty keyboard protocol) |
| Multi-line | Input can span multiple lines; beyond 8 lines it shows `… +N`, with the cursor fixed on the last line |
| Thinking | Hidden by default, toggled with `Ctrl+T`; not part of default layout noise |
| Tables | Pipe tables are parsed and aligned by display width (Chinese counts as 2 columns); inline markup is stripped before layout |
| Links | `[label](url)` renders as the label with an OSC 8 link, no longer exposing the bare URL |
| One-off hints | The startup home hint is removed; other states go to the bottom status bar |

## 3. On “Chinese Translated into English”

This is not translation behavior of the TUI. The English in the screenshot appears in `thinking` (reasoning) and tool descriptions and is the model's own reasoning language; the final answer still follows the user's language. The DSH default system prompt is also in English. Current handling: hide thinking by default (viewable with `Ctrl+T`). Optional follow-up: the TUI generates a `--patch` with a language preference that overrides the system prompt.

## 4. Verification

- `npm test`: all 10 smoke tests pass (the driver now sends the kitty `Ctrl+Enter` sequence).
- Real model turn: multi-line input + `Ctrl+Enter` to send → tool card → answer.
- `scripts/layout-preview.mjs`: table/link/code block layout passes visual inspection.

## 5. Not Done

- `/lang` command (writes the system prompt preference).
- Cursor movement within the input box (currently editing is only possible at the end).
- Automatic hint to switch to `Alt+Enter` when the terminal does not support the kitty protocol.
