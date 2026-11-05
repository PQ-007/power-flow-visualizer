import { CONTAINER_KINDS, type FlowBranch, type FlowNode, type ParsedFlow } from '../model/types'
import type { ActionRun, RunData } from './parseRun'

/** Visual bucket for a run status. */
export type RunClass = 'succeeded' | 'failed' | 'skipped' | 'running' | 'unknown'

export function runClass(status: string | undefined): RunClass {
  switch (status?.toLowerCase()) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
    case 'timedout':
    case 'faulted':
    case 'aborted':
    case 'cancelled':
      return 'failed'
    case 'skipped':
    case 'ignored':
      return 'skipped'
    case 'running':
    case 'waiting':
    case 'paused':
      return 'running'
    default:
      return 'unknown'
  }
}

export interface RunOverlay {
  run: RunData
  /** Flow node id (actions and trigger) → result. */
  byId: Map<string, ActionRun>
  /** Run entries whose action isn't in this flow (renamed/deleted since, or another flow). */
  unmatched: string[]
  /** Share of the run's actions found in the flow (0–1); low means "wrong flow or version". */
  coverage: number
}

export function matchRun(flow: ParsedFlow, run: RunData): RunOverlay {
  const byId = new Map<string, ActionRun>()
  const unmatched: string[] = []
  for (const [name, a] of run.actions) {
    if (flow.byId.has(name)) byId.set(name, a)
    else unmatched.push(name)
  }
  const trigger = flow.triggers[0]
  if (run.trigger && trigger) byId.set(trigger.id, run.trigger)
  const coverage = run.actions.size ? (run.actions.size - unmatched.length) / run.actions.size : 0
  return { run, byId, unmatched, coverage }
}

/** True when the action actually executed (not skipped, not absent from the run). */
export function ran(overlay: RunOverlay, id: string): boolean {
  const c = runClass(overlay.byId.get(id)?.status)
  return c === 'succeeded' || c === 'failed' || c === 'running'
}

/** A branch was taken if anything inside it executed. */
export function branchTaken(overlay: RunOverlay, branch: FlowBranch): boolean {
  const any = (nodes: FlowNode[]): boolean =>
    nodes.some((n) => ran(overlay, n.id) || n.branches.some((b) => any(b.nodes)))
  return any(branch.nodes)
}

/**
 * The failures worth looking at first: failed actions with no failed action inside them
 * (a failed Scope is usually just reporting a failure within). In designer order.
 */
export function rootCauses(flow: ParsedFlow, overlay: RunOverlay): string[] {
  const failed = (n: FlowNode) => runClass(overlay.byId.get(n.id)?.status) === 'failed'
  const out: string[] = []
  const visit = (nodes: FlowNode[]) => {
    for (const n of nodes) {
      const inner = n.branches.flatMap((b) => b.nodes)
      const before = out.length
      visit(inner)
      const hasFailedInside = out.length > before
      if (failed(n) && !(CONTAINER_KINDS.has(n.kind) && hasFailedInside)) out.push(n.id)
    }
  }
  // Collect in pre-order so the first failure in the flow comes first.
  visit([...flow.triggers, ...flow.actions])
  const order = new Map<string, number>()
  let i = 0
  const walk = (nodes: FlowNode[]) =>
    nodes.forEach((n) => {
      order.set(n.id, i++)
      n.branches.forEach((b) => walk(b.nodes))
    })
  walk([...flow.triggers, ...flow.actions])
  return out.sort((a, b) => order.get(a)! - order.get(b)!)
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m} min ${Math.round((ms % 60_000) / 1000)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
