English | [中文](0009-input-and-status.zh.md)

# ADR-0009: Input Cursor, Quit Confirmation, and Status Badges

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.3

## 1. Feedback and Decisions

| Feedback | Decision |
|---|---|
| Cursor cannot be controlled | Implement a real input cursor: arrow keys, Home/End, Delete, multi-line insert/merge; position by display line after line breaks |
| Mouse wheel stops working | Mouse reporting is enabled by default again (`ASHCODE_MOUSE=0` disables it); the forced disable in 0.5.2 was an overcorrection |
| Ctrl+C quits immediately | Two-stage: the first press prompts “press Ctrl+C again to quit”, and only a second press within a 3-second window quits |
| Shift+Tab hint is redundant on two lines | Plan state is kept only in the top status bar (`PLAN` badge + status line); `plan mode on/off` and the command receipt are removed |

## 2. Implementation Highlights

- Input state: `composer: string[]` + `cursorLine/cursorCol`; `insertText` / `backspaceAt` / `deleteAt` / `moveCursor`.
- Rendering: `wrapWithOffsets()` yields the character range for each display line, and the cursor is inserted as `▌` at that range; Chinese is measured as 2 columns wide.
- Plan mode: the `plan/mode` event only updates `state.plan` and produces no transcript block; text matching `Plan mode…` in `command/done` is dropped outright.
- Slash commands: `sendPrompt` does not echo a user block for content starting with `/`.

## 3. Verification

- Added `cursor-smoke` (type `/hlp` → move left twice → insert `e` → send → hits `/help`) and `quit-smoke` (two Ctrl+C presses).
- Full `npm test`: 12 tests pass; `tsc` passes.

## 4. Outstanding

- Mouse click to expand tool cards (only the wheel works).
- Word-level navigation within the input box (Ctrl+←/→).
- Quit confirmation currently covers only `Ctrl+C`; closing the window follows the terminal's own behavior.
