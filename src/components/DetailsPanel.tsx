import type { Ref } from '../analysis/references'
import type { FlowAnalysis } from '../analysis/variables'
import { actionTitle } from '../model/describe'
import type { FlowNode, ParsedFlow } from '../model/types'
import { formatDuration, runClass } from '../run/overlay'
import type { ActionRun } from '../run/parseRun'
import { ExprContext } from './exprContext'
import { JsonView } from './JsonView'

interface Props {
  flow: ParsedFlow
  analysis: FlowAnalysis
  node: FlowNode
  /** Set for "Run a child flow" actions whose target is known. */
  childFlow?: { name: string; open?: () => void }
  /** This action's result in the overlaid run, if any. */
  runResult?: ActionRun
  /** A run is overlaid (so a missing result means "did not run"). */
  hasRun?: boolean
  onNavigate: (id: string) => void
  onSelectVariable: (name: string) => void
  onClose: () => void
}

/** Keys shown elsewhere in the panel or on the canvas. */
const HIDDEN_KEYS = new Set(['type', 'runAfter', 'actions', 'else', 'cases', 'default', 'metadata'])

export function DetailsPanel({
  flow,
  analysis,
  node,
  childFlow,
  runResult,
  hasRun,
  onNavigate,
  onSelectVariable,
  onClose,
}: Props) {
  const runAfter = Object.entries(node.runAfter)
  // Siblings that run after this one (the "next" steps, including error handlers).
  const next = [...flow.byId.values()].filter((n) => node.id in n.runAfter)
  const refs = analysis.refs.get(node.id) ?? []
  const usedBy = analysis.usedBy.get(node.id) ?? []
  const definition = definitionView(node)
  const parent = node.parentId ? flow.byId.get(node.parentId) : undefined
  const branch =
    parent?.branches.length !== 1 ? parent?.branches.find((b) => b.id === node.branchId) : undefined

  const link = (id: string) => (
    <button className="link" onClick={() => onNavigate(id)}>
      {flow.byId.get(id)?.displayName ?? id}
    </button>
  )
  const refItem = (r: Ref) => {
    if (r.unresolved) {
      return (
        <span className="unresolved" title="Not found in this flow — renamed or deleted action?">
          {r.target || `${r.fn}()`} (missing)
        </span>
      )
    }
    switch (r.kind) {
      case 'variable':
        return (
          <button className="link var" onClick={() => onSelectVariable(r.target)}>
            {r.target}
          </button>
        )
      case 'parameter':
        return <span>parameter {r.target}</span>
      case 'loop':
        return <>current item of {link(r.target)}</>
      default:
        return link(r.target)
    }
  }

  return (
    <aside className="details">
      <header>
        <h2>{node.displayName}</h2>
        <button className="close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>
      <dl>
        <dt>Action</dt>
        <dd>{actionTitle(node)}</dd>
        {childFlow && (
          <>
            <dt>Child flow</dt>
            <dd>
              {childFlow.open ? (
                <button className="link" onClick={childFlow.open}>
                  {childFlow.name} ›
                </button>
              ) : (
                <span className="unresolved">{childFlow.name}</span>
              )}
            </dd>
          </>
        )}
        <dt>Internal name</dt>
        <dd>
          <code>{node.name}</code>
        </dd>
        {parent && (
          <>
            <dt>Inside</dt>
            <dd>
              {link(parent.id)}
              {branch && <small> · {branch.label}</small>}
            </dd>
          </>
        )}
        {runAfter.length > 0 && (
          <>
            <dt>Runs after</dt>
            <dd>
              {runAfter.map(([dep, s]) => (
                <div key={dep}>
                  {link(dep)} <small>({s.join(', ') || 'Succeeded'})</small>
                </div>
              ))}
            </dd>
          </>
        )}
        {next.length > 0 && (
          <>
            <dt>Then</dt>
            <dd>
              {next.map((n) => (
                <div key={n.id}>
                  {link(n.id)} <small>({n.runAfter[node.id].join(', ') || 'Succeeded'})</small>
                </div>
              ))}
            </dd>
          </>
        )}
        {refs.length > 0 && (
          <>
            <dt>Uses</dt>
            <dd>
              {refs.map((r) => (
                <div key={`${r.kind}:${r.target}`}>{refItem(r)}</div>
              ))}
            </dd>
          </>
        )}
        {usedBy.length > 0 && (
          <>
            <dt>Used by</dt>
            <dd>
              {usedBy.map((id) => (
                <div key={id}>{link(id)}</div>
              ))}
            </dd>
          </>
        )}
      </dl>
      {hasRun && <RunSection result={runResult} />}
      {Object.keys(definition).length > 0 && (
        <>
          <h3>Definition</h3>
          <ExprContext.Provider value={{ flow, nodeId: node.id, onNavigate, onSelectVariable }}>
            <div className="definition">
              <JsonView value={definition} />
            </div>
          </ExprContext.Provider>
        </>
      )}
      <details className="raw">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(stripNested(node.raw), null, 2)}</pre>
      </details>
    </aside>
  )
}

function RunSection({ result }: { result?: ActionRun }) {
  if (!result) {
    return (
      <section className="run-section">
        <h3>This run</h3>
        <p className="muted">
          Not in the run — it did not execute (or the run is from another version).
        </p>
      </section>
    )
  }
  const cls = runClass(result.status)
  const data = (label: string, value: unknown, linked?: boolean) => {
    if (value === undefined) {
      return linked ? (
        <p className="muted">
          {label}: not included in the file (export with data, see docs/run-export.md).
        </p>
      ) : null
    }
    const size = JSON.stringify(value)?.length ?? 0
    return (
      <details className="run-data" open={cls === 'failed' || size < 600}>
        <summary>
          {label}{' '}
          <small className="muted">
            ({size < 1024 ? `${size} B` : `${Math.round(size / 1024)} KB`})
          </small>
        </summary>
        <div className="definition">
          <JsonView value={value} />
        </div>
      </details>
    )
  }
  return (
    <section className={`run-section run-${cls}`}>
      <h3>This run</h3>
      <dl>
        <dt>Status</dt>
        <dd>
          <span className={`status-pill run-${cls}`}>{result.status}</span>
          {result.code && result.code !== 'OK' && <small className="muted"> {result.code}</small>}
        </dd>
        {result.startTime && (
          <>
            <dt>Started</dt>
            <dd>{new Date(result.startTime).toLocaleString()}</dd>
          </>
        )}
        {result.durationMs !== undefined && (
          <>
            <dt>Duration</dt>
            <dd>{formatDuration(result.durationMs)}</dd>
          </>
        )}
        {result.repetitionCount !== undefined && (
          <>
            <dt>Repetitions</dt>
            <dd>{result.repetitionCount}</dd>
          </>
        )}
      </dl>
      {result.error?.message && (
        <div className="run-error">
          {result.error.code && <strong>{result.error.code}: </strong>}
          {result.error.message}
        </div>
      )}
      {data('Inputs', result.inputs, result.inputsLinked)}
      {data('Outputs', result.outputs, result.outputsLinked)}
    </section>
  )
}

/**
 * The parts of an action worth reading: drops keys shown elsewhere and, for connector
 * actions, the `inputs.host` block (already summarized as "Action").
 */
function definitionView(node: FlowNode): Record<string, unknown> {
  const view = Object.fromEntries(Object.entries(node.raw).filter(([k]) => !HIDDEN_KEYS.has(k)))
  const inputs = view.inputs
  if (node.connector && inputs && typeof inputs === 'object' && !Array.isArray(inputs)) {
    const { host: _host, ...rest } = inputs as Record<string, unknown>
    view.inputs = rest
  }
  return view
}

/** Nested actions are shown on the canvas; hide them here to keep the JSON readable. */
function stripNested(raw: Record<string, unknown>) {
  const { actions, else: elseBranch, cases, default: def, ...rest } = raw
  const hidden = [actions, elseBranch, cases, def].some((v) => v !== undefined)
  return hidden ? { ...rest, '…': 'nested actions shown on canvas' } : rest
}
