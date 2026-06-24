# Field Help Tooltips for the Custom Game Definition Form

**Date:** 2026-06-23
**Status:** Approved design
**Component:** `src/components/DefinitionEditor.tsx`

## Problem

The "New Game Definition" form ([DefinitionEditor.tsx](../../../src/components/DefinitionEditor.tsx))
lets users define a custom game server. Many of its fields are non-obvious — e.g.
"Steam App ID", "Check File", "Install Sub-Directory", "Executable is on PATH", and the
`{{param}}` template substitution in config files. New users cannot tell what a field means
or how to determine the correct value without external context.

## Goal

Add contextual help to every labeled field in the form. Hovering (or keyboard-focusing) a
small info icon next to a field reveals a styled tooltip that explains **what the field is**
and, where non-trivial, **how to determine the correct value**.

## Non-Goals

- No changes to form behavior, validation, submission, or the underlying data model.
- No external documentation pages or links.
- No redesign of the form layout beyond inserting help icons.

## Approach

**Info icon + custom styled tooltip** (chosen over native `title=""` and hover-anywhere).
Native `title` is slow, unstyled, and not touch/keyboard friendly; hover-anywhere triggers
unintentionally while filling the form. A dedicated icon is discoverable, on-brand, and
accessible.

## Architecture

### New component: `FieldHelp`

A small, self-contained presentational component added to `DefinitionEditor.tsx` (co-located,
consistent with the file's existing pattern of local sub-components like `FieldLabel`,
`InputBase`).

- **Trigger:** a `<button type="button">` wrapping a `lucide-react` `HelpCircle` icon
  (`w-3.5 h-3.5`), styled muted (`text-slate-500`) and brightening on hover/focus
  (`hover:text-accentPurple`, `focus-visible:text-accentPurple`). `type="button"` prevents
  accidental form submission. The button is keyboard-focusable.
- **Tooltip surface:** an absolutely-positioned popover, shown on hover **and** focus, hidden
  on mouse-leave/blur. Styled with existing tokens: `bg-slate-950`, `border border-white/10`,
  `rounded-lg`, `text-xs text-slate-300`, `shadow-lg`, `px-3 py-2`, constrained width
  (`w-64`). Positioned above/right of the icon with a small arrow optional.
- **Accessibility:** the button gets `aria-label` (e.g. "Help: <field name>") and
  `aria-describedby` pointing at the tooltip's `id`; the tooltip has `role="tooltip"`.
  Visibility is driven by React state (`open`) toggled by
  `onMouseEnter/onMouseLeave/onFocus/onBlur`, so it works for both pointer and keyboard.
- **Props:** `{ text: string; label?: string }` — `text` is the help content, `label`
  is used for the `aria-label`.

Component contract:
- **What it does:** renders a focusable info icon that reveals help text on hover/focus.
- **How to use it:** `<FieldHelp text="…" label="Steam App ID" />`, placed inline next to a label.
- **Depends on:** `lucide-react`, React `useState`, an id generator (`React.useId`) for
  `aria-describedby`.

### Integration: extend `FieldLabel`

`FieldLabel` currently renders `<label>{children}</label>`. Extend its props to:

```ts
function FieldLabel({ children, help }: { children: React.ReactNode; help?: string })
```

When `help` is provided, render the label text and a `<FieldHelp>` side by side
(`<span className="inline-flex items-center gap-1">`), preserving the existing `*`
required markers that are passed in as part of `children`.

For the handful of fields **without** a `FieldLabel` (inline checkboxes: "Executable is on
PATH", "Extract / Unzip after download", "I understand and accept the risk", and the per-param
"Required" checkbox), render `<FieldHelp>` inline directly after the checkbox text.

### Help content source

Help strings live in a single co-located constant map in `DefinitionEditor.tsx`, keyed by a
stable field identifier, e.g.:

```ts
const FIELD_HELP = {
  displayName: "Name shown in your server catalog. Free-form, e.g. \"My ARK Server\".",
  steamAppId: "The numeric Steam ID of the dedicated-server app…",
  // …
} as const;
```

Rationale: one place to read/audit all copy; keeps JSX uncluttered (`help={FIELD_HELP.steamAppId}`).

## Field coverage & copy

Every labeled field plus the inline checkboxes and all three sub-builders
(Params, Config Files, Ports) get help. Copy is concise (one line + a concrete example),
expanding to 2–3 sentences only where determining the value is non-trivial.

### Basic Info
- **Display Name** — "Name shown in your server catalog. Free-form, e.g. \"My ARK Server\"."
- **Icon (emoji)** — "A single emoji used as the catalog icon, e.g. 🦖. Up to 4 characters."
- **Description** — "Short blurb shown under the name in the catalog. Optional."
- **Recommended RAM (GB)** — "Suggested RAM for this server, shown as guidance when creating one. Check the game's server docs; e.g. 4."
- **Default Port** — "Primary network port the server listens on (1–65535). Use the game's documented default, e.g. 27015 for Source games."

### Install Method — SteamCMD
- **Steam App ID** — "The numeric Steam ID of the dedicated-server app. Find it on SteamDB or the store URL `store.steampowered.com/app/<ID>`. Dedicated servers often have a different ID than the game — search SteamDB for the '… Dedicated Server' entry, e.g. 376030."
- **Install Sub-Directory** — "Folder (created under the install root) that holds this game's files. Use a short slug, e.g. `ark-server`, to keep games from colliding on disk."
- **Check File** — "A file that exists only after a successful install, used to verify install completed. Pick the server executable or a known data file, relative to the install dir, e.g. `ShooterGame/Binaries/Win64/ShooterGameServer.exe`."
- **Required Disk (GB)** — "Approximate disk space the install needs; warns before installing if space is low. Check the game's SteamDB 'Disk' size, e.g. 30."

### Install Method — Download
- **Download URL** — "Direct URL to the server archive or binary, e.g. `https://example.com/server.zip`. Must be publicly reachable from this host."
- **File Name** — "Name to save the downloaded file as, e.g. `server.zip`. Include the correct extension so unzip works."
- **Check File** — "A file that exists only after a successful install, used to verify install completed, relative to the install dir, e.g. `server.exe`."
- **Install Sub-Directory** — "Optional folder (under the install root) to place files in, e.g. `server-files`. Leave blank to use the install root."
- **Extract / Unzip after download** — "Tick if the downloaded file is an archive (.zip) that should be extracted after download."

### Install Method — Custom Script (admin only)
- **Install Script** — "Shell script that installs the server. Runs with this app's privileges on the host — only use trusted scripts."
- **Launch Script** — "Shell script that starts the server. Runs with this app's privileges on the host."
- **I understand and accept the risk** — "Required acknowledgement: custom scripts run with full host privileges of this app's account."

### Launch Configuration (SteamCMD / Download)
- **Executable** — "The program launched to start the server, relative to the working dir, e.g. `server.exe`. If it's a global command like `java`, enter the command and tick 'Executable is on PATH'."
- **Working Directory Sub-path** — "Folder (relative to install dir) to run the server from. Set it when the executable expects to launch from its own folder, e.g. `ShooterGame/Binaries/Win64`."
- **Executable is on PATH** — "Tick when the executable is a global command (`java`, `python`, `node`) resolved via PATH rather than a file inside the install directory."
- **Launch Arguments** — "Command-line arguments passed to the executable, one per row, e.g. `-batchmode`. Reference params with `{{paramKey}}` if needed."

### Server Parameters builder
- **Key** — "Variable name referenced in config templates and args as `{{key}}`. No spaces, e.g. `maxPlayers`."
- **Label** — "Human-friendly name shown to users when they create a server, e.g. \"Max Players\"."
- **Type** — "Field type users get: `text`, `number` (enforces Min/Max), `boolean` (checkbox), or `enum` (dropdown — fill Options)."
- **Default** — "Pre-filled value when a user creates a server. Optional."
- **Required (checkbox)** — "Tick to force users to provide a value for this parameter."
- **Options (enum)** — "Comma-separated choices for the dropdown, e.g. `easy,normal,hard`."
- **Min / Max (number)** — "Lowest / highest allowed numeric value users can enter."

### Config Files builder
- **File Path** — "Path (relative to install dir) of a config file written before each launch, e.g. `config/server.cfg`."
- **Template** — "File contents written at launch. `{{paramKey}}` is replaced with the param's value, so users' settings flow into the config, e.g. `MaxPlayers={{maxPlayers}}`."

### Additional Ports builder
- **Protocol** — "TCP or UDP — match what the game server uses for this port."
- **Port** — "An extra port (beyond Default Port) the server uses, e.g. `27016`. Check the game's server docs."

## Data flow

Static. Help strings are compile-time constants rendered into the DOM. No state beyond each
`FieldHelp`'s local open/closed boolean. No network, no props drilling beyond the optional
`help` string passed to `FieldLabel`.

## Error handling

None required — purely presentational. Edge cases handled by design:
- Long text wraps within the fixed-width tooltip (`w-64`).
- Tooltips near the viewport edge: acceptable to render with a fixed placement (above-right)
  given the form's max width (`max-w-4xl`) and left-aligned layout; no dynamic flipping in v1.

## Testing

The codebase uses **vitest** with no current React component/DOM testing setup (tests cover
`src/lib/**` logic only). To stay consistent and avoid introducing a new testing dependency
(jsdom/RTL) for a presentational change, verification is:

1. **Type/lint:** `npm run build` (Next type-check) and `npm run lint` pass.
2. **Existing suite:** `npm test` stays green (81 tests).
3. **Manual verification:** run `npm run dev`, open the definition form, and confirm for each
   install-method tab that every field shows an info icon, the tooltip appears on hover and on
   keyboard focus, and the icon does not submit the form.

If the user wants automated component tests, that's a follow-up that first adds jsdom + React
Testing Library to the vitest config (out of scope for this spec).

## Implementation summary

1. Add `FieldHelp` component to `DefinitionEditor.tsx`.
2. Add `FIELD_HELP` constant map with all copy above.
3. Extend `FieldLabel` to accept `help?: string`.
4. Pass `help={FIELD_HELP.x}` to every `FieldLabel`; add inline `<FieldHelp>` to the
   label-less checkboxes.
5. Verify build, lint, tests, and manual hover/focus behavior.
