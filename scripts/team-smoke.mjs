/** Team mode test: /team on writes the patch, restarts and shows the TEAM badge. */
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
setTimeout(() => child.write('/team on\u001b[13;5u'), 9000)

setTimeout(() => {
  const plain = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
  const text = plain.replace(/\s+/g, '')
  const badge = text.includes('TEAM')
  const restarted = text.includes('newsession') || text.includes('nwsession')
  const noCrash = !text.includes('teamswitchfailed')
  console.log(`[team-smoke] badge=${badge} restarted=${restarted} ok=${noCrash}`)
  if (!(badge && restarted && noCrash)) console.log(`[team-smoke] tail=${JSON.stringify(plain.slice(-700))}`)
  try { child.kill() } catch { /* ignore */ }
  process.exit(badge && restarted && noCrash ? 0 : 1)
}, 24_000)
