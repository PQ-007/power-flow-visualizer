import { parseTemplate } from '../expr/parse'
import { connectorName } from '../model/catalog'
import { exprText } from '../model/describe'
import type { FlowNode, ParsedFlow } from '../model/types'
import { refsOfNode } from './references'

/**
 * The things outside a flow that an action touches: SharePoint lists, Dataverse tables, Excel
 * tables, SQL tables, mailboxes, HTTP hosts, child flows, connection references and environment
 * variables. Lets a solution answer "which flows write to list Invoices?".
 */

export type ResourceKind =
  | 'sharepoint'
  | 'dataverse'
  | 'excel'
  | 'sql'
  | 'mailbox'
  | 'http'
  | 'flow'
  | 'connection'
  | 'envvar'

export type Access = 'trigger' | 'read' | 'write' | 'call' | 'use'

export interface ResourceRef {
  kind: ResourceKind
  /** Stable, case-insensitive identity, e.g. `sharepoint:contoso…/sites/finance|invoices`. */
  key: string
  label: string
  /** Secondary text, e.g. the SharePoint site or connector name. */
  detail?: string
  /** The name comes from an expression, so the actual target is only known at run time. */
  dynamic?: boolean
  access: Access
}

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  sharepoint: 'SharePoint',
  dataverse: 'Dataverse table',
  excel: 'Excel table',
  sql: 'SQL table',
  mailbox: 'Mailbox',
  http: 'HTTP endpoint',
  flow: 'Child flow',
  connection: 'Connection reference',
  envvar: 'Environment variable',
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Operation ids that change data. Anything else on a connector counts as a read. */
const WRITE_OP =
  /^(post|patch|put|delete|create|update|add|upsert|set|copy|move|upload|send|insert|remove|write|associate|disassociate|execute|perform|reply|forward|flag|mark)/i

/** Display label for a parameter value: metadata names for GUIDs, expression text, or as-is. */
function valueLabel(node: FlowNode, v: unknown): { label: string; dynamic: boolean } | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  if (parseTemplate(v)) return { label: exprText(v), dynamic: true }
  const meta = isObject(node.raw.metadata) ? node.raw.metadata[v] : undefined
  return { label: typeof meta === 'string' ? meta : v, dynamic: false }
}

/** `https://contoso.sharepoint.com/sites/finance` → `finance` (falls back to the whole value). */
export function siteLabel(url: string): string {
  const m = url.match(/\/(?:sites|teams)\/([^/?#]+)/i)
  if (m) return decodeURIComponent(m[1])
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

function connectorResources(node: FlowNode): Omit<ResourceRef, 'access'>[] {
  const inputs = isObject(node.raw.inputs) ? node.raw.inputs : {}
  const p = isObject(inputs.parameters) ? inputs.parameters : {}
  const out: Omit<ResourceRef, 'access'>[] = []
  const add = (kind: ResourceKind, id: string, label: string, detail?: string, dynamic = false) =>
    out.push({
      kind,
      key: `${kind}:${id.toLowerCase()}`,
      label,
      detail,
      dynamic: dynamic || undefined,
    })

  switch (node.connector) {
    case 'sharepointonline': {
      const site = valueLabel(node, p.dataset)
      const target = valueLabel(node, p.table ?? p.folderPath ?? p.path)
      if (target) {
        const siteText = site?.label ?? '?'
        add(
          'sharepoint',
          `${siteText}|${target.label}`,
          target.label,
          site ? siteLabel(site.label) : undefined,
          target.dynamic || site?.dynamic,
        )
      }
      break
    }
    case 'commondataserviceforapps':
    case 'commondataservice': {
      const t = valueLabel(node, p.entityName ?? p['subscriptionRequest/entityname'])
      if (t) add('dataverse', t.label, t.label, undefined, t.dynamic)
      break
    }
    case 'excelonlinebusiness': {
      const file = valueLabel(node, p.file)
      const table = valueLabel(node, p.table)
      if (file || table) {
        const f = file?.label ?? '?'
        const label = `${basename(f)}${table ? ` › ${table.label}` : ''}`
        add(
          'excel',
          `${f}|${table?.label ?? ''}`,
          label,
          file?.label,
          file?.dynamic || table?.dynamic,
        )
      }
      break
    }
    case 'sql': {
      const table = valueLabel(node, p.table)
      if (table) {
        const db = [p.server, p.database].filter((x) => typeof x === 'string').join('/')
        add('sql', `${db}|${table.label}`, table.label, db || undefined, table.dynamic)
      }
      break
    }
    case 'office365':
    case 'outlook':
    case 'sendmail':
    case 'office365groupsmail': {
      // Literal addresses only: dynamic recipients would just be noise (env vars show separately).
      const addresses = [
        p.mailboxAddress,
        p['emailMessage/To'],
        p['emailMessage/Cc'],
        p['emailMessage/From'],
      ]
      for (const a of addresses) {
        if (typeof a !== 'string' || parseTemplate(a)) continue
        for (const addr of a
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean))
          add('mailbox', addr, addr)
      }
      break
    }
  }
  return out
}

export function resourcesOfNode(flow: ParsedFlow, node: FlowNode): ResourceRef[] {
  const out: ResourceRef[] = []
  const inputs = isObject(node.raw.inputs) ? node.raw.inputs : {}
  const type = node.type.toLowerCase()

  if (node.connector) {
    const access: Access =
      node.kind === 'trigger' ? 'trigger' : WRITE_OP.test(node.operationId ?? '') ? 'write' : 'read'
    for (const r of connectorResources(node)) out.push({ ...r, access })

    const host = isObject(inputs.host) ? inputs.host : {}
    const conn = isObject(host.connection) ? host.connection : {}
    const connKey = [host.connectionName, conn.referenceName, conn.name].find(
      (x) => typeof x === 'string',
    ) as string | undefined
    const refName = connKey ? flow.connectionReferences?.[connKey] : undefined
    if (refName) {
      out.push({
        kind: 'connection',
        key: `connection:${refName.toLowerCase()}`,
        label: refName,
        detail: connectorName(node.connector),
        access: 'use',
      })
    }
  }

  if (type === 'http' || type === 'httpwebhook') {
    const uri = typeof inputs.uri === 'string' ? inputs.uri : undefined
    const host = uri?.match(/^https?:\/\/([^/@{?#]+)/i)?.[1]
    if (host)
      out.push({ kind: 'http', key: `http:${host.toLowerCase()}`, label: host, access: 'call' })
    else if (uri)
      out.push({
        kind: 'http',
        key: `http:${uri.toLowerCase()}`,
        label: exprText(uri),
        dynamic: true,
        access: 'call',
      })
  }

  if (type === 'workflow') {
    const host = isObject(inputs.host) ? inputs.host : {}
    const ref = host.workflowReferenceName
    if (typeof ref === 'string' && ref) {
      const id = ref.replace(/[{}]/g, '').toLowerCase()
      out.push({ kind: 'flow', key: `flow:${id}`, label: id, access: 'call' })
    }
  }

  for (const r of refsOfNode(flow, node)) {
    if (r.kind !== 'parameter') continue
    // Solution env vars are named "Display name (schema_name)".
    const m = r.target.match(/^(.*?)\s*\(([^()]+)\)$/)
    out.push({
      kind: 'envvar',
      key: `envvar:${(m?.[2] ?? r.target).toLowerCase()}`,
      label: m?.[1] || r.target,
      detail: m?.[2],
      access: 'read',
    })
  }
  return out
}
