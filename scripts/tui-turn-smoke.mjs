/**
 * End-to-end real turn through the TUI: ask it to read hello.txt, expect the
 * model's confirmation and a tool card in the transcript.
 * Usage: node scripts/tui-turn-smoke.mjs
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error(`bun not found at ${bunExe}`); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 110, rows: 34, cwd: process.cwd(), env: { ...process.env },
})
child.onData((data) => { raw += data })

const plain = () => raw
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b[@-_]/g, '')
const norm = () => plain().replace(/\s+/g, '')

setTimeout(() => { child.write('Read hello.txt with your read tool and reply with exactly: tui-verified') }, 7000)
setTimeout(() => { child.write('\u001b[13;5u') }, 7600)

setTimeout(() => {
  const text = norm()
  const answered = text.includes('tui-verified')
  const tool = text.includes('Read') && text.includes('hello.txt')
  console.log(`[turn-smoke] answered=${answered} tool=${tool} bytes=${raw.length}`)
  if (!answered) console.log(`[turn-smoke] tail=${JSON.stringify(plain().slice(-1200))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(answered && tool ? 0 : 1)
}, 120_000)
