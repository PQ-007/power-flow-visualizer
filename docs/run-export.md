# Showing a real run on the diagram

Power Flow Visualizer can colour a flow with the results of a real run: which actions succeeded,
failed or were skipped, which Condition/Switch branches were taken, how long each step took, the
error messages, and (optionally) each action's actual inputs and outputs.

The app never connects to Power Automate. You save a run to a JSON file yourself, then open it
in the app: open the flow (or its solution) first, then use **▶ Load run…**, **Open file**, or
drag the file onto the window. The app picks the matching flow (by flow id, otherwise by action
names) and jumps to the first failed action.

Try it without any setup: **Samples… → Sample flow + failed run**.

## Option 1: export script (recommended)

`scripts/export-run.ps1` (PowerShell 7 or Windows PowerShell 5.1) saves a run including every
action's inputs and outputs.

1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and sign in
   with the account that can see the flow:

   ```powershell
   az login
   ```

2. Open the flow in Power Automate and copy the ids from the browser address bar:
   `https://make.powerautomate.com/environments/<EnvironmentId>/flows/<FlowId>/runs/<RunId>`

3. Run the script:

   ```powershell
   # The most recent failed run
   ./scripts/export-run.ps1 -EnvironmentId <EnvironmentId> -FlowId <FlowId> -Failed

   # A specific run, statuses and errors only (no inputs/outputs)
   ./scripts/export-run.ps1 -EnvironmentId <EnvironmentId> -FlowId <FlowId> -RunId <RunId> -NoData
   ```

It writes `run-<RunId>.json`. If you can't use the Azure CLI, pass a token you obtained another
way with `-AccessToken`.

Notes:

- The script uses the same service API the Power Automate portal uses for run history
  (`api.flow.microsoft.com`). It isn't officially documented and could change.
- Actions inside loops show their overall status and repetition count; per-iteration details
  aren't exported yet.
- The file may contain personal or business data from the run. Keep it local and don't commit it.
  The temporary download links for inputs/outputs are not written to the file.

## Option 2: from the browser (no installs)

1. Open the run in the Power Automate portal.
2. Press F12 → **Network**, reload the page, and filter for `runs/`.
3. Pick the request whose URL contains `$expand=properties%2Factions`, open **Response**, and save
   it as a `.json` file.

This gives statuses, timings and errors. Inputs/outputs are only links in this response, so the
app shows "not included" for them.

## Option 3: CLI for Microsoft 365

```bash
m365 flow run get --environmentName <EnvironmentId> --flowName <FlowId> --name <RunId> --withActions --output json > run.json
```

The app accepts this output too (not yet verified against a real tenant; please report problems).

## Accepted file shapes

The importer (`src/run/parseRun.ts`) recognises:

- `pfv-run/1` — written by the script above;
- a run with `properties.actions` — what the portal loads (option 2);
- an actions list `{ "value": [ { "name", "properties": { "status", … } } ] }`;
- any object with a top-level `actions` map of `{ status, input(s), output(s) }` entries.
