import { describe, expect, it } from 'vitest'
import { parseExpression, parseTemplate } from './parse'
import { printExpr } from './print'

const roundTrip = (s: string) => printExpr(parseExpression(s))

describe('parseExpression', () => {
  it('parses calls, strings, numbers and literals', () => {
    expect(parseExpression("equals(variables('x'), 10)")).toEqual({
      type: 'call',
      name: 'equals',
      args: [
        { type: 'call', name: 'variables', args: [{ type: 'string', value: 'x' }] },
        { type: 'number', value: 10 },
      ],
    })
    expect(parseExpression('true')).toEqual({ type: 'literal', value: true })
    expect(parseExpression('null')).toEqual({ type: 'literal', value: null })
    expect(parseExpression('-1.5')).toEqual({ type: 'number', value: -1.5 })
  })

  it('handles escaped quotes', () => {
    expect(parseExpression("'it''s'")).toEqual({ type: 'string', value: "it's" })
  })

  it('parses member access chains', () => {
    for (const s of [
      "body('Get_items')?['value']",
      "outputs('A')['body']?['x'][0]",
      "triggerOutputs()?['body/Amount']",
      "first(body('Y')?['value'])?['id']",
      'item()?.name',
      'workflow().run.name',
    ]) {
      expect(roundTrip(s)).toBe(s)
    }
  })

  it('normalizes whitespace when printing', () => {
    expect(roundTrip("concat( 'a' ,variables( 'b' ) )")).toBe("concat('a', variables('b'))")
  })

  it('returns an error node instead of throwing', () => {
    for (const s of ["concat('a'", 'foo(', "'unterminated", 'a b', '1 +', '']) {
      expect(parseExpression(s)).toEqual({ type: 'error', text: s })
    }
  })
})

describe('parseTemplate', () => {
  it('treats a leading @ as a whole-value expression', () => {
    expect(parseTemplate("@variables('x')")).toEqual([
      {
        kind: 'expr',
        source: "variables('x')",
        expr: { type: 'call', name: 'variables', args: [{ type: 'string', value: 'x' }] },
      },
    ])
  })

  it('splits interpolated strings, honouring } inside quotes', () => {
    const segs = parseTemplate("Hi @{variables('n')}, see @{concat('}', 'x')}!")!
    expect(segs.map((s) => (s.kind === 'text' ? s.text : `{${s.source}}`))).toEqual([
      'Hi ',
      "{variables('n')}",
      ', see ',
      "{concat('}', 'x')}",
      '!',
    ])
  })

  it('returns null for plain text and escaped @@', () => {
    expect(parseTemplate('just text')).toBeNull()
    expect(parseTemplate('@@mention')).toBeNull()
    expect(parseTemplate('a@b.com')).toBeNull()
  })

  it('keeps an unclosed interpolation as text', () => {
    expect(parseTemplate('x @{oops')).toEqual([{ kind: 'text', text: 'x @{oops' }])
  })
})
