# ADR-0009：输入光标、退出确认与状态徽标

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.5.3

## 1. 反馈与决策

| 反馈 | 决策 |
|---|---|
| 光标无法控制 | 实现真正的输入光标：方向键、Home/End、Delete、多行插入/合并；换行后按显示行定位 |
| 滚轮失效 | 鼠标上报恢复默认开启（`ASHCODE_MOUSE=0` 关闭）；0.5.2 的强制关闭是一次过度修正 |
| Ctrl+C 直接退出 | 两段式：第一次提示“再按一次 Ctrl+C 退出”，3 秒窗口内第二次才退出 |
| Shift+Tab 提示双行冗余 | plan 状态只保留在顶部状态栏（`PLAN` 徽标 + 状态行），删掉 `plan mode on/off` 与命令回执 |

## 2. 实现要点

- 输入状态：`composer: string[]` + `cursorLine/cursorCol`；`insertText` / `backspaceAt` / `deleteAt` / `moveCursor`。
- 渲染：`wrapWithOffsets()` 给出每一显示行对应的字符区间，光标按区间插入 `▌`；中文按 2 列宽计算。
- 计划模式：`plan/mode` 事件只更新 `state.plan`，不产生转录块；`command/done` 中匹配 `Plan mode…` 的文本直接丢弃。
- 斜杠命令：`sendPrompt` 对 `/` 开头的内容不回显用户块。

## 3. 验证

- 新增 `cursor-smoke`（输入 `/hlp` → 左移两次 → 插入 `e` → 发送 → 命中 `/help`）与 `quit-smoke`（两次 Ctrl+C）。
- 全量 `npm test`：12 项通过；`tsc` 通过。

## 4. 遗留

- 鼠标点击展开工具卡（只有滚轮）。
- 输入框内的词级跳转（Ctrl+←/→）。
- 退出确认目前只覆盖 `Ctrl+C`，窗口关闭走终端自身行为。
