/**
 * Scrollback test: inject 80 filler lines, press PageUp, expect the view to
 * move up (header shows ↑N and early lines become visible).
 * Usage: node scripts/scroll-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 100, rows: 24, cwd: process.cwd(),
  env: { ...process.env, ASHCODE_FAKE_LINES: '80', ASHCODE_DEBUG: '1' },
})
child.onData((data) => { raw += data })

function plain() {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}
const norm = () => plain().replace(/\s+/g, '')

for (let index = 0; index < 5; index += 1) {
  setTimeout(() => child.write('\u001b[5~'), 9000 + index * 500)
}

setTimeout(() => {
  const text = norm()
  const log = existsSync('.tui-debug.log') ? readFileSync('.tui-debug.log', 'utf8') : ''
  const draws = log.split('\n').filter(line => line.startsWith('draw scroll='))
  const pageUps = log.split('\n').filter(line => line.includes('"name":"pageup"')).length
  const maxScroll = Math.max(0, ...draws.map(line => Number(/scroll=(\d+)/.exec(line)?.[1] ?? 0)))
  const reachedEarly = draws.some(line => /first=· filler line ([1-9]|1\d|2\d)\b/.test(line))
  const ok = maxScroll >= 32 && reachedEarly
  console.log(`[scroll-smoke] pageUps=${pageUps} maxScroll=${maxScroll} early=${reachedEarly} ok=${ok}`)
  if (!ok) console.log(`[scroll-smoke] tail=${JSON.stringify(plain().slice(-600))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ok ? 0 : 1)
}, 16_000)
