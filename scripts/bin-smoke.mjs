/**
 * Verify the compiled single-file binary boots and reaches "ready".
 * Usage: node scripts/bin-smoke.mjs [path-to-exe]
 */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const exe = process.argv[2] ?? join(process.cwd(), 'dist', process.platform === 'win32' ? 'ashcode.exe' : 'ashcode')
const exeArgs = process.argv.slice(3)
if (!existsSync(exe)) { console.error(`binary not found at ${exe}`); process.exit(2) }

let raw = ''
const child = pty.spawn(exe, exeArgs, {
  name: 'xterm-256color', cols: 100, rows: 30, cwd: process.env.ASHCODE_CWD ?? process.cwd(), env: { ...process.env },
})
child.onData((data) => { raw += data })

const plain = () => raw
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b[@-_]/g, '')
const norm = () => plain().replace(/\s+/g, '')

setTimeout(() => {
  const ready = norm().includes('ready') && norm().includes('ashcode')
  console.log(`[bin-smoke] ready=${ready} bytes=${raw.length}`)
  if (!ready) console.log(`[bin-smoke] tail=${JSON.stringify(plain().slice(-800))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(ready ? 0 : 1)
}, 20_000)
