English | [中文](0005-styling-install.zh.md)

# ADR-0005: Second/Third Batch Fixes and Installable Delivery

- Status: Accepted
- Date: 2026-11-21
- Revises: the limitation lists in ADR-0003/0004

## 1. Deliverables This Round

| Item | Implementation | Verification |
|---|---|---|
| Per-line styling | The view changed from plain text to `StyledText` chunks: header/separator/user/assistant/thinking/system/error/tool status/diff lines are each colored, with three palettes: dark, light, and high-contrast | All smoke tests (rendering path) + manual |
| Session titles | Read the last `session/title` in the log; `/sessions` shows `id — title`, and the header bar shows the current title | `resume-smoke` / `resume-history-smoke` |
| Crash self-recovery | Child process exits abnormally → show a hint and restart with the original session; after restart, `session/resume` (skipped if no session was ever created) | `crash-smoke` |
| Turn cancellation | While busy, `Esc` triggers the same recovery path (kill process → restart → restore session) and shows "turn cancelled" | Shares the code path with crash |
| CJK width | `wrap()` wraps by display width following the East Asian Wide rules (CJK/emoji count as 2 columns) | `tsc` + manual |
| Installable delivery | `scripts/install.ps1` (Windows)/`install.sh` (Unix): check Node/Bun, install dependencies, write the `ashcode` launcher and add it to PATH; `uninstall.ps1` rolls back | Installer + `cmd /c ashcode.cmd` smoke test |

## 2. Key Decisions

1. **Cancel = restart.** The SDK protocol has no cancel method; rather than faking a "cancel", kill the child process and restore from the persisted session. The cost is losing part of the current turn's output; the benefit is honest behavior and a simple implementation.
2. **Restart only resumes when the session is known.** `sessionKnown` is set after the first `query` or `resume`, avoiding "new session does not exist" causing resume failure and putting the UI into offline.
3. **The installer does not copy code.** The launcher points to the current checkout and dependencies are installed only once; `-Copy` is left for later, avoiding downloading two copies of node_modules on first install.
4. **Themes use palettes rather than component themes.** Four kinds of status colors + three palettes cover 90% of readability needs; per-character syntax highlighting is left for later.

## 3. Still Unresolved

| Item | Reason | Impact |
|---|---|---|
| Single-file binary | `bun build --compile` cannot embed the OpenTUI native DLL | Installation requires Node + Bun + node_modules |
| Non-Windows platforms | Smoke tests have only been run on Windows | Linux/macOS unverified |
| No CI | Smoke tests depend on ConPTY and a local terminal | Regression relies on manual `npm test` |
| Syntax highlighting/inline diff coloring | Requires splitting chunks by token | diff is only whole-line red/green |
| Session titles only backfilled into the list | The log has no index | Not shown at startup |
