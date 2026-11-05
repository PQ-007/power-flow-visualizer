import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RESOURCE_KIND_LABEL, type Access, type ResourceKind } from '../../analysis/resources'
import { searchSolution, type Resource, type SolutionIndex } from '../../analysis/solution'
import { flowNodeId, neighborsOf, resourceNodeId } from '../../graph/buildSolutionGraph'
import { actionSummary, actionTitle } from '../../model/describe'
import type { FlowEntry } from '../FlowWorkspace'
import { ACCESS_LABEL, DEFAULT_MAP_KINDS, KIND_BADGE } from './kinds'
import { SolutionMap } from './SolutionMap'

interface Props {
  index: SolutionIndex
  toolbarSlot: HTMLElement | null
  onOpenFlow: (flowIndex: number, entry?: FlowEntry) => void
}

const MAX_ACTIONS_PER_FLOW = 8

/** The whole-solution view: flow/resource lists, cross-flow search, map, details. */
export function SolutionWorkspace({ index, toolbarSlot, onOpenFlow }: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'flows' | 'resources'>('flows')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [kinds, setKinds] = useState<ReadonlySet<ResourceKind>>(new Set(DEFAULT_MAP_KINDS))
  const searchRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => (search.trim() ? searchSolution(index, search) : null),
    [index, search],
  )

  // Selection highlights the selected node and its neighbours; otherwise search hits.
  const highlight = useMemo(() => {
    if (selectedId) return neighborsOf(index, selectedId, kinds)
    if (!results) return null
    return new Set([
      ...results.flows.map((f) => flowNodeId(f.flowIndex)),
      ...results.resources.map((r) => resourceNodeId(r.key)),
    ])
  }, [selectedId, results, index, kinds])

  const toggleKind = (k: ResourceKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (!next.delete(k)) next.add(k)
      return next
    })

  const openFlow = useCallback((i: number) => onOpenFlow(i), [onOpenFlow])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement
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

  const kindsInSolution = useMemo(() => [...new Set(index.resources.map((r) => r.kind))], [index])
  const flowName = (i: number) => index.flows[i].displayName
  const flowLink = (i: number) => (
    <button className="link" onClick={() => setSelectedId(flowNodeId(i))}>
      {flowName(i)}
    </button>
  )

  const toolbar = (
    <>
      <input
        ref={searchRef}
        className="search"
        placeholder="Search all flows: actions, lists, tables, expressions…  ( / )"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setSelectedId(null)
        }}
      />
      {results ? (
        <span className="muted">
          {results.flows.length} flow{results.flows.length === 1 ? '' : 's'},{' '}
          {results.resources.length} resource{results.resources.length === 1 ? '' : 's'}
        </span>
      ) : (
        <span className="muted">
          {index.flows.length} flows · {index.resources.length} resources
        </span>
      )}
    </>
  )

  const selectedFlow = selectedId?.startsWith('f#') ? Number(selectedId.slice(2)) : undefined
  const selectedResource = selectedId?.startsWith('r#')
    ? index.resourceByKey.get(selectedId.slice(2))
    : undefined

  return (
    <ReactFlowProvider>
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}
      <aside className="sidebar">
        {results ? (
          <div className="solution-list">
            <h4>Flows ({results.flows.length})</h4>
            {results.flows.length === 0 && <div className="panel-empty">No matching actions</div>}
            {results.flows.map((r) => {
              const flow = index.flows[r.flowIndex]
              return (
                <div key={r.flowIndex} className="result-flow">
                  <button
                    className={`list-row${selectedFlow === r.flowIndex ? ' selected' : ''}`}
                    onClick={() => setSelectedId(flowNodeId(r.flowIndex))}
                  >
                    <span className="var-name">{flow.displayName}</span>
                    <span className="var-counts">{r.nodeIds.length} actions</span>
                  </button>
                  {r.nodeIds.slice(0, MAX_ACTIONS_PER_FLOW).map((id) => {
                    const node = flow.byId.get(id)!
                    return (
                      <button
                        key={id}
                        className="list-row result-action"
                        title={actionSummary(node) ?? actionTitle(node)}
                        onClick={() => onOpenFlow(r.flowIndex, { selectId: id, search })}
                      >
                        <span className="outline-name">{node.displayName}</span>
                        <span className="var-counts">{actionTitle(node)}</span>
                      </button>
                    )
                  })}
                  {r.nodeIds.length > MAX_ACTIONS_PER_FLOW && (
                    <button
                      className="list-row result-action muted"
                      onClick={() => onOpenFlow(r.flowIndex, { search })}
                    >
                      … {r.nodeIds.length - MAX_ACTIONS_PER_FLOW} more — open flow
                    </button>
                  )}
                </div>
              )
            })}
            <h4>Resources ({results.resources.length})</h4>
            {results.resources.map((r) => (
              <ResourceRow
                key={r.key}
                r={r}
                selected={selectedResource === r}
                onSelect={() => setSelectedId(resourceNodeId(r.key))}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'flows'} onClick={() => setTab('flows')}>
                Flows <small>{index.flows.length}</small>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'resources'}
                onClick={() => setTab('resources')}
              >
                Resources <small>{index.resources.length}</small>
              </button>
            </div>
            <div className="solution-list">
              {tab === 'flows'
                ? index.flows.map((f, i) => (
                    <button
                      key={i}
                      className={`list-row${selectedFlow === i ? ' selected' : ''}`}
                      onClick={() => setSelectedId(flowNodeId(i))}
                      onDoubleClick={() => onOpenFlow(i)}
                      title="Double-click to open"
                    >
                      <span className="var-name">{f.displayName}</span>
                      <span className="var-counts">
                        {f.triggers[0] ? actionTitle(f.triggers[0]) : ''}
                      </span>
                    </button>
                  ))
                : kindsInSolution.map((k) => (
                    <div key={k}>
                      <label className="kind-heading">
                        <input
                          type="checkbox"
                          checked={kinds.has(k)}
                          onChange={() => toggleKind(k)}
                        />
                        <span className="kind-badge">{KIND_BADGE[k]}</span>
                        {RESOURCE_KIND_LABEL[k]}
                        <small className="muted"> show on map</small>
                      </label>
                      {index.resources
                        .filter((r) => r.kind === k)
                        .map((r) => (
                          <ResourceRow
                            key={r.key}
                            r={r}
                            selected={selectedResource === r}
                            onSelect={() => setSelectedId(resourceNodeId(r.key))}
                          />
                        ))}
                    </div>
                  ))}
            </div>
          </>
        )}
      </aside>
      <div className="canvas">
        <SolutionMap
          index={index}
          kinds={kinds}
          highlight={highlight}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpenFlow={openFlow}
        />
      </div>
      {selectedFlow !== undefined && (
        <aside className="details">
          <header>
            <h2>{flowName(selectedFlow)}</h2>
            <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">
              ×
            </button>
          </header>
          <button className="primary" onClick={() => onOpenFlow(selectedFlow)}>
            Open flow ›
          </button>
          <FlowSummary
            index={index}
            flowIndex={selectedFlow}
            flowLink={flowLink}
            onSelectResource={(key) => setSelectedId(resourceNodeId(key))}
          />
        </aside>
      )}
      {selectedResource && (
        <aside className="details">
          <header>
            <h2>{selectedResource.label}</h2>
            <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">
              ×
            </button>
          </header>
          <dl>
            <dt>Kind</dt>
            <dd>{RESOURCE_KIND_LABEL[selectedResource.kind]}</dd>
            {selectedResource.detail && (
              <>
                <dt>{selectedResource.kind === 'sharepoint' ? 'Site' : 'Detail'}</dt>
                <dd>{selectedResource.detail}</dd>
              </>
            )}
            {selectedResource.dynamic && (
              <>
                <dt>Note</dt>
                <dd>
                  The name is computed by an expression, so the real target is only known at run
                  time.
                </dd>
              </>
            )}
          </dl>
          <h3>Used by</h3>
          {groupByFlow(selectedResource).map(([flowIndex, uses]) => (
            <div key={flowIndex} className="var-use">
              {flowLink(flowIndex)}
              {uses.map((u) => (
                <div key={`${u.nodeId}:${u.access}`} className="use-row">
                  <button
                    className="link"
                    onClick={() => onOpenFlow(flowIndex, { selectId: u.nodeId })}
                    title="Open the flow at this action"
                  >
                    {index.flows[flowIndex].byId.get(u.nodeId)?.displayName ?? u.nodeId}
                  </button>{' '}
                  <span className={`access access-${u.access}`}>{ACCESS_LABEL[u.access]}</span>
                </div>
              ))}
            </div>
          ))}
        </aside>
      )}
    </ReactFlowProvider>
  )
}

function ResourceRow({
  r,
  selected,
  onSelect,
}: {
  r: Resource
  selected: boolean
  onSelect: () => void
}) {
  const flows = new Set(r.uses.map((u) => u.flowIndex)).size
  const writes = r.uses.some((u) => u.access === 'write')
  return (
    <button
      className={`list-row${selected ? ' selected' : ''}`}
      onClick={onSelect}
      title={r.detail}
    >
      <span className="kind-badge">{KIND_BADGE[r.kind]}</span>
      <span className="var-name">{r.label}</span>
      <span className="var-counts">
        {flows} flow{flows === 1 ? '' : 's'}
        {writes && ' · written'}
      </span>
    </button>
  )
}

function groupByFlow(r: Resource): [number, Resource['uses']][] {
  const m = new Map<number, Resource['uses']>()
  for (const u of r.uses) m.set(u.flowIndex, [...(m.get(u.flowIndex) ?? []), u])
  return [...m.entries()].sort((a, b) => a[0] - b[0])
}

function FlowSummary({
  index,
  flowIndex,
  flowLink,
  onSelectResource,
}: {
  index: SolutionIndex
  flowIndex: number
  flowLink: (i: number) => ReactNode
  onSelectResource: (key: string) => void
}) {
  const flow = index.flows[flowIndex]
  const trigger = flow.triggers[0]
  const calls = index.calls.filter((c) => c.from === flowIndex)
  const calledBy = [...new Set(index.calls.filter((c) => c.to === flowIndex).map((c) => c.from))]
  const used = [...index.resourcesByFlow[flowIndex].entries()]
    .map(([key, access]) => ({ r: index.resourceByKey.get(key)!, access }))
    .sort((a, b) => index.resources.indexOf(a.r) - index.resources.indexOf(b.r))
  const summary = trigger && actionSummary(trigger)

  return (
    <>
      <dl>
        <dt>Trigger</dt>
        <dd>
          {trigger ? actionTitle(trigger) : 'none'}
          {summary && (
            <div>
              <code className="wrap">{summary}</code>
            </div>
          )}
        </dd>
        <dt>Steps</dt>
        <dd>{flow.byId.size}</dd>
        {flow.source && (
          <>
            <dt>File</dt>
            <dd>
              <code className="wrap">{flow.source}</code>
            </dd>
          </>
        )}
        {calls.length > 0 && (
          <>
            <dt>Calls</dt>
            <dd>
              {calls.map((c) => (
                <div key={c.nodeId}>
                  {c.to !== undefined ? (
                    flowLink(c.to)
                  ) : (
                    <span className="unresolved">{c.targetId}</span>
                  )}
                </div>
              ))}
            </dd>
          </>
        )}
        {calledBy.length > 0 && (
          <>
            <dt>Called by</dt>
            <dd>
              {calledBy.map((i) => (
                <div key={i}>{flowLink(i)}</div>
              ))}
            </dd>
          </>
        )}
        {flow.warnings.length > 0 && (
          <>
            <dt>Warnings</dt>
            <dd className="warn">{flow.warnings.join('; ')}</dd>
          </>
        )}
      </dl>
      <h3>Uses</h3>
      {used.length === 0 && <div className="muted">No external resources found</div>}
      {used.map(({ r, access }) => (
        <div key={r.key} className="use-row">
          <span className="kind-badge">{KIND_BADGE[r.kind]}</span>
          <button className="link" onClick={() => onSelectResource(r.key)} title={r.detail}>
            {r.label}
          </button>{' '}
          {access.map((a: Access) => (
            <span key={a} className={`access access-${a}`}>
              {ACCESS_LABEL[a]}
            </span>
          ))}
        </div>
      ))}
    </>
  )
}
