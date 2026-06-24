# Field Help Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible info icon + styled tooltip to every field in the custom game-definition form, explaining what each field is and how to determine its value.

**Architecture:** Add one co-located `FieldHelp` presentational component to `DefinitionEditor.tsx`, a `FIELD_HELP` constant map holding all copy, and extend the existing `FieldLabel` to accept an optional `help` string. Thread `help` into every labeled field; add inline `FieldHelp` to the label-less checkboxes. Purely presentational — no data-model, validation, or submission changes.

**Tech Stack:** Next.js 14 (App Router, client component), React 18, TypeScript, Tailwind CSS, `lucide-react` icons. Tests: vitest (lib-only; no DOM test setup).

## Global Constraints

- All work happens in `src/components/DefinitionEditor.tsx` (single file) plus this plan/spec — no new files, no new dependencies.
- Component is `"use client"` already; keep it client-side.
- Use only existing Tailwind tokens already present in the file: `bg-slate-950`, `border-white/10`, `text-slate-300`, `text-slate-500`, `text-accentPurple`, `rounded-lg`, `shadow-lg`, `text-xs`.
- Icon source: `lucide-react` (already a dependency). Use `HelpCircle`.
- Help trigger MUST be `<button type="button">` so it never submits the form.
- Tooltip MUST appear on both hover AND keyboard focus, and hide on mouse-leave/blur.
- Tooltip width fixed at `w-64`; no dynamic edge-flip in v1.
- Copy is verbatim from the spec's "Field coverage & copy" section.
- Verification per task: `npm run lint` and `npx tsc --noEmit` (or `npm run build`) pass; `npm test` stays green (81 tests). Manual hover/focus check at the end.
- Commit after each task.

---

### Task 1: Add `FieldHelp` component and extend `FieldLabel`

**Files:**
- Modify: `src/components/DefinitionEditor.tsx` (imports ~line 6-12; `FieldLabel` ~line 99-101; add `FieldHelp` after it)

**Interfaces:**
- Produces:
  - `function FieldHelp({ text, label }: { text: string; label?: string }): JSX.Element`
  - `function FieldLabel({ children, help }: { children: React.ReactNode; help?: string }): JSX.Element`

- [ ] **Step 1: Add `HelpCircle` to the lucide-react import**

In the `import { … } from "lucide-react";` block (currently `ArrowLeft, Plus, Trash2, Server as ServerIcon, ShieldAlert`), add `HelpCircle`:

```tsx
import {
  ArrowLeft,
  Plus,
  Trash2,
  Server as ServerIcon,
  ShieldAlert,
  HelpCircle,
} from "lucide-react";
```

- [ ] **Step 2: Add the `FieldHelp` component**

Insert immediately after the existing `FieldLabel` function definition:

```tsx
function FieldHelp({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = React.useId();
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label ? `Help: ${label}` : "Help"}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-slate-500 hover:text-accentPurple focus-visible:text-accentPurple outline-none transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-5 bottom-full mb-1 z-50 w-64 px-3 py-2 rounded-lg bg-slate-950 border border-white/10 shadow-lg text-xs text-slate-300 font-normal normal-case leading-relaxed pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
```

Note: `normal-case` and `font-normal` guard against the tooltip inheriting `uppercase`/`font-bold` from any label context.

- [ ] **Step 3: Extend `FieldLabel` to render help inline**

Replace the existing `FieldLabel`:

```tsx
function FieldLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-400 mb-1 font-semibold">
      <span>{children}</span>
      {help && <FieldHelp text={help} label={typeof children === "string" ? children : undefined} />}
    </label>
  );
}
```

(Was `block ... mb-1`; now `flex items-center gap-1` so the icon sits beside the text. `FieldHelp` must be defined before `FieldLabel` uses it, OR remain a function declaration — both are hoisted, so order is fine.)

- [ ] **Step 4: Verify lint + types pass**

Run: `npm run lint`
Expected: no errors in `DefinitionEditor.tsx`.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Verify existing tests still pass**

Run: `npm test`
Expected: `81 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/components/DefinitionEditor.tsx
git commit -m "feat: add FieldHelp tooltip component and help-aware FieldLabel"
```

---

### Task 2: Add the `FIELD_HELP` copy map

**Files:**
- Modify: `src/components/DefinitionEditor.tsx` (add constant in the Helpers section, after `DEFAULT_COLOR` ~line 57-58)

**Interfaces:**
- Consumes: nothing.
- Produces: `const FIELD_HELP` — an object with string members keyed exactly as listed below. Later tasks reference `FIELD_HELP.<key>`.

- [ ] **Step 1: Add the constant map**

Insert after the `DEFAULT_COLOR` constant:

```tsx
const FIELD_HELP = {
  // Basic Info
  displayName: 'Name shown in your server catalog. Free-form, e.g. "My ARK Server".',
  icon: "A single emoji used as the catalog icon, e.g. 🦖. Up to 4 characters.",
  description: "Short blurb shown under the name in the catalog. Optional.",
  recommendedRam:
    "Suggested RAM for this server, shown as guidance when creating one. Check the game's server docs; e.g. 4.",
  defaultPort:
    "Primary network port the server listens on (1–65535). Use the game's documented default, e.g. 27015 for Source games.",

  // SteamCMD
  steamAppId:
    "The numeric Steam ID of the dedicated-server app. Find it on SteamDB or the store URL store.steampowered.com/app/<ID>. Dedicated servers often have a different ID than the game — search SteamDB for the '… Dedicated Server' entry, e.g. 376030.",
  scInstallSubDir:
    "Folder (created under the install root) that holds this game's files. Use a short slug, e.g. ark-server, to keep games from colliding on disk.",
  scCheckFile:
    "A file that exists only after a successful install, used to verify install completed. Pick the server executable or a known data file, relative to the install dir, e.g. ShooterGame/Binaries/Win64/ShooterGameServer.exe.",
  requiredDisk:
    "Approximate disk space the install needs; warns before installing if space is low. Check the game's SteamDB 'Disk' size, e.g. 30.",

  // Download
  downloadUrl:
    "Direct URL to the server archive or binary, e.g. https://example.com/server.zip. Must be publicly reachable from this host.",
  fileName:
    "Name to save the downloaded file as, e.g. server.zip. Include the correct extension so unzip works.",
  dlCheckFile:
    "A file that exists only after a successful install, used to verify install completed, relative to the install dir, e.g. server.exe.",
  dlInstallSubDir:
    "Optional folder (under the install root) to place files in, e.g. server-files. Leave blank to use the install root.",
  unzip:
    "Tick if the downloaded file is an archive (.zip) that should be extracted after download.",

  // Custom Script
  installScript:
    "Shell script that installs the server. Runs with this app's privileges on the host — only use trusted scripts.",
  launchScript:
    "Shell script that starts the server. Runs with this app's privileges on the host.",
  ack:
    "Required acknowledgement: custom scripts run with full host privileges of this app's account.",

  // Launch Configuration
  executable:
    "The program launched to start the server, relative to the working dir, e.g. server.exe. If it's a global command like java, enter the command and tick 'Executable is on PATH'.",
  cwdSubDir:
    "Folder (relative to install dir) to run the server from. Set it when the executable expects to launch from its own folder, e.g. ShooterGame/Binaries/Win64.",
  executableOnPath:
    "Tick when the executable is a global command (java, python, node) resolved via PATH rather than a file inside the install directory.",
  launchArgs:
    "Command-line arguments passed to the executable, one per row, e.g. -batchmode. Reference params with {{paramKey}} if needed.",

  // Params builder
  paramKey:
    "Variable name referenced in config templates and args as {{key}}. No spaces, e.g. maxPlayers.",
  paramLabel:
    'Human-friendly name shown to users when they create a server, e.g. "Max Players".',
  paramType:
    "Field type users get: text, number (enforces Min/Max), boolean (checkbox), or enum (dropdown — fill Options).",
  paramDefault: "Pre-filled value when a user creates a server. Optional.",
  paramRequired: "Tick to force users to provide a value for this parameter.",
  paramOptions: "Comma-separated choices for the dropdown, e.g. easy,normal,hard.",
  paramMin: "Lowest allowed numeric value users can enter.",
  paramMax: "Highest allowed numeric value users can enter.",

  // Config Files builder
  configPath:
    "Path (relative to install dir) of a config file written before each launch, e.g. config/server.cfg.",
  configTemplate:
    "File contents written at launch. {{paramKey}} is replaced with the param's value, so users' settings flow into the config, e.g. MaxPlayers={{maxPlayers}}.",

  // Ports builder
  portProtocol: "TCP or UDP — match what the game server uses for this port.",
  portNumber:
    "An extra port (beyond Default Port) the server uses, e.g. 27016. Check the game's server docs.",
} as const;
```

- [ ] **Step 2: Verify lint + types pass**

Run: `npm run lint`
Expected: no errors (constant is unused so far — acceptable mid-plan; if lint flags unused, it is consumed in Task 3 before final).

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DefinitionEditor.tsx
git commit -m "feat: add FIELD_HELP copy map for definition form tooltips"
```

---

### Task 3: Wire help into Basic Info, install-method, and Launch fields

**Files:**
- Modify: `src/components/DefinitionEditor.tsx` (Basic Info section ~line 665-718; SteamCMD ~line 744-787; Download ~line 791-843; Custom Script ~line 847-887; Launch Config ~line 891-932)

**Interfaces:**
- Consumes: `FIELD_HELP` (Task 2), `FieldLabel` `help` prop and `FieldHelp` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add `help` to Basic Info labels**

Update each `FieldLabel` in the Basic Info `<section>`:

```tsx
<FieldLabel help={FIELD_HELP.displayName}>Display Name *</FieldLabel>
<FieldLabel help={FIELD_HELP.icon}>Icon (emoji)</FieldLabel>
<FieldLabel help={FIELD_HELP.description}>Description</FieldLabel>
<FieldLabel help={FIELD_HELP.recommendedRam}>Recommended RAM (GB)</FieldLabel>
<FieldLabel help={FIELD_HELP.defaultPort}>Default Port</FieldLabel>
```

- [ ] **Step 2: Add `help` to SteamCMD labels**

```tsx
<FieldLabel help={FIELD_HELP.steamAppId}>Steam App ID *</FieldLabel>
<FieldLabel help={FIELD_HELP.scInstallSubDir}>Install Sub-Directory *</FieldLabel>
<FieldLabel help={FIELD_HELP.scCheckFile}>Check File (path confirming install) *</FieldLabel>
<FieldLabel help={FIELD_HELP.requiredDisk}>Required Disk (GB)</FieldLabel>
```

- [ ] **Step 3: Add `help` to Download labels + Unzip checkbox**

```tsx
<FieldLabel help={FIELD_HELP.downloadUrl}>Download URL *</FieldLabel>
<FieldLabel help={FIELD_HELP.fileName}>File Name *</FieldLabel>
<FieldLabel help={FIELD_HELP.dlCheckFile}>Check File (path confirming install) *</FieldLabel>
<FieldLabel help={FIELD_HELP.dlInstallSubDir}>Install Sub-Directory (optional)</FieldLabel>
```

For the "Extract / Unzip after download" checkbox `<label>`, add `<FieldHelp>` after the text node (before `</label>`):

```tsx
            Extract / Unzip after download
            <FieldHelp text={FIELD_HELP.unzip} label="Extract / Unzip" />
          </label>
```

- [ ] **Step 4: Add `help` to Custom Script labels + acknowledgement checkbox**

```tsx
<FieldLabel help={FIELD_HELP.installScript}>Install Script *</FieldLabel>
<FieldLabel help={FIELD_HELP.launchScript}>Launch Script *</FieldLabel>
```

For the "I understand and accept the risk." checkbox `<label>`, add before `</label>`:

```tsx
            I understand and accept the risk.
            <FieldHelp text={FIELD_HELP.ack} label="Accept risk" />
          </label>
```

- [ ] **Step 5: Add `help` to Launch Configuration**

```tsx
<FieldLabel help={FIELD_HELP.executable}>Executable *</FieldLabel>
<FieldLabel help={FIELD_HELP.cwdSubDir}>Working Directory Sub-path (optional)</FieldLabel>
<FieldLabel help={FIELD_HELP.launchArgs}>Launch Arguments</FieldLabel>
```

For the "Executable is on PATH" checkbox `<label>` (note it contains a `<code>` element), add before `</label>`:

```tsx
            Executable is on PATH (e.g. <code className="text-xs bg-slate-800 px-1 rounded">java</code>, interpreter commands)
            <FieldHelp text={FIELD_HELP.executableOnPath} label="Executable on PATH" />
          </label>
```

- [ ] **Step 6: Verify lint + types pass**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/DefinitionEditor.tsx
git commit -m "feat: add field help to basic info, install, and launch fields"
```

---

### Task 4: Wire help into the Params, Config Files, and Ports builders

**Files:**
- Modify: `src/components/DefinitionEditor.tsx` (`ParamsBuilder` ~line 106-227; `ConfigFilesBuilder` ~line 232-285; `PortsBuilder` ~line 290-339)

**Interfaces:**
- Consumes: `FIELD_HELP` (Task 2), `FieldLabel`/`FieldHelp` (Task 1). These builder components are defined ABOVE `FIELD_HELP` in the file; because `FIELD_HELP` is a top-level `const`, referencing it inside a component body (called at render time) is fine despite lexical order.
- Produces: nothing new.

- [ ] **Step 1: Add `help` to ParamsBuilder labels**

In `ParamsBuilder`, update the `FieldLabel`s:

```tsx
<FieldLabel help={FIELD_HELP.paramKey}>Key</FieldLabel>
<FieldLabel help={FIELD_HELP.paramLabel}>Label</FieldLabel>
<FieldLabel help={FIELD_HELP.paramType}>Type</FieldLabel>
<FieldLabel help={FIELD_HELP.paramDefault}>Default</FieldLabel>
<FieldLabel help={FIELD_HELP.paramOptions}>Options (comma-separated)</FieldLabel>
<FieldLabel help={FIELD_HELP.paramMin}>Min</FieldLabel>
<FieldLabel help={FIELD_HELP.paramMax}>Max</FieldLabel>
```

For the inline "Required" checkbox `<label>`, add before `</label>`:

```tsx
                Required
                <FieldHelp text={FIELD_HELP.paramRequired} label="Required" />
              </label>
```

- [ ] **Step 2: Add `help` to ConfigFilesBuilder labels**

```tsx
<FieldLabel help={FIELD_HELP.configPath}>File Path (relative to install dir)</FieldLabel>
<FieldLabel help={FIELD_HELP.configTemplate}>Template (use {"{{param}}"} for variables)</FieldLabel>
```

- [ ] **Step 3: Add help to PortsBuilder**

`PortsBuilder` has no `FieldLabel`s (it's an inline row). Add a single header row with two labels above the `rows.map(...)`, inside the returned `<div className="space-y-2">`, as the first child:

```tsx
      <div className="flex items-center gap-2 mb-1">
        <span className="w-24 inline-flex items-center gap-1 text-xs text-slate-400 font-semibold">
          Protocol
          <FieldHelp text={FIELD_HELP.portProtocol} label="Protocol" />
        </span>
        <span className="flex-1 inline-flex items-center gap-1 text-xs text-slate-400 font-semibold">
          Port
          <FieldHelp text={FIELD_HELP.portNumber} label="Port" />
        </span>
      </div>
```

(The `w-24` and `flex-1` match the existing select/input widths so the labels line up with their controls.)

- [ ] **Step 4: Verify lint + types pass**

Run: `npm run lint`
Expected: no errors. `FIELD_HELP` is now fully consumed (no unused-var warning).

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Verify existing tests still pass**

Run: `npm test`
Expected: `81 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/components/DefinitionEditor.tsx
git commit -m "feat: add field help to params, config files, and ports builders"
```

---

### Task 5: Full build + manual verification

**Files:** none modified (verification only).

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds, no type errors, `/dashboard/...` definition route compiles.

- [ ] **Step 2: Manual hover/focus check**

Run: `npm run dev`, open the New Game Definition form (Dashboard → Create Server → custom definition).

Verify:
- Every labeled field shows a small `?` info icon beside its label.
- Hovering the icon shows a dark styled tooltip; moving the mouse away hides it.
- Tab key moves focus to each icon and the tooltip appears on focus, hides on blur.
- Clicking an icon does NOT submit the form (page does not navigate/reload).
- Switch through all three install tabs (SteamCMD / Download / Custom Script — Custom Script requires admin) and confirm help on each tab's fields.
- Add a Param row, a Config File row, and a Port row; confirm help icons appear (Params Min/Max/Options appear when Type = number/enum).

- [ ] **Step 3: Confirm no regressions in tests**

Run: `npm test`
Expected: `81 passed`.

- [ ] **Step 4: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "chore: verify field help tooltips render across all form tabs"
```

(If no changes were needed in this task, skip the commit.)

---

## Self-Review Notes

- **Spec coverage:** Every field listed in the spec's "Field coverage & copy" maps to a key in `FIELD_HELP` (Task 2) and is wired in Task 3 (basic/install/launch) or Task 4 (builders). Inline checkboxes (unzip, ack, executableOnPath, paramRequired) handled explicitly. Ports builder, which lacks labels, gets a header row.
- **Type consistency:** `FieldHelp({ text, label })` and `FieldLabel({ children, help })` signatures are used identically everywhere. `FIELD_HELP` keys referenced in Tasks 3–4 all exist in Task 2.
- **No placeholders:** all copy and code shown inline.
- **Testing constraint:** repo has no React DOM test harness; verification is build + lint + existing vitest suite + manual hover/focus, consistent with the spec's Testing section. No new deps introduced.
