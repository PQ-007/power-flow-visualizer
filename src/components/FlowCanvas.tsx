import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildGraph, type VisualEdge, type VisualNode } from '../graph/buildGraph'
import { ancestorsOf } from '../model/tree'
import type { ParsedFlow } from '../model/types'
import { CanvasContext } from './canvasContext'
import { elk } from './elk'
import { nodeTypes } from './nodeTypes'

/** A request to move the viewport to a node; `nonce` makes repeated requests distinct. */
export interface FocusRequest {
  id: string
  nonce: number
  /**
   * `zoom` fits the node on screen; `center` pans to it keeping the current zoom;
   * `fit` fits the whole diagram (id is ignored); `fitMany` fits the nodes in `ids`
   * (or the collapsed containers hiding them).
   */
  mode: 'zoom' | 'center' | 'fit' | 'fitMany'
  ids?: string[]
}

interface Props {
  flow: ParsedFlow
  collapsed: ReadonlySet<string>
  /** Search matches, or null when no search is active. */
  matches: ReadonlySet<string> | null
  /** Optional read/write role per highlighted node (variable view). */
  roles?: ReadonlyMap<string, 'write' | 'read'> | null
  selectedId: string | null
  focus: FocusRequest | null
  onSelect: (id: string | null) => void
  onToggleCollapse: (id: string) => void
}

interface LayoutResult {
  flow: ParsedFlow
  collapsed: ReadonlySet<string>
  nodes: VisualNode[]
  edges: VisualEdge[]
  error?: string
}

export function FlowCanvas(props: Props) {
  const { flow, collapsed, matches, roles, selectedId, focus, onSelect, onToggleCollapse } = props
  const rf = useReactFlow()

  // Results are tagged with their inputs so a stale layout is never shown for new inputs.
  const [result, setResult] = useState<LayoutResult | null>(null)
  useEffect(() => {
    let cancelled = false
    buildGraph(flow, elk, { collapsed })
      .then((g) => !cancelled && setResult({ flow, collapsed, ...g }))
      .catch(
        (e: unknown) =>
          !cancelled && setResult({ flow, collapsed, nodes: [], edges: [], error: String(e) }),
      )
    return () => {
      cancelled = true
    }
  }, [flow, collapsed])

  // While a re-layout (e.g. expand/collapse) is running, keep showing the previous one.
  const graph = result?.flow === flow ? result : null
  const fresh = graph?.collapsed === collapsed

  const nodes = useMemo(() => {
    if (!graph) return []
    // A match hidden inside a collapsed container lights up that container instead.
    const hiddenMatchOwners = new Set<string>()
    if (matches) {
      for (const id of matches) {
        const owner = ancestorsOf(flow, id).find((a) => collapsed.has(a))
        if (owner) hiddenMatchOwners.add(owner)
      }
    }
    return graph.nodes.map((n) => {
      const selected = n.id === selectedId
      if (!matches || n.type === 'branch') return selected ? { ...n, selected } : n
      const role = roles?.get(n.id)
      const className = matches.has(n.id)
        ? `match${role ? ` role-${role}` : ''}`
        : hiddenMatchOwners.has(n.id)
          ? 'match-inside'
          : 'dimmed'
      return { ...n, selected, className }
    })
  }, [graph, matches, roles, selectedId, flow, collapsed])

  // Move the viewport once the requested node is in the current layout.
  const handledNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!focus || !fresh || handledNonce.current === focus.nonce) return
    const present = new Set(nodes.map((n) => n.id))
    const many = focus.mode === 'fitMany'
    if (!many && focus.mode !== 'fit' && !present.has(focus.id)) return
    handledNonce.current = focus.nonce
    // For fitMany, nodes hidden in collapsed containers are represented by those containers.
    const targets = many
      ? [
          ...new Set(
            (focus.ids ?? []).map((id) =>
              present.has(id)
                ? id
                : ancestorsOf(flow, id).find((a) => present.has(a) && collapsed.has(a)),
            ),
          ),
        ].filter((id): id is string => !!id)
      : []
    const frame = requestAnimationFrame(() => {
      if (focus.mode === 'fit' || (many && targets.length === 0)) {
        void rf.fitView({ duration: 300 })
        return
      }
      if (many) {
        void rf.fitView({
          nodes: targets.map((id) => ({ id })),
          duration: 400,
          maxZoom: 1,
          padding: 0.15,
        })
        return
      }
      if (focus.mode === 'zoom') {
        void rf.fitView({ nodes: [{ id: focus.id }], duration: 400, maxZoom: 1.1, padding: 0.4 })
        return
      }
      const n = rf.getInternalNode(focus.id)
      if (!n) return
      const { x, y } = n.internals.positionAbsolute
      const w = n.measured.width ?? n.width ?? 0
      void rf.setCenter(x + w / 2, y + 40, { zoom: rf.getZoom(), duration: 300 })
    })
    return () => cancelAnimationFrame(frame)
  }, [focus, fresh, nodes, rf, flow, collapsed])

  const actions = useMemo(() => ({ toggleCollapse: onToggleCollapse }), [onToggleCollapse])
  const onNodeClick: NodeMouseHandler = (_, n) => {
    if (flow.byId.has(n.id)) onSelect(n.id)
  }

  if (graph?.error) return <div className="empty">Layout failed: {graph.error}</div>
  if (!graph) return <div className="empty">Laying out…</div>

  return (
    <CanvasContext.Provider value={actions}>
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        fitView
        minZoom={0.05}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </CanvasContext.Provider>
  )
}
