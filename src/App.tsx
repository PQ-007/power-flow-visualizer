import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { findMatches } from './analysis/search'
import { DetailsPanel } from './components/DetailsPanel'
import { FlowCanvas, type FocusRequest } from './components/FlowCanvas'
import { OutlinePanel } from './components/OutlinePanel'
import { ancestorsOf, containersAtOrBelow, defaultCollapsed } from './model/tree'
import type { ParsedFlow } from './model/types'
import { loadFlowFromJson, loadFlowsFromFile } from './parser/loadFlow'
import sample from './samples/invoice-approval.json'

/** "Show" levels: how many container levels are open. */
const LEVELS = [
  { value: '0', label: 'Top level only' },
  { value: '1', label: '2 levels' },
  { value: '2', label: '3 levels' },
  { value: 'all', label: 'Everything' },
]

export default function App() {
  const [flows, setFlows] = useState<ParsedFlow[]>([])
  const [active, setActive] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [level, setLevel] = useState('')
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [showOutline, setShowOutline] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nonce = useRef(0)

  const flow = flows[active] as ParsedFlow | undefined

  const showFlow = useCallback((list: ParsedFlow[], index: number) => {
    setFlows(list)
    setActive(index)
    setSelectedId(null)
    setFocus(null)
    setCollapsed(list[index] ? defaultCollapsed(list[index]) : new Set())
    setLevel('')
    setError(null)
  }, [])

  const open = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      showFlow((await Promise.all([...files].map(loadFlowsFromFile))).flat(), 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const requestFocus = (id: string, mode: FocusRequest['mode']) =>
    setFocus({ id, mode, nonce: ++nonce.current })

  /** Select a node, expanding its containers and moving the canvas to it. */
  const reveal = (id: string) => {
    if (!flow) return
    const hiddenBy = ancestorsOf(flow, id).filter((a) => collapsed.has(a))
    if (hiddenBy.length) {
      setCollapsed((prev) => new Set([...prev].filter((c) => !hiddenBy.includes(c))))
      setLevel('')
    }
    setSelectedId(id)
    requestFocus(id, 'zoom')
  }

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
    setLevel('')
    setFocus({ id, mode: 'center', nonce: ++nonce.current })
  }, [])

  const changeLevel = (value: string) => {
    if (!flow) return
    setLevel(value)
    setCollapsed(value === 'all' ? new Set() : containersAtOrBelow(flow, Number(value)))
    requestFocus('', 'fit')
  }

  const matches = useMemo(
    () => (flow && search.trim() ? findMatches(flow, search) : null),
    [flow, search],
  )

  // "/" focuses search, Esc clears search or selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (typing && search) setSearch('')
        else setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])

  const selected = selectedId ? flow?.byId.get(selectedId) : undefined

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        void open(e.dataTransfer.files)
      }}
    >
      <header className="toolbar">
        <strong>Power Flow Visualizer</strong>
        <label className="button">
          Open .zip / .json
          <input
            type="file"
            accept=".zip,.json"
            multiple
            hidden
            onChange={(e) => open(e.target.files)}
          />
        </label>
        <button onClick={() => showFlow([loadFlowFromJson(JSON.stringify(sample))], 0)}>
          Load sample
        </button>
        {flows.length > 1 && (
          <select
            value={active}
            onChange={(e) => showFlow(flows, Number(e.target.value))}
            aria-label="Flow"
          >
            {flows.map((f, i) => (
              <option key={i} value={i}>
                {f.displayName}
              </option>
            ))}
          </select>
        )}
        {flow && (
          <>
            <button
              onClick={() => setShowOutline((v) => !v)}
              aria-pressed={showOutline}
              title="Toggle outline"
            >
              ☰ Outline
            </button>
            <select value={level} onChange={(e) => changeLevel(e.target.value)} aria-label="Show">
              <option value="" disabled>
                Show…
              </option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <input
              ref={searchRef}
              className="search"
              placeholder="Search actions, connectors, expressions…  ( / )"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {matches && (
              <span className="muted">
                {matches.size} match{matches.size === 1 ? '' : 'es'}
              </span>
            )}
            {flow.warnings.length > 0 && (
              <span className="warn" title={flow.warnings.join('\n')}>
                ⚠ {flow.warnings.length} warning(s)
              </span>
            )}
          </>
        )}
      </header>
      {error && <div className="error">{error}</div>}
      <main>
        {flow ? (
          <ReactFlowProvider key={`${active}:${flow.displayName}:${flows.length}`}>
            {showOutline && (
              <OutlinePanel
                flow={flow}
                collapsed={collapsed}
                matches={matches}
                selectedId={selectedId}
                onSelect={reveal}
                onToggleCollapse={toggleCollapse}
              />
            )}
            <div className="canvas">
              <FlowCanvas
                flow={flow}
                collapsed={collapsed}
                matches={matches}
                selectedId={selectedId}
                focus={focus}
                onSelect={setSelectedId}
                onToggleCollapse={toggleCollapse}
              />
            </div>
            {selected && (
              <DetailsPanel
                flow={flow}
                node={selected}
                onNavigate={reveal}
                onClose={() => setSelectedId(null)}
              />
            )}
          </ReactFlowProvider>
        ) : (
          <div className="empty">
            <p>Drop a Power Automate export (.zip) or flow definition (.json) here.</p>
            <p>Files are read locally in your browser — nothing is uploaded.</p>
          </div>
        )}
      </main>
    </div>
  )
}
