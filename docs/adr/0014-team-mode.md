English | [中文](0014-team-mode.zh.md)

# ADR-0014: Agent team switch

- Status: Accepted
- Date: 2026-11-21
- Version: 0.6.1

## 1. Background

DSH's `agent-team` plugin defaults to `defaultEnabled: false` in `dsh-base`, and the Web UI has an "enable agent team collaboration" switch. The TUI needs an equivalent level of control.

## 2. Approach

- **Do not modify the user profile**: the TUI generates an overlay file `<DSH_HOME>/tui/team.yml` with the contents

  ```yaml
  - id: agent-team
    config:
      defaultEnabled: true
      maxTasks: 256
  ```

  and appends `--patch <file>` when launching the child process (the CLI supports a repeatable `--patch`).
- **Switching means restarting**: `/team on|off` writes/removes the overlay → `setPatches` → `port.restart()` → takes effect in a new session.
- **Default**: with `ASHCODE_TEAM=1` the overlay is written at startup; otherwise it is off by default.
- The header bar shows a `TEAM` badge.

## 3. Semantics

`agent-team`'s `defaultEnabled` only affects "new roots without a saved choice"; restored sessions keep their original choice. Therefore a switch only takes effect in a new session; when an old session is restored via `/sessions`, it follows its own record.

## 4. Verification

- Added `team-smoke`: after `/team on`, `TEAM` appears in the header bar, the runtime restarts successfully, and a new session is created.
- Full `npm test`: 19 items pass; `tsc` passes.

## 5. Limitations

- Team mode cannot be switched without a restart (plugin config is loaded at startup).
- Team messages/task lists are currently only presented as ordinary events in the transcript; there is no dedicated panel.
