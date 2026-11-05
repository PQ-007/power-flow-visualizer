import { ExprValue } from './Expr'

/**
 * Compact, YAML-like view of part of a flow definition. String values go through
 * ExprValue so expressions are readable and their references clickable.
 */
export function JsonView({ value }: { value: unknown }) {
  if (typeof value === 'string') return <ExprValue value={value} />
  if (value === null || typeof value !== 'object') {
    return <span className="expr-lit">{JSON.stringify(value)}</span>
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [`${i + 1}.`, v] as const)
    : Object.entries(value)
  if (entries.length === 0)
    return <span className="muted">{Array.isArray(value) ? '[]' : '{}'}</span>
  return (
    <ul className="json">
      {entries.map(([k, v]) => {
        const nested = v !== null && typeof v === 'object' && Object.keys(v).length > 0
        return (
          <li key={k}>
            <span className="json-key">{k}</span>
            {nested ? (
              <JsonView value={v} />
            ) : (
              <span className="json-value">
                <JsonView value={v} />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
