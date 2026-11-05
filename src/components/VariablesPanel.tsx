import type { FlowAnalysis, VariableInfo, VariableOp } from '../analysis/variables'
import type { ParsedFlow } from '../model/types'
import { ExprContext } from './exprContext'
import { JsonView } from './JsonView'

interface Props {
  flow: ParsedFlow
  analysis: FlowAnalysis
  selected: string | null
  onSelectVariable: (name: string | null) => void
  onNavigate: (id: string) => void
}

const OP_LABEL: Record<VariableOp, string> = {
  set: 'set to',
  increment: 'increment by',
  decrement: 'decrement by',
  append: 'append',
}

/** Every variable in the flow with where it's initialized, changed and read. */
export function VariablesPanel({ flow, analysis, selected, onSelectVariable, onNavigate }: Props) {
  const vars = [...analysis.variables.values()].sort((a, b) => a.name.localeCompare(b.name))
  const selectedKey = selected?.toLowerCase()

  if (vars.length === 0) return <div className="panel-empty">This flow has no variables.</div>

  return (
    <div className="variables">
      <p className="legend">
        <span className="swatch write" /> initializes / changes <span className="swatch read" />{' '}
        reads
      </p>
      <ul>
        {vars.map((v) => {
          const open = v.name.toLowerCase() === selectedKey
          return (
            <li key={v.name} className={open ? 'open' : undefined}>
              <button
                className="var-row"
                aria-expanded={open}
                onClick={() => onSelectVariable(open ? null : v.name)}
              >
                <span className="var-name">{v.name}</span>
                {v.type && <span className="var-type">{v.type}</span>}
                <span className="var-counts">
                  {v.writes.length} set · {v.reads.length} read
                </span>
                {v.warnings.length > 0 && (
                  <span className="warn" title={v.warnings.join('\n')}>
                    ⚠
                  </span>
                )}
              </button>
              {open && (
                <VariableDetails
                  flow={flow}
                  v={v}
                  onNavigate={onNavigate}
                  onSelectVariable={onSelectVariable}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function VariableDetails({
  flow,
  v,
  onNavigate,
  onSelectVariable,
}: {
  flow: ParsedFlow
  v: VariableInfo
  onNavigate: (id: string) => void
  onSelectVariable: (name: string) => void
}) {
  const link = (id: string) => (
    <button className="link" onClick={() => onNavigate(id)}>
      {flow.byId.get(id)?.displayName ?? id}
    </button>
  )
  const valueOf = (nodeId: string, value: unknown) =>
    value === undefined ? null : (
      <ExprContext.Provider value={{ flow, nodeId, onNavigate, onSelectVariable }}>
        <div className="var-value">
          <JsonView value={value} />
        </div>
      </ExprContext.Provider>
    )

  return (
    <div className="var-details">
      {v.warnings.map((w) => (
        <div key={w} className="warn-line">
          ⚠ {w}
        </div>
      ))}
      <h4>Initialized</h4>
      {v.initializedBy.length === 0 && <div className="muted">nowhere</div>}
      {v.initializedBy.map((i) => (
        <div key={i.nodeId} className="var-use">
          {link(i.nodeId)}
          {valueOf(i.nodeId, i.value)}
        </div>
      ))}
      <h4>Changed ({v.writes.length})</h4>
      {v.writes.length === 0 && <div className="muted">never</div>}
      {v.writes.map((w) => (
        <div key={w.nodeId} className="var-use">
          {link(w.nodeId)} <small className="muted">{OP_LABEL[w.op]}</small>
          {valueOf(w.nodeId, w.value)}
        </div>
      ))}
      <h4>Read by ({v.reads.length})</h4>
      {v.reads.length === 0 && <div className="muted">nobody</div>}
      {v.reads.map((id) => (
        <div key={id} className="var-use">
          {link(id)}
        </div>
      ))}
    </div>
  )
}
