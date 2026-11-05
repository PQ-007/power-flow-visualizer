import type { Edge, Node } from '@xyflow/react'
import type { ELK, ElkNode } from 'elkjs/lib/elk-api'
import type { Access, ResourceKind } from '../analysis/resources'
import type { Resource, SolutionIndex } from '../analysis/solution'
import type { ParsedFlow } from '../model/types'

/**
 * Solution map: one box per flow and per resource, edges in the direction data moves
 * (resource → flow for triggers/reads, flow → resource for writes, caller → child flow).
 */

export type FlowMapData = { flowIndex: number; flow: ParsedFlow }
export type ResourceMapData = { resource: Resource }
export type MapNode = Node<FlowMapData, 'flowMap'> | Node<ResourceMapData, 'resourceMap'>
export type MapEdge = Edge<{ access: Access }>

export const flowNodeId = (i: number) => `f#${i}`
export const resourceNodeId = (key: string) => `r#${key}`

const FLOW_SIZE = { width: 250, height: 64 }
const RESOURCE_SIZE = { width: 230, height: 52 }

const EDGE_LABEL: Record<Access, string> = {
  trigger: 'triggers',
  read: 'reads',
  write: 'writes',
  call: 'calls',
  use: 'uses',
}

export interface SolutionGraphOptions {
  /** Resource kinds drawn on the map. */
  kinds: ReadonlySet<ResourceKind>
}

export async function buildSolutionGraph(
  index: SolutionIndex,
  elk: ELK,
  { kinds }: SolutionGraphOptions,
): Promise<{ nodes: MapNode[]; edges: MapEdge[] }> {
  const resources = index.resources.filter((r) => kinds.has(r.kind))
  const edges = new Map<string, MapEdge>()
  const addEdge = (source: string, target: string, access: Access) => {
    const id = `${source}->${target}:${access}`
    if (edges.has(id)) return
    edges.set(id, {
      id,
      source,
      target,
      // No visible label: many edges meet at shared resources and labels would overlap.
      // Access is shown by colour (see the map legend) and announced to screen readers.
      ariaLabel: EDGE_LABEL[access],
      data: { access },
      className: `access-${access}`,
      type: 'smoothstep',
    })
  }
  for (const r of resources) {
    for (const u of r.uses) {
      const f = flowNodeId(u.flowIndex)
      const res = resourceNodeId(r.key)
      if (u.access === 'write' || u.access === 'call') addEdge(f, res, u.access)
      else addEdge(res, f, u.access)
    }
  }
  for (const c of index.calls) {
    if (c.to !== undefined) addEdge(flowNodeId(c.from), flowNodeId(c.to), 'call')
  }

  const root: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '24',
      'elk.spacing.componentComponent': '48',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    },
    children: [
      ...index.flows.map((_, i) => ({ id: flowNodeId(i), ...FLOW_SIZE })),
      ...resources.map((r) => ({ id: resourceNodeId(r.key), ...RESOURCE_SIZE })),
    ],
    edges: [...edges.values()].map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  const laid = await elk.layout(root)
  const pos = new Map((laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))

  const nodes: MapNode[] = [
    ...index.flows.map((flow, flowIndex): MapNode => ({
      id: flowNodeId(flowIndex),
      type: 'flowMap',
      position: pos.get(flowNodeId(flowIndex))!,
      ...FLOW_SIZE,
      draggable: false,
      data: { flowIndex, flow },
    })),
    ...resources.map((resource): MapNode => ({
      id: resourceNodeId(resource.key),
      type: 'resourceMap',
      position: pos.get(resourceNodeId(resource.key))!,
      ...RESOURCE_SIZE,
      draggable: false,
      data: { resource },
    })),
  ]
  return { nodes, edges: [...edges.values()] }
}

/**
 * A map node plus everything directly connected to it (with the given resource kinds visible):
 * for a flow, its resources and the flows it calls or is called by; for a resource, its flows.
 */
export function neighborsOf(
  index: SolutionIndex,
  nodeId: string,
  kinds: ReadonlySet<ResourceKind>,
): Set<string> {
  const out = new Set([nodeId])
  if (nodeId.startsWith('f#')) {
    const i = Number(nodeId.slice(2))
    for (const key of index.resourcesByFlow[i]?.keys() ?? []) {
      const r = index.resourceByKey.get(key)
      if (r && kinds.has(r.kind)) out.add(resourceNodeId(key))
    }
    for (const c of index.calls) {
      if (c.from === i && c.to !== undefined) out.add(flowNodeId(c.to))
      if (c.to === i) out.add(flowNodeId(c.from))
    }
  } else if (nodeId.startsWith('r#')) {
    for (const u of index.resourceByKey.get(nodeId.slice(2))?.uses ?? []) {
      out.add(flowNodeId(u.flowIndex))
    }
  }
  return out
}
