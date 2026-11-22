/**
 * StdioSdkPort — the only RuntimePort implementation for v1.
 *
 * Spawns `node <dsh>/lib/bin.js --profile sdk` and speaks newline-delimited
 * JSON-RPC 2.0 (see @deepseek-ai/dsh-sdk-protocol). The TUI stays a thin
 * projector: every visual state is derived from `session.event` frames.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface SessionEvent {
  type: string
  seq?: number
  time?: number
  data?: Record<string, any>
}

export interface PortHandlers {
  onEvent(event: SessionEvent): void
  onNotice(text: string): void
  onStatus(status: 'idle' | 'running'): void
  onSubagent(kind: 'started' | 'finished', info: Record<string, unknown>): void
  onServerRequest(method: string, params: Record<string, unknown>): Promise<unknown>
  /** Called when the harness process exits without an explicit shutdown. */
  onCrash?(): void
}

export interface PortOptions {
  cwd: string
  appRoot: string
  model?: string
  reasoningEffort?: string
  provider?: string
  dshHome?: string
  resumeId?: string
  patches?: string[]
}

const DSH_BIN = 'node_modules/@deepseek-ai/dsh/lib/bin.js'

/** Locate the Node executable to run the harness with (Bun must not run it). */
function nodeExecutable(): string {
  const fromPath = (globalThis as { Bun?: { which(name: string): string | null } }).Bun?.which('node')
  return process.env.ASHCODE_NODE_EXECUTABLE ?? fromPath ?? 'node'
}

export class StdioSdkPort {
  private child!: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private nextId = 1
  private buffer = ''
  private closed = false
  private closing = false
  private generation = 0
  private sessionKnown = false
  private readonly bin: string
  private readonly env: NodeJS.ProcessEnv
  sessionId: string

  constructor(private readonly options: PortOptions, private readonly handlers: PortHandlers) {
    this.bin = resolve(options.appRoot, DSH_BIN)
    if (!existsSync(this.bin)) throw new Error(`DSH CLI not found at ${this.bin}`)

    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.startsWith('DSH_') && key !== 'DSH_HOME' && key !== 'ASHCODE_NODE_EXECUTABLE') delete env[key]
    }
    env.DSH_HOME = options.dshHome ?? env.DSH_HOME ?? resolve(options.cwd, '.dsh-home')
    this.env = env
    this.sessionId = options.resumeId ?? `tui-${Date.now()}`
    this.spawnChild()
  }

  private spawnChild(): void {
    this.closed = false
    this.buffer = ''
    this.pending.clear()
    const generation = ++this.generation
    const patchArgs = (this.options.patches ?? []).flatMap(patch => ['--patch', patch])
    const child = spawn(nodeExecutable(), [this.bin, '--profile', 'sdk', ...patchArgs], {
      cwd: this.options.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim() !== '') this.handlers.onNotice(line.trim())
      }
    })
    child.on('exit', (code) => {
      // A superseded process (restart) must not look like a crash.
      if (generation !== this.generation) return
      this.closed = true
      for (const waiter of this.pending.values()) waiter.reject(new Error('harness exited'))
      this.pending.clear()
      if (this.closing) return
      this.handlers.onNotice(`harness exited with code ${code}`)
      this.handlers.onCrash?.()
    })
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line === '') continue
      try { this.onFrame(JSON.parse(line) as Record<string, unknown>) } catch { /* partial or bad frame */ }
    }
  }

  private onFrame(frame: Record<string, unknown>): void {
    const id = frame.id
    const method = frame.method
    if (typeof id === 'number' && method === undefined) {
      const waiter = this.pending.get(id)
      if (waiter === undefined) return
      this.pending.delete(id)
      if (frame.error !== undefined) waiter.reject(new Error(JSON.stringify(frame.error)))
      else waiter.resolve(frame.result)
      return
    }
    if (typeof method === 'string' && id !== undefined) {
      void this.handlers
        .onServerRequest(method, (frame.params ?? {}) as Record<string, unknown>)
        .then(result => this.write({ jsonrpc: '2.0', id, result }))
        .catch(() => this.write({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: 'client failed to answer' },
        }))
      return
    }
    const params = (frame.params ?? {}) as Record<string, any>
    switch (method) {
      case 'session.event':
        if (params.sessionId === this.sessionId) this.handlers.onEvent(params.event as SessionEvent)
        break
      case 'session.status':
        if (params.sessionId === this.sessionId) {
          this.handlers.onStatus(params.status === 'running' ? 'running' : 'idle')
        }
        break
      case 'session.query.completed':
        if (params.sessionId === this.sessionId) {
          this.handlers.onNotice(`turn finished: ${params.finishReason ?? 'completed'}`)
        }
        break
      case 'subagent.started':
        if (params.parentSessionId === this.sessionId) this.handlers.onSubagent('started', params)
        break
      case 'subagent.finished':
        if (params.parentSessionId === this.sessionId) this.handlers.onSubagent('finished', params)
        break
      default:
        break
    }
  }

  private write(payload: unknown): void {
    if (this.closed) return
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private request(method: string, params: unknown, timeoutMs = 120_000): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
      this.write({ jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (this.pending.delete(id)) rejectPromise(new Error(`timeout: ${method}`))
      }, timeoutMs)
    })
  }

  private initialize(): Promise<unknown> {
    return this.request('initialize', {
      cwd: this.options.cwd,
      provider: this.options.provider ?? 'deepseek-official',
      model: this.options.model ?? 'deepseek-flash',
      ...(this.options.reasoningEffort === undefined ? {} : { reasoningEffort: this.options.reasoningEffort }),
      approvalRequests: true,
      capabilities: { userQuestions: true },
    })
  }

  async start(): Promise<void> {
    await this.initialize()
    if (this.options.resumeId !== undefined) await this.resume(this.options.resumeId)
  }

  async query(text: string, images: Array<{ data: string; mimeType: string; name?: string }> = []): Promise<void> {
    const contentBlocks: unknown[] = [{ type: 'text', text }]
    for (const image of images) {
      contentBlocks.push({
        type: 'image',
        data: image.data,
        mimeType: image.mimeType,
        ...(image.name === undefined ? {} : { name: image.name }),
      })
    }
    await this.request('session/query', {
      sessionId: this.sessionId,
      contentBlocks,
    })
    this.sessionKnown = true
  }

  async resume(sessionId: string): Promise<void> {
    await this.request('session/resume', { sessionId })
    this.sessionId = sessionId
    this.sessionKnown = true
  }

  /** Start a fresh session id; the next prompt creates it lazily. */
  newSession(): void {
    this.sessionId = `tui-${Date.now()}`
    this.sessionKnown = false
  }

  /** Update child-process environment before a restart (e.g. a new API key). */
  updateEnv(patch: Record<string, string>): void {
    for (const [key, value] of Object.entries(patch)) {
      this.env[key] = value
      process.env[key] = value
    }
  }

  /** Select the provider route used by the next initialize/restart. */
  setModel(model: string): void {
    this.options.model = model
  }

  /** Select the reasoning effort used by the next initialize/restart. */
  setEffort(effort: string): void {
    this.options.reasoningEffort = effort
  }

  /** Replace extra profile patches used on the next spawn/restart. */
  setPatches(patches: string[]): void {
    this.options.patches = patches
  }

  /** Kill and respawn the harness, then re-initialize and reopen the session. */
  async restart(): Promise<void> {
    this.generation += 1
    this.closing = true
    try { this.child.kill() } catch { /* already gone */ }
    this.closing = false
    this.spawnChild()
    await this.initialize()
    if (this.sessionKnown) {
      try { await this.resume(this.sessionId) } catch { /* a fresh session is created lazily */ }
    }
  }

  /** Test hook: simulate an unexpected harness exit. */
  crash(): void {
    try { this.child.kill() } catch { /* ignore */ }
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closing = true
    try {
      await Promise.race([
        this.request('shutdown', {}, 2000),
        new Promise(resolveWait => setTimeout(resolveWait, 2000)),
      ])
    } catch { /* the process may already be gone */ }
    this.child.kill()
  }
}
