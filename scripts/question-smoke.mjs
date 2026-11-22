/**
 * M2 structured-question test (no model needed): the app injects a two-question
 * request; we answer both in sequence and expect a single answer payload that
 * covers every question id (the SDK rejects partial answer sets).
 * Usage: node scripts/question-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error(`bun not found at ${bunExe}`); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 110, rows: 34, cwd: process.cwd(),
  env: { ...process.env, ASHCODE_FAKE_QUESTION: '1' },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

let sent = false
const timer = setInterval(() => {
  if (sent) return
  if (norm().includes('Pickacolor')) {
    sent = true
    console.log('[smoke] first panel detected')
    setTimeout(() => child.write('2'), 300)
    setTimeout(() => child.write('\r'), 700)
    // second question renders right after the first answer; send it blind
    setTimeout(() => child.write('2'), 2600)
    setTimeout(() => child.write('\r'), 3000)
  }
}, 300)

setTimeout(() => {
  clearInterval(timer)
  const text = norm()
  const both = text.includes('answered') && text.includes('q1=green') && text.includes('q2=large')
  const values = both
  const ok = sent && both && values
  console.log(`[smoke] sent=${sent} bothIds=${both} values=${values} ok=${ok}`)
  if (!ok) console.log(`[smoke] tail=${JSON.stringify(plain().slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 30_000)
