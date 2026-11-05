import { Background, Controls, MiniMap, Panel, ReactFlow, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import type { ResourceKind } from '../../analysis/resources'
import type { SolutionIndex } from '../../analysis/solution'
import { buildSolutionGraph, type MapEdge, type MapNode } from '../../graph/buildSolutionGraph'
import { elk } from '../elk'
import { MapContext } from './mapContext'
import { mapNodeTypes } from './mapNodeTypes'

interface Props {
  index: SolutionIndex
  kinds: ReadonlySet<ResourceKind>
  /** Node ids to emphasize (others are dimmed), or null for none. */
  highlight: ReadonlySet<string> | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenFlow: (flowIndex: number) => void
}

export function SolutionMap({ index, kinds, highlight, selectedId, onSelect, onOpenFlow }: Props) {
  const rf = useReactFlow()
  const [result, setResult] = useState<{
    kinds: ReadonlySet<ResourceKind>
    nodes: MapNode[]
    edges: MapEdge[]
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    buildSolutionGraph(index, elk, { kinds })
      .then((g) => !cancelled && setResult({ kinds, ...g }))
      .catch(
        (e: unknown) => !cancelled && setResult({ kinds, nodes: [], edges: [], error: String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [index, kinds])

  // Re-fit whenever a new layout arrives (e.g. resource kinds toggled).
  useEffect(() => {
    if (!result) return
    const frame = requestAnimationFrame(() => void rf.fitView({ duration: 300, padding: 0.1 }))
    return () => cancelAnimationFrame(frame)
  }, [result, rf])

  const nodes = useMemo(
    () =>
      (result?.nodes ?? []).map((n) => ({
        ...n,
        selected: n.id === selectedId,
        className: highlight ? (highlight.has(n.id) ? 'match' : 'dimmed') : undefined,
      })),
    [result, selectedId, highlight],
  )
  const edges = useMemo(
    () =>
      (result?.edges ?? []).map((e) =>
        highlight && !(highlight.has(e.source) && highlight.has(e.target))
          ? { ...e, className: `${e.className ?? ''} dimmed` }
          : e,
      ),
    [result, highlight],
  )
  const actions = useMemo(() => ({ openFlow: onOpenFlow }), [onOpenFlow])

  if (result?.error) return <div className="empty">Layout failed: {result.error}</div>
  if (!result) return <div className="empty">Laying out…</div>

  return (
    <MapContext.Provider value={actions}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={mapNodeTypes}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        zoomOnDoubleClick={false}
        fitView
        minZoom={0.05}
      >
        <Background />
        <Panel position="top-left" className="map-legend">
          <span className="legend-line access-read" /> reads
          <span className="legend-line access-write" /> writes
          <span className="legend-line access-trigger" /> triggers
          <span className="legend-line access-call" /> calls child flow
          <span className="muted">· double-click a flow to open it</span>
        </Panel>
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </MapContext.Provider>
  )
}
