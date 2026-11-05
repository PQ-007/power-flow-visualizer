/**
 * Reads the result of a flow run from the JSON shapes people can get hold of:
 *
 *  A. run actions list     { value: [ { name, properties: { status, … } } ] }
 *     (…/runs/{run}/actions from the Power Automate / Logic Apps API)
 *  B. run with actions     { name, properties: { status, trigger, actions: { Name: {…} } } }
 *     (…/runs/{run}?$expand=properties/actions — what the Power Automate portal loads)
 *  C. pfv-run/1            { format: 'pfv-run/1', run, trigger, actions }  (scripts/export-run.ps1)
 *  D. any object with a top-level `actions` map of { status, input(s), output(s) } entries
 *     (e.g. CLI for Microsoft 365 `flow run get --withActions`)
 *
 * Only reads data; never follows `inputsLink` / `outputsLink` URLs (the app makes no network calls).
 */

export interface ActionRun {
  name: string
  status: string
  code?: string
  startTime?: string
  endTime?: string
  durationMs?: number
  error?: { code?: string; message?: string }
  inputs?: unknown
  outputs?: unknown
  /** Inputs/outputs exist in the run but weren't included in the file. */
  inputsLinked?: boolean
  outputsLinked?: boolean
  repetitionCount?: number
}

export interface RunData {
  /** Run id (e.g. 08584…CU12). */
  name?: string
  status?: string
  startTime?: string
  endTime?: string
  durationMs?: number
  error?: { code?: string; message?: string }
  /** Flow id (lower-case GUID) when the file says which flow it belongs to. */
  flowId?: string
  flowName?: string
  trigger?: ActionRun
  /** Action name → result. */
  actions: Map<string, ActionRun>
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/** ISO timestamps as-is; Windows PowerShell 5.1's `/Date(1700000000000)/` converted to ISO. */
function time(v: unknown): string | undefined {
  const s = str(v)
  const ms = s?.match(/^\/Date\((-?\d+)/)?.[1]
  return ms ? new Date(Number(ms)).toISOString() : s
}

const durationOf = (start?: string, end?: string) => {
  if (!start || !end) return undefined
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

/** Error from `error`, or from a failed action's `outputs.body.error` (common for connectors). */
function errorOf(p: Json, outputs: unknown): ActionRun['error'] {
  const candidates: unknown[] = [p.error]
  if (isObject(outputs) && isObject(outputs.body)) candidates.push(outputs.body.error, outputs.body)
  for (const c of candidates) {
    if (!isObject(c)) continue
    const message = str(c.message) ?? str(c.Message)
    const code = str(c.code) ?? str(c.Code)
    if (message || code) return { code, message }
  }
  return undefined
}

function actionRun(name: string, v: unknown): ActionRun | undefined {
  if (!isObject(v)) return undefined
  const p = isObject(v.properties) ? v.properties : v
  const status = str(p.status)
  if (!status) return undefined
  const inputs = p.inputs ?? p.input
  const outputs = p.outputs ?? p.output
  const startTime = time(p.startTime)
  const endTime = time(p.endTime)
  return {
    name: str(v.name) ?? name,
    status,
    code: str(p.code),
    startTime,
    endTime,
    durationMs: durationOf(startTime, endTime),
    error: status === 'Succeeded' || status === 'Skipped' ? undefined : errorOf(p, outputs),
    inputs,
    outputs,
    inputsLinked: inputs === undefined && isObject(p.inputsLink) ? true : undefined,
    outputsLinked: outputs === undefined && isObject(p.outputsLink) ? true : undefined,
    repetitionCount: typeof p.repetitionCount === 'number' ? p.repetitionCount : undefined,
  }
}

function actionsFrom(v: unknown): Map<string, ActionRun> {
  const out = new Map<string, ActionRun>()
  if (Array.isArray(v)) {
    for (const item of v) {
      const a = isObject(item) ? actionRun(str(item.name) ?? '', item) : undefined
      if (a?.name) out.set(a.name, a)
    }
  } else if (isObject(v)) {
    for (const [name, item] of Object.entries(v)) {
      const a = actionRun(name, item)
      if (a) out.set(name, a)
    }
  }
  return out
}

const guid = (s?: string) =>
  s?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0].toLowerCase()

/** Returns null when the JSON doesn't look like a run (e.g. it's a flow definition). */
export function parseRun(json: unknown): RunData | null {
  if (!isObject(json)) return null

  // A: actions list
  if (Array.isArray(json.value) && !json.properties) {
    const actions = actionsFrom(json.value)
    return actions.size ? { actions } : null
  }

  // C / D: top-level actions map; B: properties.actions
  const props = isObject(json.properties) ? json.properties : undefined
  const runInfo = isObject(json.run) ? json.run : (props ?? json)
  const actions = actionsFrom(json.actions ?? props?.actions)
  const triggerSource = json.trigger ?? props?.trigger
  const trigger = isObject(triggerSource)
    ? actionRun(str(triggerSource.name) ?? 'trigger', triggerSource)
    : undefined
  if (actions.size === 0 && !trigger) return null

  const flowObj = isObject(json.flow)
    ? json.flow
    : isObject(props?.flow)
      ? props.flow
      : isObject(props?.workflow)
        ? props.workflow
        : undefined
  const flowProps = flowObj && isObject(flowObj.properties) ? flowObj.properties : flowObj
  const startTime = time(runInfo.startTime)
  const endTime = time(runInfo.endTime)
  const status = str(runInfo.status)
  return {
    name: str(isObject(json.run) ? json.run.name : json.name),
    status,
    startTime,
    endTime,
    durationMs: durationOf(startTime, endTime),
    error: status && status !== 'Succeeded' ? errorOf(runInfo, undefined) : undefined,
    flowId: guid(str(flowObj?.id) ?? str(flowObj?.name)),
    flowName: str(flowProps?.displayName),
    trigger,
    actions,
  }
}

export function loadRunFromText(text: string): RunData | null {
  try {
    return parseRun(JSON.parse(text.replace(/^\uFEFF/, '')))
  } catch {
    return null
  }
}
