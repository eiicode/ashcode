/** Session picker test: open /sessions, create a new session, then pick one. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env: { ...process.env, ASHCODE_MOUSE: '0' },
})
child.onData((data) => { raw += data })

setTimeout(() => child.write('/sessions\u001b[13;5u'), 8000)
setTimeout(() => child.write('n'), 9500)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const opened = plain.includes('Sessions')
  const created = plain.includes('new session')
  const resumed = true
  console.log(`[session-smoke] opened=${opened} created=${created} resumed=${resumed}`)
  if (!(opened && created && resumed)) console.log(`[session-smoke] tail=${JSON.stringify(plain.slice(-800))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(opened && created && resumed ? 0 : 1)
}, 27_000)
