import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { Edge, Node } from '@xyflow/react'
import { CONTAINER_KINDS, type FlowBranch, type FlowNode, type ParsedFlow } from '../model/types'

/**
 * Turns a ParsedFlow into positioned React Flow nodes/edges.
 *
 * Layout model (mirrors the Power Automate designer):
 *  - plain actions are fixed-size cards
 *  - containers (Scope, Apply to each, Do until) hold their actions directly
 *  - Condition / Switch hold one "branch" box per outcome, laid side by side
 *  - edges come from `runAfter`, which in WDL always links siblings,
 *    so each level can be laid out independently by ELK.
 */

export const CARD_WIDTH = 260
export const CARD_HEIGHT = 64

export type ActionNodeData = { flowNode: FlowNode }
export type ContainerNodeData = { flowNode: FlowNode }
export type BranchNodeData = { branch: FlowBranch }

export type VisualNode =
  | Node<ActionNodeData, 'action'>
  | Node<ContainerNodeData, 'container'>
  | Node<BranchNodeData, 'branch'>

export type VisualEdge = Edge<{ statuses: string[] }>

const elk = new ELK()

const LEVEL_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '32',
  'elk.padding': '[top=44,left=16,bottom=16,right=16]',
}
// Branch boxes have no edges between them: keep them in one row, in definition order
// (If yes / If no, Case 1…n / Default) like the Power Automate designer.
const BRANCH_ROW_OPTIONS = {
  ...LEVEL_OPTIONS,
  'elk.separateConnectedComponents': 'false',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
}

function edgesFor(nodes: FlowNode[], entryId?: string): ElkExtendedEdge[] {
  const edges: ElkExtendedEdge[] = []
  for (const n of nodes) {
    const deps = Object.keys(n.runAfter)
    if (deps.length === 0 && entryId) {
      edges.push({ id: `${entryId}->${n.id}`, sources: [entryId], targets: [n.id] })
    }
    for (const dep of deps) {
      if (nodes.some((s) => s.id === dep)) {
        edges.push({ id: `${dep}->${n.id}`, sources: [dep], targets: [n.id] })
      }
    }
  }
  return edges
}

function toElk(node: FlowNode): ElkNode {
  if (!CONTAINER_KINDS.has(node.kind)) {
    return { id: node.id, width: CARD_WIDTH, height: CARD_HEIGHT }
  }
  const multiBranch = node.kind === 'condition' || node.kind === 'switch'
  if (!multiBranch) {
    const body = node.branches[0]?.nodes ?? []
    return {
      id: node.id,
      layoutOptions: LEVEL_OPTIONS,
      children: body.length ? body.map(toElk) : [emptyPlaceholder(node.id)],
      edges: edgesFor(body),
    }
  }
  return {
    id: node.id,
    layoutOptions: BRANCH_ROW_OPTIONS,
    children: node.branches.map((b) => ({
      id: b.id,
      layoutOptions: LEVEL_OPTIONS,
      children: b.nodes.length ? b.nodes.map(toElk) : [emptyPlaceholder(b.id)],
      edges: edgesFor(b.nodes),
    })),
  }
}

// Empty containers still need a size; ELK sizes parents from children.
const emptyPlaceholder = (ownerId: string): ElkNode => ({
  id: `${ownerId}#empty`,
  width: CARD_WIDTH * 0.6,
  height: 24,
})

export async function buildGraph(
  flow: ParsedFlow,
): Promise<{ nodes: VisualNode[]; edges: VisualEdge[] }> {
  const trigger = flow.triggers[0]
  const root: ElkNode = {
    id: '__root__',
    layoutOptions: { ...LEVEL_OPTIONS, 'elk.padding': '[top=16,left=16,bottom=16,right=16]' },
    children: [...flow.triggers.map(toElk), ...flow.actions.map(toElk)],
    edges: edgesFor(flow.actions, trigger?.id),
  }
  const laid = await elk.layout(root)

  const nodes: VisualNode[] = []
  const branchById = new Map<string, FlowBranch>()
  for (const n of flow.byId.values()) for (const b of n.branches) branchById.set(b.id, b)

  // Parents must precede children in React Flow's node array: walk top-down.
  const walk = (en: ElkNode, parentId?: string) => {
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
      if (flowNode && CONTAINER_KINDS.has(flowNode.kind)) {
        nodes.push({ ...base, type: 'container', data: { flowNode } })
      } else if (flowNode) {
        nodes.push({ ...base, type: 'action', data: { flowNode } })
      } else if (branch) {
        nodes.push({ ...base, type: 'branch', data: { branch } })
      }
      walk(child, child.id)
    }
  }
  walk(laid)

  const edges: VisualEdge[] = []
  const collect = (en: ElkNode) => {
    for (const e of en.edges ?? []) {
      const [source] = e.sources
      const [target] = e.targets
      const statuses = flow.byId.get(target)?.runAfter[source] ?? ['Succeeded']
      const abnormal =
        !(statuses.length === 1 && statuses[0] === 'Succeeded') && statuses.length > 0
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
