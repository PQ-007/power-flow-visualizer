import type { FlowBranch, FlowNode, NodeKind, ParsedFlow } from '../model/types'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

export function kindFromType(type: string): NodeKind {
  switch (type.toLowerCase()) {
    case 'if':
      return 'condition'
    case 'switch':
      return 'switch'
    case 'foreach':
      return 'foreach'
    case 'until':
      return 'until'
    case 'scope':
      return 'scope'
    default:
      return 'action'
  }
}

/** Power Automate stores display names with spaces replaced by underscores. */
export const toDisplayName = (name: string) => name.replace(/_/g, ' ')

/** Extracts `sharepointonline` from `.../apis/shared_sharepointonline` or `['shared_sharepointonline']`. */
function connectorInfo(raw: Json): { connector?: string; operationId?: string } {
  const inputs = isObject(raw.inputs) ? raw.inputs : undefined
  const host = inputs && isObject(inputs.host) ? inputs.host : undefined
  if (!host) return {}
  const operationId = typeof host.operationId === 'string' ? host.operationId : undefined
  const candidates: unknown[] = [host.apiId, host.connectionName]
  if (isObject(host.connection))
    candidates.push(host.connection.name, host.connection.referenceName)
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const m = c.match(/shared_([a-z0-9]+)/i)
    if (m) return { connector: m[1].toLowerCase(), operationId }
    if (!c.includes('/') && !c.includes('@')) return { connector: c, operationId }
  }
  return { operationId }
}

function normalizeRunAfter(v: unknown): Record<string, string[]> {
  if (!isObject(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, statuses] of Object.entries(v)) {
    out[k] = Array.isArray(statuses) ? statuses.map(String) : []
  }
  return out
}

interface Ctx {
  byId: Map<string, FlowNode>
  warnings: string[]
}

function parseActions(
  actions: unknown,
  ctx: Ctx,
  parentId?: string,
  branchId?: string,
): FlowNode[] {
  if (actions === undefined) return []
  if (!isObject(actions)) {
    ctx.warnings.push(`Expected an "actions" object under ${parentId ?? 'root'}`)
    return []
  }
  return Object.entries(actions).map(([name, raw]) =>
    parseNode(name, isObject(raw) ? raw : {}, 'action', ctx, parentId, branchId),
  )
}

function parseNode(
  name: string,
  raw: Json,
  role: 'trigger' | 'action',
  ctx: Ctx,
  parentId?: string,
  branchId?: string,
): FlowNode {
  const type = typeof raw.type === 'string' ? raw.type : 'Unknown'
  const kind: NodeKind = role === 'trigger' ? 'trigger' : kindFromType(type)
  const node: FlowNode = {
    id: name,
    name,
    displayName: toDisplayName(name),
    type,
    kind,
    ...connectorInfo(raw),
    runAfter: normalizeRunAfter(raw.runAfter),
    parentId,
    branchId,
    branches: [],
    raw,
  }
  if (ctx.byId.has(name)) ctx.warnings.push(`Duplicate action name "${name}"`)
  ctx.byId.set(name, node)

  const branch = (suffix: string, label: string, actions: unknown): FlowBranch => {
    const id = `${name}#${suffix}`
    return { id, label, nodes: parseActions(actions, ctx, name, id) }
  }

  switch (kind) {
    case 'condition': {
      const elseActions = isObject(raw.else) ? raw.else.actions : undefined
      node.branches = [branch('true', 'If yes', raw.actions), branch('false', 'If no', elseActions)]
      break
    }
    case 'switch': {
      const cases = isObject(raw.cases) ? raw.cases : {}
      node.branches = Object.entries(cases).map(([caseName, c]) => {
        const value = isObject(c) && c.case !== undefined ? String(c.case) : caseName
        return branch(`case:${caseName}`, `Case: ${value}`, isObject(c) ? c.actions : undefined)
      })
      const def = isObject(raw.default) ? raw.default.actions : undefined
      node.branches.push(branch('default', 'Default', def))
      break
    }
    case 'foreach':
    case 'until':
    case 'scope':
      node.branches = [branch('body', kind === 'scope' ? 'Scope' : 'Loop body', raw.actions)]
      break
  }
  return node
}

/**
 * Parses a WDL `definition` object (the thing with `triggers` and `actions`).
 */
export function parseDefinition(definition: unknown, displayName = 'Untitled flow'): ParsedFlow {
  const ctx: Ctx = { byId: new Map(), warnings: [] }
  if (!isObject(definition)) {
    return {
      displayName,
      triggers: [],
      actions: [],
      byId: ctx.byId,
      warnings: ['Definition is not an object'],
    }
  }
  const triggers = isObject(definition.triggers)
    ? Object.entries(definition.triggers).map(([n, raw]) =>
        parseNode(n, isObject(raw) ? raw : {}, 'trigger', ctx),
      )
    : []
  if (triggers.length === 0) ctx.warnings.push('Flow has no trigger')
  const actions = parseActions(definition.actions, ctx)

  // Validate runAfter references point at siblings that exist.
  for (const node of ctx.byId.values()) {
    for (const dep of Object.keys(node.runAfter)) {
      const target = ctx.byId.get(dep)
      if (!target) ctx.warnings.push(`"${node.name}" runs after unknown action "${dep}"`)
      else if (target.branchId !== node.branchId)
        ctx.warnings.push(`"${node.name}" runs after "${dep}" which is in a different scope`)
    }
  }
  return { displayName, triggers, actions, byId: ctx.byId, warnings: ctx.warnings }
}
