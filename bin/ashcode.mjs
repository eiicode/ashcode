#!/usr/bin/env bun
/**
 * Launcher: load the app-level .env.local (regardless of the caller's cwd),
 * handle --help/--version, then start the TUI. The caller's cwd is the workspace.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const appRoot = dirname(import.meta.dir)
const args = process.argv.slice(2)

/** Terminal modes the TUI may leave behind when killed abruptly. */
const RESET_SEQUENCES = '\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1005l\u001b[?1006l\u001b[?25h\u001b[?1049l\u001b[0m'

if (args.includes('--reset-terminal')) {
  process.stdout.write(RESET_SEQUENCES)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`ashcode — terminal UI for DeepSeek Harness

Usage:
  ashcode [options]

Options:
  --resume <id>     reopen a persisted session
  --home <path>     DSH data directory (default: isolated, or ~/.ashcode)
  --version, -v     print the version
  --help, -h        print this help
  --reset-terminal  restore terminal modes if a killed run left garbage

Environment:
  DEEPSEEK_API_KEY  provider credential (or put it in .env.local)
  ASHCODE_HOME      same as --home
  ASHCODE_MODEL     model name (default deepseek-flash)
  ASHCODE_THEME     dark | light | contrast | ansi
  ASHCODE_DEBUG     write .tui-debug.log

Keys: Enter send · Shift+Tab plan · Ctrl+O tools · PgUp/PgDn scroll · Esc cancel · Ctrl+C quit
`)
  process.exit(0)
}

const envFile = join(appRoot, '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (match === null) continue
    if (process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}

await import('../src/ui/app.ts')
