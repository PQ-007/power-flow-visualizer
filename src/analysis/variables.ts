import type { FlowNode, ParsedFlow } from '../model/types'
import { refsOfNode, type Ref } from './references'

export type VariableOp = 'set' | 'increment' | 'decrement' | 'append'

export interface VariableWrite {
  nodeId: string
  op: VariableOp
  /** Raw value from the definition (may be an expression string). */
  value: unknown
}

export interface VariableInfo {
  /** Name as initialized (or as first seen when never initialized). */
  name: string
  type?: string
  initializedBy: { nodeId: string; value: unknown }[]
  writes: VariableWrite[]
  /** Ids of actions that read the variable through `variables('name')`. */
  reads: string[]
  warnings: string[]
}

export interface FlowAnalysis {
  refs: Map<string, Ref[]>
  /** Action/trigger id → ids of actions whose expressions reference it. */
  usedBy: Map<string, string[]>
  /** Keyed by lower-cased name (variable names are case-insensitive). */
  variables: Map<string, VariableInfo>
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const WRITE_OPS: Record<string, VariableOp> = {
  setvariable: 'set',
  incrementvariable: 'increment',
  decrementvariable: 'decrement',
  appendtoarrayvariable: 'append',
  appendtostringvariable: 'append',
}

/** Foreach loops that may run iterations in parallel (explicit concurrency > 1). */
function parallelLoop(flow: ParsedFlow, node: FlowNode): FlowNode | undefined {
  let cur = node.parentId ? flow.byId.get(node.parentId) : undefined
  while (cur) {
    if (cur.kind === 'foreach') {
      const rc = isObject(cur.raw.runtimeConfiguration) ? cur.raw.runtimeConfiguration : {}
      const conc = isObject(rc.concurrency) ? rc.concurrency : {}
      if (typeof conc.repetitions === 'number' && conc.repetitions > 1) return cur
    }
    cur = cur.parentId ? flow.byId.get(cur.parentId) : undefined
  }
  return undefined
}

export function analyzeFlow(flow: ParsedFlow): FlowAnalysis {
  const refs = new Map<string, Ref[]>()
  const usedBy = new Map<string, string[]>()
  const variables = new Map<string, VariableInfo>()

  const variable = (name: string) => {
    const key = name.toLowerCase()
    let v = variables.get(key)
    if (!v) {
      v = { name, initializedBy: [], writes: [], reads: [], warnings: [] }
      variables.set(key, v)
    }
    return v
  }

  for (const node of flow.byId.values()) {
    const nodeRefs = refsOfNode(flow, node)
    refs.set(node.id, nodeRefs)
    for (const r of nodeRefs) {
      if ((r.kind === 'action' || r.kind === 'loop' || r.kind === 'trigger') && !r.unresolved) {
        const list = usedBy.get(r.target) ?? []
        if (!list.includes(node.id)) list.push(node.id)
        usedBy.set(r.target, list)
      }
      if (r.kind === 'variable') {
        const v = variable(r.target)
        if (!v.reads.includes(node.id)) v.reads.push(node.id)
      }
    }

    const inputs = isObject(node.raw.inputs) ? node.raw.inputs : undefined
    const type = node.type.toLowerCase()
    if (type === 'initializevariable' && Array.isArray(inputs?.variables)) {
      for (const decl of inputs.variables) {
        if (!isObject(decl) || typeof decl.name !== 'string') continue
        const v = variable(decl.name)
        v.name = decl.name
        v.type = typeof decl.type === 'string' ? decl.type : undefined
        v.initializedBy.push({ nodeId: node.id, value: decl.value })
      }
    } else if (WRITE_OPS[type] && typeof inputs?.name === 'string') {
      variable(inputs.name).writes.push({
        nodeId: node.id,
        op: WRITE_OPS[type],
        value: inputs.value,
      })
    }
  }

  for (const v of variables.values()) {
    if (v.initializedBy.length === 0) v.warnings.push('Used but never initialized')
    if (v.initializedBy.length > 1) v.warnings.push('Initialized more than once')
    for (const init of v.initializedBy) {
      if (flow.byId.get(init.nodeId)?.parentId)
        v.warnings.push('Initialized inside a container (must be at the top level)')
    }
    if (v.reads.length === 0) v.warnings.push('Never read')
    for (const w of v.writes) {
      const loop = parallelLoop(flow, flow.byId.get(w.nodeId)!)
      if (loop)
        v.warnings.push(
          `Changed inside "${loop.displayName}", which runs iterations in parallel: values may race`,
        )
    }
  }

  return { refs, usedBy, variables }
}

/** Ids of every action touching a variable, with its role (for highlighting). */
export function variableRoles(v: VariableInfo): Map<string, 'write' | 'read'> {
  const roles = new Map<string, 'write' | 'read'>()
  for (const id of v.reads) roles.set(id, 'read')
  for (const i of v.initializedBy) roles.set(i.nodeId, 'write')
  for (const w of v.writes) roles.set(w.nodeId, 'write')
  return roles
}
