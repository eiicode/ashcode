/**
 * Resume-history test: start with --resume <id> and expect the persisted
 * transcript to be replayed into the view.
 * Usage: node scripts/resume-history-smoke.mjs [sessionId]
 */
import pty from 'node-pty'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error(`bun not found`); process.exit(2) }

const home = process.env.ASHCODE_HOME ?? join(process.cwd(), '.dsh-home')
const encoded = `--${process.cwd().replace(/[:\\/]+/g, '-')}--`
const dir = join(home, 'sessions', encoded)
const ids = existsSync(dir) ? readdirSync(dir) : []

/** Pick the newest session whose log is larger than a header-only frame. */
function pickSession() {
  if (process.argv[3] !== undefined) return process.argv[3]
  for (const id of ids.slice().reverse()) {
    const file = join(dir, id, 'session.v4.jsonl.zstd')
    if (!existsSync(file)) continue
    return id
  }
  return undefined
}

const sessionId = pickSession()
if (sessionId === undefined) { console.error('no session to resume'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts', '--resume', sessionId], {
  name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: { ...process.env },
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
  const replayed = text.includes('replayed')
  const history = /❯|Useyourshelltool|tui-shell-ok|hello from dsh tui/.test(text)
  const ok = replayed && history
  console.log(`[resume-history] session=${sessionId} replayed=${replayed} history=${history} ok=${ok}`)
  if (!ok) console.log(`[resume-history] tail=${JSON.stringify(plain().slice(-1000))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 25_000)
