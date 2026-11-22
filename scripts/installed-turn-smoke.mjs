/**
 * End-to-end proof for an installed copy: run the installed launcher from a
 * foreign workspace, ask it to read a file, expect the tool + answer.
 * Usage: node scripts/installed-turn-smoke.mjs <launcher.cmd> <workspaceDir>
 */
import pty from 'node-pty'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const launcher = process.argv[2]
const workspace = process.argv[3]
if (!launcher || !workspace) { console.error('usage: installed-turn-smoke.mjs <launcher> <workspace>'); process.exit(2) }
if (!existsSync(launcher)) { console.error(`missing launcher ${launcher}`); process.exit(2) }

writeFileSync(join(workspace, 'hello.txt'), 'installed copy works\n')

let raw = ''
const child = pty.spawn('cmd.exe', ['/c', launcher], {
  name: 'xterm-256color', cols: 110, rows: 34, cwd: workspace, env: { ...process.env },
})
child.onData((data) => { raw += data })

const plain = () => raw
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b[@-_]/g, '')
const norm = () => plain().replace(/\s+/g, '')

setTimeout(() => { child.write('Read hello.txt with your read tool and reply with exactly: installed-ok') }, 9000)
setTimeout(() => { child.write('\u001b[13;5u') }, 9600)

setTimeout(() => {
  const text = norm()
  const answered = text.includes('installed-ok')
  const tool = text.includes('⚙') || text.includes('hello.txt')
  console.log(`[installed-turn] answered=${answered} tool=${tool}`)
  if (!answered) console.log(`[installed-turn] tail=${JSON.stringify(plain().slice(-1000))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(answered && tool ? 0 : 1)
}, 150_000)
