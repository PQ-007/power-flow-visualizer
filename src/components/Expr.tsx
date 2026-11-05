import type { ReactNode } from 'react'
import { refOfCall, type Ref } from '../analysis/references'
import { parseTemplate, type Expr } from '../expr/parse'
import { printExpr } from '../expr/print'
import { useExprLinks, type ExprLinks } from './exprContext'

/** Expressions longer than this (on one line) are broken across lines, one argument each. */
const MAX_INLINE = 56

function RefLink({
  refInfo,
  links,
  children,
}: {
  refInfo: Ref
  links: ExprLinks
  children: ReactNode
}) {
  if (refInfo.unresolved) {
    return (
      <span
        className="expr-ref unresolved"
        title={`No action named "${refInfo.target}" in this flow`}
      >
        {children}
      </span>
    )
  }
  const isVar = refInfo.kind === 'variable'
  const label = isVar
    ? `Variable ${refInfo.target}`
    : (links.flow.byId.get(refInfo.target)?.displayName ?? refInfo.target)
  if (refInfo.kind === 'parameter') return <span className="expr-ref param">{children}</span>
  return (
    <button
      className={`expr-ref ${isVar ? 'var' : 'action'}`}
      title={isVar ? `Show where ${refInfo.target} is used` : `Go to ${label}`}
      onClick={() =>
        isVar ? links.onSelectVariable(refInfo.target) : links.onNavigate(refInfo.target)
      }
    >
      {children}
    </button>
  )
}

function ExprNode({ e, links }: { e: Expr; links: ExprLinks | null }): ReactNode {
  switch (e.type) {
    case 'string':
      return <span className="expr-str">{printExpr(e)}</span>
    case 'number':
    case 'literal':
      return <span className="expr-lit">{printExpr(e)}</span>
    case 'ident':
      return <span>{e.name}</span>
    case 'error':
      return (
        <span className="expr-error" title="Could not parse this expression">
          {e.text}
        </span>
      )
    case 'member': {
      const q = e.optional ? '?' : ''
      return (
        <>
          <ExprNode e={e.object} links={links} />
          {e.dot && e.property.type === 'string' ? (
            <span className="expr-prop">
              {q}.{e.property.value}
            </span>
          ) : (
            <span className="expr-prop">
              {q}[<ExprNode e={e.property} links={links} />]
            </span>
          )}
        </>
      )
    }
    case 'call': {
      const ref = links ? refOfCall(e, links.flow, links.nodeId) : null
      // Functions without a name argument (triggerBody(), item()) link on the function name.
      const linkName = ref && (e.args.length === 0 || e.args[0].type !== 'string')
      const name = <span className="expr-fn">{e.name}</span>
      const args = e.args.map((a, i) =>
        ref && links && i === 0 && !linkName ? (
          <RefLink key={i} refInfo={ref} links={links}>
            <ExprNode e={a} links={null} />
          </RefLink>
        ) : (
          <ExprNode key={i} e={a} links={links} />
        ),
      )
      const head =
        linkName && links ? (
          <RefLink refInfo={ref} links={links}>
            {name}
          </RefLink>
        ) : (
          name
        )
      if (printExpr(e).length <= MAX_INLINE || e.args.length === 0) {
        return (
          <>
            {head}(
            {args.map((a, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {a}
              </span>
            ))}
            )
          </>
        )
      }
      return (
        <>
          {head}(
          <span className="expr-args">
            {args.map((a, i) => (
              <span className="expr-arg" key={i}>
                {a}
                {i < args.length - 1 && ','}
              </span>
            ))}
          </span>
          )
        </>
      )
    }
  }
}

/**
 * Renders a JSON string value from a flow definition: plain text as-is, expressions
 * syntax-highlighted and pretty-printed, with references as links.
 */
export function ExprValue({ value }: { value: string }) {
  const links = useExprLinks()
  const segments = parseTemplate(value)
  if (!segments) return <span className="expr-text">{JSON.stringify(value)}</span>
  const whole = segments.length === 1 && segments[0].kind === 'expr' && value.startsWith('@')
  return (
    <code className="expr">
      {whole && <span className="expr-at">@</span>}
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i} className="expr-text">
            {s.text}
          </span>
        ) : (
          <span key={i} className={whole ? undefined : 'expr-interp'}>
            {!whole && <span className="expr-at">@{'{'}</span>}
            <ExprNode e={s.expr} links={links} />
            {!whole && <span className="expr-at">{'}'}</span>}
          </span>
        ),
      )}
    </code>
  )
}
