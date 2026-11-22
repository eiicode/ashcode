English | [中文](USER-GUIDE.zh.md)

# ashcode Installation and Usage Guide

Version 1.0.0 · Windows-first (scripts are provided for macOS/Linux, but they have not been smoke-tested)

ashcode is a terminal UI (TUI) for driving the local DeepSeek Harness (DSH). It does not reimplement the agent: the TUI handles display and input, while the real sessions, tools, approvals and models all live in the DSH runtime.

```
Bun process (TUI rendering)  ──stdio JSON-RPC──  Node process (dsh --profile sdk)
```

---

## 1. Requirements

| Dependency | Version | Notes |
|---|---|---|
| Windows | 10/11 | Best experience in Windows Terminal |
| Node.js | ≥ 24.9 | DSH runtime (required by its native plugins) |
| Bun | ≥ 1.3.14 | TUI rendering; if missing, the installer runs `npm install -g bun` |
| Network | Access to npm and the model API | The first install downloads dependencies |

No pnpm and no browser required.

---

## 2. Installation

Default install location: `%LOCALAPPDATA%\ashcode` (`app\` is the application copy, `bin\` is the launcher).

### Option A: install from the repository

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

If you prefer cmd or want to double-click to install, use the entry point in the same directory (arguments are passed through as-is; a run with no arguments pauses when it finishes):

```bat
install.cmd
```

### Option B: install from a release package

```powershell
powershell -ExecutionPolicy Bypass -File scripts\pack.ps1
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Source dist\ashcode-<version>-win-x64.zip
```

### Option C: one-line install (recommended)

Always fetches the latest version and installs it automatically:

```powershell
irm https://github.com/eiicode/ashcode/releases/latest/download/install.ps1 | iex
```

You can also download the zip first and then install from it (useful when you need to pin a version):

```powershell
$zip = "$env:TEMP\ashcode.zip"
irm https://github.com/eiicode/ashcode/releases/latest/download/ashcode-latest-win-x64.zip -OutFile $zip
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Source $zip
```

> When `install.ps1` is run without `-Source` and outside the repository, it automatically falls back to the latest Release, so this one-liner also works for any statically hosted copy.

### What the installer does

1. Verify Node ≥ 24.9; install Bun automatically if it is missing
2. Copy the application to `%LOCALAPPDATA%\ashcode\apps\app-<version>`
3. Run `npm install` and, when necessary, re-run the dependency install scripts that npm 11 blocked
4. Generate `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd` (using the absolute path of bun.exe)
5. Add the `bin` directory to the **user PATH**
6. Record `install.json` for uninstallation

### Install parameters

| Parameter | Purpose |
|---|---|
| `-Source <path/URL>` | Install from a zip; if omitted, install from the current repository |
| `-InstallDir <dir>` | Custom install directory, defaults to `%LOCALAPPDATA%\ashcode` |
| `-Force` | Overwrite an existing installation |
| `-NoPath` | Do not modify PATH (for testing) |

### Verify the installation

**Open a new terminal** (PATH takes effect in new sessions):

```powershell
ashcode --version      # 1.0.0
ashcode --help
```

> If the command is not found in the current terminal, use the full path:
> `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd --version`

---

## 3. First-time configuration (API key)

**Setting it inside the TUI (recommended)**: when `DEEPSEEK_API_KEY` is not detected, an `API Key` input box pops up after startup (input is shown as `*`); `Enter` saves it to `.env.local` in the application directory and automatically restarts the runtime. You can change it at any time later with `/key`.

You can also pick one of the following manual options:

**a) Write it into `.env.local` in the application directory** (recommended)

```
# %LOCALAPPDATA%\ashcode\app\.env.local
DEEPSEEK_API_KEY=sk-...
```

When installing from the repository, the installer automatically copies the `.env.local` from the repository.

**b) Environment variable**

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
ashcode
```

**c) Reuse the desktop DSH configuration**

```powershell
ashcode --home "$env:USERPROFILE\.dsh"
```

---

## 4. Data directory

| Run mode | Default data directory |
|---|---|
| Run inside the repository directory | `./.dsh-home` |
| Installed copy (any directory) | `%USERPROFILE%\.ashcode` |
| `--home <path>` / `ASHCODE_HOME` | The specified directory (highest priority) |

Session logs, credentials and settings all live in the data directory. To share sessions and credentials with the desktop DSH, use `--home %USERPROFILE%\.dsh`.

---

## 5. Startup and command line

```powershell
ashcode                        # new session
ashcode --resume <sessionId>   # resume a session (replays history automatically)
ashcode --home C:\some\dir     # specify the data directory
ashcode --version
ashcode --help
```

Without `--resume`, startup shows an empty transcript; sending the first message creates a session.

---

## 6. Interface

```
ashcode · V4.1-Flash · high · BUILD · idle         58.7k↑ 13.6k↓ 94%c $0.012
──────────────────────────────────────────────────────────────────────────
                               your message (right-aligned bubble)
  assistant's Markdown reply (headings / lists / code blocks / inline code)

✓ Read  src/app.ts  0.4s  … +12
✓ Edit  src/app.ts  0.2s
  Edit src/app.ts  +1 −1
  - length = pack("<B", n)
  + length = pack("<H", n)

╭─ Fix protocol mismatch  1/3 ──────────────────────────────────────╮
│ ■ Fix frame header length field                                   │
│ □ Add checksum test                                               │
╰───────────────────────────────────────────────────────────────────╯

· turn finished: completed
ready                                                        ↑12
╭─ Input ──────────────────── Enter newline · Ctrl+Enter send ─╮
│ Type a message… (Enter newline, Ctrl+Enter send)           ▌ │
╰──────────────────────────────────────────────────────────────╯
```

When there is an approval or a question, a centered panel floats up in the middle and the transcript is dimmed automatically:

```
        ╭─ Approval · pwsh ──────────────╮
        │ approval: pwsh                 │
        │ ▸ 1) Allow once                │
        │   2) Reject                    │
        │   3) Cancel                    │
        │ ↑/↓ choose · Enter confirm     │
        ╰────────────────────────────────╯
```

State meanings:

| State | Meaning |
|---|---|
| `idle` | Idle |
| `working Ns` | A turn is in progress, elapsed time |
| `plan` | plan mode is on (the header bar shows the `PLAN` badge) |
| `↑N` | Scrolling back N lines (bottom right) |
| `◐` / `✓` / `✗` | Tool running / succeeded / failed |

The right side of the header bar shows this session's usage:

```
12.3k↑ 4.1k↓ 78%c $0.0012
```

- The header bar always shows the current mode: `BUILD` (default) or `PLAN` (toggled with `Shift+Tab`)
- The header bar also shows the model short name and the reasoning level, e.g. `V4.1-Flash · high`
- `working Ns` counts time only **while a turn is in progress** (from when you send a message until the turn ends); when idle it shows `idle`

- `↑` input tokens not served from cache, `↓` output tokens
- `%c` cache hit rate = cache reads / (input + cache reads + cache writes)
- `$` estimated cost; shown only when `ASHCODE_PRICE_*` is configured

Bottom status bar: `Session[title] · Permission[workspace writable] · Version[1.1.0] · Context[38%] · Turn[31] · Step[233] · Tool[35 times] · Speed[207t/s]`

When the terminal narrows, the secondary items at the end are hidden in order (`Speed` → `Tool` → …), while `Session` / `Permission` / `Version` are kept preferentially.
`Context` is the latest message's occupancy / the context window; `Speed` is this turn's average throughput (including tool wait time).

In a wide terminal (≥ 100 columns) a session bar appears on the left: the list of titles, with the current session highlighted by `▸`; **click any row with the mouse to switch**, and `Ctrl+B` shows/hides it.

---

## 7. Key bindings

| Key | Action |
|---|---|
| `Enter` | Send (becomes newline when `ASHCODE_ENTER=newline`) |
| `Alt+Enter` / `Shift+Enter` | Newline (multi-line input) |
| `←` / `→` | Move the cursor left / right |
| `Home` / `End` | Jump to the start / end of the line |
| `Delete` | Delete the character at the cursor |
| `Shift+Tab` | Toggle plan mode (the header bar shows `PLAN`) |
| `Ctrl+O` | Expand/collapse all tool cards |
| `Ctrl+B` | Show/hide the left session bar (shown by default when width ≥ 100 columns; **click with the mouse to switch sessions**) |
| `Ctrl+T` | Show/hide the model's thinking process (hidden by default) |
| `Ctrl+F` | Search the transcript: type a keyword, `Enter` jumps to a match, `Esc` exits |
| `↑` / `↓` | Cycle history when the composer is empty; move the selection inside a panel |
| `Tab` | Accept `@` file completion / `/` command completion |
| `PgUp` / `Ctrl+U` | Page up (the mouse wheel works too) |
| `PgDn` / `Ctrl+D` | Page down |
| `Esc` | Clear the composer; close a panel/search; **cancels the turn if a turn is in progress** |
| `1`–`9` | Select directly inside a panel |
| `Space` | Check an option in a multiple-choice question |
| `Ctrl+C` | Copy when there is a selection (OSC 52); otherwise prompts to quit (press again within 3 seconds to quit) |
| Mouse drag | Select transcript text (selection highlighted); `Ctrl+C` copies |
| `Ctrl+click` | Open a file path in the body text (OSC 8 link) |

Notes:

- Input typed right at startup (while the runtime is still initializing) is queued and sent automatically once ready.
- Typing `@` opens workspace file completion; typing `/` opens command completion.
- The mouse wheel scrolls the transcript (requires the terminal to support mouse reporting).

---

## 8. Slash commands

| Command | Action |
|---|---|
| `/help` | Quick reference for commands and key bindings |
| `/new` | Start a new session (clears the current transcript; the old session is still kept on disk) |
| `/model` | Open the model picker (`↑/↓` + `Enter`); `/model <name>` selects directly |
| `/effort` | Open the reasoning-level picker (off/low/high/max); `/effort <level>` selects directly |
| `/attach <path>` | Attach an image (png/jpg/webp/gif, ≤8 MiB), sent with the next message |
| `/team` | Show agent-team collaboration status; `/team on` / `/team off` toggles it (restarts the runtime and starts a new session) |
| `/sessions` | Open the session picker: `↑/↓` to select, `Enter` to switch, `n` for new, `r` to rename (stored locally in `tui/titles.json`), `d` to delete (press twice to confirm), `Esc` to close |
| `/resume <id>` | Resume the specified session directly and replay its history |
| `/key` | Re-enter the API key (saved to `.env.local` in the application directory and restarts the runtime) |
| `/plan` / `/plan off` | Toggle plan mode (the header bar shows `PLAN`) |

Other native DSH commands (such as `/compact`) are passed through to the runtime as-is.

---

## 9. Configuration

| Variable | Default | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | Model credentials |
| `ASHCODE_HOME` | See section 4 | Data directory |
| `ASHCODE_MODEL` | `deepseek-flash` (displayed as V4.1-Flash) | Model id |
| `ASHCODE_ENTER` | `send` | `send` = `Enter` sends; `newline` = `Enter` inserts a newline and `Ctrl+Enter` sends |
| `ASHCODE_EFFORT` | `high` | Reasoning level: `off` / `low` / `high` / `max` |
| `ASHCODE_TEAM` | Unset | Set to `1` to enable agent-team collaboration by default |
| `ASHCODE_THEME` | `dark` | `dark` / `light` / `contrast` / `ansi` (follows the terminal's 16 colors) |
| `ASHCODE_DEBUG` | Unset | Writes `.tui-debug.log` to aid troubleshooting |
| `ASHCODE_MOUSE` | On | Set to `0` to disable mouse reporting (force-killing the process may leave mouse mode behind; fix it with `--reset-terminal`) |
| `ASHCODE_PRICE_INPUT` | Unset | Input price (per million tokens, cache miss); once set, the header bar shows cost |
| `ASHCODE_PRICE_CACHE` | Same as input price | Cache-hit input price (per million tokens) |
| `ASHCODE_PRICE_OUTPUT` | Unset | Output price (per million tokens) |

---

## 10. FAQ

**Q: In a new terminal, `ashcode` is not recognized as an internal or external command**
PATH only takes effect in terminals opened after installation. Reopen the terminal, or use the full path `%LOCALAPPDATA%\ashcode\bin\ashcode.cmd`.

**Q: It says bun is not found / the bun version is too old**
```powershell
npm install -g bun
bun --version   # requires ≥ 1.3.14
```

**Q: Startup reports `DSH CLI not found`**
The application copy is missing dependencies: re-run the installer (do not pass arguments other than `-NoPath`), or go into `%LOCALAPPDATA%\ashcode\app` and run `npm install` manually.

**Q: Tool execution reports sandbox/permission errors**
First re-run the installer so that the native install scripts execute (npm 11 blocks them by default). If it still fails, run this in the application directory:
```powershell
npm approve-scripts --all
npm rebuild
```

**Q: The terminal keeps printing garbage like `^[[<35;91;30M`**
Cause: the TUI process was force-killed (for example via Task Manager / killing the process / files replaced during an upgrade), so the terminal is still in **mouse reporting mode** and mouse movement is printed as input. Two ways to recover:

1. Just close this terminal tab and open a new one (simplest);
2. Or run this in the current terminal:

```powershell
ashcode --reset-terminal
```

Since 0.5.2, mouse reporting is off by default (it requires `ASHCODE_MOUSE=1` to enable), and the installer now uses versioned directories, so upgrading no longer requires terminating a running TUI.

**Q: How do I switch models**
Type `/model` to see the current model, and `/model deepseek-v4-pro` to switch (this restarts the runtime and starts a new session). The default model can also be set with `ASHCODE_MODEL`.

**Q: How do I switch / create / delete sessions**
Type `/sessions` to open the picker: `↑/↓` to select, `Enter` to switch, `n` for new, `d` pressed twice to delete, `Esc` to close. You can also use `/new` directly, or start straight into a given session with `ashcode --resume <id>`.

**Q: Why can't I see the cost**
Cost needs unit prices: set `ASHCODE_PRICE_INPUT` (input not served from cache), `ASHCODE_PRICE_CACHE` (cache-hit input, defaults to the input price) and `ASHCODE_PRICE_OUTPUT` (unit: per million tokens). Without them, only tokens and the cache hit rate are shown.

**Q: Pressing Enter does not send**
That is by design: `Enter` inserts a newline and `Ctrl+Enter` sends. Some terminals do not report `Ctrl+Enter`; use `Alt+Enter` to send instead (same effect).

**Q: Why are the thinking process / tool descriptions in English**
That is the model's **reasoning content (thinking)**, not UI translation. The model tends to reason in English, while the final answer follows your language. Since 0.5.1, thinking is hidden by default; press `Ctrl+T` to view it. If you want even the reasoning in Chinese, you can append a language preference to DSH's system prompt (this will later become the `/lang` command).

**Q: Chinese text or borders are misaligned**
Use Windows Terminal (or iTerm2) and make sure the font is monospaced. conhost has poor support for wide characters.

**Q: Approvals keep getting rejected**
The panel selects `allow once` by default; press `↓` + `Enter` to change the selection. An approval applies only to the current action and does not grant a persistent allow.

**Q: Turn content is incomplete after cancelling with `Esc`**
Cancelling is implemented as "restart the harness + resume the session", so output from the current turn that has not yet been persisted to disk is lost. This is a deliberate trade-off (the DSH SDK protocol has no cancel).

**Q: I want to clean up the data**
Just delete the data directory (by default `%USERPROFILE%\.ashcode` or `./.dsh-home`); this does not affect the program itself.

---

## 11. Upgrade and uninstall

**Upgrade**: re-run the installer (it overwrites the app copy and keeps the data directory).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Force
```

**Uninstall**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

Or the cmd entry point: `uninstall.cmd`. It removes the launcher, the application copy and the PATH entry, and keeps your data directory.

---

## 12. Known limitations

- Only verified on Windows; `install.sh` for macOS/Linux has not been smoke-tested.
- No single-file binary: `bun build --compile` cannot embed the OpenTUI native library, so installation requires Node + Bun.
- No syntax highlighting: diffs are only whole-line red/green.
- Cancelling a turn is equivalent to restarting the runtime (see the FAQ).
- Session titles come from the logs and are used only for the list and the header; full-text search is not supported.

---

## 13. Using it in the VS Code integrated terminal

Yes. VS Code's integrated terminal is a real terminal (ConPTY on Windows), so the TUI renders and receives key presses normally.

**Simplest**: restart VS Code once (so that it inherits the post-install PATH), then in the integrated terminal change into your project directory and run:

```powershell
ashcode
```

**Start it from a task** (this repository ships `.vscode/tasks.json`): use `Terminal → Run Task…` and choose:

| Task | Purpose |
|---|---|
| `ashcode: Run here` | Start with the current workspace as the agent's cwd |
| `ashcode: Resume session` | Enter a session id to resume it directly |
| `ashcode: Share desktop home` | Start with `--home ~/.dsh` to see the desktop version's sessions and credentials |

**Notes**

- Use PowerShell or cmd for the terminal profile; in **Git Bash** use `cmd //c ashcode`; it does not work in a **WSL** profile (that is a Linux environment, and it must be installed separately inside WSL).
- Cascadia Code / Consolas are recommended as the font: monospaced and containing box-drawing characters.
- If VS Code steals some keys, add this in the settings:
  ```json
  "terminal.integrated.commandsToSkipShell": ["-workbench.action.quickOpen"]
  ```
  or temporarily enable `"terminal.integrated.sendKeybindingsToShell": true`.
- The tasks use `${env:LOCALAPPDATA}\ashcode\bin\ashcode.cmd`; if you install to another directory, change this path.

---

## 14. Developer reference

```powershell
npm install
npm run tui            # run directly from source
npm test               # 10 ConPTY smoke tests
npm run typecheck
npm run pack           # build the release package
```

- Architecture decisions: `docs/adr/`
- Source: `src/ui/app.ts` (UI), `src/runtime/stdio-sdk.ts` (JSON-RPC transport with DSH)
