# agent-glance rename: canonical naming map

- **Date:** 2026-04-23
- **Status:** authoritative — downstream rename issues MUST follow this map
- **Scope:** package rename `clawd-docklet` → `agent-glance`; HUD/tool family `docket` → `glance`
- **Issue:** docklet-alm (gates docklet-aqt, -w4l, -dwf, -m82, -ffk, -6ye, -50d)

This is the single source of truth for the rename sweep. If a case below looks ambiguous to you while executing a downstream issue, update this file rather than guessing — the parallel agents all consult it.

## 1. Package & binary

| Old | New |
| --- | --- |
| `clawd-docklet` (npm package) | `agent-glance` |
| `clawd-docklet` (bin name) | `agent-glance` |
| `new McpServer({ name: "clawd-docklet", ... })` | `new McpServer({ name: "agent-glance", ... })` |
| version `0.0.1` | version `0.1.0` (first real release) |

## 2. MCP tool names (caller-facing)

| Old | New |
| --- | --- |
| `write_docket` | `write_glance` |
| `hide_docket` | `hide_glance` |
| `read_docket` | `read_glance` |
| `edit_docket` | `edit_glance` |

## 3. Internal RPC method strings (adapter ↔ daemon)

**Unchanged.** These are already idiomatic single-word method names and are not exposed to users.

`"write"`, `"hide"`, `"read"`, `"edit"` — keep verbatim.

## 4. Environment variables

| Old | New |
| --- | --- |
| `CLAWD_DOCKLET_ROLE` | `AGENT_GLANCE_ROLE` |
| `CLAWD_DOCKLET_SOCKET` | `AGENT_GLANCE_SOCKET` |
| `CLAWD_DOCKLET_PIDFILE` | `AGENT_GLANCE_PIDFILE` |
| `CLAWD_DOCKLET_IDLE_MS` | `AGENT_GLANCE_IDLE_MS` |
| `CLAWD_DOCKLET_HUD_MODE` | `AGENT_GLANCE_HUD_MODE` |
| `CLAWD_DOCKLET_DOCKET_DISABLED` | `AGENT_GLANCE_HUD_DISABLED` |
| `CLAWD_DOCKLET_STATUS_DISABLED` | `AGENT_GLANCE_STATUS_DISABLED` |
| `CLAWD_DOCKLET_CONFIG` | `AGENT_GLANCE_CONFIG` |

**Rationale for `HUD_DISABLED` over `GLANCE_DISABLED`:** `AGENT_GLANCE_GLANCE_DISABLED` reads awkwardly and duplicates the namespace token. `HUD` matches the existing `HUD_MODE` precedent — the env-var tier uses "HUD" as the feature-toggle shorthand for the glance window.

## 5. Filesystem paths (all OSes)

| Old | New |
| --- | --- |
| `~/Library/Application Support/clawd-docklet/` (macOS) | `~/Library/Application Support/agent-glance/` |
| `%LOCALAPPDATA%\clawd-docklet\` (Windows fallback) | `%LOCALAPPDATA%\agent-glance\` |
| `~/.clawd-docklet/` (Linux fallback) | `~/.agent-glance/` |
| `\\.\pipe\clawd-docklet` (Windows named pipe) | `\\.\pipe\agent-glance` |

Socket/pidfile/config filenames inside the dir (`daemon.sock`, `daemon.pid`, `config.json`) are unchanged.

**Migration note:** users with an existing `clawd-docklet` config dir will start fresh after upgrading. First release — no migration logic needed.

## 6. Source files (`src/`)

| Old | New |
| --- | --- |
| `src/docket.ts` | `src/glance.ts` |
| `src/docket-buffer.ts` | `src/glance-buffer.ts` |

Unchanged: `src/index.ts`, `src/adapter.ts`, `src/daemon.ts`, `src/protocol.ts`, `src/paths.ts`, `src/config.ts`, `src/status-item.ts`.

Use `git mv` to preserve history.

## 7. Test files (`test/`)

| Old | New |
| --- | --- |
| `test/docket.test.ts` | `test/glance.test.ts` |
| `test/docket-buffer.test.ts` | `test/glance-buffer.test.ts` |

Unchanged: `test/adapter-daemon.test.ts`, `test/config.test.ts`, `test/e2e.test.ts`, `test/protocol.test.ts`, `test/status-item.test.ts`, `test/helpers/*`.

## 8. Specs & plans

| Old | New |
| --- | --- |
| `docs/superpowers/specs/2026-04-23-clawd-docklet-shell-design.md` | `2026-04-23-agent-glance-shell-design.md` |
| `docs/superpowers/specs/2026-04-23-docket-hud-design.md` | `2026-04-23-glance-hud-design.md` |
| `docs/superpowers/specs/2026-04-23-docket-read-edit-tools.md` | `2026-04-23-glance-read-edit-tools.md` |
| `docs/superpowers/specs/2026-04-23-docket-status-item.md` | `2026-04-23-glance-status-item.md` |
| `docs/superpowers/plans/2026-04-23-docket-hud.md` | `2026-04-23-glance-hud.md` |

Each renamed spec should gain one line near the top: `Renamed from <old-filename> on 2026-04-23 (docklet-6ye).` This file (the naming map) is **not** renamed.

## 9. Source identifiers

### Types / classes / interfaces

| Old | New |
| --- | --- |
| `Docket` (type) | `Glance` |
| `DocketOptions` | `GlanceOptions` |
| `DocketBuffer` (class) | `GlanceBuffer` |
| `DocketBufferOptions` | `GlanceBufferOptions` |

### Functions

| Old | New |
| --- | --- |
| `createDocket` | `createGlance` |
| `createDocketBuffer` | `createGlanceBuffer` |
| `registerDocketHandlers` (daemon side) | `registerGlanceHandlers` |
| `registerDocketTools` (adapter side) | `registerGlanceTools` |

### Variables / fields

| Old | New |
| --- | --- |
| `docket` (local variable) | `glance` |
| `docketDisabled` (Paths field + derived locals) | `hudDisabled` |

**Rationale for `hudDisabled` not `glanceDisabled`:** matches the env var `AGENT_GLANCE_HUD_DISABLED`. See §4.

## 10. UI / user-visible strings

| Old | New |
| --- | --- |
| `"Hide Glimpse"` (status-item popover menu row) | `"Hide Glance"` |

Any other user-visible string containing "docket" or "docklet" (including error messages, log lines, tool descriptions) must be swept to "glance" / "agent-glance" respectively.

Tool descriptions surfaced to the agent via `registerTool({ description: ... })` must be updated — they ship in `tools/list` and are how other agents learn what the tool does.

## 11. package.json publish metadata (new fields)

To be added in docklet-m82:

```json
{
  "name": "agent-glance",
  "version": "0.1.0",
  "description": "MCP server providing a shared HUD ('glance') for AI agents — singleton daemon, stdio adapter, multi-client.",
  "bin": { "agent-glance": "dist/index.js" },
  "keywords": ["mcp", "model-context-protocol", "claude", "agent", "hud", "glance", "glimpseui"],
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/agent-glance.git" },
  "homepage": "https://github.com/<owner>/agent-glance#readme",
  "bugs": { "url": "https://github.com/<owner>/agent-glance/issues" },
  "author": "<owner>"
}
```

`<owner>` is a placeholder — the user fills in the real GitHub owner during docklet-m82.

## 12. Explicitly NOT renamed

To prevent drift, these stay as-is:

- `glimpseui` dependency — that's a separate package this one consumes.
- Internal RPC method strings `"write"`, `"hide"`, `"read"`, `"edit"` (§3).
- Socket / pidfile / config filenames inside the support dir (`daemon.sock`, `daemon.pid`, `config.json`).
- Unrelated files in `src/` and `test/` that contain neither `docket` nor `docklet` (§6, §7).
- The naming map itself (this file).
- `CLAUDE.md` section "Verify Library APIs Before Using Them" — general guidance, not docket-specific; preserve verbatim during the docs rename.

## 13. Search patterns downstream agents should use

To catch stragglers, grep (case-sensitive unless noted) for:

```text
docket        # lowercase identifier
Docket        # TypeCase
docklet       # lowercase package ref
Docklet       # rare, but possible in comments
clawd-docklet # package/dir name
CLAWD_DOCKLET # env var prefix
```

Expected surviving matches after the sweep: **zero**, except (a) this naming map, (b) git history / commit messages, (c) beads issue IDs (e.g. `docklet-501`) which are immutable identifiers for existing bd records.
