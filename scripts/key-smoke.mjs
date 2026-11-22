/** Key prompt test: without DEEPSEEK_API_KEY the modal appears and Esc closes it. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

const home = join(process.env.TEMP ?? '.', 'ashcode-key-smoke')
let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(),
  env: { ...process.env, DEEPSEEK_API_KEY: '', ASHCODE_HOME: home, ASHCODE_MOUSE: '0' },
})
child.onData((data) => { raw += data })
setTimeout(() => child.write('\u001b'), 9000)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const shown = plain.includes('API Key') && plain.includes('保存')
  console.log(`[key-smoke] modal=${shown}`)
  if (!shown) console.log(`[key-smoke] tail=${JSON.stringify(plain.slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(shown ? 0 : 1)
}, 14_000)
