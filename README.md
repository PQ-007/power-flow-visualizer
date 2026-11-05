# Power Flow Visualizer

See any Power Automate cloud flow as a diagram — without opening Power Automate.

Drop an exported flow (`.zip` package, solution `.zip`, or a definition `.json`) into the app and
get a zoomable flow chart of triggers, actions, conditions, switches, loops and scopes. Click any
action to see its type, connector, `runAfter` rules and raw JSON. Search highlights actions by
name, connector or anything in their inputs (variable names, expressions, URLs…).

Everything runs locally in the browser. Files are never uploaded and no connector is ever called.

> Roadmap, architecture and the dry-run **simulator** design: [docs/PLAN.md](docs/PLAN.md)

## Getting flows to look at

| Source                                                 | What to load                                     |
| ------------------------------------------------------ | ------------------------------------------------ |
| My flows → ⋯ → Export → **Package (.zip)**             | the `.zip` as-is                                 |
| Solutions → Export solution                            | the solution `.zip` (all flows inside are found) |
| Dataverse `workflow` table, `clientdata` column        | save the JSON to a `.json` file                  |
| Any JSON with `triggers` / `actions` (bare definition) | the `.json` file                                 |

## Development

Requires Node 22+ (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173 — click "Load sample"
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
  parser/                 .zip/.json → definition → ParsedFlow   (pure TS, unit tested)
  graph/buildGraph.ts     ParsedFlow → ELK layout → React Flow nodes/edges
  components/             canvas, node renderers, details panel
  samples/                sample flow used by "Load sample" and tests
docs/PLAN.md              roadmap and design
```

Stack: React 19, TypeScript, Vite, [React Flow](https://reactflow.dev) (`@xyflow/react`) for the
canvas, [ELK](https://eclipse.dev/elk/) (`elkjs`) for hierarchical layout, `fflate` for unzipping.
