English | [中文](0013-sidebar-stats-attach.zh.md)

# ADR-0013: Sidebar, stats, choosers and attachments

- Status: Accepted
- Date: 2026-11-21
- Version: 0.6.0

## 1. Requirements and implementation

| Requirement | Implementation | Data source |
|---|---|---|
| Left session sidebar + click to switch | At ≥100 columns, a 22-column sidebar is shown by default (title, current session `▸`), toggled with `Ctrl+B`; a click with `x∈[2,24)`, `y-2` hitting a row → `switchSession` | Local `sessions/` + the down event of `onMouse` |
| Status collapse/timing | Tool cards keep elapsed time and collapsed results; the status bar shows turn/step counts and tok/s | `turn/*`, `step/*`, `assistant/message.usage` |
| Duration stats | `working Ns` counts turns only; `lastTurnMs` is used for tok/s | Same as above |
| Model/effort chooser | `/model` and `/effort` with no argument open a modal, `↑/↓` + `Enter` applies (restart + new session) | Provider catalog constants (`deepseek-flash`, `deepseek-v4-pro`) |
| Attachments | `/attach <path>` reads an image → base64 → `SdkEncodedImageBlock` sent with the next prompt | The image block of `dsh-sdk-protocol` |
| Permission display | The status bar shows the preset from the `permission/preset` event, read-only | Event |

## 2. Key trade-offs

- **The sidebar does not span the full height**: it covers only the transcript area (the header and status bar keep the full width), so the composer is not squeezed narrower.
- **The click region is explicitly constrained**: only `x∈[2,24)` and `y≥2` hit; clicks in the body area do not trigger a switch.
- **Attachments support images only**: for text files it is more reliable to let the agent read them with the read tool; images are the only input that must go through a block.
- **Permissions are read-only**: the SDK protocol has no way to switch presets (the Web goes through the HTTP gateway); the TUI displays it for now and does not fake a switch.

## 3. Verification

- Added `sidebar-smoke` (sidebar rendering + mouse click switching), `chooser-smoke` (model/effort chooser), `attach-smoke` (attachment enqueueing).
- Full `npm test`: 18 items pass; `tsc` passes.
- A real turn with the default `deepseek-flash` + `high` passes.

## 4. Known limitations

- Permission presets cannot be switched inside the TUI (requires the upstream to add a method to the SDK).
- The sidebar does not scroll independently and shows at most the current page's rows; beyond 12 sessions only the most recent are listed.
- Attachments have no thumbnail/preview; the queue is cleared once they are sent.
- Status collapse is "tool card collapse + summary", not the arbitrary block collapse the Web has.
