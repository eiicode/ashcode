/** Model/effort chooser test. */
import pty from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const bunExe = process.argv[2]
  ?? join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe')
if (!existsSync(bunExe)) { console.error('bun not found'); process.exit(2) }

let raw = ''
const child = pty.spawn(bunExe, ['src/ui/app.ts'], {
  name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(), env: { ...process.env, ASHCODE_MOUSE: '0' },
})
child.onData((data) => { raw += data })

setTimeout(() => child.write('/model\u001b[13;5u'), 8000)
setTimeout(() => child.write('\u001b[B'), 9500)      // down to v4-pro
setTimeout(() => child.write('\u001b[13;5u'), 10_200) // apply
setTimeout(() => child.write('/effort\u001b[13;5u'), 20_000)
setTimeout(() => child.write('\u001b[B'), 21_500)     // high -> max
setTimeout(() => child.write('\u001b[13;5u'), 22_200)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const text = plain.replace(/\s+/g, '')
  const modelSwitched = text.includes('model→deepseek-v4-pro')
  const effortSwitched = text.includes('·max·') || /max.*(BUILD|PLAN)/.test(text)
  console.log(`[chooser-smoke] model=${modelSwitched} effort=${effortSwitched}`)
  if (!(modelSwitched && effortSwitched)) console.log(`[chooser-smoke] tail=${JSON.stringify(plain.slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(modelSwitched && effortSwitched ? 0 : 1)
}, 32_000)
