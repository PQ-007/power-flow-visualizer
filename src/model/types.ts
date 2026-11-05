/**
 * Internal, UI-agnostic model of a Power Automate (Logic Apps WDL) flow.
 * The parser produces this; the graph builder and UI consume it.
 */

export type NodeKind = 'trigger' | 'action' | 'condition' | 'switch' | 'foreach' | 'until' | 'scope'

/** Container kinds hold nested actions inside one or more branches. */
export const CONTAINER_KINDS: ReadonlySet<NodeKind> = new Set([
  'condition',
  'switch',
  'foreach',
  'until',
  'scope',
])

/** runAfter statuses as they appear in the definition. */
export type RunAfterStatus = 'Succeeded' | 'Failed' | 'Skipped' | 'TimedOut' | string

export interface FlowBranch {
  /** Stable id, e.g. `Condition_1#true`, `Switch_1#case:Approved`. */
  id: string
  /** Human label shown in the UI: "If yes", "Case: Approved", "Default"… */
  label: string
  nodes: FlowNode[]
}

export interface FlowNode {
  /** Unique id. Action names are unique within a flow definition. */
  id: string
  /** Raw key from the definition (underscores instead of spaces). */
  name: string
  /** Display name as the Power Automate designer shows it. */
  displayName: string
  /** Raw `type` from the definition (e.g. `OpenApiConnection`, `If`). */
  type: string
  kind: NodeKind
  /** Connector short name, e.g. `sharepointonline`, when applicable. */
  connector?: string
  /** Connector operation id, e.g. `GetItems`, when applicable. */
  operationId?: string
  /** Predecessor action name -> statuses that allow this action to run. */
  runAfter: Record<string, RunAfterStatus[]>
  /** Id of the enclosing container node, undefined at top level. */
  parentId?: string
  /** Id of the enclosing branch, undefined at top level. */
  branchId?: string
  /** Nested branches for container kinds (empty for plain actions). */
  branches: FlowBranch[]
  /** Original JSON of this action/trigger, for the details panel. */
  raw: Record<string, unknown>
}

export interface ParsedFlow {
  displayName: string
  triggers: FlowNode[]
  /** Top-level actions (nested ones live in `branches`). */
  actions: FlowNode[]
  /** Every node (triggers + all nested actions) by id. */
  byId: Map<string, FlowNode>
  /** Non-fatal problems found while parsing. */
  warnings: string[]
}
