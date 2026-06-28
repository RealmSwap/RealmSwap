# Agent Guide — RealmSwap / GameVault

This file is for AI coding agents (Claude Code, Codex, Copilot, Gemini, etc.) working on
this repository. Human contributors are welcome to read it too.

## Use graphify before answering questions about this codebase

This repo ships a vendored **graphify** skill at
[`.claude/skills/graphify/SKILL.md`](.claude/skills/graphify/SKILL.md). It turns the
codebase into a navigable knowledge graph (interactive HTML, GraphRAG-ready JSON, and a
plain-language `GRAPH_REPORT.md`) with community detection, "god node" detection, and
BFS/DFS query tools.

**When to reach for it:**

- Any question about architecture, file relationships, or how subsystems connect
  ("how does the runner abstraction work?", "what touches the crash policy engine?").
- Onboarding to an unfamiliar area before you start editing.
- Tracing a path between two concepts (`/graphify path "A" "B"`).
- Especially if a `graphify-out/` directory already exists — query it instead of
  re-reading files from scratch (`/graphify query "<question>"`).

The graph is persistent: it lives in `graphify-out/graph.json` and survives across
sessions, so you can ask follow-ups later without re-scanning everything.

**How to invoke** (in Claude Code, use the `Skill` tool with `skill: "graphify"`; from a
prompt, type the slash command):

```
/graphify                       # build/refresh the graph for the whole repo
/graphify src                   # scope to a subdirectory
/graphify --update              # incremental re-extract of only changed files
/graphify query "<question>"    # answer from the existing graph
/graphify --help                # full command reference
```

After making structural changes, run `/graphify --update` so the graph stays accurate.

## Installing graphify (if it isn't installed yet)

The skill drives a Python package named **`graphifyy`**. The skill auto-installs it on
first run, but if you want to install it ahead of time:

**Prerequisite:** Python 3.10+ on `PATH`.

```powershell
# Preferred — isolated tool install (auto-detected by the skill):
uv tool install --upgrade graphifyy

# Fallback — plain pip into the active environment:
pip install graphifyy
```

The skill locates the interpreter automatically (uv tool dir → pipx → active venv) and
falls back to installing `graphifyy` itself if it can't find it, so on Windows you
normally just run `/graphify` and let it bootstrap. This project targets Windows, and the
skill's commands are written in PowerShell to match.

`graphify-out/` is generated output — it is gitignored (see below) and should not be
committed.

## The graph lives in the main repo; worktrees get a copy automatically

The built graph (`graphify-out/`) is kept in the **main repo root** and is gitignored, so
it does not travel through git. To keep worktrees in sync, a committed `SessionStart` hook
([.claude/settings.json](.claude/settings.json) →
[.claude/scripts/sync-graphify-from-main.ps1](.claude/scripts/sync-graphify-from-main.ps1))
copies the latest `graphify-out/` from the main repo into any worktree under
`.claude/worktrees/` when a session starts there. It is copy-only (never deletes), only
copies when the worktree's graph is missing or older, and is a no-op in the main workspace.

Practical implications:
- In a fresh worktree, just start a session — the graph is already there to `query`.
- After you change code, run `/graphify --update` to refresh the graph. Run it in the
  **main repo** (`C:\Users\jimmy\Documents\GitHub\GameVault`) so the canonical copy stays
  current; worktrees pick up the refresh on their next session start.

## Other conventions for this repo

- Branch off `main` and open a pull request; do not commit straight to `main`.
- This is a Next.js 14 + Electron + Prisma (SQLite) app that targets Windows. See
  [`README.md`](README.md) for the architecture overview and dev commands
  (`npm run dev`, `npm run electron:dev`, `npm run db:push`).
