/** Block model and transcript renderers (tool cards, diffs, plans, modals). */
import type { RGBA } from '@opentui/core'
import { renderMarkdown, textWidth, wrapSpans, padDisplay, truncateDisplay, type MdStyles, type Span } from './markdown.ts'
import { t } from './i18n.ts'
import type { Palette } from './theme.ts'

export type ToolStatus = 'running' | 'ok' | 'error'

export interface ToolBlock {
  kind: 'tool'
  id: string
  name: string
  args: Record<string, any>
  status: ToolStatus
  result: string
  startedAt: number
  endedAt?: number
  expanded: boolean
}

export interface TextBlock {
  kind: 'user' | 'assistant' | 'system' | 'error'
  text: string
}

/** Reasoning stream: kept whole, rendered collapsed with its duration. */
export interface ThinkingBlock {
  kind: 'thinking'
  text: string
  startedAt: number
  endedAt?: number
}

export interface PlanBlock {
  kind: 'plan'
  title: string
  items: Array<{ text: string; done: boolean }>
}

export type Block = TextBlock | ThinkingBlock | ToolBlock | PlanBlock

export interface RLine { spans: Span[] }

export interface RenderContext {
  width: number
  palette: Palette
  toolsExpanded: boolean
  showThinking: boolean
  search?: string
  /** Map a path to a file URL so terminal links open in the editor. */
  linkPath?: (path: string) => string
}

export interface ModalOption { label: string; tone?: 'ok' | 'err' | 'normal' }

export interface ModalSpec {
  title: string
  detail: string[]
  options: ModalOption[]
  selected: number
  hint: string
  footer?: string
}

/** Human-readable duration: `45s`, `3m25s`. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}m${String(seconds).padStart(2, '0')}s`
}

const VERBS: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  str_replace_editor: 'Edit',
  bash: 'Shell',
  pwsh: 'Shell',
  grep: 'Search',
  glob: 'Search',
  web_fetch: 'Web',
  web_search: 'Web',
  task: 'Task',
  present: 'Present',
  skill: 'Skill',
  ask_user_question: 'Ask',
  exit_plan_mode: 'Plan',
  todo_write: 'Todo',
  workflow: 'Workflow',
}

export function verbOf(name: string): string {
  return VERBS[name] ?? name
}

export function shortSummary(tool: ToolBlock, max = 64): string {
  const raw = tool.args.file_path ?? tool.args.path ?? tool.args.command ?? tool.args.pattern
    ?? tool.args.url ?? tool.args.query ?? tool.args.description ?? tool.args.name
  if (typeof raw !== 'string') return ''
  const single = raw.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}

function duration(tool: ToolBlock): string {
  const end = tool.endedAt ?? Date.now()
  const seconds = Math.max(0, (end - tool.startedAt) / 1000)
  if (tool.status === 'running') return `${seconds.toFixed(0)}s`
  return seconds < 0.05 ? '' : `${seconds.toFixed(1)}s`
}

const mdStyles = (palette: Palette, linkPath?: (path: string) => string): MdStyles => ({
  base: palette.fg,
  dim: palette.dim,
  accent: palette.accent,
  code: palette.sys,
  codeBg: palette.codeBg,
  heading: palette.accent,
  ok: palette.ok,
  linkPath,
})

function toneSpan(text: string, palette: Palette, tone: 'add' | 'del' | 'plain'): Span {
  const color = tone === 'add' ? palette.diffAdd : tone === 'del' ? palette.diffDel : palette.fg
  const span: Span = { text, fg: color }
  if (tone === 'add') span.bg = palette.diffAddBg
  if (tone === 'del') span.bg = palette.diffDelBg
  return span
}

function diffLines(tool: ToolBlock, palette: Palette, width: number): RLine[] {
  const out: RLine[] = []
  const path = String(tool.args.file_path ?? tool.args.path ?? '')
  const oldText = typeof tool.args.old_string === 'string' ? tool.args.old_string : undefined
  const newText = typeof tool.args.new_string === 'string' ? tool.args.new_string : undefined
  if (oldText !== undefined && newText !== undefined) {
    const removed = oldText.split('\n').length
    const added = newText.split('\n').length
    out.push({
      spans: [
        { text: `Edit ${path}`, fg: palette.accent, bold: true },
        { text: `  +${added} −${removed}`, fg: palette.dim },
      ],
    })
    for (const row of oldText.split('\n').slice(0, 8)) out.push(...wrapSpans([toneSpan(`- ${row}`, palette, 'del')], width, 2))
    for (const row of newText.split('\n').slice(0, 8)) out.push(...wrapSpans([toneSpan(`+ ${row}`, palette, 'add')], width, 2))
    return out
  }
  if (typeof tool.args.content === 'string') {
    out.push({ spans: [{ text: `Write ${path}`, fg: palette.accent, bold: true }] })
    for (const row of tool.args.content.split('\n').slice(0, 12)) {
      out.push(...wrapSpans([toneSpan(`+ ${row}`, palette, 'add')], width, 2))
    }
    return out
  }
  if (tool.result !== '') {
    const rows = tool.result.split('\n')
    if (rows.some(row => /^[+-]/.test(row))) {
      for (const row of rows.slice(0, 14)) {
        const tone = row.startsWith('+') ? 'add' : row.startsWith('-') ? 'del' : 'plain'
        out.push(...wrapSpans([toneSpan(row, palette, tone)], width, 2))
      }
    }
  }
  return out
}

/** Render one tool call: one compact line, plus detail when expanded. */
export function renderTool(tool: ToolBlock, ctx: RenderContext): RLine[] {
  const { palette, width } = ctx
  const expanded = ctx.toolsExpanded || tool.expanded
  const verb = verbOf(tool.name)
  const glyph = tool.status === 'running' ? '◐' : tool.status === 'error' ? '✗' : '✓'
  const color = tool.status === 'running' ? palette.warn : tool.status === 'error' ? palette.err : palette.ok
  const summary = shortSummary(tool)
  const time = duration(tool)
  const first: Span[] = [
    { text: `${glyph} `, fg: color },
    { text: verb, fg: palette.fg, bold: true },
  ]
  if (summary !== '') first.push({ text: `  ${summary}`, fg: palette.dim })
  if (time !== '') first.push({ text: `  ${time}`, fg: palette.dim })

  if (!expanded) {
    const rows = tool.result === '' ? 0 : tool.result.split('\n').length
    if (rows > 1) first.push({ text: `  … +${rows - 1}`, fg: palette.dim })
    return [{ spans: first }]
  }

  const out: RLine[] = [{ spans: first }]
  if (tool.name === 'edit' || tool.name === 'write' || tool.name === 'str_replace_editor') {
    const diff = diffLines(tool, palette, width)
    if (diff.length > 0) { out.push(...diff.slice(0, 18)); return out }
  }
  const args = JSON.stringify(tool.args)
  if (args !== '{}') {
    for (const row of wrapSpans([{ text: args, fg: palette.dim }], width, 2).slice(0, 3)) out.push(row)
  }
  if (tool.result !== '') {
    out.push({ spans: [{ text: '  result:', fg: palette.dim }] })
    for (const row of tool.result.split('\n').slice(0, 12)) {
      out.push({ spans: [{ text: `  ${row}`, fg: palette.fg }] })
    }
  }
  return out
}

export function renderPlan(plan: PlanBlock, ctx: RenderContext): RLine[] {
  const { palette, width } = ctx
  const done = plan.items.filter(item => item.done).length
  const boxWidth = Math.min(width, 72)
  const title = `${plan.title}  ${done}/${plan.items.length}`
  return [
    { spans: [{ text: `╭─ ${title} ${'─'.repeat(Math.max(0, boxWidth - textWidth(title) - 3))}`, fg: palette.accent }] },
    ...plan.items.map((item): RLine => ({
      spans: [
        { text: item.done ? '│ ■ ' : '│ □ ', fg: item.done ? palette.ok : palette.dim },
        { text: item.text, fg: item.done ? palette.dim : palette.fg },
      ],
    })),
    { spans: [{ text: `╰${'─'.repeat(Math.max(0, boxWidth - 1))}`, fg: palette.accent }] },
  ]
}

/** Render a centered modal box. */
export function renderModal(spec: ModalSpec, width: number, palette: Palette): RLine[] {
  const boxWidth = Math.min(Math.max(46, width - 12), 78)
  const pad = Math.max(0, Math.floor((width - boxWidth) / 2))
  const inner = boxWidth - 4
  const row = (text: string, color: RGBA, isBold = false, isDim = false): RLine => ({
    spans: [
      { text: ' '.repeat(pad) },
      { text: '│ ', fg: palette.accent },
      { text: padDisplay(truncateDisplay(text, inner), inner), fg: color, bold: isBold, dim: isDim },
      { text: ' │', fg: palette.accent },
    ],
  })

  const out: RLine[] = []
  const title = ` ${spec.title} `
  out.push({
    spans: [
      { text: ' '.repeat(pad) },
      { text: '╭─', fg: palette.accent },
      { text: title, fg: palette.accent, bold: true },
      { text: '─'.repeat(Math.max(0, boxWidth - textWidth(title) - 3)), fg: palette.accent },
      { text: '╮', fg: palette.accent },
    ],
  })
  for (const detail of spec.detail) {
    for (const wrapped of wrapSpans([{ text: detail, fg: palette.dim }], inner)) {
      out.push(row(wrapped.spans.map(span => span.text).join(''), palette.dim, false, true))
    }
  }
  if (spec.footer !== undefined) out.push(row(spec.footer, palette.warn))
  for (const [index, option] of spec.options.entries()) {
    const active = index === spec.selected
    const color = option.tone === 'ok' ? palette.ok : option.tone === 'err' ? palette.err : palette.fg
    out.push(row(`${active ? '▸' : ' '} ${index + 1}) ${option.label}`, active ? color : palette.dim, active))
  }
  out.push(row(spec.hint, palette.dim, false, true))
  out.push({
    spans: [
      { text: ' '.repeat(pad) },
      { text: `╰${'─'.repeat(boxWidth - 2)}╯`, fg: palette.accent },
    ],
  })
  return out
}

/** Turn a tool call into a plan block when it is `exit_plan_mode`. */
export function planFromTool(tool: ToolBlock): PlanBlock | undefined {
  if (tool.name !== 'exit_plan_mode') return undefined
  const raw = typeof tool.args.plan === 'string' ? tool.args.plan
    : typeof tool.args.content === 'string' ? tool.args.content : ''
  if (raw.trim() === '') return undefined
  const lines = raw.split('\n')
  const heading = lines.find(row => /^#{1,6}\s+/.test(row)) ?? '# Plan'
  const title = heading.replace(/^#{1,6}\s+/, '').trim()
  const items: Array<{ text: string; done: boolean }> = []
  for (const row of lines) {
    const checkbox = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(row)
    if (checkbox !== null) { items.push({ text: checkbox[2] ?? '', done: (checkbox[1] ?? ' ') !== ' ' }); continue }
    const bullet = /^\s*(?:[-*]|--|\d+[.)])\s+(.*)$/.exec(row)
    if (bullet !== null && bullet[1] !== undefined) items.push({ text: bullet[1], done: false })
  }
  return { kind: 'plan', title, items }
}

/** Render all blocks with one blank line between logical blocks. */
export function renderBlocks(blocks: Block[], ctx: RenderContext): RLine[] {
  const out: RLine[] = []
  const md = mdStyles(ctx.palette, ctx.linkPath)
  let previous: Block | undefined

  const separator = (current: Block): void => {
    if (previous === undefined) return
    if (previous.kind === 'tool' && current.kind === 'tool') return
    const soft = (kind: string): boolean => kind === 'thinking' || kind === 'system' || kind === 'error'
    if (soft(previous.kind) && soft(current.kind)) return
    out.push({ spans: [{ text: '' }] })
  }

  for (const block of blocks) {
    separator(block)
    switch (block.kind) {
      case 'user': {
        // Right-aligned bubble: content-hugging width, capped so long prompts keep a margin.
        const bg = ctx.palette.userBg
        const limit = Math.min(76, Math.max(24, Math.floor(ctx.width * 0.75)))
        const lines = wrapSpans([{ text: block.text, fg: ctx.palette.fg, bg }], limit)
        const widest = lines.reduce(
          (max, line) => Math.max(max, line.spans.reduce((sum, span) => sum + textWidth(span.text), 0)),
          0,
        )
        const bubbleWidth = Math.min(limit, Math.max(8, widest))
        const leftPad = Math.max(0, ctx.width - bubbleWidth)
        for (const line of lines) {
          const used = line.spans.reduce((sum, span) => sum + textWidth(span.text), 0)
          const pad = Math.max(0, bubbleWidth - used)
          out.push({
            spans: [
              ...(leftPad > 0 ? [{ text: ' '.repeat(leftPad) }] : []),
              ...(pad > 0 ? [{ text: ' '.repeat(pad), bg }] : []),
              ...line.spans.map(span => ({ ...span, bg })),
            ],
          })
        }
        break
      }
      case 'assistant':
        out.push(...renderMarkdown(block.text, ctx.width, md))
        break
      case 'thinking': {
        const started = block.startedAt ?? Date.now()
        const elapsed = ((block.endedAt ?? Date.now()) - started) / 1000
        const meta = elapsed >= 1 ? ` · ${formatDuration(elapsed * 1000)}` : ''
        if (!ctx.showThinking) {
          const lineCount = block.text.split('\n').filter(line => line.trim() !== '').length
          out.push({
            spans: [
              { text: t('thinkingLabel'), fg: ctx.palette.dim, dim: true },
              { text: `${meta}${lineCount === 1 ? t('thinkingMetaOne') : t('thinkingMetaMany', lineCount)}`, fg: ctx.palette.dim, dim: true },
            ],
          })
          break
        }
        out.push({ spans: [{ text: `${t('thinkingLabel')}${meta}`, fg: ctx.palette.accent, dim: true }] })
        for (const line of block.text.split('\n')) {
          out.push({ spans: [{ text: `  ${line}`, fg: ctx.palette.dim, dim: true }] })
        }
        break
      }
      case 'system':
        out.push({ spans: [{ text: '· ', fg: ctx.palette.dim }, { text: block.text, fg: ctx.palette.sys }] })
        break
      case 'error':
        out.push({ spans: [{ text: '✗ ', fg: ctx.palette.err }, { text: block.text, fg: ctx.palette.err }] })
        break
      case 'plan':
        out.push(...renderPlan(block, ctx))
        break
      case 'tool':
        out.push(...renderTool(block, ctx))
        break
      default:
        break
    }
    previous = block
  }
  return out
}
