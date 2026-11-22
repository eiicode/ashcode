/**
 * Paste test: send a bracketed-paste frame, then Enter; the pasted command must
 * end up in the composer and execute.
 * Usage: node scripts/paste-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error(`bun not found at ${bunExe}`); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 110, rows: 34, cwd: process.cwd(), env: { ...process.env },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

setTimeout(() => child.write('\u001b[200~/help\u001b[201~'), 8000)
setTimeout(() => child.write('\u001b[13;5u'), 8600)

setTimeout(() => {
  const text = norm()
  const ok = text.includes('commands:') || text.includes('commands:/help')
  console.log(`[paste-smoke] ok=${ok}`)
  if (!ok) console.log(`[paste-smoke] tail=${JSON.stringify(plain().slice(-800))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 22_000)
