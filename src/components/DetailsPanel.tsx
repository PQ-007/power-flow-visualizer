import { actionSummary, actionTitle } from '../model/describe'
import type { FlowNode, ParsedFlow } from '../model/types'

interface Props {
  flow: ParsedFlow
  node: FlowNode
  onNavigate: (id: string) => void
  onClose: () => void
}

export function DetailsPanel({ flow, node, onNavigate, onClose }: Props) {
  const runAfter = Object.entries(node.runAfter)
  // Siblings that run after this one (the "next" steps, including error handlers).
  const next = [...flow.byId.values()].filter((n) => node.id in n.runAfter)
  const summary = actionSummary(node)
  const link = (id: string) => (
    <button className="link" onClick={() => onNavigate(id)}>
      {flow.byId.get(id)?.displayName ?? id}
    </button>
  )

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
        {summary && (
          <>
            <dt>Summary</dt>
            <dd>
              <code className="wrap">{summary}</code>
            </dd>
          </>
        )}
        <dt>Internal name</dt>
        <dd>
          <code>{node.name}</code>
        </dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        {node.parentId && (
          <>
            <dt>Inside</dt>
            <dd>
              {link(node.parentId)}
              {node.branchId && flow.byId.get(node.parentId)?.branches.length !== 1 && (
                <small>
                  {' '}
                  ·{' '}
                  {
                    flow.byId.get(node.parentId)?.branches.find((b) => b.id === node.branchId)
                      ?.label
                  }
                </small>
              )}
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
      </dl>
      <h3>Raw JSON</h3>
      <pre>{JSON.stringify(stripNested(node.raw), null, 2)}</pre>
    </aside>
  )
}

/** Nested actions are shown on the canvas; hide them here to keep the JSON readable. */
function stripNested(raw: Record<string, unknown>) {
  const { actions, else: elseBranch, cases, default: def, ...rest } = raw
  const hidden = [actions, elseBranch, cases, def].some((v) => v !== undefined)
  return hidden ? { ...rest, '…': 'nested actions shown on canvas' } : rest
}
