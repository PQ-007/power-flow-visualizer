import { Background, Controls, MiniMap, ReactFlow, type NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import { buildGraph, type VisualEdge, type VisualNode } from '../graph/buildGraph'
import type { FlowNode, ParsedFlow } from '../model/types'
import { nodeTypes } from './nodeTypes'

interface Props {
  flow: ParsedFlow
  search: string
  onSelect: (node: FlowNode | null) => void
}

export function FlowCanvas({ flow, search, onSelect }: Props) {
  // Results are tagged with the flow they were computed for, so a stale
  // layout is never shown while the next one is being computed.
  const [result, setResult] = useState<{
    flow: ParsedFlow
    nodes: VisualNode[]
    edges: VisualEdge[]
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    buildGraph(flow)
      .then((g) => !cancelled && setResult({ flow, ...g }))
      .catch(
        (e: unknown) => !cancelled && setResult({ flow, nodes: [], edges: [], error: String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [flow])

  const graph = result?.flow === flow ? result : null
  const error = graph?.error

  // Dim everything that doesn't match the search box.
  const nodes = useMemo(() => {
    if (!graph) return []
    const q = search.trim().toLowerCase()
    if (!q) return graph.nodes
    return graph.nodes.map((n) => {
      if (n.type === 'branch') return n
      const fn = n.data.flowNode
      const hay = `${fn.name} ${fn.type} ${fn.connector ?? ''} ${JSON.stringify(fn.raw.inputs ?? '')}`
      return { ...n, className: hay.toLowerCase().includes(q) ? 'match' : 'dimmed' }
    })
  }, [graph, search])

  const onNodeClick: NodeMouseHandler = (_, n) => onSelect(flow.byId.get(n.id) ?? null)

  if (error) return <div className="empty">Layout failed: {error}</div>
  if (!graph) return <div className="empty">Laying out…</div>

  return (
    <ReactFlow
      nodes={nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={false}
      fitView
      minZoom={0.1}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  )
}
