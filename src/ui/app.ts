/**
 * ashcode — block-based transcript, modals, markdown, tools, search.
 *
 * The view is a single TextRenderable whose content is a StyledText built from
 * renderBlocks(): everything shown is projected from DSH session events.
 */
import { StyledText, TextRenderable, createCliRenderer, createTextAttributes, type TextChunk } from '@opentui/core'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { StdioSdkPort, type SessionEvent } from '../runtime/stdio-sdk.ts'
import { makePalette } from './theme.ts'
import { t, describeLang, getLang, resolveLang, setLang, type Lang } from './i18n.ts'
import { textWidth, type Span } from './markdown.ts'
import {
  planFromTool, renderBlocks, renderModal,
  type Block, type ModalSpec, type RenderContext, type RLine, type ToolBlock,
} from './render.ts'

const cwd = process.cwd()
const appRootDir = resolve((import.meta as unknown as { dir: string }).dir, '../..')
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(appRootDir, 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? ''
  } catch { return '' }
})()
const palette = makePalette(process.env.ASHCODE_THEME)
const debugEnabled = process.env.ASHCODE_DEBUG !== undefined
const PAD = 2

const debug = (message: string): void => {
  if (!debugEnabled) return
  try { appendFileSync('.tui-debug.log', `${message}\n`) } catch { /* ignore */ }
}

/** `--home <path>` beats `ASHCODE_HOME`, which beats the context default. */
function resolveHome(): string {
  const index = process.argv.indexOf('--home')
  if (index >= 0 && process.argv[index + 1] !== undefined) return resolve(process.argv[index + 1]!)
  if (process.env.ASHCODE_HOME !== undefined) return process.env.ASHCODE_HOME
  return cwd === appRootDir ? resolve(cwd, '.dsh-home') : join(homedir(), '.ashcode')
}

const dshHome = resolveHome()
const isolatedHome = process.env.ASHCODE_HOME === undefined && !process.argv.includes('--home')

// Language: ASHCODE_LANG wins, otherwise the saved preference, otherwise English.
setLang(resolveLang())
if (process.env.ASHCODE_LANG === undefined) loadSettings()

/** `<home>/tui/settings.json` holds UI preferences such as the language. */
function settingsFile(): string {
  return join(dshHome, 'tui', 'settings.json')
}

function loadSettings(): void {
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf8')) as { lang?: string }
    if (raw.lang === 'zh' || raw.lang === 'en') setLang(raw.lang)
  } catch { /* first run or unreadable: keep the default */ }
}

function saveSettings(): void {
  try {
    mkdirSync(join(dshHome, 'tui'), { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify({ lang: getLang() }, null, 2))
  } catch { /* best effort */ }
}

interface Question {
  id: string
  question: string
  detail?: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

interface AskAnswerItem { id: string; selected: string[]; custom?: string }

type Panel =
  | { kind: 'approval'; toolName: string; reason?: string; selected: number; resolve(outcome: 'allowed-once' | 'rejected' | 'cancelled'): void }
  | {
    kind: 'question'
    questions: Question[]
    index: number
    answers: AskAnswerItem[]
    selected: number
    chosen: Set<number>
    custom: string
    resolve(result: unknown): void
  }

const blocks: Block[] = []
const state = {
  busy: false,
  note: 'connecting...',
  sessionId: '',
  title: '',
  plan: false,
  tools: 0,
  startedAt: 0,
  pending: undefined as Panel | undefined,
  scroll: 0,
  toolsExpanded: false,
  showThinking: false,
  /** Latest todo_write snapshot (whole-list replacement, as the tool defines it). */
  todos: [] as Array<{ content: string; status: string }>,
  /** Coarse turn phase, shown next to the header spinner. */
  phase: '' as '' | 'analyzing' | 'thinking' | 'tool' | 'responding',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  model: process.env.ASHCODE_MODEL ?? 'deepseek-flash',
  effort: process.env.ASHCODE_EFFORT ?? 'high',
  team: process.env.ASHCODE_TEAM === '1',
  preset: process.env.ASHCODE_PERMISSION_MODE ?? 'workspace-write',
  turns: 0,
  steps: 0,
  lastTurnMs: 0,
  turnOutputStart: 0,
  lastTurnOutput: 0,
  contextWindow: 0,
  lastUsageTokens: 0,
  sidebar: false,
}

let composer: string[] = ['']
/** Column offsets (within the composer's border line) of the clickable stop button. */
let stopHit: { start: number; end: number } | undefined
/** Row index of the composer's bottom border in the last rendered frame. */
let composerBottomRow = -1
let cursorLine = 0
let cursorCol = 0
let quitArmedAt = 0
let completionIndex = 0
const attachments: Array<{ name: string; mimeType: string; data: string }> = []
let history: string[] = []
let historyIndex = -1
let started = false
let pendingPrompt: string | undefined
let replaying = false
let recovering = false
let lastAssistantId = ''
let search: { active: boolean; query: string } = { active: false, query: '' }

interface PickerItem { id: string; title: string; at: number }
let picker: { items: PickerItem[]; selected: number; deleteArmed: boolean } | undefined
let chooser: { kind: 'model' | 'effort'; items: string[]; selected: number } | undefined
let rename: { id: string; value: string } | undefined
let keyInput: { value: string } | undefined

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  // Mouse reporting is on by default; set ASHCODE_MOUSE=0 to disable it when a
  // terminal cannot recover cleanly from an abrupt exit.
  useMouse: process.env.ASHCODE_MOUSE !== '0',
})
const view = new TextRenderable(renderer, { content: '', fg: palette.fg, bg: palette.bg, selectable: true })
renderer.root.add(view)

// Without this the transcript keeps the layout it was drawn with, so narrowing
// the terminal simply clips the header and status lines until the next event.
renderer.on('resize', () => {
  scheduleRedraw()
})

const contentWidth = (): number => {
  const sidebarWidth = state.sidebar ? 25 : 0
  return Math.max(24, Math.min(100, renderer.width - PAD * 2 - sidebarWidth))
}
const layoutWidth = (): number => Math.max(40, Math.min(100, renderer.width - PAD * 2))

let sidebarItems: PickerItem[] = []

function toChunk(text: string, span: Partial<Span> = {}): TextChunk {
  return {
    __isChunk: true,
    text,
    ...(span.fg === undefined ? {} : { fg: span.fg }),
    ...(span.bg === undefined ? {} : { bg: span.bg }),
    ...(span.link === undefined ? {} : { link: span.link }),
    attributes: createTextAttributes({
      bold: span.bold === true,
      dim: span.dim === true,
      italic: span.italic === true,
    }),
  } as TextChunk
}

function lineChunks(line: RLine, width: number): TextChunk[] {
  const chunks: TextChunk[] = [toChunk(' '.repeat(PAD), {})]
  for (const span of line.spans) chunks.push(toChunk(span.text, span))
  const used = PAD + line.spans.reduce((sum, span) => sum + textWidth(span.text), 0)
  if (used < width) chunks.push(toChunk(' '.repeat(Math.max(0, width - used)), {}))
  chunks.push(toChunk('\n', {}))
  return chunks
}

const MODEL_LABELS: Record<string, string> = {
  'deepseek-flash': 'V4.1-Flash',
  'deepseek-v4-pro': 'V4-Pro',
}
const modelLabel = (model: string): string => MODEL_LABELS[model] ?? model

const teamPatchPath = join(dshHome, 'tui', 'team.yml')
const titlesPath = join(dshHome, 'tui', 'titles.json')
function loadTitles(): Record<string, string> {
  try { return JSON.parse(readFileSync(titlesPath, 'utf8')) as Record<string, string> } catch { return {} }
}
let sessionTitles = loadTitles()
function saveTitles(): void {
  try {
    mkdirSync(dirname(titlesPath), { recursive: true })
    writeFileSync(titlesPath, JSON.stringify(sessionTitles, null, 2))
  } catch { /* best effort */ }
}
const titleOf = (item: { id: string; title: string }): string => sessionTitles[item.id] ?? item.title

/** Write or remove the team-mode overlay consumed by `--patch`. */
function writeTeamPatch(enabled: boolean): void {
  if (!enabled) {
    if (existsSync(teamPatchPath)) rmSync(teamPatchPath, { force: true })
    return
  }
  mkdirSync(dirname(teamPatchPath), { recursive: true })
  writeFileSync(teamPatchPath, [
    '- id: agent-team',
    '  config:',
    '    defaultEnabled: true',
    '    maxTasks: 256',
    '',
  ].join('\n'))
}

if (state.team) writeTeamPatch(true)

function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Tokens, cache hit ratio, and (optionally) cost, e.g. `12.3k↑ 4.1k↓ 78%c $0.002`. */
function usageSummary(): string {
  const usage = state.usage
  const totalInput = usage.input + usage.cacheRead + usage.cacheWrite
  if (totalInput === 0 && usage.output === 0) return ''
  const parts = [`${fmtTokens(usage.input)}↑`, `${fmtTokens(usage.output)}↓`]
  if (totalInput > 0) parts.push(`${Math.round((usage.cacheRead / totalInput) * 100)}%c`)
  const priceIn = Number(process.env.ASHCODE_PRICE_INPUT ?? '')
  const priceCached = Number(process.env.ASHCODE_PRICE_CACHE ?? process.env.ASHCODE_PRICE_INPUT ?? '')
  const priceOut = Number(process.env.ASHCODE_PRICE_OUTPUT ?? '')
  if (Number.isFinite(priceIn) && Number.isFinite(priceOut) && (priceIn > 0 || priceOut > 0)) {
    const cached = Number.isFinite(priceCached) ? priceCached : priceIn
    const cost = (usage.input * priceIn + (usage.cacheRead + usage.cacheWrite) * cached + usage.output * priceOut) / 1_000_000
    parts.push(`$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`)
  }
  return parts.join(' ')
}

/** One-line todo summary, mirroring DSH's task panel: done/total plus the active item. */
function todoLine(width: number): RLine {
  const total = state.todos.length
  const done = state.todos.filter(item => item.status === 'completed').length
  const active = state.todos.find(item => item.status === 'in_progress')
  const pending = state.todos.filter(item => item.status === 'pending').length
  const tail = active !== undefined
    ? t('todoActive', active.content)
    : pending > 0 ? t('todoPending', pending) : t('todoDone')
  return {
    spans: [{
      text: clipDisplay(`${t('todoPrefix', done, total)}${tail}`, width),
      fg: active !== undefined ? palette.accent : palette.dim,
    }],
  }
}

function headerLine(width: number): RLine {
  const phaseLabel = state.phase === 'analyzing' ? t('phaseAnalyzing')
    : state.phase === 'thinking' ? t('phaseThinking')
      : state.phase === 'tool' ? t('phaseTool')
        : state.phase === 'responding' ? t('phaseResponding') : ''
  const busyText = state.busy
    ? `working ${((Date.now() - state.startedAt) / 1000).toFixed(0)}s${phaseLabel === '' ? '' : ` · ${phaseLabel}`}`
    : 'idle'
  const mode = state.plan ? 'PLAN' : 'BUILD'
  const spans: Span[] = [
    { text: `ashcode  ·  ${modelLabel(state.model)}  ·  ${state.effort}  ·  `, fg: palette.accent, bold: true },
    { text: mode, fg: state.plan ? palette.warn : palette.sys, bold: true },
  ]
  if (state.team) {
    spans.push({ text: '  ·  ', fg: palette.dim })
    spans.push({ text: 'TEAM', fg: palette.ok, bold: true })
  }
  spans.push({ text: `  ·  ${busyText}`, fg: palette.dim })
  const used = spans.reduce((sum, span) => sum + textWidth(span.text), 0)
  const right = usageSummary() || `${state.tools} tools`
  const gap = Math.max(1, width - used - textWidth(right))
  spans.push({ text: ' '.repeat(gap), fg: palette.dim })
  spans.push({ text: right, fg: palette.dim })
  return { spans }
}

function statusLine(width: number): RLine {
  const left = state.note
  const presetLabel = (preset: string): string => {
    if (preset === 'read-only') return t('presetReadOnly')
    if (preset === 'workspace-write') return t('presetWorkspaceWrite')
    if (preset === 'danger-full-access') return t('presetDangerFullAccess')
    return preset
  }
  const rawName = sessionTitles[state.sessionId] ?? state.title
  const contextPct = state.contextWindow > 0
    ? Math.min(999, Math.round((state.lastUsageTokens / state.contextWindow) * 100))
    : 0
  let tokensPerSec = 0
  if (state.busy && state.startedAt > 0) {
    const elapsed = (Date.now() - state.startedAt) / 1000
    if (elapsed >= 1) tokensPerSec = Math.max(0, state.usage.output - state.turnOutputStart) / elapsed
  } else if (state.lastTurnMs > 0) {
    tokensPerSec = state.lastTurnOutput / (state.lastTurnMs / 1000)
  }
  let groups = [
    t('statusSession', rawName === '' ? t('untitled') : clipDisplay(rawName, 12)),
    t('statusPermission', presetLabel(state.preset)),
    ...(APP_VERSION === '' ? [] : [t('statusVersion', APP_VERSION)]),
    ...(contextPct > 0 ? [t('statusContext', contextPct)] : []),
    t('statusTurn', state.turns),
    t('statusStep', state.steps),
    t('statusTool', state.tools),
    ...(tokensPerSec >= 1 ? [t('statusSpeed', Math.round(tokensPerSec))] : []),
  ]
  const fits = (text: string): boolean => textWidth(left) + 1 + textWidth(text) <= width
  let right = groups.join(' · ')
  while (groups.length > 3 && !fits(right)) {
    groups = groups.slice(0, -1)
    right = groups.join(' · ')
  }
  if (!fits(right)) {
    const shortened = rawName === '' ? t('untitled') : clipDisplay(rawName, 6)
    groups = [t('statusSession', shortened), ...groups.slice(1)]
    right = groups.join(' · ')
  }
  if (!fits(right)) groups = [t('statusSession', rawName === '' ? t('untitled') : clipDisplay(rawName, 3))]
  right = groups.join(' · ')
  const hints = `${state.scroll > 0 ? `  ↑${state.scroll}` : ''}${search.active ? `  /${search.query}` : ''}`
  if (hints !== '' && fits(right + hints)) right += hints
  const gap = Math.max(1, width - textWidth(left) - textWidth(right))
  return {
    spans: [
      { text: left.slice(0, 60), fg: palette.dim },
      { text: ' '.repeat(gap), fg: palette.dim },
      { text: right, fg: search.active ? palette.warn : palette.dim },
    ],
  }
}

function wrapComposer(text: string, width: number): string[] {
  if (textWidth(text) <= width) return [text]
  const rows: string[] = []
  let row = ''
  let used = 0
  for (const char of text) {
    const size = textWidth(char)
    if (used + size > width) { rows.push(row); row = ''; used = 0 }
    row += char
    used += size
  }
  if (row !== '') rows.push(row)
  return rows
}

function padTo(text: string, width: number): string {
  const used = textWidth(text)
  return used >= width ? text : text + ' '.repeat(width - used)
}

interface ComposerRow { text: string; start: number; end: number }

/** Wrap one logical input line and remember character offsets for the cursor. */
function wrapWithOffsets(text: string, width: number): ComposerRow[] {
  if (text === '') return [{ text: '', start: 0, end: 0 }]
  const rows: ComposerRow[] = []
  let row = ''
  let start = 0
  let used = 0
  for (const char of text) {
    const size = textWidth(char)
    if (used + size > width && row !== '') {
      rows.push({ text: row, start, end: start + row.length })
      start += row.length
      row = ''
      used = 0
    }
    row += char
    used += size
  }
  rows.push({ text: row, start, end: start + row.length })
  return rows
}

function composerText(): string {
  return composer.join('\n')
}

function resetComposer(): void {
  composer = ['']
  cursorLine = 0
  cursorCol = 0
}

function setComposer(text: string): void {
  composer = text.split('\n')
  if (composer.length === 0) composer = ['']
  cursorLine = composer.length - 1
  cursorCol = (composer[cursorLine] ?? '').length
}

function insertText(text: string): void {
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  const line = composer[cursorLine] ?? ''
  const before = line.slice(0, cursorCol)
  const after = line.slice(cursorCol)
  if (parts.length === 1) {
    composer[cursorLine] = before + (parts[0] ?? '') + after
    cursorCol += (parts[0] ?? '').length
    return
  }
  composer.splice(cursorLine, 1, before + (parts[0] ?? ''), ...parts.slice(1, -1), (parts[parts.length - 1] ?? '') + after)
  cursorLine += parts.length - 1
  cursorCol = (parts[parts.length - 1] ?? '').length
}

function backspaceAt(): void {
  const line = composer[cursorLine] ?? ''
  if (cursorCol > 0) {
    composer[cursorLine] = line.slice(0, cursorCol - 1) + line.slice(cursorCol)
    cursorCol -= 1
    return
  }
  if (cursorLine > 0) {
    const previous = composer[cursorLine - 1] ?? ''
    composer[cursorLine - 1] = previous + line
    composer.splice(cursorLine, 1)
    cursorLine -= 1
    cursorCol = previous.length
  }
}

function deleteAt(): void {
  const line = composer[cursorLine] ?? ''
  if (cursorCol < line.length) {
    composer[cursorLine] = line.slice(0, cursorCol) + line.slice(cursorCol + 1)
    return
  }
  if (cursorLine + 1 < composer.length) {
    composer[cursorLine] = line + (composer[cursorLine + 1] ?? '')
    composer.splice(cursorLine + 1, 1)
  }
}

function moveCursor(deltaLine: number, deltaCol: number): void {
  if (deltaLine !== 0) {
    cursorLine = Math.min(composer.length - 1, Math.max(0, cursorLine + deltaLine))
    cursorCol = Math.min(cursorCol, (composer[cursorLine] ?? '').length)
    return
  }
  const line = composer[cursorLine] ?? ''
  if (deltaCol < 0) {
    if (cursorCol > 0) cursorCol -= 1
    else if (cursorLine > 0) {
      cursorLine -= 1
      cursorCol = (composer[cursorLine] ?? '').length
    }
    return
  }
  if (cursorCol < line.length) cursorCol += 1
  else if (cursorLine + 1 < composer.length) {
    cursorLine += 1
    cursorCol = 0
  }
}

function composerLines(width: number): RLine[] {
  const inner = Math.max(10, width - 4)
  const rows: Array<{ text: string; cursorAt: number; placeholder: boolean }> = []
  if (composer.length === 1 && composer[0] === '') {
    rows.push({ text: t('composerPlaceholder'), cursorAt: 0, placeholder: true })
  } else {
    composer.forEach((text, lineIndex) => {
      const wrapped = wrapWithOffsets(text, inner)
      wrapped.forEach((row, rowIndex) => {
        const isLastRow = rowIndex === wrapped.length - 1
        let cursorAt = -1
        if (lineIndex === cursorLine && cursorCol >= row.start && cursorCol <= row.end) {
          if (!(cursorCol === row.end && !isLastRow)) cursorAt = cursorCol - row.start
        }
        rows.push({ text: row.text, cursorAt, placeholder: false })
      })
    })
  }
  // DSH's composer starts two lines tall; keep the same minimum so the box does
  // not visibly grow the moment the first character lands.
  while (rows.length < 2) rows.push({ text: '', cursorAt: -1, placeholder: false })

  const enterMode = process.env.ASHCODE_ENTER === 'newline' ? 'newline' : 'send'
  const hint = enterMode === 'send' ? t('composerHintSend') : t('composerHintNewline')
  const left = t('composerLabel')
  const right = ` ${hint} ─╮`
  const dashes = Math.max(0, width - textWidth(left) - textWidth(right))
  const out: RLine[] = [{
    spans: [
      { text: left, fg: palette.accent },
      { text: '─'.repeat(dashes), fg: palette.accent },
      { text: right, fg: palette.dim },
    ],
  }]

  const visible = rows.slice(-8)
  const hidden = rows.length - visible.length
  if (hidden > 0) out.push({ spans: [{ text: '│ ', fg: palette.accent }, { text: `… +${hidden}`, fg: palette.dim }] })

  for (const row of visible) {
    const color = row.placeholder ? palette.dim : palette.fg
    let text = row.text
    if (row.cursorAt >= 0) {
      const at = Math.min(row.cursorAt, text.length)
      text = `${text.slice(0, at)}▌${text.slice(at)}`
    }
    out.push({
      spans: [
        { text: '│ ', fg: palette.accent },
        { text: padTo(text, inner), fg: color },
        { text: ' │', fg: palette.accent },
      ],
    })
  }
  // While a turn runs, the bottom border carries a clickable stop affordance so
  // the escape hatch is visible instead of only living in --help.
  const stopLabel = t('composerStop')
  const borderWidth = Math.max(0, width - 2)
  const stopWidth = textWidth(stopLabel)
  if (state.busy && stopWidth + 4 <= borderWidth) {
    const dashes = borderWidth - stopWidth
    const leftDashes = Math.floor(dashes / 2)
    stopHit = { start: 1 + leftDashes, end: 1 + leftDashes + stopWidth }
    out.push({
      spans: [
        { text: '╰', fg: palette.accent },
        { text: '─'.repeat(leftDashes), fg: palette.accent },
        { text: stopLabel, fg: palette.err, bold: true },
        { text: '─'.repeat(dashes - leftDashes), fg: palette.accent },
        { text: '╯', fg: palette.accent },
      ],
    })
  } else {
    stopHit = undefined
    out.push({ spans: [{ text: `╰${'─'.repeat(borderWidth)}╯`, fg: palette.accent }] })
  }
  return out
}
let fileCache: { at: number; files: string[] } | undefined
function workspaceFiles(): string[] {
  if (fileCache !== undefined && Date.now() - fileCache.at < 5000) return fileCache.files
  const files: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (files.length > 600 || depth > 4) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (files.length > 600) return
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.dsh-home' || entry.name === 'dist') continue
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path, depth + 1)
      else files.push(relative(cwd, path).replace(/\\/g, '/'))
    }
  }
  walk(cwd, 0)
  fileCache = { at: Date.now(), files }
  return files
}

function completionItems(): string[] {
  const text = composer.join('\n')
  const atMatch = /(?:^|\s)@([\w./-]*)$/.exec(text)
  if (atMatch !== null) {
    const prefix = atMatch[1] ?? ''
    return workspaceFiles()
      .filter(file => file.toLowerCase().includes(prefix.toLowerCase()))
      .slice(0, 6)
      .map(file => `@${file}`)
  }
  if (text.startsWith('/') && !text.includes(' ')) {
    const commands = ['/help', '/new', '/sessions', '/resume ', '/model ', '/effort ', '/team ', '/key', '/plan', '/plan off', '/language ']
    return commands.filter(command => command.startsWith(text)).slice(0, 6)
  }
  return []
}

function modalSpec(): ModalSpec | undefined {
  const panel = state.pending
  if (panel === undefined) return undefined
  if (panel.kind === 'approval') {
    return {
      title: `Approval · ${panel.toolName}`,
      detail: [`approval: ${panel.toolName}`, ...(panel.reason === undefined ? [] : [panel.reason])],
      options: [{ label: 'Allow once', tone: 'ok' }, { label: 'Reject', tone: 'err' }, { label: 'Cancel' }],
      selected: panel.selected,
      hint: '↑/↓ choose · 1-3 jump · Enter confirm · Esc cancel',
    }
  }
  const question = panel.questions[panel.index]
  if (question === undefined) return undefined
  const step = panel.questions.length > 1 ? ` [${panel.index + 1}/${panel.questions.length}]` : ''
  const options = (question.options ?? []).map((option, index) => ({
    label: option.label,
    tone: (question.multiSelect === true ? panel.chosen.has(index) : index === panel.selected)
      ? 'ok' as const : 'normal' as const,
  }))
  return {
    title: `Question${step}`,
    detail: [question.question, ...(question.detail === undefined ? [] : [question.detail])],
    options: options.length === 0 ? [{ label: '(type an answer below)' }] : options,
    selected: panel.selected,
    hint: question.multiSelect === true
      ? '↑/↓ move · Space toggle · Enter next · Esc cancel'
      : '↑/↓ select · type "other" · Enter next · Esc cancel',
    footer: panel.custom === '' ? undefined : `other: ${panel.custom}`,
  }
}

function sessionDir(sessionId: string): string | undefined {
  const base = join(dshHome, 'sessions')
  if (!existsSync(base)) return undefined
  for (const workspace of readdirSync(base)) {
    const dir = join(base, workspace, sessionId)
    if (existsSync(dir)) return dir
  }
  return undefined
}

function loadSessionItems(): PickerItem[] {
  return sessionDirs().map((id) => {
    const dir = sessionDir(id)
    let at = 0
    let title = ''
    if (dir !== undefined) {
      at = statSync(dir).mtimeMs
      const file = join(dir, 'session.v4.jsonl.zstd')
      if (existsSync(file)) {
        for (const event of decodeSessionLog(file)) {
          if (event.type === 'session/title') title = String((event.data as Record<string, unknown> | undefined)?.title ?? '')
        }
      }
    }
    return { id, title, at }
  }).sort((a, b) => b.at - a.at).slice(0, 12)
}

function openSessions(): void {
  picker = { items: loadSessionItems(), selected: 0, deleteArmed: false }
  redraw()
}

function refreshSidebar(): void {
  sidebarItems = loadSessionItems()
}

function pickerModal(): ModalSpec | undefined {
  if (picker === undefined) return undefined
  if (picker.items.length === 0) {
    return {
      title: 'Sessions',
      detail: [t('sessionsEmpty')],
      options: [{ label: t('newSession') }],
      selected: 0,
      hint: t('sessionsHint'),
    }
  }
  const start = Math.max(0, Math.min(picker.selected - 3, picker.items.length - 8))
  const windowItems = picker.items.slice(start, start + 8)
  return {
    title: `Sessions (${picker.items.length})`,
    detail: [t('sessionsSwitchHint')],
    options: windowItems.map(item => ({
      label: titleOf(item) === '' ? '(untitled)' : titleOf(item)
    })),
    selected: picker.selected - start,
    hint: picker.deleteArmed ? t('deleteArmed', picker.items[picker.selected]?.id ?? '') : t('renameHint'),
  }
}

function keyModal(): ModalSpec | undefined {
  if (keyInput === undefined) return undefined
  const masked = keyInput.value === '' ? '(empty)' : '*'.repeat(Math.min(48, keyInput.value.length))
  return {
    title: 'API Key',
    detail: [t('keyDetail')],
    options: [{ label: t('keySave'), tone: 'ok' }],
    selected: 0,
    hint: t('keyHint'),
    footer: `key: ${masked}`,
  }
}

function writeEnvLocal(key: string): void {
  const file = join(appRootDir, '.env.local')
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : []
  const kept = lines.filter(line => !/^\s*DEEPSEEK_API_KEY\s*=/.test(line))
  kept.push(`DEEPSEEK_API_KEY=${key}`)
  writeFileSync(file, `${kept.join('\n').trimEnd()}\n`)
}

async function saveApiKey(): Promise<void> {
  const value = keyInput?.value.trim() ?? ''
  keyInput = undefined
  if (value === '') { redraw(); return }
  try { writeEnvLocal(value) } catch (error) {
    pushBlock({ kind: 'error', text: `cannot write .env.local: ${String(error)}` })
    return
  }
  port.updateEnv({ DEEPSEEK_API_KEY: value })
  pushBlock({ kind: 'system', text: 'API key saved · restarting harness' })
  await recoverHarness('crash')
}

async function switchSession(id: string): Promise<void> {
  picker = undefined
  if (id === state.sessionId) {
    state.note = 'already current'
    redraw()
    return
  }
  try {
    await port.resume(id)
    state.sessionId = id
    blocks.length = 0
    state.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    state.plan = false
    state.scroll = 0
    refreshSidebar()
    pushBlock({ kind: 'system', text: `resumed ${id}` })
    replaySession(id)
  } catch (error) {
    const message = String(error)
    if (message.includes('already open')) {
      state.sessionId = id
      pushBlock({ kind: 'system', text: 'session already open' })
      replaySession(id)
    } else {
      pushBlock({ kind: 'error', text: `resume failed: ${message}` })
    }
  }
}

function newSession(): void {
  port.newSession()
  state.sessionId = port.sessionId
  blocks.length = 0
  state.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  state.plan = false
  state.scroll = 0
  picker = undefined
  refreshSidebar()
  pushBlock({ kind: 'system', text: `new session ${state.sessionId}` })
  redraw()
}

async function switchModel(name: string): Promise<void> {
  const next = name.trim()
  if (next === '') return
  state.model = next
  port.setModel(next)
  pushBlock({ kind: 'system', text: `model → ${next} · restarting harness` })
  try {
    await port.restart()
    newSession()
  } catch (error) {
    state.note = 'model switch failed'
    pushBlock({ kind: 'error', text: `model switch failed: ${String(error)}` })
  }
}

async function switchEffort(level: string): Promise<void> {
  const next = level.trim().toLowerCase()
  if (!['off', 'low', 'high', 'max'].includes(next)) {
    pushBlock({ kind: 'error', text: `unknown effort: ${level} (off|low|high|max)` })
    return
  }
  state.effort = next
  port.setEffort(next)
  pushBlock({ kind: 'system', text: `effort → ${next} · restarting harness` })
  try {
    await port.restart()
    newSession()
  } catch (error) {
    state.note = 'effort switch failed'
    pushBlock({ kind: 'error', text: `effort switch failed: ${String(error)}` })
  }
}

function renameModal(): ModalSpec | undefined {
  if (rename === undefined) return undefined
  return {
    title: 'Rename session',
    detail: [rename.id],
    options: [{ label: 'Save', tone: 'ok' }],
    selected: 0,
    hint: 'Enter save / Esc cancel',
    footer: 'name: ' + (rename.value === '' ? '(empty - restores original)' : rename.value),
  }
}
function chooserModal(): ModalSpec | undefined {
  if (chooser === undefined) return undefined
  const current = chooser.kind === 'model' ? state.model : state.effort
  return {
    title: chooser.kind === 'model' ? 'Model' : 'Reasoning effort',
    detail: [t('chooserHint')],
    options: chooser.items.map(item => ({
      label: item === current ? `● ${item}` : `  ${item}`,
      tone: item === current ? 'ok' as const : 'normal' as const,
    })),
    selected: chooser.selected,
    hint: '',
  }
}

function openChooser(kind: 'model' | 'effort'): void {
  const items = kind === 'model'
    ? ['deepseek-flash', 'deepseek-v4-pro']
    : ['off', 'low', 'high', 'max']
  const current = kind === 'model' ? state.model : state.effort
  const index = Math.max(0, items.indexOf(current))
  chooser = { kind, items, selected: index }
  redraw()
}

function applyChooser(): void {
  if (chooser === undefined) return
  const item = chooser.items[chooser.selected]
  const kind = chooser.kind
  chooser = undefined
  if (item === undefined) { redraw(); return }
  if (kind === 'model') void switchModel(item)
  else void switchEffort(item)
}

async function switchTeam(enabled: boolean): Promise<void> {
  state.team = enabled
  try { writeTeamPatch(enabled) } catch (error) {
    pushBlock({ kind: 'error', text: `cannot write team patch: ${String(error)}` })
    return
  }
  port.setPatches(enabled ? [teamPatchPath] : [])
  pushBlock({ kind: 'system', text: `team ${enabled ? 'on' : 'off'} · restarting harness` })
  try {
    await port.restart()
    newSession()
  } catch (error) {
    state.note = 'team switch failed'
    pushBlock({ kind: 'error', text: `team switch failed: ${String(error)}` })
  }
}

function buildBody(): { lines: RLine[]; width: number } {
  const width = contentWidth()
  const ctx: RenderContext = {
    width,
    palette,
    toolsExpanded: state.toolsExpanded,
    showThinking: state.showThinking,
    search: search.active ? search.query : undefined,
    linkPath: (path: string) => `file:///${resolve(cwd, path).replace(/\\/g, '/')}`,
  }
  return { lines: renderBlocks(blocks, ctx), width }
}

function dimSpan(line: RLine): RLine {
  if (state.pending === undefined) return line
  return { spans: line.spans.map(span => ({ ...span, dim: true })) }
}

/** Truncate to a display width (CJK counts as two cells). */
function clipDisplay(text: string, width: number): string {
  let out = ''
  let used = 0
  for (const char of text) {
    const size = textWidth(char)
    if (used + size > width) break
    out += char
    used += size
  }
  return out
}

function sidebarRow(index: number): RLine {
  const item = sidebarItems[index]
  if (item === undefined) return { spans: [{ text: ' '.repeat(22) }] }
  const current = item.id === state.sessionId
  const label = clipDisplay(titleOf(item) === '' ? item.id.slice(-10) : titleOf(item), 19)
  return {
    spans: [
      { text: current ? '▸ ' : '  ', fg: current ? palette.accent : palette.dim },
      { text: padTo(label, 20), fg: current ? palette.fg : palette.dim, bold: current },
    ],
  }
}

function redraw(): void {
  const frameWidth = layoutWidth()
  const body = buildBody()
  const lines = body.lines
  const header = headerLine(frameWidth)
  const status = statusLine(frameWidth)
  const composerRows = composerLines(frameWidth)
  const modal = keyInput !== undefined ? keyModal()
    : rename !== undefined ? renameModal()
    : state.pending !== undefined ? modalSpec()
      : picker !== undefined ? pickerModal()
        : chooser !== undefined ? chooserModal() : undefined
  const modalLines = modal === undefined ? [] : renderModal(modal, frameWidth, palette)
  const completion = state.pending === undefined ? completionItems() : []
  const completionRows = completion.map((item, index): RLine => ({
    spans: [{
      text: `${' '.repeat(PAD)}${index === Math.min(completionIndex, completion.length - 1) ? '>' : ' '} ${item}`,
      fg: palette.accent,
      bold: index === Math.min(completionIndex, completion.length - 1),
    }],
  }))

  const fixed = 5 + composerRows.length + completionRows.length + modalLines.length + (state.todos.length > 0 ? 1 : 0)
  const page = Math.max(4, renderer.height - fixed)
  const maxScroll = Math.max(0, lines.length - page)
  state.scroll = Math.min(Math.max(0, state.scroll), maxScroll)
  const end = lines.length - state.scroll
  const start = Math.max(0, end - page)
  const visible = lines.slice(start, end)

  debug(`draw scroll=${state.scroll} first=${visible[0]?.spans.map(span => span.text).join('') ?? ''}`)

  const chunks: TextChunk[] = []
  let pushedLines = 0
  const push = (line: RLine): void => {
    chunks.push(...lineChunks(line, PAD + frameWidth))
    pushedLines += 1
  }
  push(header)
  push({ spans: [{ text: '─'.repeat(frameWidth), fg: palette.sep }] })
  if (state.sidebar) {
    for (let index = 0; index < page; index += 1) {
      const side = sidebarRow(index)
      const content = dimSpan(visible[index] ?? { spans: [] })
      push({ spans: [...side.spans, { text: ' │ ', fg: palette.sep }, ...content.spans] })
    }
  } else {
    for (const line of visible) push(dimSpan(line))
    // Pad the transcript area so the status line and composer stay pinned to the
    // bottom instead of sliding down while the first screenful fills up.
    for (let index = visible.length; index < page; index += 1) push({ spans: [{ text: '' }] })
  }
  for (const line of modalLines) push(line)
  for (const line of completionRows) push(line)
  if (quitArmedAt > 0) {
    const banner = t('quitBanner')
    push({ spans: [{ text: padTo(banner, frameWidth), fg: palette.bg, bg: palette.warn, bold: true }] })
  }
  push({ spans: [{ text: '' }] })
  if (state.todos.length > 0) push(todoLine(frameWidth))
  push(status)
  for (const line of composerRows) push(line)
  composerBottomRow = pushedLines - 1
  view.content = new StyledText(chunks)
}

let pendingRedraw: ReturnType<typeof setTimeout> | undefined
function scheduleRedraw(): void {
  if (pendingRedraw !== undefined) return
  pendingRedraw = setTimeout(() => { pendingRedraw = undefined; redraw() }, 40)
}

function pushBlock(block: Block): void {
  blocks.push(block)
  if (blocks.length > 300) blocks.splice(0, blocks.length - 300)
  state.scroll = 0
  scheduleRedraw()
}

/** Seal the trailing reasoning block so its elapsed time stops counting. */
function closeThinking(): void {
  const last = blocks[blocks.length - 1]
  if (last?.kind === 'thinking' && last.endedAt === undefined) last.endedAt = Date.now()
}

function project(event: SessionEvent): void {
  const data = (event.data ?? {}) as Record<string, any>
  switch (event.type) {
    case 'turn/start':
      state.busy = true
      state.turns += 1
      state.turnOutputStart = state.usage.output
      state.startedAt = state.startedAt || Date.now()
      state.note = 'working…'
      state.phase = 'analyzing'
      break
    case 'turn/end':
      state.busy = false
      state.lastTurnMs = state.startedAt > 0 ? Date.now() - state.startedAt : 0
      state.lastTurnOutput = Math.max(0, state.usage.output - state.turnOutputStart)
      state.startedAt = 0
      state.note = 'idle'
      state.phase = ''
      closeThinking()
      break
    case 'step/start':
      state.steps += 1
      break
    case 'session/title':
      if (typeof data.title === 'string') state.title = data.title
      break
    case 'permission/preset':
      if (typeof data.preset === 'string') state.preset = data.preset
      break
    case 'request/context':
      if (typeof data.contextWindow === 'number') state.contextWindow = data.contextWindow
      break
    case 'assistant/message': {
      const usage = data.usage as { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number } | undefined
      if (usage !== undefined) {
        state.usage.input += usage.inputTokens ?? 0
        state.usage.output += usage.outputTokens ?? 0
        state.usage.cacheRead += usage.cacheReadTokens ?? 0
        state.usage.cacheWrite += usage.cacheWriteTokens ?? 0
        state.lastUsageTokens = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0)
          + (usage.cacheWriteTokens ?? 0) + (usage.outputTokens ?? 0)
      }
      const id = String(data.message?.id ?? '')
      const parts: string[] = []
      for (const block of data.message?.content ?? []) {
        if (block.type === 'text' && block.text) parts.push(String(block.text))
        else if (block.type === 'reasoning' && block.text) {
          const text = String(block.text)
          const last = blocks[blocks.length - 1]
          if (last?.kind === 'thinking' && last.endedAt === undefined) {
            last.text += text
            scheduleRedraw()
          } else {
            pushBlock({ kind: 'thinking', text, startedAt: Date.now() })
          }
          state.phase = 'thinking'
        }
      }
      if (parts.length > 0) {
        closeThinking()
        state.phase = 'responding'
        const text = parts.join('\n')
        const last = blocks[blocks.length - 1]
        if (last?.kind === 'assistant' && id !== '' && id === lastAssistantId) last.text += `\n${text}`
        else { pushBlock({ kind: 'assistant', text }); lastAssistantId = id }
        scheduleRedraw()
      }
      break
    }
    case 'user/message': {
      if (!replaying || data.source?.kind !== 'user') break
      const text = (data.content ?? [])
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text?: string }) => String(block.text ?? '')).join('\n').trim()
      if (text !== '') pushBlock({ kind: 'user', text })
      break
    }
    case 'tool/call': {
      state.tools += 1
      state.phase = 'tool'
      const args = (() => {
        try { return JSON.parse(String(data.arguments ?? '{}')) as Record<string, any> } catch { return {} }
      })()
      const callName = String(data.name ?? '')
      if (callName === 'todo_write' && Array.isArray(args.todos)) {
        state.todos = (args.todos as unknown[])
          .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && typeof (item as any).content === 'string')
          .map(item => ({ content: String(item.content), status: String(item.status ?? 'pending') }))
      }
      const tool: ToolBlock = {
        kind: 'tool',
        id: String(data.callId ?? ''),
        name: String(data.name ?? 'tool'),
        args,
        status: 'running',
        result: '',
        startedAt: Date.now(),
        expanded: false,
      }
      const plan = planFromTool(tool)
      if (plan !== undefined) pushBlock(plan)
      else pushBlock(tool)
      break
    }
    case 'tool/result': {
      const callId = String(data.message?.toolCallId ?? '')
      const tool = [...blocks].reverse().find((block): block is ToolBlock => block.kind === 'tool' && block.id === callId)
      if (tool !== undefined) {
        const parts = (data.message?.content ?? []) as Array<{ type: string; text?: string }>
        tool.result = parts.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n').trim()
        tool.status = data.message?.isError === true ? 'error' : 'ok'
        tool.endedAt = Date.now()
        if (tool.status === 'error') tool.expanded = true
      }
      break
    }
    case 'plan/mode':
      state.plan = data.active === true
      state.note = state.plan ? 'plan mode' : 'ready'
      break
    case 'session/title':
      if (typeof data.title === 'string' && data.title !== '') state.title = data.title
      break
    case 'command/done':
      if (typeof data.text === 'string' && data.text !== '' && !/^Plan mode|^Entering plan mode/i.test(data.text)) {
        pushBlock({ kind: 'system', text: data.text })
      }
      break
    default:
      break
  }
  scheduleRedraw()
}

async function recoverHarness(reason: 'crash' | 'cancel'): Promise<void> {
  if (recovering) return
  recovering = true
  state.note = reason === 'cancel' ? 'cancelling…' : 'recovering…'
  scheduleRedraw()
  try {
    await port.restart()
    state.busy = false
    state.note = 'ready'
    pushBlock({ kind: 'system', text: reason === 'cancel' ? 'turn cancelled; session resumed' : 'harness restarted; session resumed' })
  } catch (error) {
    state.note = 'offline'
    pushBlock({ kind: 'error', text: `recovery failed: ${String(error)}` })
  } finally {
    recovering = false
    redraw()
  }
}

async function handleServerRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (method === 'approval/request') {
    const toolName = String(params.toolName ?? 'tool')
    const reason = typeof params.reason === 'string' ? params.reason : undefined
    return new Promise(resolvePromise => {
      state.pending = {
        kind: 'approval',
        toolName,
        reason,
        selected: 0,
        resolve: (outcome) => {
          state.pending = undefined
          pushBlock({ kind: 'system', text: `approval ${outcome} · ${toolName}` })
          resolvePromise({ outcome })
        },
      }
      redraw()
    })
  }
  if (method === 'user-question/ask') {
    const raw = (params.questions ?? []) as Question[]
    const questions = Array.isArray(raw)
      ? raw.filter(item => item !== null && typeof item === 'object' && typeof item.id === 'string')
      : []
    if (questions.length === 0) return { cancelled: true }
    return new Promise(resolvePromise => {
      state.pending = {
        kind: 'question',
        questions,
        index: 0,
        answers: [],
        selected: 0,
        chosen: new Set<number>(),
        custom: '',
        resolve: (result) => {
          state.pending = undefined
          const payload = result as { answers?: AskAnswerItem[]; cancelled?: boolean }
          if (payload.cancelled === true) pushBlock({ kind: 'system', text: 'question skipped' })
          else {
            const summary = (payload.answers ?? [])
              .map(answer => `${answer.id}=${answer.selected.join('|') || '(none)'}`)
              .join(', ')
            pushBlock({ kind: 'system', text: `answered ${summary}` })
          }
          resolvePromise(result)
        },
      }
      redraw()
    })
  }
  return {}
}

const port = new StdioSdkPort(
  { cwd, appRoot: appRootDir, model: state.model, reasoningEffort: state.effort, dshHome, resumeId: parseResumeArg(), patches: state.team ? [teamPatchPath] : [] },
  {
    onEvent: project,
    onNotice: (text) => {
      if (text.startsWith('[')) { debug(`notice ${text}`); return }
      if (text.startsWith('turn finished')) {
        state.busy = false
        state.note = 'idle'
        scheduleRedraw()
        return
      }
      state.note = text.slice(0, 60)
      scheduleRedraw()
    },
    onStatus: (status) => {
      if (status === 'idle') state.busy = false
      scheduleRedraw()
    },
    onSubagent: (kind, info) => {
      const child = String((info as Record<string, unknown>).childSessionId ?? '').slice(-8)
      pushBlock({ kind: 'system', text: kind === 'started' ? `subagent ${child} started` : `subagent ${child} finished` })
    },
    onServerRequest: handleServerRequest,
    onCrash: () => {
      pushBlock({ kind: 'error', text: 'harness exited unexpectedly' })
      void recoverHarness('crash')
    },
  },
)

function parseResumeArg(): string | undefined {
  const index = process.argv.indexOf('--resume')
  if (index >= 0 && process.argv[index + 1] !== undefined) return process.argv[index + 1]
  return undefined
}

function sessionDirs(): string[] {
  const encoded = `--${cwd.replace(/[:\\/]+/g, '-')}--`
  const dir = join(dshHome, 'sessions', encoded)
  if (!existsSync(dir)) return []
  return readdirSync(dir).slice(-20)
}

function decodeSessionLog(file: string): SessionEvent[] {
  const buffer = readFileSync(file)
  const offsets: number[] = []
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (buffer[index] === 0x28 && buffer[index + 1] === 0xb5 && buffer[index + 2] === 0x2f && buffer[index + 3] === 0xfd) offsets.push(index)
  }
  let text = ''
  for (const offset of offsets) {
    try { text += zstdDecompressSync(buffer.subarray(offset)).toString('utf8') } catch { /* torn frame */ }
  }
  const events: SessionEvent[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed = JSON.parse(line) as SessionEvent
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.type === 'string') events.push(parsed)
    } catch { /* torn line */ }
  }
  return events
}

function findSessionLog(sessionId: string): string | undefined {
  const base = join(dshHome, 'sessions')
  if (!existsSync(base)) return undefined
  for (const workspace of readdirSync(base)) {
    const file = join(base, workspace, sessionId, 'session.v4.jsonl.zstd')
    if (existsSync(file)) return file
  }
  return undefined
}

function sessionSummaries(): Array<{ id: string; title: string }> {
  return sessionDirs().map((id) => {
    const file = findSessionLog(id)
    let title = ''
    if (file !== undefined) {
      for (const event of decodeSessionLog(file)) {
        if (event.type === 'session/title') title = String((event.data as Record<string, unknown> | undefined)?.title ?? '')
      }
    }
    return { id, title: title.slice(0, 48) }
  })
}

function replaySession(sessionId: string): void {
  const file = findSessionLog(sessionId)
  if (file === undefined) { pushBlock({ kind: 'system', text: `no local log for ${sessionId}` }); return }
  const events = decodeSessionLog(file)
  replaying = true
  try { for (const event of events) project(event) } finally { replaying = false }
  pushBlock({ kind: 'system', text: `replayed ${events.length} events` })
}

async function runLocalCommand(text: string): Promise<boolean> {
  if (text === '/help') {
    pushBlock({ kind: 'system', text: 'commands: /help /new /sessions /resume <id> /model /effort /team /key /plan · keys: Shift+Tab plan, Ctrl+O tools, Ctrl+F search, Esc cancel' })
    return true
  }
  if (text.startsWith('/attach ')) {
    const target = resolve(cwd, text.slice('/attach '.length).trim())
    const mimes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.gif': 'image/gif',
    }
    const mime = mimes[extname(target).toLowerCase()]
    if (mime === undefined) { pushBlock({ kind: 'error', text: 'only png/jpg/webp/gif can be attached' }); return true }
    if (!existsSync(target)) { pushBlock({ kind: 'error', text: `file not found: ${target}` }); return true }
    const buffer = readFileSync(target)
    if (buffer.length > 8 * 1024 * 1024) { pushBlock({ kind: 'error', text: 'image larger than 8 MiB' }); return true }
    attachments.push({ name: basename(target), mimeType: mime, data: buffer.toString('base64') })
    pushBlock({ kind: 'system', text: t('attachNote', basename(target), Math.round(buffer.length / 1024)) })
    return true
  }
  if (text === '/attach') {
    pushBlock({ kind: 'system', text: 'usage: /attach <path-to-image>' })
    return true
  }
  if (text === '/team') {
    pushBlock({ kind: 'system', text: t('teamNote', state.team ? 'on' : 'off') })
    return true
  }
  if (text === '/team on' || text === '/team off') {
    await switchTeam(text.endsWith('on'))
    return true
  }
  if (text === '/model') {
    openChooser('model')
    return true
  }
  if (text.startsWith('/model ')) {
    await switchModel(text.slice('/model '.length))
    return true
  }
  if (text === '/effort') {
    openChooser('effort')
    return true
  }
  if (text.startsWith('/effort ')) {
    await switchEffort(text.slice('/effort '.length))
    return true
  }
  if (text === '/sessions') {
    openSessions()
    return true
  }
  if (text === '/new') {
    newSession()
    return true
  }
  if (text === '/key') {
    keyInput = { value: '' }
    redraw()
    return true
  }
  if (text.startsWith('/language')) {
    const arg = text.slice('/language'.length).trim().toLowerCase()
    if (arg === 'en' || arg === 'zh') {
      setLang(arg)
      saveSettings()
      pushBlock({ kind: 'system', text: `language: ${describeLang()}` })
    } else {
      pushBlock({ kind: 'system', text: `language: ${describeLang()} · usage /language en|zh` })
    }
    redraw()
    return true
  }
  if (text.startsWith('/resume ')) {
    const id = text.slice('/resume '.length).trim()
    await switchSession(id)
    return true
  }
  return false
}

async function sendPrompt(text: string): Promise<void> {
  if (await runLocalCommand(text)) { redraw(); return }
  if (!text.startsWith('/')) pushBlock({ kind: 'user', text })
  history.push(text)
  historyIndex = -1
  state.busy = true
  state.startedAt = Date.now()
  state.note = 'queued'
  redraw()
  try {
    const pendingImages = attachments.splice(0, attachments.length)
    await port.query(text, pendingImages)
  } catch (error) {
    state.busy = false
    state.note = 'error'
    pushBlock({ kind: 'error', text: `query failed: ${String(error)}` })
  }
}

async function submit(): Promise<void> {
  const text = composerText().trim()
  resetComposer()
  if (text === '') { redraw(); return }
  if (!started) {
    pendingPrompt = text
    state.note = 'harness starting…'
    pushBlock({ kind: 'user', text: `${text} (queued)` })
    return
  }
  await sendPrompt(text)
}

function toggleTools(): void {
  state.toolsExpanded = !state.toolsExpanded
  redraw()
}

async function togglePlan(): Promise<void> {
  if (!started) return
  composer = [state.plan ? '/plan off' : '/plan']
  await submit()
}

function confirmPanel(): void {
  const panel = state.pending
  if (panel === undefined) return
  if (panel.kind === 'approval') {
    panel.resolve(panel.selected === 0 ? 'allowed-once' : panel.selected === 1 ? 'rejected' : 'cancelled')
    return
  }
  const question = panel.questions[panel.index]
  if (question === undefined) { panel.resolve({ cancelled: true }); return }
  const options = question.options ?? []
  const selected = options.length === 0
    ? []
    : question.multiSelect === true
      ? [...panel.chosen].sort((a, b) => a - b).map(index => options[index]!.label)
      : [options[panel.selected]!.label]
  panel.answers.push({ id: question.id, selected, ...(panel.custom === '' ? {} : { custom: panel.custom }) })
  if (panel.index + 1 < panel.questions.length) {
    panel.index += 1
    panel.selected = 0
    panel.chosen.clear()
    panel.custom = ''
    redraw()
    return
  }
  panel.resolve({ answers: panel.answers })
}

function cancelPanel(): void {
  const panel = state.pending
  if (panel === undefined) return
  if (panel.kind === 'approval') panel.resolve('cancelled')
  else panel.resolve({ cancelled: true })
}

function movePanel(delta: number): void {
  const panel = state.pending
  if (panel === undefined) return
  const current = panel.kind === 'question' ? panel.questions[panel.index] : undefined
  const count = panel.kind === 'approval' ? 3 : Math.max(1, current?.options?.length ?? 1)
  panel.selected = (panel.selected + delta + count) % count
  redraw()
}

function applyCompletion(item: string): void {
  const text = composerText()
  if (item.startsWith('/')) { setComposer(item); redraw(); return }
  setComposer(text.replace(/@[\w./-]*$/, item))
  redraw()
}

function emptyComposer(): boolean {
  return composer.length === 1 && composer[0] === ''
}

function historyStep(delta: number): void {
  if (history.length === 0) return
  historyIndex = historyIndex < 0 ? history.length - 1 : Math.min(history.length - 1, Math.max(0, historyIndex + delta))
  setComposer(history[historyIndex] ?? '')
  redraw()
}

function jumpToSearch(): void {
  const query = search.query.toLowerCase()
  if (query === '') return
  const lines = buildBody().lines
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const text = lines[index]!.spans.map(span => span.text).join('').toLowerCase()
    if (text.includes(query)) {
      const page = Math.max(4, renderer.height - 6)
      state.scroll = Math.max(0, lines.length - index - Math.floor(page / 2))
      redraw()
      return
    }
  }
}

renderer.keyInput.on('keypress', (key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }) => {
  if (keyInput !== undefined) {
    if (key.name === 'escape') { keyInput = undefined; redraw(); return }
    if (key.name === 'backspace') { keyInput.value = keyInput.value.slice(0, -1); redraw(); return }
    if (key.name === 'return' || key.name === 'enter') { void saveApiKey(); return }
    if (key.ctrl !== true && key.meta !== true && key.sequence !== undefined
      && key.sequence.length === 1 && !key.sequence.includes('\u001b')) {
      keyInput.value += key.sequence
      redraw()
    }
    return
  }

  if (rename !== undefined) {
    if (key.name === 'escape') { rename = undefined; redraw(); return }
    if (key.name === 'backspace') { rename.value = rename.value.slice(0, -1); redraw(); return }
    if (key.name === 'return' || key.name === 'enter') {
      const name = rename.value.trim()
      if (name === '') delete sessionTitles[rename.id]
      else sessionTitles[rename.id] = name
      saveTitles()
      rename = undefined
      refreshSidebar()
      redraw()
      return
    }
    if (key.ctrl !== true && key.meta !== true && key.sequence !== undefined && key.sequence.length === 1 && !key.sequence.includes('\\u001b')) { rename.value += key.sequence; redraw() }
    return
  }

  if (picker !== undefined) {
    const current = picker.items[picker.selected]
    if (key.name === 'escape') { picker = undefined; redraw(); return }
    if (key.name === 'up') { picker.selected = Math.max(0, picker.selected - 1); picker.deleteArmed = false; redraw(); return }
    if (key.name === 'down') { picker.selected = Math.min(picker.items.length - 1, picker.selected + 1); picker.deleteArmed = false; redraw(); return }
    if (key.name === 'return' || key.name === 'enter') {
      if (current !== undefined) void switchSession(current.id)
      else newSession()
      return
    }
    if (key.sequence === 'r' && current !== undefined) { rename = { id: current.id, value: titleOf(current) }; redraw(); return }
    if (key.sequence === 'n') { newSession(); return }
    if (key.sequence === 'd' && current !== undefined) {
      if (!picker.deleteArmed) { picker.deleteArmed = true; redraw(); return }
      const dir = sessionDir(current.id)
      picker.deleteArmed = false
      if (dir !== undefined) { try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ } }
      const index = picker.selected
      picker.items = picker.items.filter(item => item.id !== current.id)
      picker.selected = Math.max(0, Math.min(index, picker.items.length - 1))
      redraw()
      return
    }
    return
  }

  if (chooser !== undefined) {
    if (key.name === 'escape') { chooser = undefined; redraw(); return }
    if (key.name === 'up') { chooser.selected = Math.max(0, chooser.selected - 1); redraw(); return }
    if (key.name === 'down') { chooser.selected = Math.min(chooser.items.length - 1, chooser.selected + 1); redraw(); return }
    if (key.name === 'return' || key.name === 'enter') { applyChooser(); return }
    if (key.sequence !== undefined && /^[1-9]$/.test(key.sequence)) {
      const index = Number(key.sequence) - 1
      if (index < chooser.items.length) { chooser.selected = index; applyChooser() }
    }
    return
  }

  const panel = state.pending
  if (panel !== undefined) {
    const current = panel.kind === 'question' ? panel.questions[panel.index] : undefined
    if (key.name === 'escape') { cancelPanel(); return }
    if (key.name === 'return' || key.name === 'enter') { confirmPanel(); return }
    if (key.name === 'up') { movePanel(-1); return }
    if (key.name === 'down') { movePanel(1); return }
    if (panel.kind === 'question' && (key.name === 'space' || key.sequence === ' ') && current?.multiSelect === true) {
      if (panel.chosen.has(panel.selected)) panel.chosen.delete(panel.selected)
      else panel.chosen.add(panel.selected)
      redraw()
      return
    }
    if (panel.kind === 'question' && key.sequence !== undefined && /^[0-9]$/.test(key.sequence)) {
      const index = Number(key.sequence) - 1
      if (index >= 0 && index < (current?.options?.length ?? 0)) {
        panel.selected = index
        if (current?.multiSelect === true) {
          if (panel.chosen.has(index)) panel.chosen.delete(index)
          else panel.chosen.add(index)
        }
      }
      redraw()
      return
    }
    if (panel.kind === 'approval' && key.sequence !== undefined && /^[1-3]$/.test(key.sequence)) {
      panel.selected = Number(key.sequence) - 1
      redraw()
      return
    }
    if (panel.kind === 'question' && key.name === 'backspace') {
      panel.custom = panel.custom.slice(0, -1)
      redraw()
      return
    }
    if (panel.kind === 'question' && key.ctrl !== true && key.meta !== true
      && key.sequence !== undefined && key.sequence.length === 1 && !/[0-9]/.test(key.sequence)) {
      panel.custom += key.sequence
      redraw()
    }
    return
  }

  if (search.active) {
    if (key.name === 'escape') { search = { active: false, query: '' }; redraw(); return }
    if (key.name === 'return' || key.name === 'enter') { jumpToSearch(); return }
    if (key.name === 'backspace') { search.query = search.query.slice(0, -1); redraw(); return }
    if (key.ctrl !== true && key.meta !== true && key.sequence !== undefined && key.sequence.length === 1) {
      search.query += key.sequence
      redraw()
    }
    return
  }

  const completion = completionItems()
  if (key.name === 'tab' && key.shift !== true && completion.length > 0) { applyCompletion(completion[Math.min(completionIndex, completion.length - 1)]!); return }
  if (key.name === 'escape') {
    if (quitArmedAt > 0) { quitArmedAt = 0; state.note = state.busy ? 'working…' : 'idle'; redraw(); return }
    if (state.busy) { void recoverHarness('cancel'); return }
    resetComposer()
    state.scroll = 0
    redraw()
    return
  }
  if (key.name === 'tab' && key.shift === true) { void togglePlan(); return }
  if (key.ctrl === true && key.name === 'c') {
    if (renderer.hasSelection) {
      const text = renderer.getSelection()?.getSelectedText() ?? ''
      renderer.copyToClipboardOSC52(text)
      renderer.clearSelection()
      state.note = `copied ${text.length} chars`
      redraw()
      return
    }
    if (Date.now() - quitArmedAt < 3000) { void shutdown(); return }
    quitArmedAt = Date.now()
    state.note = t('quitNote')
    redraw()
    setTimeout(() => {
      if (Date.now() - quitArmedAt >= 2900) {
        quitArmedAt = 0
        state.note = state.busy ? 'working…' : 'ready'
        redraw()
      }
    }, 3000)
    return
  }
  if (key.ctrl === true && key.name === 'o') { toggleTools(); return }
  if (key.ctrl === true && key.name === 'b') {
    state.sidebar = !state.sidebar
    refreshSidebar()
    redraw()
    return
  }
  if (key.ctrl === true && key.name === 't') { state.showThinking = !state.showThinking; redraw(); return }
  if (key.ctrl === true && key.name === 'f') { search = { active: true, query: '' }; redraw(); return }
  if (key.ctrl === true && key.name === 'u') { state.scroll += Math.max(5, renderer.height - 8); redraw(); return }
  if (key.ctrl === true && key.name === 'd') { state.scroll = Math.max(0, state.scroll - Math.max(5, renderer.height - 8)); redraw(); return }
  if (key.name === 'pageup') { state.scroll += Math.max(5, renderer.height - 8); redraw(); return }
  if (key.name === 'pagedown') { state.scroll = Math.max(0, state.scroll - Math.max(5, renderer.height - 8)); redraw(); return }
  {
    const items = completionItems()
    if (items.length > 0 && composerText().startsWith('/') && !composerText().includes(' ')) {
      if (key.name === 'up') { completionIndex = (completionIndex - 1 + items.length) % items.length; redraw(); return }
      if (key.name === 'down') { completionIndex = (completionIndex + 1) % items.length; redraw(); return }
      if ((key.name === 'return' || key.name === 'enter') && key.ctrl !== true && key.meta !== true) {
        const typed = composerText().trim()
        const target = items.includes(typed) ? typed : (items[completionIndex] ?? items[0]!)
        setComposer(target)
        void submit()
        return
      }
    }
  }
  if (key.name === 'left') { moveCursor(0, -1); redraw(); return }
  if (key.name === 'right') { moveCursor(0, 1); redraw(); return }
  if (key.name === 'home') { cursorCol = 0; redraw(); return }
  if (key.name === 'end') { cursorCol = (composer[cursorLine] ?? '').length; redraw(); return }
  if (key.name === 'delete') { deleteAt(); redraw(); return }
  if (key.name === 'up') {
    if (emptyComposer()) historyStep(-1)
    else { moveCursor(-1, 0); redraw() }
    return
  }
  if (key.name === 'down') {
    if (emptyComposer()) historyStep(1)
    else { moveCursor(1, 0); redraw() }
    return
  }
  if (key.name === 'return' || key.name === 'enter') {
    const enterMode = process.env.ASHCODE_ENTER === 'newline' ? 'newline' : 'send'
    if (key.ctrl === true) { void submit(); return }
    if (enterMode === 'send') {
      if (key.meta === true || key.shift === true) { insertText('\n'); redraw(); return }
      void submit()
      return
    }
    if (key.meta === true) { void submit(); return }
    insertText('\n')
    redraw()
    return
  }
  if (key.name === 'backspace') { backspaceAt(); redraw(); return }
  if (key.ctrl !== true && key.meta !== true && key.sequence !== undefined
    && !key.sequence.includes('\u001b') && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(key.sequence)) {
    insertText(key.sequence)
    redraw()
  }
})

renderer.keyInput.on('paste', (event: { bytes?: unknown }) => {
  const bytes = event?.bytes
  const text = typeof bytes === 'string' ? bytes
    : bytes instanceof Uint8Array ? new TextDecoder().decode(bytes) : String(bytes ?? '')
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  if (clean === '') return
  if (keyInput !== undefined) {
    keyInput.value += clean.replace(/\s+/g, '')
    redraw()
    return
  }
  const panel = state.pending
  if (panel !== undefined) {
    if (panel.kind === 'question') { panel.custom += clean.replace(/\n/g, ' '); redraw() }
    return
  }
  const rows = clean.split('\n')
  void rows
  insertText(clean)
  redraw()
})

const RESET_SEQUENCES = '\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1005l\u001b[?1006l\u001b[?25h\u001b[?1049l\u001b[0m'
process.on('exit', () => {
  try { process.stdout.write(RESET_SEQUENCES) } catch { /* ignore */ }
})

;(view as unknown as { onMouse?: (event: { type?: string; x?: number; y?: number; scroll?: { direction?: string } }) => void }).onMouse = (event) => {
  if (process.env.ASHCODE_MOUSE === '0') return
  // Stop button on the composer's bottom border, mirroring DSH's stop affordance.
  if (event.type === 'down' && state.busy && stopHit !== undefined
    && event.x !== undefined && event.y !== undefined
    && event.y === composerBottomRow
    && event.x >= PAD + stopHit.start && event.x < PAD + stopHit.end) {
    void recoverHarness('cancel')
    return
  }
  if (event.type === 'down' && state.sidebar && event.x !== undefined && event.y !== undefined) {
    if (event.x >= PAD && event.x < PAD + 22 && event.y >= 2) {
      const item = sidebarItems[event.y - 2]
      if (item !== undefined && item.id !== state.sessionId) void switchSession(item.id)
    }
    return
  }
  if (event.type !== 'scroll' || event.scroll === undefined) return
  const step = Math.max(1, Math.round((renderer.height - 8) / 4))
  state.scroll += event.scroll.direction === 'up' ? step : -step
  redraw()
}

const spinner = setInterval(() => {
  if (state.busy) scheduleRedraw()
}, 500)

redraw()

try {
  await port.start()
  started = true
  state.sessionId = port.sessionId
  state.note = 'ready'
  state.sidebar = renderer.width >= 120
  refreshSidebar()
  if (process.env.DEEPSEEK_API_KEY === undefined || process.env.DEEPSEEK_API_KEY === '') {
    keyInput = { value: '' }
    state.note = t('needKeyNote')
  }
  const resumedWith = parseResumeArg()
  if (resumedWith !== undefined) replaySession(resumedWith)
  if (process.env.ASHCODE_FAKE_APPROVAL !== undefined) {
    void handleServerRequest('approval/request', { toolName: 'demo-tool', reason: 'fake request for UI test' })
  }
  if (process.env.ASHCODE_FAKE_QUESTION !== undefined) {
    void handleServerRequest('user-question/ask', {
      questions: [
        { id: 'q1', question: 'Pick a color', options: [{ label: 'red' }, { label: 'green' }, { label: 'blue' }] },
        { id: 'q2', question: 'Pick a size', options: [{ label: 'small' }, { label: 'large' }] },
      ],
    })
  }
  if (process.env.ASHCODE_FAKE_TOOL !== undefined) {
    pushBlock({
      kind: 'tool',
      id: 'fake-tool-1',
      name: 'write',
      args: { file_path: 'demo.txt', content: 'hello from demo' },
      status: 'ok',
      result: 'Updated file demo.txt',
      startedAt: Date.now() - 420,
      endedAt: Date.now(),
      expanded: false,
    })
  }
  if (process.env.ASHCODE_FAKE_LINES !== undefined) {
    const count = Number(process.env.ASHCODE_FAKE_LINES)
    for (let index = 1; index <= (Number.isFinite(count) ? count : 0); index += 1) {
      pushBlock({ kind: 'system', text: `filler line ${index}` })
    }
  }
  if (process.env.ASHCODE_FAKE_CRASH_MS !== undefined) {
    const delay = Number(process.env.ASHCODE_FAKE_CRASH_MS)
    setTimeout(() => port.crash(), Number.isFinite(delay) ? delay : 2000)
  }
  if (pendingPrompt !== undefined) {
    const queued = pendingPrompt
    pendingPrompt = undefined
    void sendPrompt(queued)
  }
} catch (error) {
  pushBlock({ kind: 'error', text: `startup failed: ${String(error)}` })
  state.note = 'offline'
}
redraw()

async function shutdown(): Promise<void> {
  state.note = 'shutting down…'
  redraw()
  clearInterval(spinner)
  await port.shutdown()
  await renderer.destroy()
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
process.on('SIGBREAK', () => { void shutdown() })
