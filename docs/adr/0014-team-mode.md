# ADR-0014：智能体团队开关

- 状态：Accepted
- 日期：2026-11-21
- 版本：0.6.1

## 1. 背景

DSH 的 `agent-team` 插件在 `dsh-base` 里默认 `defaultEnabled: false`，Web UI 有“启用智能体团队协作”的开关。TUI 需要同等的控制能力。

## 2. 方案

- **不修改用户 profile**：TUI 生成一个 overlay 文件 `<DSH_HOME>/tui/team.yml`，内容为

  ```yaml
  - id: agent-team
    config:
      defaultEnabled: true
      maxTasks: 256
  ```

  启动子进程时追加 `--patch <file>`（CLI 支持可重复的 `--patch`）。
- **切换即重启**：`/team on|off` 写入/删除 overlay → `setPatches` → `port.restart()` → 新会话生效。
- **默认值**：`ASHCODE_TEAM=1` 时启动即写入 overlay；否则默认关闭。
- 顶栏显示 `TEAM` 徽标。

## 3. 语义

`agent-team` 的 `defaultEnabled` 只影响“没有保存选择的新 root”，恢复的会话保留原选择。因此切换后开新会话才生效；旧会话用 `/sessions` 恢复时按它自己的记录。

## 4. 验证

- 新增 `team-smoke`：`/team on` 后顶栏出现 `TEAM`、运行时重启成功、新会话创建。
- 全量 `npm test`：19 项通过；`tsc` 通过。

## 5. 限制

- 无法在不重启的情况下切换团队模式（插件配置在启动时装载）。
- 团队消息/任务列表目前只在转录中以普通事件呈现，未做专门面板。
