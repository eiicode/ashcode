English | [中文](SECURITY.zh.md)

# Security policy

## Supported versions

| Version | Supported |
|---|---|
| `1.x` | ✅ |
| `< 1.0` | ❌ |

Platform support is Windows 10/11 only; the macOS / Linux install script has not
been smoke-tested and is out of scope.

## Reporting a vulnerability

**Do not** disclose details in a public issue, and never paste an API key or a log
containing credentials.

1. Open the repository's **Security** tab → **Report a vulnerability** (GitHub
   private vulnerability reporting);
2. If that entry point is unavailable, open an issue that contains **no details**
   and ask for a private channel.

This is a personally maintained open-source project: responses are best-effort,
with no SLA.

## Scope

**In scope**

- Approval / permission bypass: a tool call running without confirmation, or a
  permission preset being silently downgraded
- Command injection: this project spawns `node` and `dsh`, with injection points
  including `--home`, `--resume`, attachment paths and `ASHCODE_NODE_EXECUTABLE`
- Credential leakage: an API key ending up in logs, the status bar, the terminal
  scrollback or an error message
- Terminal escape-sequence injection: model output written straight to the
  terminal (OSC 8 links, OSC 52 clipboard, and so on)
- Release chain: the installer / pack scripts writing to PATH or overwriting files
  beyond what is documented

**Known by design, not a vulnerability**

- The API key is stored in plain text in the app directory's `.env.local` (see the
  README; an environment variable can replace it)
- The default permission preset is `workspace-write`
- This project **does not implement** the sandbox or the approval policy — the DSH
  runtime owns them; this client only renders and relays

**Out of scope**

- Problems in upstream `@deepseek-ai/dsh` — report them to the [upstream repository](https://github.com/deepseek-ai/deepseek-harness)
- The content of model output (hallucinations, bad advice, and so on)
- Issues that require the attacker to already have arbitrary code execution on the
  machine
