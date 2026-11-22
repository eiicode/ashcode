/**
 * UI strings. English is the default; `/language zh` (or `ASHCODE_LANG=zh`)
 * switches to Chinese. Values may use `{0}`, `{1}` placeholders.
 */
export type Lang = 'en' | 'zh'

const EN = {
  phaseAnalyzing: 'analyzing',
  phaseThinking: 'thinking',
  phaseTool: 'running tool',
  phaseResponding: 'responding',

  todoPrefix: '▸ Tasks {0}/{1}',
  todoActive: ' · in progress: {0}',
  todoPending: ' · {0} pending',
  todoDone: ' · all done',

  presetReadOnly: 'read-only',
  presetWorkspaceWrite: 'workspace-write',
  presetDangerFullAccess: 'danger-full-access',

  untitled: '(untitled)',
  statusSession: 'Session[{0}]',
  statusPermission: 'Perm[{0}]',
  statusVersion: 'Version[{0}]',
  statusContext: 'Context[{0}%]',
  statusTurn: 'Turn[{0}]',
  statusStep: 'Step[{0}]',
  statusTool: 'Tools[{0}]',
  statusSpeed: 'Rate[{0}t/s]',

  composerPlaceholder: 'Type a message…',
  composerHintSend: 'Enter send · Alt+Enter newline',
  composerHintNewline: 'Enter newline · Ctrl+Enter send',
  composerLabel: '╭─ Input ',
  composerStop: ' ■ Esc stop ',

  sessionsEmpty: 'No persisted session in this workspace yet.',
  newSession: 'New session',
  sessionsHint: 'n new · Esc close',
  sessionsSwitchHint: 'Enter switch · n new · d delete · Esc close',
  renameHint: 'r rename',
  deleteArmed: 'press d again to delete {0}',

  keyDetail: 'Enter your DeepSeek API key. It is saved to .env.local in the app directory and the runtime restarts.',
  keySave: 'Save',
  keyHint: 'Enter save · Esc cancel',

  chooserHint: '↑/↓ select · Enter apply (restarts the runtime and opens a new session) · Esc cancel',
  quitBanner: ' ⚠  Press Ctrl+C again to quit (within 3s) · Esc cancels ',
  attachNote: 'attached {0} ({1} KB) · sent with the next message',
  teamNote: 'team: {0} · usage /team on|off (ASHCODE_TEAM=1 enables by default)',
  quitNote: 'Press Ctrl+C again to quit',
  needKeyNote: 'API key required (/key to set it)',

  thinkingLabel: '✦ thinking',
  thinkingMetaOne: ' · 1 line · Ctrl+T',
  thinkingMetaMany: ' · {0} lines · Ctrl+T',
} as const

const ZH: Record<keyof typeof EN, string> = {
  phaseAnalyzing: '分析请求',
  phaseThinking: '深度思考',
  phaseTool: '执行工具',
  phaseResponding: '生成回复',

  todoPrefix: '▸ 任务 {0}/{1}',
  todoActive: ' · 进行中: {0}',
  todoPending: ' · {0} 待处理',
  todoDone: ' · 全部完成',

  presetReadOnly: '只读',
  presetWorkspaceWrite: '工作区可写',
  presetDangerFullAccess: '完全权限',

  untitled: '(未命名)',
  statusSession: '会话[{0}]',
  statusPermission: '权限[{0}]',
  statusVersion: '版本[{0}]',
  statusContext: '上下文[{0}%]',
  statusTurn: '回合[{0}]',
  statusStep: '步骤[{0}]',
  statusTool: '工具[{0}次]',
  statusSpeed: '速度[{0}t/s]',

  composerPlaceholder: '输入消息…',
  composerHintSend: 'Enter 发送 · Alt+Enter 换行',
  composerHintNewline: 'Enter 换行 · Ctrl+Enter 发送',
  composerLabel: '╭─ 输入 ',
  composerStop: ' ■ Esc 停止 ',

  sessionsEmpty: '当前工作区还没有持久化会话。',
  newSession: '新建会话',
  sessionsHint: 'n 新建 · Esc 关闭',
  sessionsSwitchHint: 'Enter 切换 · n 新建 · d 删除 · Esc 关闭',
  renameHint: 'r 重命名',
  deleteArmed: '再按 d 删除 {0}',

  keyDetail: '输入 DeepSeek API Key，保存到应用目录的 .env.local 并重启运行时。',
  keySave: '保存',
  keyHint: 'Enter 保存 · Esc 取消',

  chooserHint: '↑/↓ 选择 · Enter 应用（会重启运行时并开新会话）· Esc 取消',
  quitBanner: ' ⚠  再按一次 Ctrl+C 退出（3 秒内）· Esc 取消 ',
  attachNote: '已附加 {0}（{1} KB）· 下一条消息一起发送',
  teamNote: 'team: {0} · 用法 /team on|off（默认 ASHCODE_TEAM=1 开启）',
  quitNote: '再按一次 Ctrl+C 退出',
  needKeyNote: '需要 API Key（/key 可重新设置）',

  thinkingLabel: '✦ 思考',
  thinkingMetaOne: ' · 1 行 · Ctrl+T',
  thinkingMetaMany: ' · {0} 行 · Ctrl+T',
}

export type StringKey = keyof typeof EN

let current: Lang = 'en'

export function setLang(lang: Lang): void {
  current = lang
}

export function getLang(): Lang {
  return current
}

/** `ASHCODE_LANG` wins; anything unrecognised falls back to English. */
export function resolveLang(): Lang {
  const raw = (process.env.ASHCODE_LANG ?? '').trim().toLowerCase()
  if (raw === 'zh' || raw === 'zh-cn' || raw === 'cn' || raw === 'chinese') return 'zh'
  return 'en'
}

export function t(key: StringKey, ...args: Array<string | number>): string {
  const table = current === 'zh' ? ZH : EN
  let text: string = table[key] ?? EN[key]
  args.forEach((value, index) => {
    text = text.split(`{${index}}`).join(String(value))
  })
  return text
}

export function describeLang(): string {
  return current === 'zh' ? '中文' : 'English'
}
