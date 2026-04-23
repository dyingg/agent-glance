# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

Use 'bd' for task tracking.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install                          # installs + runs prepare → tsc → dist/
npm run build                        # tsc → dist/ (chmods dist/index.js)
npm test                             # vitest run (protocol + adapter-daemon + e2e)
npm run test:watch                   # vitest in watch mode
npx tsc -p tsconfig.test.json        # typecheck tests without emitting
```

## Architecture Overview

`clawd-docklet` is a TypeScript MCP server published to npm. It uses a **singleton daemon + stdio adapter** pattern so multiple MCP clients (Claude Code sessions, Codex) share one server process instead of spawning one per client.

```
Client #1 ──stdio──▶ adapter ─┐
Client #2 ──stdio──▶ adapter ─┼──▶ Unix socket ──▶ daemon  (one process)
Codex     ──stdio──▶ adapter ─┘
```

- **One binary, two roles.** `dist/index.js` dispatches by `CLAWD_DOCKLET_ROLE`: unset → adapter (default), `daemon` → long-running server the adapter spawns on first use via `spawn(..., { detached: true, stdio: "ignore" }).unref()`.
- **Race-free startup.** The daemon `bind()`s on a Unix socket (`~/Library/Application Support/clawd-docklet/daemon.sock` on macOS). If two adapters try to spawn a daemon simultaneously, only one wins the bind; the other gets `EADDRINUSE` and exits cleanly.
- **Shell stage.** No MCP tools registered yet — the server handshakes, reports `tools/list` as empty, and maintains the adapter↔daemon wiring so the next change is "add a tool" rather than a refactor.
- **Shared state lives in the daemon.** `glimpseui` window management (forthcoming) will live daemon-side so all clients see the same UI state.

Source layout:

```
src/index.ts      # role dispatcher (shebang here)
src/adapter.ts    # stdio MCP server; connects to daemon; DaemonClient RPC
src/daemon.ts     # socket server; bind-as-lock; idle shutdown; pidfile
src/protocol.ts   # newline-delimited JSON framing (Frame, encode, LineDecoder)
src/paths.ts      # env-aware resolution of socket/pidfile/idle-timeout
```

Design spec: `docs/superpowers/specs/2026-04-23-clawd-docklet-shell-design.md`.

## Conventions & Patterns

- **ESM everywhere.** `"type": "module"` in `package.json`; imports use explicit `.js` extensions (TypeScript NodeNext resolution).
- **Env-var knobs for testability.** All paths and timeouts (`CLAWD_DOCKLET_SOCKET`, `CLAWD_DOCKLET_PIDFILE`, `CLAWD_DOCKLET_IDLE_MS`) override defaults so tests get isolated sockets in `mkdtempSync` dirs.
- **Test helpers live in `test/helpers/`.** `freshEnv()` builds an isolated env; `readDaemonPid()` + `waitForProcessExit()` for process-level assertions.
- **Four test layers.** Layer 1 (protocol unit), Layer 2 (in-process adapter↔daemon), Layer 4 (real-subprocess MCP handshake). Layer 3 hardening tests (race, stale socket, idle shutdown) are deferred to the first-tool milestone.

## Git Commits

Keep commits atomic: commit only the files you touched and list each path explicitly.

- For tracked files:
  ```bash
  git commit -m "<scoped message>" -- path/to/file1 path/to/file2
  ```
- For brand-new files, use this one-liner:
  ```bash
  git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2
  ```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var
