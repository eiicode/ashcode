/** Startup idle + /model switch test. */
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

setTimeout(() => child.write('/model deepseek-v4-pro\u001b[13;5u'), 9000)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const text = plain.replace(/\s+/g, '')
  const idle = text.includes('idle')
  const switched = text.includes('deepseek-v4-pro') && text.includes('newsession')
  console.log(`[model-smoke] idle=${idle} switched=${switched}`)
  if (!(idle && switched)) console.log(`[model-smoke] tail=${JSON.stringify(plain.slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(idle && switched ? 0 : 1)
}, 22_000)
