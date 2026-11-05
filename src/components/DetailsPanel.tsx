import type { FlowNode } from '../model/types'

export function DetailsPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const runAfter = Object.entries(node.runAfter)
  return (
    <aside className="details">
      <header>
        <h2>{node.displayName}</h2>
        <button onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>
      <dl>
        <dt>Internal name</dt>
        <dd>
          <code>{node.name}</code>
        </dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        {node.connector && (
          <>
            <dt>Connector</dt>
            <dd>
              {node.connector}
              {node.operationId && ` · ${node.operationId}`}
            </dd>
          </>
        )}
        {node.parentId && (
          <>
            <dt>Inside</dt>
            <dd>{node.parentId.replace(/_/g, ' ')}</dd>
          </>
        )}
        {runAfter.length > 0 && (
          <>
            <dt>Runs after</dt>
            <dd>
              {runAfter.map(([dep, s]) => (
                <div key={dep}>
                  {dep.replace(/_/g, ' ')} <small>({s.join(', ') || 'Succeeded'})</small>
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
