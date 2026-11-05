import { builtinTypeName, connectorName, operationTitle } from './catalog'
import type { FlowNode } from './types'

/**
 * Short, human-readable descriptions of an action for cards, the outline and search.
 * Pure functions: no React, no DOM.
 */

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** "SharePoint · Update item" for connector actions, "Set variable" for built-ins. */
export function actionTitle(node: FlowNode): string {
  if (node.connector) {
    const op = node.operationId ? ` · ${operationTitle(node.connector, node.operationId)}` : ''
    return `${connectorName(node.connector)}${op}`
  }
  return builtinTypeName(node.type, typeof node.raw.kind === 'string' ? node.raw.kind : undefined)
}

/**
 * Text for a WDL value: expressions lose their leading `@` (and a whole-value `@{…}` wrapper),
 * literal strings are quoted so they can't be mistaken for expressions.
 */
export function exprText(v: unknown): string {
  if (typeof v === 'string') {
    const whole = v.match(/^@\{([^{}]*)\}$/)
    if (whole) return whole[1]
    if (v.startsWith('@') && !v.startsWith('@{')) return v.slice(1)
    return JSON.stringify(v)
  }
  if (v === undefined) return ''
  return JSON.stringify(v)
}

const BINARY_OPS: Record<string, string> = {
  equals: '=',
  greater: '>',
  greaterOrEquals: '≥',
  less: '<',
  lessOrEquals: '≤',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
}
const NEGATED_OPS: Record<string, string> = {
  equals: '≠',
  contains: 'does not contain',
  startsWith: 'does not start with',
  endsWith: 'does not end with',
}

/** Renders a Condition (`If`) expression object as text, e.g. `a > 10000 and b = 'x'`. */
export function conditionText(expr: unknown, nested = false): string {
  if (!isObject(expr)) return exprText(expr)
  const [op, args] = Object.entries(expr)[0] ?? []
  if (!op) return ''
  if ((op === 'and' || op === 'or') && Array.isArray(args)) {
    const parts = args.map((a) => conditionText(a, true))
    const text = parts.join(` ${op} `)
    return nested && parts.length > 1 ? `(${text})` : text
  }
  if (op === 'not') {
    const inner = isObject(args) ? Object.entries(args)[0] : undefined
    if (inner && NEGATED_OPS[inner[0]] && Array.isArray(inner[1])) {
      return `${exprText(inner[1][0])} ${NEGATED_OPS[inner[0]]} ${exprText(inner[1][1])}`
    }
    return `not ${conditionText(args, true)}`
  }
  if (BINARY_OPS[op] && Array.isArray(args)) {
    return `${exprText(args[0])} ${BINARY_OPS[op]} ${exprText(args[1])}`
  }
  return `${op}(${Array.isArray(args) ? args.map(exprText).join(', ') : exprText(args)})`
}

/** One line with the most useful input of an action, or undefined if nothing stands out. */
export function actionSummary(node: FlowNode): string | undefined {
  const raw = node.raw
  const inputs = isObject(raw.inputs) ? raw.inputs : undefined
  switch (node.type.toLowerCase()) {
    case 'if':
      return conditionText(raw.expression)
    case 'switch':
      return `on ${exprText(raw.expression)}`
    case 'foreach':
      return `for each in ${exprText(raw.foreach)}`
    case 'until':
      return `until ${conditionText(raw.expression)}`
    case 'initializevariable': {
      const v = Array.isArray(inputs?.variables) ? inputs.variables[0] : undefined
      if (!isObject(v)) return undefined
      const value = v.value === undefined ? '' : ` = ${exprText(v.value)}`
      return `${String(v.name)} (${String(v.type)})${value}`
    }
    case 'setvariable':
    case 'incrementvariable':
    case 'decrementvariable':
    case 'appendtoarrayvariable':
    case 'appendtostringvariable': {
      if (!inputs) return undefined
      const op =
        node.type.toLowerCase() === 'setvariable'
          ? '='
          : node.type.startsWith('Append')
            ? '+='
            : node.type.startsWith('Decrement')
              ? '-='
              : '+='
      return inputs.value === undefined
        ? String(inputs.name)
        : `${String(inputs.name)} ${op} ${exprText(inputs.value)}`
    }
    case 'compose':
      return exprText(raw.inputs)
    case 'parsejson':
    case 'query':
    case 'select':
    case 'table':
    case 'join':
      return inputs?.from !== undefined
        ? `from ${exprText(inputs.from)}`
        : exprText(inputs?.content)
    case 'http':
      return inputs ? `${String(inputs.method ?? 'GET')} ${exprText(inputs.uri)}` : undefined
    case 'terminate':
      return inputs ? `status: ${String(inputs.runStatus)}` : undefined
    case 'response':
      return inputs?.statusCode !== undefined ? `status ${exprText(inputs.statusCode)}` : undefined
    case 'wait': {
      const interval = isObject(inputs?.interval) ? inputs.interval : undefined
      return interval ? `${String(interval.count)} ${String(interval.unit)}` : undefined
    }
    case 'recurrence': {
      const r = isObject(raw.recurrence) ? raw.recurrence : undefined
      return r ? `every ${String(r.interval)} ${String(r.frequency).toLowerCase()}` : undefined
    }
  }
  const params = isObject(inputs?.parameters) ? inputs.parameters : undefined
  if (params) {
    // SharePoint/Excel/Dataverse: the list/table is what people look for.
    const target = params.table ?? params.entityName ?? params.file ?? params['emailMessage/To']
    if (target !== undefined) return exprText(target)
  }
  return undefined
}
