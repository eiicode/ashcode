/**
 * M2 session + plan test: /sessions lists persisted ids, /resume restores one,
 * Shift+Tab toggles plan mode through the harness.
 * Usage: node scripts/resume-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error(`bun not found at ${bunExe}`); process.exit(2) }

const home = process.env.ASHCODE_HOME ?? join(process.cwd(), '.dsh-home')
const encoded = `--${process.cwd().replace(/[:\\/]+/g, '-')}--`
const dir = join(home, 'sessions', encoded)
const ids = existsSync(dir) ? readdirSync(dir) : []
if (ids.length === 0) { console.error(`no sessions under ${dir}`); process.exit(2) }
const target = ids[0]

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

setTimeout(() => child.write('/sessions\u001b[13;5u'), 6000)
setTimeout(() => child.write('\u001b[13;5u'), 7000)
setTimeout(() => child.write('\x1b[Z'), 12_000)

setTimeout(() => {
  const text = norm()
  const listed = text.includes('Sessions')
  const resumed = text.includes('resumed') || text.includes('replaye')
  const plan = text.includes('PLAN')
  console.log(`[smoke] session=${target} listed=${listed} resumed=${resumed} plan=${plan}`)
  if (!(listed && resumed && plan)) console.log(`[smoke] tail=${JSON.stringify(plain().slice(-1200))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(listed && resumed && plan ? 0 : 1)
}, 32_000)
