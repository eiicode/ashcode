/** Sidebar test: shown on wide terminals, Ctrl+B toggles, mouse click switches. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: { ...process.env },
})
child.onData((data) => { raw += data })

setTimeout(() => child.write('\u001b[<0;6;4M\u001b[<0;6;4m'), 12_000)
setTimeout(() => child.write('\u0002'), 15_000) // Ctrl+B hides
setTimeout(() => child.write('\u0002'), 16_500) // Ctrl+B shows

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const text = plain.replace(/\s+/g, '')
  const marker = text.includes('▸')
  const resumed = text.includes('resumed') || text.includes('replayed')
  console.log(`[sidebar-smoke] marker=${marker} resumed=${resumed}`)
  if (!(marker && resumed)) console.log(`[sidebar-smoke] tail=${JSON.stringify(plain.slice(-800))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(marker && resumed ? 0 : 1)
}, 20_000)
