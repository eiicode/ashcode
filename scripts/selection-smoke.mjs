/** Selection test: drag over transcript, Ctrl+C copies via OSC 52. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(),
  env: { ...process.env, ASHCODE_FAKE_LINES: '20' },
})
child.onData((data) => { raw += data })

const cmd = (n) => `\u001b[13;5u` // unused helper
void cmd

setTimeout(() => child.write('\u001b[<0;6;4M'), 10_000)
setTimeout(() => child.write('\u001b[<32;20;6M'), 10_400)
setTimeout(() => child.write('\u001b[<32;40;8M'), 10_800)
setTimeout(() => child.write('\u001b[<0;40;8m'), 11_200)
setTimeout(() => child.write('\u0003'), 12_000)

setTimeout(() => {
  const copied = raw.includes('\u001b]52;c;') || raw.includes(']52;c;')
  console.log(`[selection-smoke] copied=${copied}`)
  if (!copied) console.log(`[selection-smoke] tail=${JSON.stringify(raw.slice(-300))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(copied ? 0 : 1)
}, 16_000)
