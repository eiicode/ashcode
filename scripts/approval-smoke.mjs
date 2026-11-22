/**
 * M2 approval panel test (no model needed): the app injects a fake approval
 * request after start; we select "allow once" and expect the recorded outcome.
 * Usage: node scripts/approval-smoke.mjs
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
  env: { ...process.env, ASHCODE_FAKE_APPROVAL: '1' },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

let answered = false
const timer = setInterval(() => {
  if (!answered && norm().includes('approval:')) {
    answered = true
    console.log('[smoke] approval panel detected')
    setTimeout(() => child.write('1'), 250)
    setTimeout(() => child.write('\r'), 650)
  }
}, 300)

function done(ok, reason) {
  clearInterval(timer)
  console.log(`[smoke] ${reason} panel=${answered} ok=${ok}`)
  if (!ok) console.log(`[smoke] tail=${JSON.stringify(plain().slice(-900))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}

setTimeout(() => done(answered && norm().includes('approvalallowed-once'), 'timeout'), 45_000)
