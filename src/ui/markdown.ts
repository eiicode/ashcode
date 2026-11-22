/**
 * Minimal markdown renderer for the transcript: headings, lists (including the
 * model's `--` style), quotes, fenced code, inline bold/code, and paragraphs.
 * Output is width-wrapped into styled spans; no ANSI is involved here.
 */
import type { RGBA } from '@opentui/core'

export interface Span {
  text: string
  fg?: RGBA
  bg?: RGBA
  bold?: boolean
  dim?: boolean
  italic?: boolean
  link?: { url: string }
}

export interface MLine { spans: Span[] }

export interface MdStyles {
  base: RGBA
  dim: RGBA
  accent: RGBA
  code: RGBA
  codeBg: RGBA
  heading: RGBA
  ok: RGBA
  /** Map a relative/absolute path to a file URL for OSC 8 links. */
  linkPath?: (path: string) => string
}

const PATH_PATTERN = '(?:[A-Za-z]:[\\\\/])?(?:[\\w.-]+[\\\\/])*[\\w.-]+\\.(?:md|markdown|py|ts|tsx|js|mjs|json|ya?ml|toml|txt|sh|ps1|bat|png|jpe?g|svg|html|css|c|h|cpp|go|rs|java)'

/** East Asian wide characters occupy two terminal cells. */
export function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code === 0) return 0
  if ((code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x1f300 && code <= 0x1f64f) || (code >= 0x1f900 && code <= 0x1f9ff)
    || (code >= 0x20000 && code <= 0x3fffd)) return 2
  return 1
}

export function textWidth(text: string): number {
  let width = 0
  for (const char of text) width += charWidth(char)
  return width
}

/** Wrap spans at a display width, returning one MLine per visual line. */
export function wrapSpans(spans: Span[], width: number, indent = 0): MLine[] {
  const limit = Math.max(8, width - indent)
  const out: MLine[] = []
  let current: Span[] = []
  let used = 0
  let first = true

  const startLine = (): void => {
    current = []
    used = 0
    if (indent > 0) current.push({ text: ' '.repeat(indent) })
  }
  startLine()

  for (const span of spans) {
    let buffer = ''
    for (const char of span.text) {
      const size = charWidth(char)
      if (used + size > limit && (used > 0 || !first)) {
        if (buffer !== '') { current.push({ ...span, text: buffer }); buffer = '' }
        out.push({ spans: current })
        first = false
        startLine()
      }
      buffer += char
      used += size
    }
    if (buffer !== '') current.push({ ...span, text: buffer })
  }
  if (current.length > 0) out.push({ spans: current })
  return out
}

/** Split one inline string into styled spans for **bold**, `code`, links, and paths. */
function inline(text: string, base: MdStyles, bold = false, code = false): Span[] {
  const spans: Span[] = []
  const pattern = new RegExp(`(\\*\\*[^*]+\\*\\*|\`[^\`]+\`|\\[[^\\]]+\\]\\([^)]+\\)|${PATH_PATTERN})`, 'g')
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) spans.push({ text: text.slice(last, index), fg: base.base, bold })
    const token = match[0]
    if (token.startsWith('**')) {
      spans.push({ text: token.slice(2, -2), fg: base.base, bold: true })
    } else if (token.startsWith('`')) {
      spans.push({ text: token.slice(1, -1), fg: base.code, bg: base.codeBg, bold })
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link !== null) spans.push({ text: link[1] ?? '', fg: base.accent, bold, link: { url: link[2] ?? '' } })
      else spans.push({ text: token, fg: base.base, bold })
    } else {
      const url = base.linkPath?.(token)
      spans.push({ text: token, fg: base.accent, bold, ...(url === undefined ? {} : { link: { url } }) })
    }
    last = index + token.length
  }
  if (last < text.length) spans.push({ text: text.slice(last), fg: base.base, bold })
  return spans
}

/** Strip inline markdown so table columns align on plain text. */
function plainCell(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

/** Cut text to a display width without splitting wide characters. */
export function truncateDisplay(text: string, width: number): string {
  let out = ''
  let used = 0
  for (const char of text) {
    const size = charWidth(char)
    if (used + size > width) break
    out += char
    used += size
  }
  return out
}

export function padDisplay(text: string, width: number): string {
  const used = textWidth(text)
  return used >= width ? text : text + ' '.repeat(width - used)
}

/** Render pipe tables as aligned columns (separator rows are skipped). */
function tableLines(rows: string[][], styles: MdStyles, width: number): MLine[] {
  const plain = rows.map(row => row.map(plainCell))
  const columns = Math.max(...plain.map(row => row.length))
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(2, ...plain.map(row => textWidth(row[column] ?? ''))))
  let total = widths.reduce((sum, value) => sum + value, 0) + (columns - 1) * 3
  while (total > width && widths.some(value => value > 4)) {
    const widest = widths.indexOf(Math.max(...widths))
    widths[widest] = (widths[widest] ?? 4) - 1
    total -= 1
  }
  const out: MLine[] = []
  plain.forEach((row, index) => {
    const spans: Span[] = []
    for (let column = 0; column < columns; column += 1) {
      const cell = padDisplay(truncateDisplay(row[column] ?? '', widths[column] ?? 0), widths[column] ?? 0)
      spans.push({
        text: cell,
        fg: index === 0 ? styles.heading : styles.base,
        bold: index === 0,
      })
      if (column < columns - 1) spans.push({ text: ' │ ', fg: styles.dim })
    }
    out.push({ spans })
    if (index === 0) {
      out.push({ spans: [{ text: widths.map(value => '─'.repeat(value)).join('─┼─'), fg: styles.dim }] })
    }
  })
  return out
}

/** Render markdown text into visual lines no wider than `width`. */
export function renderMarkdown(text: string, width: number, styles: MdStyles): MLine[] {
  const out: MLine[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let fence: { lang: string; body: string[] } | null = null

  const pushSpans = (spans: Span[], indent = 0): void => {
    out.push(...wrapSpans(spans, width, indent))
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').replace(/\t/g, '  ')

    if (fence !== null) {
      if (/^\s*```/.test(line)) {
        const label = fence.lang === '' ? 'code' : fence.lang
        out.push({ spans: [{ text: `┌ ${label}`, fg: styles.dim }] })
        for (const codeLine of fence.body) {
          out.push({ spans: [{ text: '│ ', fg: styles.dim }, { text: codeLine, fg: styles.code, bg: styles.codeBg }] })
        }
        out.push({ spans: [{ text: '└', fg: styles.dim }] })
        fence = null
      } else {
        fence.body.push(line)
      }
      continue
    }

    const fenceStart = /^\s*```\s*([\w+-]*)\s*$/.exec(line)
    if (fenceStart !== null) { fence = { lang: fenceStart[1] ?? '', body: [] }; continue }

    if (line.trim() === '') { out.push({ spans: [{ text: '' }] }); continue }

    // "Saved to: path" keeps the path on its own line so it can be clicked.
    const trailingPath = new RegExp(`^(.*?[：:])\\s*(${PATH_PATTERN})\\s*$`).exec(line)
    if (trailingPath !== null) {
      pushSpans(inline(trailingPath[1] ?? '', styles))
      const path = trailingPath[2] ?? ''
      const url = styles.linkPath?.(path)
      out.push(...wrapSpans([{ text: path, fg: styles.accent, ...(url === undefined ? {} : { link: { url } }) }], width, 2))
      continue
    }

    if (/^\s*\|/.test(line)) {
      const rows: string[][] = []
      let cursor = index
      while (cursor < lines.length && /^\s*\|/.test(lines[cursor] ?? '')) {
        const rawRow = (lines[cursor] ?? '').trim()
        if (!/^\|?[\s:|-]+\|?$/.test(rawRow)) {
          rows.push(rawRow.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()))
        }
        cursor += 1
      }
      if (rows.length > 0) {
        out.push(...tableLines(rows, styles, width))
        index = cursor - 1
        continue
      }
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      pushSpans([{ text: heading[2] ?? '', fg: styles.heading, bold: true }])
      continue
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push({ spans: [{ text: '─'.repeat(Math.min(width, 40)), fg: styles.dim }] })
      continue
    }

    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote !== null) {
      pushSpans([{ text: '│ ', fg: styles.dim }, ...inline(quote[1] ?? '', styles)], 0)
      continue
    }

    const checkbox = /^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line)
    if (checkbox !== null) {
      const mark = checkbox[2] === ' ' ? '□' : '■'
      pushSpans([{ text: `${mark} `, fg: checkbox[2] === ' ' ? styles.dim : styles.ok }, ...inline(checkbox[3] ?? '', styles)], 2)
      continue
    }

    const bullet = /^(\s*)(?:[-*]|--)\s+(.*)$/.exec(line)
    if (bullet !== null) {
      pushSpans([{ text: '• ', fg: styles.accent }, ...inline(bullet[2] ?? '', styles)], 2)
      continue
    }

    const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line)
    if (ordered !== null) {
      pushSpans([{ text: `${ordered[2]}. `, fg: styles.accent }, ...inline(ordered[3] ?? '', styles)], 3)
      continue
    }

    pushSpans(inline(line, styles))
  }

  if (fence !== null) {
    for (const codeLine of fence.body) {
      out.push({ spans: [{ text: '│ ', fg: styles.dim }, { text: codeLine, fg: styles.code, bg: styles.codeBg }] })
    }
  }
  return out
}
