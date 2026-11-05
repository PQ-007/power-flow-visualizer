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

### M0 — Dev environment + walking skeleton ✅ (this commit)

- Vite + React 19 + TypeScript, oxlint, Prettier, Vitest, GitHub Actions CI.
- Parser for zip/JSON shapes, all container kinds, connector extraction, basic warnings.
- ELK-based nested layout rendered with React Flow; details panel with raw JSON; search that dims
  non-matching actions; sample flow.

### M1 — Viewer you can use every day

- Collapse / expand containers (click header); "collapse all below depth N".
- Left **outline tree** (like a table of contents), synced with canvas selection; click to
  zoom-to-node.
- Connector display names and icons from a bundled offline table (`sharepointonline` →
  SharePoint), friendly operation titles (`PatchItem` → Update item).
- Show the key inputs on the card (e.g. condition expression, Compose value, variable name).
- Paste flow JSON from the clipboard; designer "Copy action" format.
- Multiple flows from a solution: flow picker with search; remember last opened via IndexedDB.
- Performance: run ELK in a Web Worker and lazy-load it (it's ~1.5 MB); target smooth pan/zoom on
  500+ action flows.
- Child flows: if a `Workflow` action calls a flow that's in the same solution, link to it.

### M2 — Understanding tools ("find the piece to fix")

- **Expression parser** for WDL (`@{…}`, `@fn(...)`, `?['a/b']` paths) — shared with M3.
- **Variables view**: every variable, where it's initialized, set, incremented, appended, read.
  Click → highlight all those actions.
- **Data lineage**: from `body('X')`, `outputs('X')`, `items('Loop')`, `triggerOutputs()`
  references, show "uses data from" / "data used by" for each action; optional overlay of
  data-flow edges on the canvas.
- **Search 2.0**: filters like `connector:sharepoint`, `type:SetVariable`, `uses:ApprovalStatus`,
  `fails-to:Catch`.
- **Lint / smells**: unreachable actions, no error handling around connectors, hard-coded emails or
  URLs, Apply-to-each with concurrency + Set variable (race), unused variables, deep nesting.
- **Plain-language summary** (deterministic, no AI): "Triggered when an item is created in
  SharePoint 'Invoices'. If Amount > 10000 → starts an approval …".

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

### M5 — Packaging

- **PWA** (installable, works fully offline) — cheapest way to get "its own window".
- Optional **Tauri** desktop build (small native `.exe`, open `.zip` by double-click /
  file association) if a real desktop app is wanted.

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
| ELK bundle size (~1.5 MB)                                    | Lazy-load in a worker (M1)                                                     |

## 9. Suggested order of work (next steps)

1. M1: collapse/expand + outline tree (biggest usability win for large flows).
2. M1: connector names/icons + key inputs on cards.
3. M2: expression parser → variables view → lineage.
4. M3: simulator engine on top of the expression parser, then the simulator UI.
5. M4/M5 as needed.
