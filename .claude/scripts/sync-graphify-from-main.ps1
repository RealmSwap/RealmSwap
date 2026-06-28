# Sync the graphify knowledge graph from the main repo into a worktree.
#
# Runs as a SessionStart hook (see .claude/settings.json). When a Claude Code
# session starts inside a git worktree located under <main-repo>/.claude/worktrees/,
# this copies the latest graphify-out/ from the main repo root into the worktree
# so agents working in the worktree see the same graph without rebuilding it.
#
# Safety:
#   - Never deletes anything (copy-only, additive).
#   - No-op when run from the main workspace (not inside .claude/worktrees/).
#   - No-op when the main repo has no graphify-out/ yet.
#   - Only copies when the worktree's graph is missing or older than main's.

$ErrorActionPreference = 'SilentlyContinue'

# Resolve this worktree's root from the script's own location:
#   <root>/.claude/scripts/sync-graphify-from-main.ps1
$scriptDir    = $PSScriptRoot
$claudeDir    = Split-Path $scriptDir -Parent      # <root>/.claude
$worktreeRoot = Split-Path $claudeDir -Parent      # <root>

# Are we inside a worktree? Worktrees live under <main>/.claude/worktrees/<name>.
$needle = ('\' + [IO.Path]::Combine('.claude', 'worktrees') + '\').ToLower()
$idx = $worktreeRoot.ToLower().IndexOf($needle)
if ($idx -lt 0) { exit 0 }   # main workspace -> nothing to do

$mainRoot = $worktreeRoot.Substring(0, $idx)
$srcDir   = Join-Path $mainRoot     'graphify-out'
$dstDir   = Join-Path $worktreeRoot 'graphify-out'

if (-not (Test-Path $srcDir)) { exit 0 }   # no graph in main yet

# Decide whether a copy is warranted (dst missing, or main's graph is newer).
$srcGraph = Join-Path $srcDir 'graph.json'
$dstGraph = Join-Path $dstDir 'graph.json'
$needCopy = $false
if (-not (Test-Path $dstGraph)) {
    $needCopy = $true
} elseif (Test-Path $srcGraph) {
    if ((Get-Item $srcGraph).LastWriteTimeUtc -gt (Get-Item $dstGraph).LastWriteTimeUtc) {
        $needCopy = $true
    }
}
if (-not $needCopy) { exit 0 }

New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
Copy-Item -Path (Join-Path $srcDir '*') -Destination $dstDir -Recurse -Force

Write-Output '{"systemMessage":"graphify-out/ synced from the main repo into this worktree."}'
exit 0
