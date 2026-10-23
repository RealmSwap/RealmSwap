AGENTS.md — RealmSwap Engineering Protocol

Mission

Build, maintain, and improve RealmSwap with maximum engineering efficiency without sacrificing correctness, security, maintainability, or user experience.

Optimize for:

Correct, verified outcomes.
High-impact improvements aligned with the product's goals.
Minimal unnecessary exploration, tool calls, code churn, and duplicated work.
Small, reviewable changes that fit the existing architecture.
Clear reporting of what was verified and what remains uncertain.
Do not optimize for minimum token usage at the expense of engineering quality.

1. Establish Ground Truth First

Before making substantive changes:

Read the relevant repository instructions, package scripts, architecture documentation, and code surrounding the requested change.
Inspect the actual implementation. Never infer behavior solely from names, comments, README claims, or intended architecture.
Trace relevant execution paths end to end: UI → API → business logic → persistence/processes → resulting behavior.
Inspect existing tests, error handling, and callers before changing a function or interface.
Check git status and preserve existing user changes. Never discard or overwrite unrelated work.
Use targeted searches and file reads. Expand the investigation only when the initial evidence requires it.
For bugs, reproduce the behavior when practical before fixing it.

For feature work, establish the current behavior, desired behavior, constraints, and acceptance criteria before implementation.

If repository access, tool capabilities, or available evidence are insufficient, state the limitation explicitly. Never claim to have inspected, run, or verified something that you have not.

2. Tool Efficiency and Coordination

Available tools may include Caveman, RTK, Ponytail, and Context Mode. Their exact capabilities depend on the installed environment and their actual documentation.

Inspect the available tool descriptions and local instructions once per session or when tool availability changes.
Use each tool only for work it demonstrably supports.
Follow tool-specific instructions and schemas. Do not invent commands, flags, or capabilities.
Prefer one targeted, high-value operation over repeated broad scans.
Reuse established findings, file paths, test results, and repository context instead of rediscovering them.
Avoid repeatedly dumping large files, dependency trees, generated files, or entire directories when a focused search will suffice.
Batch independent read-only investigations when supported.
Do not parallelize dependent operations or competing edits to the same files.
Delegate only when the task can be divided into genuinely independent workstreams and integration overhead is justified.
Give delegated work explicit scope, expected output, and a prohibition against editing shared files unless authorized.
Verify delegated findings against the source before relying on them.

Context management

Keep a compact working record of:

The user's objective and acceptance criteria.
Relevant architecture and entry points.
Findings confirmed from source.
Files changed and why.
Commands executed and their outcomes.
Remaining risks and next steps.

Prefer concise summaries with exact file paths, symbols, and relevant excerpts over large unfiltered outputs.

Do not repeatedly reread unchanged files or repeat successful searches without a reason.

Never omit a necessary verification step merely to conserve context.

3. Plan Proportionally

For small changes, inspect the relevant code and proceed directly.

For medium or large changes, create a short implementation plan covering:

Existing behavior and root cause or requirement.
Relevant components and dependencies.
Proposed minimal change.
Tests and acceptance criteria.
Risks, compatibility, and migration concerns.

Keep plans proportional to the task. Do not create elaborate plans for trivial fixes.

Update the plan when new evidence materially changes the approach.

Do not stop at analysis or recommendations when the user has requested implementation and implementation is possible.

4. Implementation Standards

Follow the repository's existing language, framework, naming, formatting, and architectural conventions.
Prefer the smallest complete solution over a broad refactor.
Reuse established abstractions and dependencies where appropriate.
Avoid introducing dependencies, services, frameworks, configuration layers, or abstractions without a concrete benefit.
Preserve public APIs and existing behavior unless the requested change requires otherwise.
Handle invalid input, expected operational failures, cancellation, partial failure, and resource cleanup appropriately.
Make errors actionable without leaking secrets or sensitive internals.
Avoid silent fallbacks that conceal broken or unsupported behavior.
Do not add placeholder implementations, fake success responses, speculative compatibility claims, or tests that merely encode the current implementation.
Keep comments focused on non-obvious reasoning, constraints, and invariants.
Avoid unrelated cleanup and opportunistic rewrites.
Never weaken tests, types, validation, authorization, or security controls just to make a change pass.
For refactors, preserve behavior unless a behavior change is explicitly intended and tested.

5. RealmSwap-Specific Priorities

RealmSwap is a desktop-oriented game-server management product. Its relevant areas include Next.js/React, Electron, Prisma/SQLite, game-server lifecycle management, mod management, backups, RealmSync, packaging, and integrations. Verify the current architecture in source before relying on this list.

Mod support

When investigating or implementing mod support, distinguish between:

Individual mod installation and removal.
Game and mod-loader version compatibility.
Modpack import and complete server-side installation.
Required dependencies and client-only versus server-only mods.
Configuration files, overrides, and pinned versions.
Client synchronization and connection compatibility.
Safe updates, rollback, and recovery from failed changes.
Distribution-source rules, file integrity, and permissions.

Do not assume a feature is missing just because documentation is incomplete. Trace its implementation and test coverage first.

Prefer explicit compatibility checks and useful unsupported-feature errors over pretending an arbitrary pack will work.

RealmSync

Trace both sides of the synchronization protocol. Check message validation, authentication and authorization, version compatibility, disconnects, retries, transfer integrity, and failure recovery where applicable.

Preserve protocol compatibility unless a coordinated migration is justified.

Game-server lifecycle

Treat installation, start, stop, restart, update, and deletion as potentially destructive or asynchronous operations.

Check process ownership, timeouts, cancellation, cleanup, duplicate operations, and partial failures.

Never assume a process started successfully just because a command was issued.

Worlds and backups

Treat game worlds as user data that may be irreplaceable.

Before destructive operations, establish the safety guarantees and recovery path.

Test backup consistency, restoration, interrupted operations, disk exhaustion, path validation, and preservation of existing data where relevant.

Never silently overwrite or delete user worlds as a shortcut.

Electron and security

Review process execution, filesystem boundaries, IPC, API authorization, secrets, archive extraction, downloaded executables, remote connections, and update integrity when relevant.

Do not execute untrusted input through a shell or trust paths, archives, mod metadata, or network messages without appropriate validation.

Follow least privilege and the repository's established security model.

Desktop packaging

Distinguish development-mode success from packaged-application success.

When changing Electron integration, installers, native dependencies, or update behavior, identify which build and runtime environments need verification.

Do not claim release readiness based solely on a passing unit test.

6. Testing and Verification

Choose verification based on the change's risk and scope.

Run the most relevant focused test first.
Run appropriate type checks, linting, and related tests.
Run broader regression tests when the change crosses subsystem boundaries.
Verify builds or packaged runtime behavior when relevant and feasible.
Inspect the final diff for unintended changes.
Add or update tests for changed behavior, especially bug fixes and failure cases.

Test meaningful negative paths, not just the happy path.

For asynchronous or destructive operations, test failure handling and data preservation where practical.

If a test cannot be run because of missing services, credentials, platform support, time, or tooling, report that specifically. Do not imply that an unrun test passed.

Do not repeatedly run an expensive full suite when a focused failure already identifies the problem. Fix the cause, rerun the relevant test, and then perform the appropriate regression checks.

7. Research and Dependency Discipline

When current external documentation is needed:

Prefer official documentation and the project's actual installed version.
Check compatibility before relying on APIs or behavior from another version.
Distinguish confirmed facts from assumptions.
Avoid adding a dependency to solve a problem already addressed by the project.
Review license and distribution constraints for dependencies, game assets, and mod sources when relevant.
Repository source and reproducible behavior take precedence over assumptions based on external examples.

8. Git and Change Safety

Do not reset, clean, force-push, or rewrite history unless explicitly authorized.
Do not overwrite unrelated user changes.
Do not commit, publish, deploy, or release unless requested or clearly authorized by the active workflow.
Keep changes scoped to the task.
Inspect the final diff and ensure no secrets, generated artifacts, local configuration, or unrelated edits are included.

9. Completion Criteria

A task is complete only when:

The requested behavior is implemented, or the blocker is clearly explained.
Relevant tests or verification steps have been performed where possible.
The final diff has been reviewed.
Important limitations and unresolved risks are documented.
The final response summarizes the result accurately.

Report:

What changed.
Why the change is correct.
Which tests and commands ran, including their outcomes.
What could not be verified.
Any important follow-up work.

Keep the report concise for small changes and detailed enough for architectural or security-sensitive work.

Never claim complete repository coverage, successful execution, or verified correctness without corresponding evidence.

10. Decision Rule

At every step, ask:

"What's the smallest evidence-backed action that moves the user's actual goal forward while preserving correctness and safety?"

If a quick fix is safe and sufficient, use it.

If the problem requires deeper tracing, investigate before editing.

If evidence contradicts the initial hypothesis, revise the approach.

If requirements are ambiguous but a safe, reversible interpretation is clear, proceed and state the assumption. Ask a question only when the ambiguity materially affects correctness, safety, or product direction.
