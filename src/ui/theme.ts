/** Semantic palette. `ansi` mode follows the terminal's own 16-color theme. */
import { RGBA } from '@opentui/core'

export interface Palette {
  fg: RGBA
  bg: RGBA
  accent: RGBA
  dim: RGBA
  ok: RGBA
  warn: RGBA
  err: RGBA
  sys: RGBA
  sep: RGBA
  diffAdd: RGBA
  diffDel: RGBA
  diffAddBg: RGBA
  diffDelBg: RGBA
  codeBg: RGBA
  /** Background of the right-aligned user message bubble. */
  userBg: RGBA
}

function hex(value: string): RGBA {
  return RGBA.fromHex(value)
}

/** Build the palette; unknown names fall back to dark. */
export function makePalette(mode: string | undefined): Palette {
  switch (mode) {
    case 'light':
      return {
        fg: hex('#24292f'), bg: hex('#f6f8fa'), accent: hex('#0969da'), dim: hex('#6e7781'),
        ok: hex('#1a7f37'), warn: hex('#9a6700'), err: hex('#cf222e'), sys: hex('#1b7c83'),
        sep: hex('#d0d7de'), diffAdd: hex('#116329'), diffDel: hex('#a40e26'),
        diffAddBg: hex('#dafbe1'), diffDelBg: hex('#ffebe9'), codeBg: hex('#eff1f3'),
        userBg: hex('#eef3fb'),
      }
    case 'contrast':
      return {
        fg: hex('#ffffff'), bg: hex('#000000'), accent: hex('#00ffff'), dim: hex('#c0c0c0'),
        ok: hex('#00ff00'), warn: hex('#ffff00'), err: hex('#ff5555'), sys: hex('#00ffff'),
        sep: hex('#555555'), diffAdd: hex('#00ff00'), diffDel: hex('#ff5555'),
        diffAddBg: hex('#003300'), diffDelBg: hex('#330000'), codeBg: hex('#111111'),
        userBg: hex('#003a5c'),
      }
    case 'ansi':
      return {
        fg: RGBA.fromIndex(7), bg: RGBA.fromIndex(0), accent: RGBA.fromIndex(12),
        dim: RGBA.fromIndex(8), ok: RGBA.fromIndex(10), warn: RGBA.fromIndex(11),
        err: RGBA.fromIndex(9), sys: RGBA.fromIndex(14), sep: RGBA.fromIndex(8),
        diffAdd: RGBA.fromIndex(10), diffDel: RGBA.fromIndex(9),
        diffAddBg: RGBA.fromIndex(0), diffDelBg: RGBA.fromIndex(0), codeBg: RGBA.fromIndex(0),
        userBg: RGBA.fromIndex(4),
      }
    default:
      return {
        fg: hex('#d8dee9'), bg: hex('#1b1f24'), accent: hex('#61afef'), dim: hex('#6a737d'),
        ok: hex('#98c379'), warn: hex('#e5c07b'), err: hex('#e06c75'), sys: hex('#56b6c2'),
        sep: hex('#3b4048'), diffAdd: hex('#98c379'), diffDel: hex('#e06c75'),
        diffAddBg: hex('#1d2a1d'), diffDelBg: hex('#2f1d1f'), codeBg: hex('#20252b'),
        userBg: hex('#1f2d3d'),
      }
  }
}
