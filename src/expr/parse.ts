/**
 * Parser for the Workflow Definition Language expression syntax used by Power Automate.
 *
 *   "@body('Get_items')?['value']"          whole-value expression
 *   "Hello @{variables('name')}!"            string with interpolated expressions
 *   "@@not an expression"                    escaped literal "@not an expression"
 *
 * The parser is tolerant: malformed input never throws, it yields an `error` node with the
 * unparsed text so the UI can still show it.
 */

export type Expr =
  | { type: 'call'; name: string; args: Expr[] }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'literal'; value: boolean | null }
  | { type: 'member'; object: Expr; property: Expr; optional: boolean; dot: boolean }
  | { type: 'ident'; name: string }
  | { type: 'error'; text: string }

export type Segment = { kind: 'text'; text: string } | { kind: 'expr'; expr: Expr; source: string }

type Token =
  | { t: 'ident'; v: string }
  | { t: 'string'; v: string }
  | { t: 'number'; v: number }
  | { t: 'punct'; v: '(' | ')' | ',' | '[' | ']' | '.' | '?' }

function tokenize(src: string): { tokens: Token[]; rest: string } {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (c === "'") {
      let v = ''
      i++
      for (;;) {
        if (i >= src.length) return { tokens, rest: src.slice(src.lastIndexOf("'", i - 1)) }
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            v += "'"
            i += 2
            continue
          }
          i++
          break
        }
        v += src[i++]
      }
      tokens.push({ t: 'string', v })
    } else if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)!
      tokens.push({ t: 'number', v: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z_$]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)!
      tokens.push({ t: 'ident', v: m[0] })
      i += m[0].length
    } else if ('(),[].?'.includes(c)) {
      tokens.push({ t: 'punct', v: c as '(' })
      i++
    } else {
      return { tokens, rest: src.slice(i) }
    }
  }
  return { tokens, rest: '' }
}

class ParseError extends Error {}

/** Parses the body of one expression (without the leading `@` or `@{ }`). */
export function parseExpression(source: string): Expr {
  const { tokens, rest } = tokenize(source)
  let pos = 0
  const peek = () => tokens[pos]
  const isPunct = (v: string, tok = peek()) => tok?.t === 'punct' && tok.v === v
  const expect = (v: string) => {
    if (!isPunct(v)) throw new ParseError(`expected ${v}`)
    pos++
  }

  const primary = (): Expr => {
    const tok = tokens[pos++]
    if (!tok) throw new ParseError('unexpected end')
    if (tok.t === 'string') return { type: 'string', value: tok.v }
    if (tok.t === 'number') return { type: 'number', value: tok.v }
    if (tok.t === 'ident') {
      if (isPunct('(')) {
        pos++
        const args: Expr[] = []
        if (!isPunct(')')) {
          for (;;) {
            args.push(postfix())
            if (isPunct(',')) {
              pos++
              continue
            }
            break
          }
        }
        expect(')')
        return { type: 'call', name: tok.v, args }
      }
      const lower = tok.v.toLowerCase()
      if (lower === 'true' || lower === 'false') return { type: 'literal', value: lower === 'true' }
      if (lower === 'null') return { type: 'literal', value: null }
      return { type: 'ident', name: tok.v }
    }
    throw new ParseError(`unexpected ${tok.v}`)
  }

  const postfix = (): Expr => {
    let e = primary()
    for (;;) {
      let optional = false
      if (isPunct('?') && (isPunct('[', tokens[pos + 1]) || isPunct('.', tokens[pos + 1]))) {
        optional = true
        pos++
      }
      if (isPunct('[')) {
        pos++
        const property = postfix()
        expect(']')
        e = { type: 'member', object: e, property, optional, dot: false }
      } else if (isPunct('.')) {
        pos++
        const tok = tokens[pos++]
        if (tok?.t !== 'ident') throw new ParseError('expected property name')
        e = {
          type: 'member',
          object: e,
          property: { type: 'string', value: tok.v },
          optional,
          dot: true,
        }
      } else {
        return e
      }
    }
  }

  try {
    const e = postfix()
    if (pos < tokens.length || rest) throw new ParseError('trailing input')
    return e
  } catch {
    return { type: 'error', text: source }
  }
}

/** Index of the `}` closing an interpolation that starts at `from`, honouring quoted strings. */
function closingBrace(s: string, from: number): number {
  let inString = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      if (inString && s[i + 1] === "'") i++
      else inString = !inString
    } else if (c === '}' && !inString) {
      return i
    }
  }
  return -1
}

/**
 * Splits a JSON string value into literal text and expressions.
 * Returns null when the value contains no expression at all (plain text).
 */
export function parseTemplate(value: string): Segment[] | null {
  if (value.startsWith('@@')) return null
  if (value.startsWith('@') && !value.startsWith('@{')) {
    const source = value.slice(1)
    return [{ kind: 'expr', expr: parseExpression(source), source }]
  }
  if (!value.includes('@{')) return null
  const segments: Segment[] = []
  let i = 0
  while (i < value.length) {
    const start = value.indexOf('@{', i)
    if (start === -1) {
      segments.push({ kind: 'text', text: value.slice(i) })
      break
    }
    const end = closingBrace(value, start + 2)
    if (end === -1) {
      segments.push({ kind: 'text', text: value.slice(i) })
      break
    }
    if (start > i) segments.push({ kind: 'text', text: value.slice(i, start) })
    const source = value.slice(start + 2, end)
    segments.push({ kind: 'expr', expr: parseExpression(source), source })
    i = end + 1
  }
  return segments
}

/** Visits every node of an expression tree. */
export function visitExpr(e: Expr, fn: (e: Expr) => void): void {
  fn(e)
  if (e.type === 'call') e.args.forEach((a) => visitExpr(a, fn))
  else if (e.type === 'member') {
    visitExpr(e.object, fn)
    visitExpr(e.property, fn)
  }
}
