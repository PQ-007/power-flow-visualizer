import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { Edge, Node } from '@xyflow/react'
import { descendantCount, isContainer } from '../model/tree'
import type { FlowBranch, FlowNode, ParsedFlow } from '../model/types'

/**
 * Turns a ParsedFlow into positioned React Flow nodes/edges.
 *
 * Layout model (mirrors the Power Automate designer):
 *  - plain actions are fixed-size cards
 *  - containers (Scope, Apply to each, Do until) hold their actions directly
 *  - Condition / Switch hold one "branch" box per outcome, laid side by side
 *  - collapsed containers are drawn as a single card
 *  - edges come from `runAfter`, which in WDL always links siblings,
 *    so each level can be laid out independently by ELK.
 *
 * The ELK instance is injected so the browser can run layout in a Web Worker
 * while tests use the bundled (synchronous) build.
 */

export const CARD_WIDTH = 280
export const CARD_HEIGHT = 76

export type ActionNodeData = { flowNode: FlowNode }
export type ContainerNodeData = { flowNode: FlowNode }
export type CollapsedNodeData = { flowNode: FlowNode; hiddenCount: number }
export type BranchNodeData = { branch: FlowBranch }

export type VisualNode =
  | Node<ActionNodeData, 'action'>
  | Node<ContainerNodeData, 'container'>
  | Node<CollapsedNodeData, 'collapsed'>
  | Node<BranchNodeData, 'branch'>

export type VisualEdge = Edge<{ statuses: string[] }>

export interface GraphOptions {
  /** Ids of containers drawn as a single card. */
  collapsed?: ReadonlySet<string>
}

const LEVEL_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '32',
  'elk.padding': '[top=56,left=16,bottom=16,right=16]',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}
// Branch boxes have no edges between them: keep them in one row, in definition order
// (If yes / If no, Case 1…n / Default) like the Power Automate designer.
const BRANCH_ROW_OPTIONS = {
  ...LEVEL_OPTIONS,
  'elk.separateConnectedComponents': 'false',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
}

function edgesFor(nodes: FlowNode[], entryId?: string): ElkExtendedEdge[] {
  const ids = new Set(nodes.map((n) => n.id))
  const edges: ElkExtendedEdge[] = []
  for (const n of nodes) {
    const deps = Object.keys(n.runAfter)
    if (deps.length === 0 && entryId) {
      edges.push({ id: `${entryId}->${n.id}`, sources: [entryId], targets: [n.id] })
    }
    for (const dep of deps) {
      if (ids.has(dep)) edges.push({ id: `${dep}->${n.id}`, sources: [dep], targets: [n.id] })
    }
  }
  return edges
}

// Empty containers still need a size; ELK sizes parents from children.
const emptyPlaceholder = (ownerId: string): ElkNode => ({
  id: `${ownerId}#empty`,
  width: CARD_WIDTH * 0.6,
  height: 24,
})

function toElk(node: FlowNode, collapsed: ReadonlySet<string>): ElkNode {
  if (!isContainer(node) || collapsed.has(node.id)) {
    return { id: node.id, width: CARD_WIDTH, height: CARD_HEIGHT }
  }
  const level = (owner: string, nodes: FlowNode[]): Partial<ElkNode> => ({
    layoutOptions: LEVEL_OPTIONS,
    children: nodes.length ? nodes.map((n) => toElk(n, collapsed)) : [emptyPlaceholder(owner)],
    edges: edgesFor(nodes),
  })
  if (node.kind !== 'condition' && node.kind !== 'switch') {
    return { id: node.id, ...level(node.id, node.branches[0]?.nodes ?? []) }
  }
  return {
    id: node.id,
    layoutOptions: BRANCH_ROW_OPTIONS,
    children: node.branches.map((b) => ({ id: b.id, ...level(b.id, b.nodes) })),
  }
}

export async function buildGraph(
  flow: ParsedFlow,
  elk: ELK,
  options: GraphOptions = {},
): Promise<{ nodes: VisualNode[]; edges: VisualEdge[] }> {
  const collapsed = options.collapsed ?? new Set<string>()
  const trigger = flow.triggers[0]
  const root: ElkNode = {
    id: '__root__',
    layoutOptions: { ...LEVEL_OPTIONS, 'elk.padding': '[top=16,left=16,bottom=16,right=16]' },
    children: [...flow.triggers, ...flow.actions].map((n) => toElk(n, collapsed)),
    edges: edgesFor(flow.actions, trigger?.id),
  }
  const laid = await elk.layout(root)

  const branchById = new Map<string, FlowBranch>()
  for (const n of flow.byId.values()) for (const b of n.branches) branchById.set(b.id, b)

  // Parents must precede children in React Flow's node array: walk top-down.
  const nodes: VisualNode[] = []
  const visit = (en: ElkNode, parentId?: string) => {
    for (const child of en.children ?? []) {
      if (child.id.endsWith('#empty')) continue
      const base = {
        id: child.id,
        position: { x: child.x ?? 0, y: child.y ?? 0 },
        parentId,
        extent: parentId ? ('parent' as const) : undefined,
        draggable: false,
        width: child.width,
        height: child.height,
      }
      const flowNode = flow.byId.get(child.id)
      const branch = branchById.get(child.id)
      if (flowNode && isContainer(flowNode) && collapsed.has(flowNode.id)) {
        nodes.push({
          ...base,
          type: 'collapsed',
          data: { flowNode, hiddenCount: descendantCount(flowNode) },
        })
      } else if (flowNode && isContainer(flowNode)) {
        nodes.push({ ...base, type: 'container', data: { flowNode } })
      } else if (flowNode) {
        nodes.push({ ...base, type: 'action', data: { flowNode } })
      } else if (branch) {
        nodes.push({ ...base, type: 'branch', data: { branch } })
      }
      visit(child, child.id)
    }
  }
  visit(laid)

  const edges: VisualEdge[] = []
  const collect = (en: ElkNode) => {
    for (const e of en.edges ?? []) {
      const [source] = e.sources
      const [target] = e.targets
      const statuses = flow.byId.get(target)?.runAfter[source] ?? ['Succeeded']
      const abnormal =
        statuses.length > 0 && !(statuses.length === 1 && statuses[0] === 'Succeeded')
      edges.push({
        id: e.id,
        source,
        target,
        type: 'smoothstep',
        zIndex: 1000,
        data: { statuses },
        label: abnormal ? `on ${statuses.join(', ')}` : undefined,
        className: abnormal ? 'edge-abnormal' : undefined,
      })
    }
    for (const c of en.children ?? []) collect(c)
  }
  collect(laid)

  return { nodes, edges }
}
