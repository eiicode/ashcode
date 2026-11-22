/** Print a transcript layout sample (no renderer, no colors) for quick review. */
import { renderBlocks } from '../src/ui/render.ts'
import { makePalette } from '../src/ui/theme.ts'

const palette = makePalette(process.argv[2] ?? 'dark')
const width = Number(process.argv[3] ?? 96)

const now = Date.now()
const blocks = [
  { kind: 'user', text: '审查 tools/PPG_ATE 的协议实现，找出与 A102 规范不一致的地方。' },
  { kind: 'thinking', text: '先看目录结构和协议文档，再逐条核对。' },
  {
    kind: 'assistant',
    text: [
      '## 结论',
      '',
      '有 **3 处**不一致，其中 1 处会导致 ATE 超时：',
      '',
      '- 帧头长度字段用了 `uint8`，规范要求 `uint16`',
      '- 校验和覆盖范围少了 payload 的最后 2 字节',
      '- `0x96` 超时后未重发，直接丢弃',
      '',
      '建议先改第一处，再补测试：',
      '',
      '| 文件 | 作用 |',
      '| --- | --- |',
      '| `proto.py` | 帧编解码 |',
      '| `ota.py` | 升级流程 |',
      '',
      '参考 [协议文档](docs/protocol.md)。',
      '已保存到: misc-20261121-2-report.md',
      '',
      '```ts',
      'const frame = encodeFrame(payload)',
      'assert.equal(frame.length, payload.length + 4)',
      '```',
    ].join('\n'),
  },
  { kind: 'tool', id: 'a', name: 'read', args: { file_path: 'tools/PPG_ATE/ppg_ate_proto.py' }, status: 'ok', result: '1: import struct\n2: ...', startedAt: now - 400, endedAt: now, expanded: false },
  { kind: 'tool', id: 'b', name: 'read', args: { file_path: 'tools/PPG_ATE/ppg_ate_ota.py' }, status: 'ok', result: '1: ...', startedAt: now - 300, endedAt: now, expanded: false },
  { kind: 'tool', id: 'c', name: 'edit', args: { file_path: 'tools/PPG_ATE/ppg_ate_proto.py', old_string: 'length = struct.pack("<B", len(payload))', new_string: 'length = struct.pack("<H", len(payload))' }, status: 'ok', result: '', startedAt: now - 200, endedAt: now, expanded: false },
  { kind: 'plan', title: '修复协议不一致', items: [{ text: '修正帧头长度字段', done: true }, { text: '补校验和测试', done: false }, { text: '回归 ATE 全量用例', done: false }] },
  { kind: 'system', text: 'turn finished: completed' },
]

const lines = renderBlocks(blocks, { width, palette, toolsExpanded: false })
const text = lines.map(line => line.spans.map(span => span.text).join('')).join('\n')
console.log(text)
