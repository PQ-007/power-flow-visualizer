import { findMatches } from './search'
import type { ParsedFlow } from '../model/types'
import { resourcesOfNode, type Access, type ResourceKind } from './resources'

export interface ResourceUse {
  flowIndex: number
  nodeId: string
  access: Access
}

export interface Resource {
  key: string
  kind: ResourceKind
  label: string
  detail?: string
  dynamic?: boolean
  uses: ResourceUse[]
}

export interface FlowCall {
  from: number
  /** Index of the called flow, or undefined when it isn't in the loaded set. */
  to?: number
  targetId: string
  nodeId: string
}

export interface SolutionIndex {
  flows: ParsedFlow[]
  /** Every resource, sorted by kind then label. Child flows found in the solution are excluded (see `calls`). */
  resources: Resource[]
  resourceByKey: Map<string, Resource>
  flowIndexById: Map<string, number>
  calls: FlowCall[]
  /** Resource keys used by each flow (by flow index). */
  resourcesByFlow: Map<string, Access[]>[]
}

const KIND_ORDER: ResourceKind[] = [
  'sharepoint',
  'dataverse',
  'excel',
  'sql',
  'mailbox',
  'http',
  'flow',
  'envvar',
  'connection',
]

export function buildSolutionIndex(flows: ParsedFlow[]): SolutionIndex {
  const flowIndexById = new Map<string, number>()
  flows.forEach((f, i) => f.id && flowIndexById.set(f.id, i))

  const resourceByKey = new Map<string, Resource>()
  const calls: FlowCall[] = []
  const resourcesByFlow = flows.map(() => new Map<string, Access[]>())

  flows.forEach((flow, flowIndex) => {
    for (const node of flow.byId.values()) {
      for (const r of resourcesOfNode(flow, node)) {
        if (r.kind === 'flow') {
          const targetId = r.key.slice('flow:'.length)
          const to = flowIndexById.get(targetId)
          calls.push({ from: flowIndex, to, targetId, nodeId: node.id })
          if (to !== undefined) continue // drawn as a flow → flow edge, not a resource
          r.label = `Flow ${targetId} (not in this set)`
        }
        let res = resourceByKey.get(r.key)
        if (!res) {
          res = {
            key: r.key,
            kind: r.kind,
            label: r.label,
            detail: r.detail,
            dynamic: r.dynamic,
            uses: [],
          }
          resourceByKey.set(r.key, res)
        }
        res.uses.push({ flowIndex, nodeId: node.id, access: r.access })
        const accesses = resourcesByFlow[flowIndex].get(r.key) ?? []
        if (!accesses.includes(r.access)) accesses.push(r.access)
        resourcesByFlow[flowIndex].set(r.key, accesses)
      }
    }
  })

  const resources = [...resourceByKey.values()].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label),
  )
  return { flows, resources, resourceByKey, flowIndexById, calls, resourcesByFlow }
}

export interface SolutionSearchResult {
  /** Flows with matching actions (or a matching name), in solution order. */
  flows: { flowIndex: number; nodeIds: string[]; nameMatch: boolean }[]
  resources: Resource[]
}

/** Runs the single-flow search over every flow, plus flow names and resource names. */
export function searchSolution(index: SolutionIndex, query: string): SolutionSearchResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return { flows: [], resources: [] }
  const allIn = (text: string) => terms.every((t) => text.toLowerCase().includes(t))
  const flows = index.flows
    .map((flow, flowIndex) => ({
      flowIndex,
      nodeIds: [...findMatches(flow, query)],
      nameMatch: allIn(flow.displayName),
    }))
    .filter((r) => r.nodeIds.length > 0 || r.nameMatch)
  const resources = index.resources.filter((r) => allIn(`${r.label} ${r.detail ?? ''} ${r.kind}`))
  return { flows, resources }
}
