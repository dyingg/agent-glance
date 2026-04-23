# agent-glance

![Glance HUD preview](media/preview.png)

An MCP server that provides a shared HUD — the **glance** — across AI agent sessions. Multiple clients (Claude Code sessions, Codex, etc.) attach to one running server instead of spawning one per client, so every session sees and can update the same on-screen surface.

## Install

```bash
# Claude Code
claude mcp add agent-glance -- npx -y agent-glance

# Codex
codex mcp add agent-glance -- npx -y agent-glance
```

For local development:

```bash
git clone <this repo>
cd agent-glance
npm install
npm run build
npm link
claude mcp add agent-glance -- agent-glance
```

## How it works

```
Client #1 ──stdio──▶ adapter ─┐
Client #2 ──stdio──▶ adapter ─┼──▶ Unix socket ──▶ daemon  (one process)
Codex     ──stdio──▶ adapter ─┘
```

`agent-glance` uses a **singleton daemon + stdio adapter** pattern. One compiled binary plays two roles, dispatched by the `AGENT_GLANCE_ROLE` env var: unset → adapter (what the MCP client launches), `daemon` → the long-running server the adapter spawns on first use. The daemon owns the glance window state and uses `bind()` on its socket path as its lock, so simultaneous adapter launches cannot produce two daemons.

## Tools

| Tool | Description |
|---|---|
| `write_glance` | Replace the glance HUD contents with a new body (markdown/text). |
| `hide_glance` | Hide the glance window without clearing its buffer. |
| `read_glance` | Read back the current glance buffer (used as a gate before editing). |
| `edit_glance` | Apply an Edit-style string-replace patch to the glance buffer (read-before-edit enforced). |

## Development

```bash
npm run build      # tsc → dist/
npm test           # vitest run
npm run test:watch
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_GLANCE_SOCKET` | platform-specific | Socket/pipe path |
| `AGENT_GLANCE_PIDFILE` | next to socket | Pidfile written on daemon bind |
| `AGENT_GLANCE_IDLE_MS` | `30000` | Ms after last client disconnect before daemon exits |
| `AGENT_GLANCE_ROLE` | unset | Set to `daemon` to run as daemon (internal) |
| `AGENT_GLANCE_HUD_MODE` | unset | Glance HUD lifecycle mode |
| `AGENT_GLANCE_HUD_DISABLED` | unset | Disable the glance HUD entirely |
| `AGENT_GLANCE_STATUS_DISABLED` | unset | Disable the menu-bar status item |
| `AGENT_GLANCE_CONFIG` | platform-specific | Config file path |

## License

MIT
