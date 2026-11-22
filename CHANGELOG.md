English | [中文](CHANGELOG.zh.md)

# Changelog

Version headings must match `CHANGELOG.zh.md` exactly.

## 1.6.0 — 2026-11-22

### Added

- A dedicated row above the composer while a tool runs:
  `✳ Calling tool · Shell: git log -1 --stat · 0.8s`, with `(+N)` when several run at
  once. It only takes a line while work is in flight

### Changed

- Durations read `45s` / `3m25s` instead of raw seconds, in the thinking block too

## 1.5.3 — 2026-11-22

### Fixed

- The slash-command completion is single-column again, with a scrolling window:
  `↑`/`↓` walk the whole list and the viewport follows the selection, so commands
  beyond the first eight (`/key`, `/team`, …) stay reachable. Hidden items are
  announced with `↑N` / `↓N`

## 1.5.2 — 2026-11-22

### Fixed

- `/key` was still missing from the slash-command completion: a fixed eight-entry
  cap kept hiding whatever came after it. The list now renders every match, in two
  columns once it exceeds six entries

## 1.5.1 — 2026-11-22

### Fixed

- `/language` never appeared in the slash-command completion list: it sat beyond
  the first six entries. The list now shows eight entries and places `/language`
  seventh

## 1.5.0 — 2026-11-22

The UI is bilingual, and English is now the default — matching the docs.

### Added

- `/language en|zh` plus the `ASHCODE_LANG` environment variable; the choice is
  persisted to `<DSH home>/tui/settings.json`
- Every user-visible string now lives in `src/ui/i18n.ts`, so a new label costs one
  dictionary entry

### Changed

- The interface starts in English. `/language zh` restores the Chinese UI, which is
  unchanged in content

## 1.4.0 — 2026-11-22

Progress reporting moves closer to the DSH Web UI: reasoning is no longer
truncated, and task progress stays visible.

### Added

- Thinking blocks keep their full text and render collapsed as
  `✦ thinking · 45s · 3 lines · Ctrl+T`; press `Ctrl+T` to expand (previously only
  the first line was kept, capped at 90 characters, so long reasoning was lost)
- A one-line todo summary above the status bar: `▸ 任务 2/7 · 进行中: …`, fed by the
  whole-list snapshot from the `todo_write` tool

### Changed

- The header timer now carries the current phase: `working 12s · 分析请求` /
  `深度思考` / `执行工具` / `生成回复`

## 1.3.1 — 2026-11-22

### Fixed

- The installer aborted mid-way when npm wrote warnings to stderr and the caller
  merged the streams (`2>&1`, CI logs, wrapper scripts), leaving an app directory
  without `node_modules`. The dependency step now uses
  `$ErrorActionPreference = 'Continue'` and still fails on exit codes.
- Dependency install scripts are now actually executed
  (`npm approve-scripts --all` + `npm rebuild`); the previous `try/catch` never
  fired, because a failing native command does not throw.

## 1.3.0 — 2026-11-22

### Added

- One-line install: `irm https://github.com/eiicode/ashcode/releases/latest/download/install.ps1 | iex`
- Releases now also publish `install.ps1` and a stable-named
  `ashcode-latest-win-x64.zip` for the command above.

### Changed

- `install.ps1` now defaults to downloading the latest release when run outside
  the repository without `-Source`, instead of failing.
- `install.ps1` ends with `return` instead of `exit 0`, so `irm | iex` no longer
  closes the caller's PowerShell session.

## 1.2.0 — 2026-11-22

The composer now matches the DSH Web UI.

### Added

- A clickable `■ Esc 停止` (stop) affordance on the composer's bottom border
  while a turn runs; clicking behaves exactly like Esc (cancel the turn and
  recover the session).

### Changed

- The composer is two lines tall by default and keeps growing with multi-line
  input (the display cap stays at 8 rows).
- The transcript area is padded when short, so the status line and composer stay
  pinned to the bottom instead of sliding down as output arrives.

## 1.1.2 — 2026-11-22

### Fixed

- The UI did not reflow on terminal resize: the header and status lines kept the
  old width and were clipped. It now subscribes to `renderer.on('resize')` and
  redraws immediately.

## 1.1.1 — 2026-11-22

### Fixed

- The user bubble background was too close to the terminal background and nearly
  invisible in the dark theme (`userBg` raised from `#1f2d3d` to `#2a3c55`).
- The version group was the first thing truncated on narrow terminals; the
  status bar now keeps session · permission · version first.
- The version shown in the `USER-GUIDE.md` status-bar example did not match the
  release.

## 1.1.0 — 2026-11-22

The transcript and status bar move closer to the DSH Web UI: clearer separation
and a visible run state.

### Added

- User messages render as right-aligned bubbles (dark / light / contrast / ANSI
  palettes).
- The status bar gained a context-usage percentage and a per-turn throughput
  figure (t/s).

### Changed

- `USER-GUIDE.md` layout diagram and status-bar field notes updated.

## 1.0.0 — 2026-11-22

First public release, published as an independent open-source client.

### Changed

- Package name, entry point (`bin/ashcode.mjs`), launcher and install directory
  unified as `ashcode`.
- Environment variables use the `ASHCODE_*` prefix.
- The installer validates Bun ≥ 1.3.14; the smoke runner's bun path can be
  overridden with `ASHCODE_BUN`.
- Install directory is `%LOCALAPPDATA%\ashcode`; upgrading keeps an existing
  `.env.local`.
- The repository moved to GitHub as the primary remote.

### Added

- `LICENSE` (MIT) and `THIRD-PARTY-NOTICES.md`.
- The release package now ships `LICENSE` and the third-party notices.

### Notes

- Versions 0.1.0–0.8.4 were internal iterations and were never published
  separately.
