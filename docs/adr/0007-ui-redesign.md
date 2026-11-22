English | [中文](0007-ui-redesign.zh.md)

# ADR-0007: UI Redesign (Block Model and Information Hierarchy)

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.0

## 1. Background

The 0.4.0 interface flattened the transcript into a set of rows: roles, tools, and system messages shared a single style, the header row crammed information into one line, and internal events (such as `answer {...}`) leaked out verbatim. Usable, but it read like a log.

## 2. Decisions

| Decision | Content | Rationale |
|---|---|---|
| Block model | `user / assistant / thinking / tool / plan / system / error`, whitespace between blocks, no blank lines between consecutive tools | Structure first, then style |
| Layout | 2 columns of left padding, body text up to 100 columns, right-aligned metadata | Readability of long Chinese paragraphs |
| Tool card | One line: status + verb + argument summary + duration + collapse count (`… +12`); `Ctrl+O` expands | More calls visible per screen |
| Diff | `+`/`-` lines with background color, edit shows old/new, write shows additions | Understand file changes at a glance |
| Plan | `□/■` checklist + completion, bordered box | Plan mode needs structured presentation |
| Modal | Approvals/questions as a centered overlay, transcript dimmed | No longer scrolled away |
| Humanized display | `answered q1=green`, `question skipped`, `approval allowed-once` | Don't show protocol JSON to users |
| Theme | New `ansi` theme (`RGBA.fromIndex`, follows the terminal's 16 colors) | Harmony with the user's terminal theme |
| Status bar | Fixed at the bottom: hints / scroll position / search; header bar keeps only model, plan, and run time | Information layering |

## 3. Implementation

- `src/ui/theme.ts`: semantic palette (dark / light / contrast / ansi).
- `src/ui/markdown.ts`: headings, lists (including `--`), quotes, code blocks, bold, inline code; wraps by display width (CJK counts as 2 columns).
- `src/ui/render.ts`: block rendering, tool cards, diff, plan, modal.
- `src/ui/app.ts`: state machine, event projection, keybindings, search, history, completion, mouse, throttled redraw.

StyledText blocks are constructed directly with `{ __isChunk, text, fg, bg, attributes }` (`createTextAttributes`), not with style helper functions — the latter produce blocks that the native encoder rejects when composed.

## 4. Verification

- `npm test`: all 10 smoke tests green (including approval, question, tool card, scrolling, resume, crash).
- Real model turn: read file → tool card → answer, passes.
- The layout preview script `scripts/layout-preview.mjs` outputs fixed samples for quick visual inspection.

## 5. Not Done

- Syntax highlighting (token-based coloring), word-level inline diff highlighting.
- Grouping tool calls (consecutive calls to the same tool merged into `×N`).
- Search highlighting within the transcript (currently only jumps).
- Mouse click to expand tool cards.
