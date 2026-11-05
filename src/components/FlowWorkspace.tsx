import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { findMatches } from '../analysis/search'
import type { SolutionIndex } from '../analysis/solution'
import { analyzeFlow, variableRoles } from '../analysis/variables'
import { ancestorsOf, containersAtOrBelow, defaultCollapsed } from '../model/tree'
import type { ParsedFlow } from '../model/types'
import { formatDuration, matchRun, rootCauses, runClass } from '../run/overlay'
import type { RunData } from '../run/parseRun'
import { DetailsPanel } from './DetailsPanel'
import { FlowCanvas, type FocusRequest } from './FlowCanvas'
import { OutlinePanel } from './OutlinePanel'
import { VariablesPanel } from './VariablesPanel'

/** "Show" levels: how many container levels are open. */
const LEVELS = [
  { value: '0', label: 'Top level only' },
  { value: '1', label: '2 levels' },
  { value: '2', label: '3 levels' },
  { value: 'all', label: 'Everything' },
]

/** Where to land when a flow is opened from elsewhere (e.g. a solution search result). */
export interface FlowEntry {
  selectId?: string
  search?: string
}

interface Props {
  flow: ParsedFlow
  /** Toolbar element this view renders its controls into. */
  toolbarSlot: HTMLElement | null
  entry?: FlowEntry
  /** Present when the flow is part of a loaded solution. */
  solution?: {
    index: SolutionIndex
    onOpenFlow: (flowIndex: number, entry?: FlowEntry) => void
  }
  /** Result of a real run to overlay on the diagram. */
  run?: RunData
  onOpenFiles: (files: FileList | null) => void
  onClearRun: () => void
}

/** The single-flow view: outline/variables sidebar, diagram, details panel. */
export function FlowWorkspace({
  flow,
  toolbarSlot,
  entry,
  solution,
  run,
  onOpenFiles,
  onClearRun,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(entry?.selectId ?? null)
  const [search, setSearch] = useState(entry?.search ?? '')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    const c = new Set(defaultCollapsed(flow))
    if (entry?.selectId) for (const a of ancestorsOf(flow, entry.selectId)) c.delete(a)
    return c
  })
  const [level, setLevel] = useState('')
  const [focus, setFocus] = useState<FocusRequest | null>(
    entry?.selectId ? { id: entry.selectId, mode: 'zoom', nonce: 0 } : null,
  )
  const [showSidebar, setShowSidebar] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'outline' | 'variables'>('outline')
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nonce = useRef(1)

  const requestFocus = (request: Omit<FocusRequest, 'nonce'>) =>
    setFocus({ ...request, nonce: ++nonce.current })

  /** Select a node, expanding its containers and moving the canvas to it. */
  const reveal = (id: string) => {
    const hiddenBy = ancestorsOf(flow, id).filter((a) => collapsed.has(a))
    if (hiddenBy.length) {
      setCollapsed((prev) => new Set([...prev].filter((c) => !hiddenBy.includes(c))))
      setLevel('')
    }
    setSelectedId(id)
    requestFocus({ id, mode: 'zoom' })
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
    setLevel(value)
    setCollapsed(value === 'all' ? new Set() : containersAtOrBelow(flow, Number(value)))
    requestFocus({ id: '', mode: 'fit' })
  }

  const analysis = useMemo(() => analyzeFlow(flow), [flow])
  const overlay = useMemo(() => (run ? matchRun(flow, run) : null), [flow, run])
  const failures = useMemo(() => (overlay ? rootCauses(flow, overlay) : []), [flow, overlay])
  const variable = selectedVariable
    ? analysis.variables.get(selectedVariable.toLowerCase())
    : undefined
  const roles = useMemo(() => (variable ? variableRoles(variable) : null), [variable])

  // Highlighted set: the selected variable's actions, otherwise the search matches.
  const searchMatches = useMemo(
    () => (search.trim() ? findMatches(flow, search) : null),
    [flow, search],
  )
  const matches = useMemo(
    () => (roles ? new Set(roles.keys()) : searchMatches),
    [roles, searchMatches],
  )

  const selectVariable = (name: string | null) => {
    setSelectedVariable(name)
    const info = name ? analysis.variables.get(name.toLowerCase()) : undefined
    if (info) {
      setSearch('')
      setSidebarTab('variables')
      setShowSidebar(true)
      requestFocus({ id: '', mode: 'fitMany', ids: [...variableRoles(info).keys()] })
    }
  }

  // "/" focuses search, Esc clears search, then variable, then selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (typing && search) setSearch('')
        else if (selectedVariable) setSelectedVariable(null)
        else setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search, selectedVariable])

  const selected = selectedId ? flow.byId.get(selectedId) : undefined

  // Child flow target of a "Run a child flow" action, when it's in the loaded solution.
  const childFlow = useMemo(() => {
    if (!selected || !solution) return undefined
    const call = solution.index.calls.find(
      (c) => c.nodeId === selected.id && solution.index.flows[c.from] === flow,
    )
    if (!call) return undefined
    if (call.to === undefined) return { name: `${call.targetId} (not loaded)` }
    const to = call.to
    return {
      name: solution.index.flows[to].displayName,
      open: () => solution.onOpenFlow(to),
    }
  }, [selected, solution, flow])

  const toolbar = (
    <>
      <button
        onClick={() => setShowSidebar((v) => !v)}
        aria-pressed={showSidebar}
        title="Toggle side panel"
      >
        ☰ Panel
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
        onChange={(e) => {
          setSearch(e.target.value)
          setSelectedVariable(null)
        }}
      />
      {searchMatches && (
        <span className="muted">
          {searchMatches.size} match{searchMatches.size === 1 ? '' : 'es'}
        </span>
      )}
      {variable && (
        <span className="chip">
          Variable <strong>{variable.name}</strong>
          <button onClick={() => setSelectedVariable(null)} aria-label="Clear variable">
            ×
          </button>
        </span>
      )}
      {overlay ? (
        <span
          className={`chip run-chip run-${runClass(overlay.run.status)}`}
          title={[overlay.run.name && `Run ${overlay.run.name}`, overlay.run.error?.message]
            .filter(Boolean)
            .join('\n')}
        >
          Run <strong>{overlay.run.status ?? 'loaded'}</strong>
          {overlay.run.startTime && (
            <span className="muted"> · {new Date(overlay.run.startTime).toLocaleString()}</span>
          )}
          {overlay.run.durationMs !== undefined && (
            <span className="muted"> · {formatDuration(overlay.run.durationMs)}</span>
          )}
          {failures.length > 0 && (
            <button
              className="link"
              onClick={() => {
                const i = failures.indexOf(selectedId ?? '')
                reveal(failures[(i + 1) % failures.length])
              }}
              title="Jump to the first failed action (again for the next one)"
            >
              Go to error{failures.length > 1 ? ` (${failures.length})` : ''}
            </button>
          )}
          <button onClick={onClearRun} aria-label="Remove run overlay">
            ×
          </button>
        </span>
      ) : (
        <label className="button" title="Overlay a run's results (see docs/run-export.md)">
          ▶ Load run…
          <input type="file" accept=".json" hidden onChange={(e) => onOpenFiles(e.target.files)} />
        </label>
      )}
      {overlay && overlay.unmatched.length > 0 && (
        <span className="warn" title={`Not in this flow:\n${overlay.unmatched.join('\n')}`}>
          ⚠ {overlay.unmatched.length} run step(s) not in this flow — different version?
        </span>
      )}
      {flow.warnings.length > 0 && (
        <span className="warn" title={flow.warnings.join('\n')}>
          ⚠ {flow.warnings.length} warning(s)
        </span>
      )}
    </>
  )

  return (
    <ReactFlowProvider>
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}
      {showSidebar && (
        <aside className="sidebar">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={sidebarTab === 'outline'}
              onClick={() => setSidebarTab('outline')}
            >
              Outline <small>{flow.byId.size}</small>
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab === 'variables'}
              onClick={() => setSidebarTab('variables')}
            >
              Variables <small>{analysis.variables.size}</small>
              {[...analysis.variables.values()].some((v) => v.warnings.length) && (
                <span className="warn"> ⚠</span>
              )}
            </button>
          </div>
          {sidebarTab === 'outline' ? (
            <OutlinePanel
              flow={flow}
              collapsed={collapsed}
              matches={matches}
              roles={roles}
              overlay={overlay}
              selectedId={selectedId}
              onSelect={reveal}
              onToggleCollapse={toggleCollapse}
            />
          ) : (
            <VariablesPanel
              flow={flow}
              analysis={analysis}
              selected={selectedVariable}
              onSelectVariable={selectVariable}
              onNavigate={reveal}
            />
          )}
        </aside>
      )}
      <div className="canvas">
        <FlowCanvas
          flow={flow}
          collapsed={collapsed}
          matches={matches}
          roles={roles}
          overlay={overlay}
          selectedId={selectedId}
          focus={focus}
          onSelect={setSelectedId}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      {selected && (
        <DetailsPanel
          flow={flow}
          analysis={analysis}
          node={selected}
          childFlow={childFlow}
          runResult={overlay?.byId.get(selected.id)}
          hasRun={!!overlay}
          onNavigate={reveal}
          onSelectVariable={selectVariable}
          onClose={() => setSelectedId(null)}
        />
      )}
    </ReactFlowProvider>
  )
}
