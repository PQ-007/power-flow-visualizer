# Power Flow Visualizer — Plan

## 1. Problem

Flows written by other people are slow to understand inside the Power Automate designer:
everything is collapsed, one card at a time, nested scopes hide what's inside, and there is no way
to ask "where is this variable set?" or "what runs if this action fails?". Finding the one action
that needs fixing takes too long.

## 2. Goal

A local, read-only tool that turns a flow export into a diagram you can navigate, search and
**simulate** (dry-run with fake data), without connecting to Power Automate or calling any
connector.

Non-goals: editing flows and saving back, running real connectors, replacing the designer.

## 3. Principles

- **Offline and private.** Files are read in the browser. No backend, no telemetry, no connector
  calls. Enforced later with a CSP (`connect-src 'self'`).
- **Pure core, thin UI.** Parsing, analysis and simulation are plain TypeScript with no React, so
  they're unit-tested against fixture flows. The UI only renders the results.
- **Mirror the designer's mental model.** Same names (spaces, not underscores), same branch labels
  (If yes / If no, Case …, Default), top-to-bottom order, so what you see maps 1:1 to what you'll
  fix in Power Automate.

## 4. Input formats

Flows use the Logic Apps Workflow Definition Language (WDL): `definition.triggers` and
`definition.actions`, where each action has `type`, `inputs`, and `runAfter`, and containers nest
more actions.

| Source                                  | Shape                                         | Status |
| --------------------------------------- | --------------------------------------------- | ------ |
| Legacy export package `.zip`            | `Microsoft.Flow/flows/<guid>/definition.json` | ✅ M0  |
| Solution export `.zip`                  | `Workflows/<name>-<guid>.json`                | ✅ M0  |
| Bare definition / `{properties:{…}}`    | JSON file                                     | ✅ M0  |
| Dataverse `workflow.clientdata`         | `{properties:{definition}}` JSON              | ✅ M0  |
| Designer clipboard ("Copy action")      | `{ nodeId, serializedOperation }` etc.        | M1     |
| Paste from clipboard (Ctrl+V on canvas) | any of the above                              | M1     |

Container types and how they map to the diagram:

| WDL type  | Kind      | Branches                                          |
| --------- | --------- | ------------------------------------------------- |
| `If`      | condition | `actions` → If yes, `else.actions` → If no        |
| `Switch`  | switch    | `cases.*.actions` → Case: value, `default`        |
| `Foreach` | foreach   | `actions` (loop body)                             |
| `Until`   | until     | `actions` (loop body)                             |
| `Scope`   | scope     | `actions`                                         |
| other     | action    | — (connector from `inputs.host`, e.g. SharePoint) |

## 5. Architecture

```
 File / zip / paste
        │
        ▼
 parser/      loadFlow (zip + JSON shape detection) → parseDefinition → ParsedFlow
        │                                                          (model/types.ts)
        ├──► analysis/   variables, data lineage, references, lint warnings      (M2)
        ├──► sim/        expression evaluator + step engine + run trace           (M3)
        │
        ▼
 graph/       ParsedFlow (+ highlights / sim trace) → ELK layout → React Flow nodes/edges
        │
        ▼
 components/  Canvas · Outline tree · Details panel · Search · Simulator panel
```

Key model facts the code relies on:

- Action names are unique across the whole flow, so the name is the node id.
- `runAfter` always points at siblings in the same branch, so each container level can be laid
  out independently. Top-level actions with empty `runAfter` follow the trigger.
- `runAfter` statuses other than `Succeeded` (Failed, TimedOut, Skipped) are drawn as red dashed
  edges with a label — this is how Try/Catch patterns become visible at a glance.

## 6. Milestones

### M0 — Dev environment + walking skeleton ✅

- Vite + React 19 + TypeScript, oxlint, Prettier, Vitest, GitHub Actions CI.
- Parser for zip/JSON shapes, all container kinds, connector extraction, basic warnings.
- ELK-based nested layout rendered with React Flow; details panel with raw JSON; search that dims
  non-matching actions; sample flow.

### M1 — Viewer you can use every day

Done:

- ✅ Collapse / expand containers from the canvas or the outline; "Show" levels (top level only,
  2 levels, 3 levels, everything). Flows over 80 steps open with nested containers collapsed.
- ✅ Left **outline** (table of contents) sharing collapse state with the canvas; clicking an
  item expands whatever hides it, selects it and zooms to it. While searching, the outline shows
  only matches and the containers leading to them.
- ✅ Search matches hidden inside collapsed containers mark that container (dashed highlight).
- ✅ Connector display names and friendly operation titles from an offline table
  (`src/model/catalog.ts`; unknown ids are humanized).
- ✅ Key input on each card: condition expression, Switch subject, loop source, variable
  assignments, HTTP method + URL, SharePoint list, Terminate status… (`src/model/describe.ts`).
- ✅ Details panel: clickable "Inside", "Runs after" and "Then" links to jump around.
- ✅ ELK runs in a Web Worker and ships as a separate file (main bundle 1.9 MB → 0.44 MB).
  A 361-step synthetic flow expands fully in ~0.5 s.
- ✅ Keyboard: `/` focuses search, `Esc` clears search/selection.

Remaining:

- Paste flow JSON from the clipboard; designer "Copy action" format.
- Flow picker with search for solutions with many flows; remember last opened (IndexedDB).
- Connector icons (bundled, offline).
- Child flows: if a `Workflow` action calls a flow that's in the same solution, link to it.
- **Open in Power Automate** button: build the designer URL from the environment and flow ids
  in the export. Just a link; the app itself still makes no network calls.

### M2 — Understanding tools ("find the piece to fix")

Done:

- ✅ **Expression parser** for WDL (`src/expr`): whole-value `@…`, interpolated `@{…}`, `@@`
  escapes, calls, `'it''s'` strings, `?['a/b']` / `.prop` member chains. Tolerant: bad input
  becomes an error node, never an exception. Shared with the M3 simulator.
- ✅ **Clickable expressions** in the details panel: syntax-highlighted, long calls broken one
  argument per line; `body('X')`, `outputs('X')`, `result('X')`, `items('Loop')`, `item()`,
  `triggerBody()`… jump to that action, `variables('v')` opens the variable. References to
  actions that don't exist are flagged in red.
- ✅ Readable **Definition** view (YAML-like) instead of raw JSON (raw JSON still one click away).
- ✅ **Uses / Used by** per action (data lineage as lists).
- ✅ **Variables view** (sidebar tab): every variable with where it's initialized, changed (with
  the value) and read. Selecting one highlights those actions on the canvas (orange = writes,
  blue = reads), filters the outline, and zooms to fit them. Warnings: used but never
  initialized, initialized twice or inside a container, never read, changed inside an
  Apply to each with parallel iterations.

Remaining:

- Data lineage overlay: optional data-flow edges on the canvas.
- **Search 2.0**: filters like `connector:sharepoint`, `type:SetVariable`, `uses:ApprovalStatus`,
  `fails-to:Catch`.
- **Lint / smells**: unreachable actions, no error handling around connectors, hard-coded emails or
  URLs, Apply-to-each with concurrency + Set variable (race), unused variables, deep nesting.
- **Plain-language summary** (deterministic, no AI): "Triggered when an item is created in
  SharePoint 'Invoices'. If Amount > 10000 → starts an approval …".
- **Notes on actions**: attach a note to any action, saved as a small JSON file next to the
  export, so what one person figured out is there for the next.

### M2.5 — Solution-wide view (many flows by many people)

Done:

- ✅ Load a whole solution: solution `.zip`, unpacked `pac solution unpack` folder ("Open folder"),
  or several files at once. Flow names and ids come from `customizations.xml` (falls back to the
  file name without its GUID); connection references from each workflow JSON.
- ✅ **Resources** each action touches (`src/analysis/resources.ts`): SharePoint lists/libraries
  (GUIDs resolved to names through action metadata), Dataverse tables, Excel tables, SQL tables,
  literal mailboxes, HTTP hosts, child flows, connection references, environment variables.
  Access is classified as triggers / reads / writes / calls / uses from the trigger role and
  operation id.
- ✅ **Search across every flow** (action names, connectors, inputs, expressions) plus flow and
  resource names. Results list matching actions per flow; clicking one opens that flow at the
  action with the search kept.
- ✅ **Solution map**: flows and resources as boxes, edges coloured by access (reads, writes,
  triggers, calls child flow), resource kinds toggleable (connection references hidden by
  default). Selecting a node highlights its neighbours; double-click opens a flow.
- ✅ Details: per flow (trigger, steps, file, calls / called by, resources with access); per
  resource (every action using it, grouped by flow, each opening the flow at that action).
- ✅ "Run a child flow" actions link to the child flow when it's in the loaded set.
- ✅ Invented sample solution (5 flows) under `src/samples/solution`, loaded through the same
  code path as a real export.

Remaining:

- More connectors in the resource extractor (Teams channels, Planner plans, OneDrive files,
  Forms) as real flows show which matter.
- Group the map by resource when it gets crowded (e.g. 50+ flows).

### M2.6 — Real run overlay

Done:

- ✅ Run importer (`src/run/parseRun.ts`) for the shapes people can get: the portal's run JSON
  (`properties.actions`), the run-actions list, CLI for Microsoft 365 output, and `pfv-run/1`
  written by `scripts/export-run.ps1`. Handles a UTF-8 BOM and Windows PowerShell 5.1 dates.
- ✅ The run is matched to a loaded flow by flow id, else by action names (the flow on screen
  first); run steps missing from the flow are reported ("different version?").
- ✅ Diagram: ✓ / ✕ / – badges, failed actions and scopes in red, skipped and not-run actions
  faded, Condition/Switch branches marked taken / not taken, executed edges emphasised.
  Outline shows a status dot per step.
- ✅ Lands on the first **root-cause** failure (the innermost failed action, not the scope
  reporting it); "Go to error" cycles through failures.
- ✅ Details panel "This run": status, code, start, duration, repetitions, error message, actual
  inputs and outputs.
- ✅ `scripts/export-run.ps1` + `docs/run-export.md` (script, browser DevTools, CLI for
  Microsoft 365). The script never writes the temporary SAS download links to the file.

Remaining:

- Per-iteration results for actions inside loops (repetitions API) with an iteration picker.
- Verify the script and the CLI for Microsoft 365 shape against a real tenant.
- The simulator (M3) can reuse a run's outputs as its mocks.

### M3 — Simulator (dry run)

Walk the flow the way the engine would, with fake data, and show which path is taken.

- **Inputs**: a trigger payload (JSON editor, prefilled from a schema-shaped template) and optional
  mocked outputs per action (default: `{}` / status `Succeeded`).
- **Engine** (pure TS, in `src/sim`):
  - Topological order per branch using `runAfter`; an action runs only when all predecessors
    reached one of its allowed statuses, otherwise it is `Skipped` (and Skipped propagates, as in
    the real engine).
  - Conditions/Switch evaluated with the expression evaluator; loops iterate over the evaluated
    array (capped, with concurrency treated as sequential); Until with an iteration cap; Terminate
    stops the run; Scope status = worst child status.
  - Variables actions actually update simulated state.
  - When an expression can't be evaluated (unsupported function, missing mock) the simulator
    **asks the user** to pick the branch/value instead of failing.
- **Expression evaluator**: start with the commonly used functions — logic (`equals`, `and`, `or`,
  `not`, `greater*`, `less*`, `if`, `coalesce`, `empty`, `contains`), data (`variables`,
  `body`, `outputs`, `triggerBody`, `triggerOutputs`, `items`, `item`, `parameters`), strings
  (`concat`, `toLower`, `toUpper`, `substring`, `replace`, `split`, `trim`, `length`), collections
  (`first`, `last`, `join`, `union`, `createArray`), conversion (`int`, `string`, `bool`, `json`,
  `float`), dates (`utcNow` with a fixed clock, `addDays`, `formatDateTime` basics). Grow the list
  from real flows.
- **"What if it fails?"**: force any action to Failed / TimedOut and see which `runAfter` paths
  (Catch scopes, notifications) fire.
- **UI**: play / step / reset; executed path highlighted, skipped actions greyed, per-step panel
  showing evaluated inputs, chosen branch, and the variable state after the step; timeline list
  of steps.
- Save/load simulation scenarios (trigger payload + mocks) as JSON next to the flow.

### M4 — Compare & share

- **Diff two versions** of the same flow (e.g. two exports): added / removed / changed actions
  coloured on the canvas, side-by-side JSON diff for changed ones.
- Export the diagram as PNG / SVG, and as Mermaid text for wikis.
- Export a single self-contained HTML report (diagram + variables + lint) to hand to colleagues.
- **CLI** reusing the pure core: `pfv render flow.json --mermaid` for docs and PRs,
  `pfv diff old.zip new.zip` for a reviewable change summary.

### M5 — Packaging

- **PWA** (installable, works fully offline) — cheapest way to get "its own window".
- Optional **Tauri** desktop build (small native `.exe`, open `.zip` by double-click /
  file association) if a real desktop app is wanted.
- Optional **VS Code extension**: diagram beside the flow JSON for teams that keep solutions in
  git.

Deliberately not planned: AI "explain this flow" (would send flow contents to an outside
service; the deterministic summary in M2 covers most of the value).

## 7. Testing strategy

- `src/samples` + a `fixtures/` folder of sanitized real-world exports (strip tenant URLs, emails,
  GUIDs). Every new WDL quirk found → add a fixture + test.
- Unit tests for parser, analysis and simulator (bulk of coverage, fast, Node-only).
- Layout tests check structure (parent-before-child, ordering), not pixel positions.
- A few Playwright smoke tests (load sample, click node, search) once the UI stabilises.

## 8. Risks / open questions

| Risk                                                         | Mitigation                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| WDL has more shapes than documented (webhooks, `Http`, etc.) | Unknown types render as generic actions; parser never throws on unknown fields |
| Expression evaluator will never be 100% complete             | Ask-the-user fallback; show "unsupported: fn" clearly instead of guessing      |
| Huge flows (1000+ actions) slow to lay out                   | Web Worker, collapse by default below depth N, cache layout per collapse state |
| Exports may contain secrets / personal data                  | Strictly local processing; CSP; never commit real exports                      |

## 9. Suggested order of work (next steps)

1. ✅ M1: collapse/expand, outline, friendly names, key inputs on cards, layout worker.
2. ✅ M2: expression parser → clickable expressions → variables view (lineage overlay left).
3. ✅ M2.5: solution-wide search and map.
4. ✅ M2.6: real run overlay.
5. M3: simulator engine (reusing the expression parser and real-run outputs), then its UI.
6. M1 leftovers, M4, M5 as needed.
