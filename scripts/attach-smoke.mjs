/** Attachment test: /attach reads a local image and queues it for the next prompt. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 110, rows: 30, cwd: process.cwd(), env: { ...process.env, ASHCODE_MOUSE: '0' },
})
child.onData((data) => { raw += data })
setTimeout(() => child.write('/attach scripts/fixtures/attach.png\u001b[13;5u'), 9000)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const text = plain.replace(/\s+/g, '')
  const ok = text.includes('attachedattach.png')
  console.log(`[attach-smoke] ok=${ok}`)
  if (!ok) console.log(`[attach-smoke] tail=${JSON.stringify(plain.slice(-600))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 15_000)
