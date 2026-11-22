/** Cursor editing test: type "/hlp", move left twice, insert "e", send. */
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

setTimeout(() => child.write('/hlp'), 8000)
setTimeout(() => child.write('\u001b[D\u001b[D'), 8500)
setTimeout(() => child.write('e'), 8900)
setTimeout(() => child.write('\u001b[13;5u'), 9300)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const ok = plain.replace(/\s+/g, '').includes('commands:')
  console.log(`[cursor-smoke] ok=${ok}`)
  if (!ok) console.log(`[cursor-smoke] tail=${JSON.stringify(plain.slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 20_000)
