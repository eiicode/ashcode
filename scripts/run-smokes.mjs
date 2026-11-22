/**
 * Run every ConPTY smoke in sequence and report a single result.
 * Usage: node scripts/run-smokes.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const smokes = [
  'tui-smoke',
  'approval-smoke',
  'question-smoke',
  'toolcard-smoke',
  'resume-smoke',
  'paste-smoke',
  'scroll-smoke',
  'resume-history-smoke',
  'crash-smoke',
  'cursor-smoke',
  'quit-smoke',
  'session-smoke',
  'key-smoke',
  'model-smoke',
  'sidebar-smoke',
  'chooser-smoke',
  'attach-smoke',
  'team-smoke',
  'selection-smoke',
]

/** Bun is not always installed through npm; ASHCODE_BUN wins, then the usual homes, then PATH. */
function resolveBun() {
  const candidates = [
    process.env.ASHCODE_BUN,
    join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'bun.exe'),
  ].filter(Boolean)
  for (const candidate of candidates) { if (existsSync(candidate)) return candidate }
  const found = spawnSync('where.exe', ['bun'], { encoding: 'utf8' })
  const first = (found.stdout ?? '').split(/\r?\n/).map(line => line.trim()).find(Boolean)
  return first ?? 'bun'
}

const bunExe = resolveBun()
const results = []
for (const name of smokes) {
  const started = Date.now()
  const run = spawnSync(process.execPath, [`scripts/${name}.mjs`], { stdio: 'inherit' })
  results.push({ name, code: run.status ?? 1, ms: Date.now() - started })
}

const wrapper = spawnSync(process.execPath, ['scripts/bin-smoke.mjs', bunExe, 'bin/ashcode.mjs'], { stdio: 'inherit' })
results.push({ name: 'bin-wrapper', code: wrapper.status ?? 1, ms: 0 })

console.log('\n=== summary ===')
for (const result of results) {
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'}  ${result.name}  ${result.ms}ms`)
}
process.exit(results.every(result => result.code === 0) ? 0 : 1)
