# Power Flow Visualizer

See any Power Automate cloud flow as a diagram — without opening Power Automate.

Drop an exported flow (`.zip` package, solution `.zip`, or a definition `.json`) into the app and
get a zoomable flow chart of triggers, actions, conditions, switches, loops and scopes.

- Each card shows the designer name, the connector and operation ("SharePoint · Update item")
  and the key input (condition expression, variable assignment, list name, URL…).
- Collapse and expand any container, or pick how many levels to show. Large flows open collapsed.
- The outline on the left lists every step; click one to expand what hides it and zoom to it.
- Search (`/`) matches names, connectors and anything in an action's inputs (variable names,
  expressions, URLs…). Matches inside collapsed containers mark the container.
- Click an action for its details: links to its container, what it runs after, what runs after
  it, which actions/variables it uses and which actions use it.
- Expressions are syntax-highlighted and pretty-printed; `body('X')`, `items('Loop')`,
  `variables('v')` and friends are links. References to missing actions are flagged.
- The **Variables** tab lists every variable with where it's initialized, changed and read,
  plus warnings (never initialized, never read, changed in a parallel loop…). Selecting one
  highlights those actions on the canvas.
- Red dashed edges show error-handling paths (`runAfter` Failed/TimedOut).

**Real runs:** load a run's results (**▶ Load run…**) to see which actions succeeded, failed or
were skipped, which branches were taken, durations, error messages and actual inputs/outputs.
The app opens at the first real failure. How to get a run file: [docs/run-export.md](docs/run-export.md)
(a PowerShell export script, or straight from the browser). Try **Samples… → Sample flow + failed
run**.

When several flows are loaded (a solution), the **Solution** view shows:

- a **map** of flows and the SharePoint lists, Dataverse tables, Excel tables, HTTP hosts,
  mailboxes, environment variables and child flows they trigger on, read, write or call;
- **search across every flow** — e.g. type `Invoices` to see every flow and action touching
  that list, then click an action to open the flow right there;
- details for each flow (what it calls, what calls it, what it uses) and each resource (every
  action using it, grouped by flow).

Everything runs locally in the browser. Files are never uploaded and no connector is ever called.

> Roadmap, architecture and the dry-run **simulator** design: [docs/PLAN.md](docs/PLAN.md)

## Getting flows to look at

| Source                                                 | What to load                                     |
| ------------------------------------------------------ | ------------------------------------------------ |
| My flows → ⋯ → Export → **Package (.zip)**             | the `.zip` as-is                                 |
| Solutions → Export solution                            | the solution `.zip` (all flows inside are found) |
| `pac solution unpack` output                           | **Open folder** and pick the unpacked folder     |
| Dataverse `workflow` table, `clientdata` column        | save the JSON to a `.json` file                  |
| Any JSON with `triggers` / `actions` (bare definition) | the `.json` file                                 |

## Development

Requires Node 22+ (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173 — pick a sample from "Samples…"
```

| Script              | Does                                                   |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Vite dev server with hot reload                        |
| `npm test`          | Vitest unit tests (`npm run test:watch` to watch)      |
| `npm run typecheck` | TypeScript project build check                         |
| `npm run lint`      | oxlint                                                 |
| `npm run format`    | Prettier write (`format:check` to verify)              |
| `npm run check`     | typecheck + lint + format check + tests (what CI runs) |
| `npm run build`     | production build into `dist/` (static, works offline)  |

## Project layout

```
src/
  model/types.ts          UI-agnostic flow model (FlowNode, FlowBranch, ParsedFlow)
  model/catalog.ts        offline connector / operation / action-type display names
  model/describe.ts       card titles and one-line summaries (condition text, assignments…)
  model/tree.ts           ancestors, depth, collapse defaults, designer-order walk
  parser/                 .zip/.json → definition → ParsedFlow   (pure TS, unit tested)
  expr/                   WDL expression parser + printer
  analysis/references.ts  what each action's expressions point at (actions, loops, variables…)
  analysis/variables.ts   variables view data + "used by" index + warnings
  analysis/search.ts      search matching
  analysis/resources.ts   lists/tables/hosts/child flows/env vars each action touches
  analysis/solution.ts    solution index (resources × flows, child-flow calls) + cross-flow search
  graph/buildSolutionGraph.ts  solution map layout
  run/                    run file importer, run ↔ flow matching, overlay helpers
  graph/buildGraph.ts     ParsedFlow (+ collapsed set) → ELK layout → React Flow nodes/edges
  components/             FlowWorkspace (single flow), solution/ (map + search), panels, ELK worker
  samples/                sample flow + sample solution (Samples… menu and tests)
docs/PLAN.md              roadmap and design
docs/run-export.md        how to save a run for the overlay
scripts/export-run.ps1    run export script (runs on your machine, your sign-in)
```

Stack: React 19, TypeScript, Vite, [React Flow](https://reactflow.dev) (`@xyflow/react`) for the
canvas, [ELK](https://eclipse.dev/elk/) (`elkjs`) for hierarchical layout, `fflate` for unzipping.
