import { parseTemplate, visitExpr, type Expr } from '../expr/parse'
import { ancestorsOf } from '../model/tree'
import type { FlowNode, ParsedFlow } from '../model/types'

/**
 * What each action's expressions point at: other actions' outputs, loop items, variables,
 * the trigger, parameters. This powers clickable expressions, "Uses / Used by" and the
 * variables view.
 */

export type RefKind = 'action' | 'loop' | 'variable' | 'trigger' | 'parameter'

export interface Ref {
  kind: RefKind
  /** Action/trigger id, variable name (as written) or parameter name. */
  target: string
  /** Function that produced the reference, lower-cased (`body`, `variables`, `item`…). */
  fn: string
  /** The target action/loop doesn't exist (typo, renamed action, copied expression). */
  unresolved?: boolean
}

const FN_KIND: Record<string, RefKind> = {
  body: 'action',
  outputs: 'action',
  actions: 'action',
  actionbody: 'action',
  actionoutputs: 'action',
  result: 'action',
  items: 'loop',
  iterationindexes: 'loop',
  variables: 'variable',
  trigger: 'trigger',
  triggeroutputs: 'trigger',
  triggerbody: 'trigger',
  triggerformdatavalue: 'trigger',
  triggerformdatamultivalues: 'trigger',
  triggermultipartbody: 'trigger',
  parameters: 'parameter',
}

/** The reference a single function call makes, if any. `nodeId` is where the call appears. */
export function refOfCall(
  call: Extract<Expr, { type: 'call' }>,
  flow: ParsedFlow,
  nodeId: string,
): Ref | null {
  const fn = call.name.toLowerCase()
  if (fn === 'item') {
    const loop = [...ancestorsOf(flow, nodeId)]
      .reverse()
      .find((id) => flow.byId.get(id)?.kind === 'foreach')
    return loop
      ? { kind: 'loop', target: loop, fn }
      : { kind: 'loop', target: '', fn, unresolved: true }
  }
  const kind = FN_KIND[fn]
  if (!kind) return null
  if (kind === 'trigger') {
    const t = flow.triggers[0]
    return t ? { kind, target: t.id, fn } : { kind, target: '', fn, unresolved: true }
  }
  const arg = call.args[0]
  if (arg?.type !== 'string') return null // dynamic name: can't resolve statically
  if (kind === 'parameter' && arg.value.startsWith('$')) return null // $connections, $authentication
  const target = arg.value
  if (kind === 'action' || kind === 'loop') {
    const exists = flow.byId.has(target)
    return exists ? { kind, target, fn } : { kind, target, fn, unresolved: true }
  }
  return { kind, target, fn }
}

/** Keys holding nested actions or engine metadata rather than this action's own expressions. */
const SKIP_KEYS = new Set(['actions', 'else', 'cases', 'default', 'runAfter', 'metadata'])

/** Calls `fn` with every expression found in a node's own definition. */
export function forEachExpression(node: FlowNode, fn: (e: Expr) => void): void {
  const walk = (v: unknown, top: boolean) => {
    if (typeof v === 'string') {
      for (const seg of parseTemplate(v) ?? []) if (seg.kind === 'expr') fn(seg.expr)
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, false))
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!(top && SKIP_KEYS.has(k))) walk(x, false)
    }
  }
  walk(node.raw, true)
}

export function refsOfNode(flow: ParsedFlow, node: FlowNode): Ref[] {
  const seen = new Map<string, Ref>()
  forEachExpression(node, (expr) =>
    visitExpr(expr, (e) => {
      if (e.type !== 'call') return
      const ref = refOfCall(e, flow, node.id)
      if (!ref) return
      const key = `${ref.kind}:${ref.kind === 'variable' ? ref.target.toLowerCase() : ref.target}`
      if (!seen.has(key)) seen.set(key, ref)
    }),
  )
  return [...seen.values()]
}
