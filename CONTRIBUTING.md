English | [中文](CONTRIBUTING.zh.md)

# Contributing

Thanks for helping. This project does exactly one thing: it **displays** the DSH
runtime in a terminal and takes input. Sessions, tools, approvals, models and the
sandbox all live in `@deepseek-ai/dsh` — changes to those capabilities usually
belong in a dsh plugin, not in this repository.

## Environment

| Dependency | Version | Notes |
|---|---|---|
| Windows | 10/11 | The only verified platform |
| Node.js | ≥ 24.9.0 | Runs the DSH runtime (its native addons require it) |
| Bun | ≥ 1.3.14 | Renders the TUI |
| PowerShell | 5.1+ | The install / pack / release scripts are written to stay 5.1-compatible |

macOS / Linux have `scripts/install.sh`, but it has not been smoke-tested. PRs are
welcome — just say how far you actually got.

## Local development

```powershell
npm install          # many dependencies; first run takes a few minutes. Add --legacy-peer-deps on peer conflicts
npm run typecheck    # tsc --noEmit; must pass before you commit
npm run tui          # start the TUI directly (= bun src/ui/app.ts)
```

> `npm run tui` bypasses `bin/ashcode.mjs`, so it does **not** read `.env.local`.
> Set the `DEEPSEEK_API_KEY` environment variable first.
> To exercise an installed copy, use `npm run install:local` and then run `ashcode`.

## Tests

`npm test` runs 19 ConPTY smoke tests in sequence (`scripts/run-smokes.mjs`). Its
prerequisites are hard requirements:

- Windows with a real terminal (ConPTY);
- an installed ashcode (`%LOCALAPPDATA%\ashcode\bin\ashcode.cmd`);
- a working `DEEPSEEK_API_KEY`;
- `bun.exe` at `%APPDATA%\npm\node_modules\bun\bin\bun.exe` (the path is
  hard-coded in `scripts/run-smokes.mjs`).

Because of that, **these smoke tests cannot run in CI**. CI only runs `typecheck`
and `pack`, which do not need a PTY. For a PR, at minimum run
`npm run typecheck` and describe which interactions you verified by hand.

Single smoke test: `npm run smoke:tui`, `npm run smoke:approval`, and so on (see
`package.json`).

## Code layout

| Path | Responsibility |
|---|---|
| `src/ui/app.ts` | Main render loop, state machine, panels, input handling (single file, ~1600 lines) |
| `src/ui/render.ts` | Line / span model and layout helpers |
| `src/ui/markdown.ts` | Terminal Markdown rendering |
| `src/ui/theme.ts` | Semantic palette (`dark` / `light` / `contrast` / `ansi`) |
| `src/runtime/stdio-sdk.ts` | Spawns `dsh --profile sdk` and speaks stdio JSON-RPC |
| `bin/ashcode.mjs` | Entry point: loads `.env.local`, `--help` / `--version` |
| `scripts/` | Install, pack, release, smoke tests |

Architecture decisions live in `docs/adr/`. **Read ADR-0002 before touching the
transport layer or the runtime split** — the two-process design is not a
preference, it is the only combination that works on both sides.

## Commits and releases

- Use conventional-commit prefixes (`feat:` / `fix:` / `test:` / `chore:` / `docs:`).
- `CHANGELOG.md` (English) and `CHANGELOG.zh.md` (Chinese) are hand-written. At
  release time `scripts/release.ps1` pulls the matching section from both, so
  version headings must be exactly `## <version> — <date>` and must match across
  the two files.
- Do not change `version` in `package.json` in a PR.

## Language

Chinese or English, either is fine — issues, PRs and code comments alike.
