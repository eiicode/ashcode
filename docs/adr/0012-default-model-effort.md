English | [中文](0012-default-model-effort.zh.md)

# ADR-0012: Default model and reasoning effort

- Status: Accepted
- Date: 2026-11-21
- Version: 0.5.7

## 1. Decision

The default model changes from `deepseek-v4-flash` to **`deepseek-flash`** (shown as `DeepSeek-V4.1-Flash` in the provider catalog), with default reasoning effort **`high`**.

Rationale: the built-in catalog of `dsh-llm-deepseek` has only two entries — `deepseek-flash` (name `DeepSeek-V4.1-Flash`) and `deepseek-v4-pro`; `deepseek-v4-flash` is not an id in the catalog. The default values match what is shown in the Web UI screenshot.

## 2. Implementation

- `PortOptions.reasoningEffort` is passed to the `reasoningEffort` of the SDK `initialize`.
- The header bar shows short-name mappings: `deepseek-flash → V4.1-Flash`, `deepseek-v4-pro → V4-Pro`, with the effort appended, e.g. `V4.1-Flash · high`.
- Add `/effort <off|low|high|max>`: updates the effort → restarts the harness → opens a new session; `/effort` shows the current value.
- The environment variable `ASHCODE_EFFORT` overrides the default effort.

## 3. Verification

- A real model turn passes under the default `deepseek-flash` + `high` (read file → tool card → answer).
- After `/model` and `/effort` switches the harness restarts normally (the generation counter prevents misjudging a crash).
- `tsc` passes.

## 4. Outstanding

- The model catalog is not auto-discovered: the provider has a `/models` endpoint, which could later be made into a picker with dynamic fetching; currently it relies on an explicit id or `ASHCODE_MODEL`.
- Switching model/effort opens a new session; old sessions can still be restored via `/sessions`.
