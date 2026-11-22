/**
 * Real-model turn through the SDK profile: proves prompt -> tool -> result -> turn end.
 * Run with Node: node scripts/sdk-turn.mjs "prompt"
 * Reads DEEPSEEK_API_KEY from the environment (Bun loads .env.local; Node does not).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cwd = process.cwd()
const home = resolve(cwd, '.dsh-home')
mkdirSync(home, { recursive: true })

/** Minimal .env.local loader so plain Node sees the same key Bun would. */
if (process.env.DEEPSEEK_API_KEY === undefined && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match !== null && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}

const env = { ...process.env }
for (const key of Object.keys(env)) {
  if (key.startsWith('DSH_') && key !== 'DSH_HOME') delete env[key]
}
env.DSH_HOME = home

const bin = resolve(cwd, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
if (!existsSync(bin)) { console.error(`missing ${bin}`); process.exit(2) }

const prompt = process.argv[2] ?? 'Create a file named hello.txt containing exactly "hello from dsh tui", then read it back and confirm the content.'
if (process.env.DEEPSEEK_API_KEY === undefined) {
  console.error('DEEPSEEK_API_KEY is not set')
  process.exit(2)
}

const child = spawn(process.execPath, [bin, '--profile', 'sdk'], {
  cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
})

let buffer = ''
const pending = new Map()
let nextId = 1
let sessionId = `turn-${Date.now()}`
let toolCalls = 0
let approvals = 0
let settled = false

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line !== '') {
      try { onFrame(JSON.parse(line)) } catch (error) { console.log(`[bad-frame] ${String(error)}`) }
    }
  }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
  for (const line of String(chunk).split(/\r?\n/)) if (line.trim() !== '') console.log(`[stderr] ${line.trim()}`)
})

function reply(id, result) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function onFrame(frame) {
  if (typeof frame.id === 'number' && frame.method === undefined) {
    const waiter = pending.get(frame.id)
    if (waiter !== undefined) { pending.delete(frame.id); waiter(frame) }
    return
  }
  if (typeof frame.method === 'string' && frame.id !== undefined) {
    if (frame.method === 'approval/request') {
      approvals++
      console.log(`[approval] ${frame.params?.toolName ?? 'tool'} -> allowed-once`)
      reply(frame.id, { outcome: 'allowed-once' })
      return
    }
    if (frame.method === 'user-question/ask') {
      console.log('[question] cancelled')
      reply(frame.id, { cancelled: true })
      return
    }
    reply(frame.id, {})
    return
  }
  if (frame.method === 'session.event') {
    const { sessionId: sid, event } = frame.params
    if (sid !== sessionId) return
    const data = event.data ?? {}
    switch (event.type) {
      case 'turn/start': console.log('[turn] start'); break
      case 'turn/end':
        console.log(`[turn] end ${JSON.stringify(data.reason ?? '?')}`)
        settled = true
        finish()
        break
      case 'assistant/message': {
        for (const block of data.message?.content ?? []) {
          if (block.type === 'text' && block.text) console.log(`[assistant] ${String(block.text).slice(0, 600)}`)
          if (block.type === 'reasoning' && block.text) console.log(`[thinking] ${String(block.text).slice(0, 200)}`)
        }
        break
      }
      case 'tool/call':
        toolCalls++
        console.log(`[tool] ${data.name} ${String(data.arguments ?? '').slice(0, 160)}`)
        break
      case 'tool/result':
        console.log(`[result] ${String(JSON.stringify(data.message ?? '')).slice(0, 300)}`)
        break
      default: break
    }
    return
  }
  if (frame.method === 'session.query.completed') {
    console.log(`[query] completed: ${frame.params?.finishReason ?? '?'}`)
    settled = true
    finish()
  }}

function request(method, params, timeoutMs = 120_000) {
  const id = nextId++
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => { pending.delete(id); rejectPromise(new Error(`timeout ${method}`)) }, timeoutMs)
    pending.set(id, (frame) => {
      clearTimeout(timer)
      if (frame.error !== undefined) rejectPromise(new Error(JSON.stringify(frame.error)))
      else resolvePromise(frame.result)
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

function finish(code = 0) {
  console.log(`SUMMARY tools=${toolCalls} approvals=${approvals} settled=${settled}`)
  try { child.stdin.end() } catch { /* ignore */ }
  setTimeout(() => { child.kill(); process.exit(settled ? code : 1) }, 1500)
}

try {
  await request('initialize', {
    cwd,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    approvalRequests: true,
    capabilities: { userQuestions: true },
  })
  console.log('[init] ok')
  await request('session/query', { sessionId, contentBlocks: [{ type: 'text', text: prompt }] })
  console.log('[query] enqueued')
} catch (error) {
  console.error(`[fatal] ${String(error)}`)
  finish(1)
}

setTimeout(() => {
  if (!settled) { console.error('[timeout] no completion in 180s'); finish(1) }
}, 180_000)
