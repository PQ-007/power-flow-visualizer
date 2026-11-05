# Power Flow Visualizer

Offline viewer (and, later, dry-run simulator) for Power Automate flow definitions. See
`docs/PLAN.md` for the roadmap and `README.md` for scripts.

## Rules

- Never add network calls. Flows are loaded from local files only; nothing talks to Power
  Automate, Dataverse or any connector.
- Keep `src/model`, `src/parser`, `src/graph` (and future `src/analysis`, `src/sim`) free of React
  so they stay unit-testable in Node. UI lives in `src/components` and `src/App.tsx`.
- `runAfter` always references siblings in the same branch; layout relies on that.
- Sample/fixture flows must be invented or fully sanitized (no real tenant URLs, emails, GUIDs).

## Before committing

Run `npm run check` (typecheck, oxlint, prettier, vitest). Add tests for parser/analysis changes.
