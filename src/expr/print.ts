import type { Expr } from './parse'

/** Single-line text of an expression, in canonical WDL syntax. */
export function printExpr(e: Expr): string {
  switch (e.type) {
    case 'call':
      return `${e.name}(${e.args.map(printExpr).join(', ')})`
    case 'string':
      return `'${e.value.replace(/'/g, "''")}'`
    case 'number':
      return String(e.value)
    case 'literal':
      return String(e.value)
    case 'ident':
      return e.name
    case 'error':
      return e.text
    case 'member': {
      const q = e.optional ? '?' : ''
      if (e.dot && e.property.type === 'string')
        return `${printExpr(e.object)}${q}.${e.property.value}`
      return `${printExpr(e.object)}${q}[${printExpr(e.property)}]`
    }
  }
}
