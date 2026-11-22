/**
 * Drive the M1 TUI inside a real ConPTY: wait, type "/plan", expect the
 * plan-mode acknowledgement, then tear down.
 * Usage: node scripts/tui-smoke.mjs [path-to-bun]
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) {
  console.error(`bun not found at ${bunExe}`)
  process.exit(2)
}

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color',
  cols: 100,
  rows: 30,
  cwd: process.cwd(),
  env: { ...process.env },
})

child.onData((data) => { raw += data })

/** Strip ANSI so markers survive styling. */
function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}

function finish(reason, ok) {
  console.log(`[smoke] ${reason} bytes=${raw.length} ok=${ok}`)
  if (!ok) console.log(`[smoke] tail=${JSON.stringify(plain().slice(-1200))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}

/** OpenTUI positions spaces with cursor moves, so compare without whitespace. */
function hasPlanAck() {
  return plain().replace(/\s+/g, '').includes('PLAN')
}

child.onExit(({ exitCode }) => finish(`exit=${exitCode}`, hasPlanAck()))

setTimeout(() => { child.write('/plan') }, 3000)
setTimeout(() => { child.write('\u001b[13;5u') }, 3400)
setTimeout(() => {
  finish('timeout', hasPlanAck())
}, 16_000)
