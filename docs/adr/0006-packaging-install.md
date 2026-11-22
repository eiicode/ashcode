English | [中文](0006-packaging-install.zh.md)

# ADR-0006: Packaging and Installation (Aligning with MiMoCode's One-Click Experience)

- Status: Accepted
- Date: 2026-11-21
- Related: ADR-0005 (installer v1)

## 1. Goals

Align the install experience with MiMoCode: one command, the runtime provisioned automatically, ready to use right after install, and a clean uninstall.

## 2. Approach

| Stage | Implementation |
|---|---|
| Release artifact | `scripts/pack.ps1` → `dist/ashcode-<version>-win-x64.zip` (~57 KB; contains only src/bin/scripts/docs/package.json/README/tsconfig, excluding `node_modules`, `.env.local`, and logs) |
| Installer | `scripts/install.ps1 -Source <zip path or URL>`; when `-Source` is omitted, installs from the current checkout |
| Install layout | `%LOCALAPPDATA%\ashcode\app` (app copy) + `\bin\ashcode.cmd` (absolute-path launcher) + `install.json` (version/path manifest) |
| Runtime | Reuses the system Node ≥22 and Bun ≥1.3.14; when Bun is missing, runs `npm install -g bun` automatically; the launcher uses the **absolute path to bun.exe** (not the `.ps1` shim) |
| Dependencies | `npm install --legacy-peer-deps` at install time, followed by `npm approve-scripts --all` + `npm rebuild` (npm 11 blocks dependency install scripts by default; leaving this unhandled leaves sandbox/PTY native addons missing) |
| Credentials | A checkout install copies `.env.local`; a zip install never carries it |
| Uninstall | `scripts/uninstall.ps1` removes the app directory, launcher, and PATH based on `install.json` |

## 3. Verification

| Scenario | Result |
|---|---|
| `pack.ps1` produces a zip | 57 KB, 50 entries, no `.env.local` |
| Install from zip into a temporary directory | Success; `ashcode --version` → `0.4.0`; `--help` works |
| Start the installed copy from a temporary working directory | Reaches ready |
| Installed copy runs a real model turn (read file) | Answers `installed-ok`; tool card appears |
| Install into `%LOCALAPPDATA%\ashcode` | Success; launcher points to the app copy; real turn passes |
| PATH | Written to the user PATH (takes effect in new terminals) |

## 4. Key Fixes (Pitfalls Hit)

1. `Get-Command bun` returns `bun.ps1`, which cmd.exe cannot execute once written into a `.cmd` → resolve `bun.exe` instead (npm install directory / WindowsApps / `where.exe`).
2. npm 11's `allow-scripts` blocks dependency install scripts by default, so native addons are missing after the first install → the installer adds `approve-scripts --all` + `rebuild`.
3. When the installed copy starts from an arbitrary directory, the DSH CLI must resolve against the **app root** (not the current working directory) → `PortOptions.appRoot`.
4. The installed copy's default data directory must not land inside the user's project → use `./.dsh-home` inside the checkout, otherwise `~/.ashcode`; `--home` / `ASHCODE_HOME` can override it.
5. Passing a relative path to `-InstallDir` writes a relative path into the launcher, which fails at startup from a different directory → the installer/uninstaller entry points use `GetFullPath` uniformly.
6. Added thin `install.cmd` / `uninstall.cmd` entry points (they forward to PowerShell and `pause` on double-click) and shipped them in the release zip.
7. `--legacy-peer-deps` skips peers such as `@deepseek-ai/cordis-plugin-group`, so the installed copy fails at startup with `Cannot find package ...` → prefer a plain `npm install` (falling back to legacy only on failure), list that package as an explicit dependency, and verify key modules exist after install.

## 5. Not Done

- There is no public download URL, so there is no real one-line `irm ... | iex` command yet; hosting the zip and `install.ps1` on any static host is enough — the installer already supports URLs.
- Does not bundle the Node/Bun runtime (MiMoCode ships native binaries); when missing, it reports a clear error or installs Bun automatically.
- Auto-update (`ashcode update`) is not implemented; rerunning the installer overwrites.
