/**
 * M2 tool-card test: a fake tool item is injected after start; Ctrl+O expands
 * it and the expanded body shows the recorded result.
 * Usage: node scripts/toolcard-smoke.mjs
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
  env: { ...process.env, ASHCODE_FAKE_TOOL: '1' },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

let expanded = false
const timer = setInterval(() => {
  if (!expanded && norm().includes('demo.txt')) {
    expanded = true
    console.log('[smoke] tool card detected, pressing Ctrl+O')
    setTimeout(() => child.write('\x0f'), 400)
  }
}, 300)

setTimeout(() => {
  clearInterval(timer)
  const text = norm()
  const collapsed = text.includes('demo.txt')
  const open = text.includes('Write demo.txt'.replace(/\s+/g, '')) && text.includes('hello from demo'.replace(/\s+/g, ''))
  console.log(`[smoke] card=${collapsed} expanded=${open}`)
  if (!(collapsed && open)) console.log(`[smoke] tail=${JSON.stringify(plain().slice(-900))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(collapsed && open ? 0 : 1)
}, 20_000)
