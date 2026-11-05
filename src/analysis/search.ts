import { actionSummary, actionTitle } from '../model/describe'
import type { FlowNode, ParsedFlow } from '../model/types'

const haystacks = new WeakMap<FlowNode, string>()

/** Everything a person might type to find an action, lower-cased. Nested actions excluded. */
function haystack(node: FlowNode): string {
  let h = haystacks.get(node)
  if (h === undefined) {
    const { actions: _a, else: _e, cases: _c, default: _d, ...own } = node.raw
    h = [
      node.name,
      node.displayName,
      node.type,
      node.connector ?? '',
      actionTitle(node),
      actionSummary(node) ?? '',
      JSON.stringify(own),
    ]
      .join('\n')
      .toLowerCase()
    haystacks.set(node, h)
  }
  return h
}

/** Ids of nodes matching every whitespace-separated term of `query` (case-insensitive). */
export function findMatches(flow: ParsedFlow, query: string): Set<string> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const out = new Set<string>()
  if (terms.length === 0) return out
  for (const node of flow.byId.values()) {
    const h = haystack(node)
    if (terms.every((t) => h.includes(t))) out.add(node.id)
  }
  return out
}
