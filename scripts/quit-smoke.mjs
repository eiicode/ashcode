/** Quit confirmation test: first Ctrl+C warns, second quits. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
let exited = false
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env: { ...process.env, ASHCODE_MOUSE: '0', ASHCODE_LANG: 'zh' },
})
child.onData((data) => { raw += data })
child.onExit(() => { exited = true })

setTimeout(() => child.write('\u0003'), 8000)
setTimeout(() => child.write('\u0003'), 9000)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const warned = plain.includes('再按一次')
  console.log(`[quit-smoke] warned=${warned} exited=${exited}`)
  if (!warned || !exited) console.log(`[quit-smoke] tail=${JSON.stringify(plain.slice(-500))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(warned && exited ? 0 : 1)
}, 14_000)
