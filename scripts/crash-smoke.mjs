/**
 * Crash recovery test: kill the harness child on purpose and expect the TUI to
 * notice, restart it and resume the session.
 * Usage: node scripts/crash-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 110, rows: 34, cwd: process.cwd(),
  env: { ...process.env, ASHCODE_FAKE_CRASH_MS: '2500' },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

setTimeout(() => {
  const text = norm()
  const noticed = text.includes('harnessexitedunexpectedly') || text.includes('harnesexited')
  const restarted = text.includes('harnessrestarted') || text.includes('harnesrestarted')
  const ok = noticed && restarted
  console.log(`[crash-smoke] noticed=${noticed} restarted=${restarted} ok=${ok}`)
  if (!ok) console.log(`[crash-smoke] tail=${JSON.stringify(plain().slice(-900))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 22_000)
