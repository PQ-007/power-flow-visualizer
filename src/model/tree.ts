import { CONTAINER_KINDS, type FlowNode, type ParsedFlow } from './types'

/** Container ids enclosing `id`, outermost first. */
export function ancestorsOf(flow: ParsedFlow, id: string): string[] {
  const out: string[] = []
  let cur = flow.byId.get(id)?.parentId
  while (cur) {
    out.unshift(cur)
    cur = flow.byId.get(cur)?.parentId
  }
  return out
}

/** 0 for top-level actions and triggers. */
export const depthOf = (flow: ParsedFlow, id: string) => ancestorsOf(flow, id).length

export const isContainer = (n: FlowNode) => CONTAINER_KINDS.has(n.kind)

export function containerIds(flow: ParsedFlow): string[] {
  return [...flow.byId.values()].filter(isContainer).map((n) => n.id)
}

/** Number of actions nested (at any depth) inside a node. */
export function descendantCount(node: FlowNode): number {
  return node.branches.reduce(
    (sum, b) => sum + b.nodes.reduce((s, n) => s + 1 + descendantCount(n), 0),
    0,
  )
}

/** Containers at depth >= `minDepth` (0 = collapse everything). */
export function containersAtOrBelow(flow: ParsedFlow, minDepth: number): Set<string> {
  return new Set(containerIds(flow).filter((id) => depthOf(flow, id) >= minDepth))
}

/** Sensible starting state: small flows fully open, large ones show the top level only. */
export function defaultCollapsed(flow: ParsedFlow, threshold = 80): Set<string> {
  return flow.byId.size > threshold ? containersAtOrBelow(flow, 1) : new Set()
}

/** Depth-first walk in designer order (trigger, then actions, branches left to right). */
export function* walk(flow: ParsedFlow): Generator<FlowNode> {
  function* rec(nodes: FlowNode[]): Generator<FlowNode> {
    for (const n of nodes) {
      yield n
      for (const b of n.branches) yield* rec(b.nodes)
    }
  }
  yield* rec(flow.triggers)
  yield* rec(flow.actions)
}
