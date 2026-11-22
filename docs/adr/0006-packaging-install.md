# ADR-0006：打包与安装（对齐 MiMoCode 的一键体验）

- 状态：Accepted
- 日期：2026-11-21
- 关联：ADR-0005（安装器初版）

## 1. 目标

安装体验向 MiMoCode 看齐：一条命令、自动备齐运行时、装完即用、卸载干净。

## 2. 方案

| 环节 | 实现 |
|---|---|
| 发布物 | `scripts/pack.ps1` → `dist/ashcode-<version>-win-x64.zip`（~57 KB，只含 src/bin/scripts/docs/package.json/README/tsconfig，不含 `node_modules`、`.env.local`、日志） |
| 安装器 | `scripts/install.ps1 -Source <zip 路径或 URL>`；省略 `-Source` 时从当前 checkout 安装 |
| 安装布局 | `%LOCALAPPDATA%\ashcode\app`（应用副本）+ `\bin\ashcode.cmd`（绝对路径启动器）+ `install.json`（版本/路径清单） |
| 运行时 | 复用系统 Node ≥22 与 Bun ≥1.3.14；Bun 缺失时自动 `npm install -g bun`；启动器用 **bun.exe 绝对路径**（不是 `.ps1` shim） |
| 依赖 | 安装时 `npm install --legacy-peer-deps`，随后 `npm approve-scripts --all` + `npm rebuild`（npm 11 默认拦截依赖安装脚本，不处理会导致沙箱/PTY 原生件缺失） |
| 凭据 | checkout 安装会复制 `.env.local`；zip 安装绝不携带 |
| 卸载 | `scripts/uninstall.ps1` 依据 `install.json` 删除应用目录、启动器与 PATH |

## 3. 验证

| 场景 | 结果 |
|---|---|
| `pack.ps1` 产出 zip | 57 KB，50 个条目，无 `.env.local` |
| 从 zip 安装到临时目录 | 成功，`ashcode --version` → `0.4.0`，`--help` 正常 |
| 从临时工作目录启动安装副本 | 进入 ready |
| 安装副本跑真实模型回合（读文件） | 回答 `installed-ok`，工具卡出现 |
| 安装到 `%LOCALAPPDATA%\ashcode` | 成功，启动器指向 app 副本，真实回合通过 |
| PATH | 已写入用户 PATH（新终端生效） |

## 4. 关键修正（踩过的坑）

1. `Get-Command bun` 返回的是 `bun.ps1`，写进 `.cmd` 后 cmd.exe 无法执行 → 改为解析 `bun.exe`（npm 安装目录 / WindowsApps / `where.exe`）。
2. npm 11 的 `allow-scripts` 默认拦截依赖安装脚本，首次安装后原生件缺失 → 安装器补 `approve-scripts --all` + `rebuild`。
3. 安装副本从任意目录启动时，DSH CLI 必须按 **应用根目录** 解析（不是当前工作目录）→ `PortOptions.appRoot`。
4. 安装副本的默认数据目录不能落在用户项目里 → 在 checkout 内用 `./.dsh-home`，否则用 `~/.ashcode`；`--home` / `ASHCODE_HOME` 可覆盖。
5. `-InstallDir` 传相对路径时启动器里会写入相对路径，换目录启动即失败 → 安装/卸载器入口统一 `GetFullPath`。
6. 增加 `install.cmd` / `uninstall.cmd` 薄入口（转发 PowerShell，双击时 `pause`），并打进发布 zip。
7. `--legacy-peer-deps` 会跳过 `@deepseek-ai/cordis-plugin-group` 等 peer，安装副本启动时报 `Cannot find package ...` → 改为优先普通 `npm install`（失败才回退 legacy）、把该包列为显式依赖、安装后校验关键模块是否存在。

## 5. 未做

- 没有公开下载 URL，所以还没有真正的 `irm ... | iex` 一行命令；把 zip 与 `install.ps1` 放到任意静态托管即可，安装器已支持 URL。
- 不自带 Node/Bun 运行时（MiMoCode 自带原生二进制）；缺失时明确报错或自动装 Bun。
- 自动更新（`ashcode update`）未实现，重跑安装器即可覆盖。
