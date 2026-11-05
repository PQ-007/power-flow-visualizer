import { strFromU8, unzipSync } from 'fflate'
import type { ParsedFlow } from '../model/types'
import { normalizeGuid, parseCustomizations } from './customizations'
import { parseDefinition } from './parseDefinition'

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export interface ExtractedDefinition {
  definition: unknown
  displayName?: string
  /** The object that held `definition` (has `connectionReferences` in solution exports). */
  container?: Json
}

/**
 * Finds the WDL definition inside the common JSON shapes people copy around:
 *  - the bare definition ({ $schema, triggers, actions })
 *  - { definition: {...} }
 *  - { properties: { displayName, definition } }  (legacy package / solution Workflows/*.json /
 *    Dataverse workflow.clientdata)
 */
export function extractDefinition(json: unknown): ExtractedDefinition | null {
  if (!isObject(json)) return null
  if (isObject(json.triggers) || isObject(json.actions)) return { definition: json }
  if (isObject(json.definition)) {
    return { definition: json.definition, displayName: str(json.displayName), container: json }
  }
  if (isObject(json.properties)) {
    const inner = extractDefinition(json.properties)
    if (inner)
      return { ...inner, displayName: inner.displayName ?? str(json.properties.displayName) }
  }
  return null
}

/** `{ shared_sharepointonline: { connection: { connectionReferenceLogicalName } } }` → key → name. */
function connectionReferencesOf(container: Json | undefined): Record<string, string> | undefined {
  const refs =
    container && isObject(container.connectionReferences)
      ? container.connectionReferences
      : undefined
  if (!refs) return undefined
  const out: Record<string, string> = {}
  for (const [key, v] of Object.entries(refs)) {
    if (!isObject(v)) continue
    const conn = isObject(v.connection) ? v.connection : {}
    const name =
      str(conn.connectionReferenceLogicalName) ??
      str(v.connectionReferenceLogicalName) ??
      str(conn.name)
    if (name) out[key] = name
  }
  return out
}

export interface FlowMeta {
  displayName?: string
  id?: string
  source?: string
}

export function loadFlowFromJson(
  text: string,
  fallbackName = 'Untitled flow',
  meta: FlowMeta = {},
): ParsedFlow {
  const json: unknown = JSON.parse(text)
  const found = extractDefinition(json)
  if (!found) throw new Error('No flow definition (triggers/actions) found in this JSON')
  const flow = parseDefinition(
    found.definition,
    meta.displayName ?? found.displayName ?? fallbackName,
  )
  // Legacy packages carry the flow's own GUID in `name`.
  const ownId =
    isObject(json) && typeof json.name === 'string' && GUID.test(json.name) ? json.name : undefined
  const id = meta.id ?? ownId
  if (id) flow.id = normalizeGuid(id)
  if (meta.source) flow.source = meta.source
  const refs = connectionReferencesOf(found.container)
  if (refs && Object.keys(refs).length) flow.connectionReferences = refs
  return flow
}

/** `Workflows/InvoiceApproval-1A2B…-…json` → `InvoiceApproval`. */
const nameFromFile = (path: string) =>
  path
    .split('/')
    .pop()!
    .replace(/\.json$/i, '')
    .replace(new RegExp(`-${GUID.source}$`, 'i'), '')

const isFlowFile = (path: string) =>
  /(^|\/)Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/i.test(path) ||
  /(^|\/)Workflows\/[^/]+\.json$/i.test(path)

/**
 * Loads every flow from a set of files keyed by path (a zip's entries or an unpacked folder):
 *  - legacy package:   Microsoft.Flow/flows/<guid>/definition.json
 *  - solution:         Workflows/<name>-<guid>.json  (+ customizations.xml for names and ids)
 * Paths may have a leading folder (e.g. when a whole unpacked folder is picked).
 */
export function loadFlowsFromEntries(entries: Record<string, Uint8Array | string>): ParsedFlow[] {
  const text = (v: Uint8Array | string) => (typeof v === 'string' ? v : strFromU8(v))
  const paths = Object.keys(entries).map((p) => p.replace(/\\/g, '/'))
  const original = Object.fromEntries(
    Object.keys(entries).map((p) => [p.replace(/\\/g, '/'), entries[p]]),
  )

  const customizationsPath = paths.find((p) => /(^|\/)customizations\.xml$/i.test(p))
  const workflows = customizationsPath
    ? parseCustomizations(text(original[customizationsPath]))
    : []
  const byFile = new Map(
    workflows.filter((w) => w.jsonFile).map((w) => [w.jsonFile!.toLowerCase(), w]),
  )

  const flows: ParsedFlow[] = []
  for (const path of paths.filter(isFlowFile).sort()) {
    const rel = path.slice(path.toLowerCase().lastIndexOf('workflows/'))
    const entry = /workflows\//i.test(path) ? byFile.get(rel.toLowerCase()) : undefined
    const legacyId = path.match(/flows\/([^/]+)\/definition\.json$/i)?.[1]
    const fileId = path.match(new RegExp(`-(${GUID.source})\\.json$`, 'i'))?.[1]
    try {
      flows.push(
        loadFlowFromJson(text(original[path]), nameFromFile(path), {
          displayName: entry?.name,
          id: entry?.id ?? (legacyId && GUID.test(legacyId) ? legacyId : fileId),
          source: path,
        }),
      )
    } catch {
      // Not every matching file is a flow (e.g. connection definitions); skip it.
    }
  }
  return flows.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function loadFlowsFromZip(bytes: Uint8Array): ParsedFlow[] {
  const files = unzipSync(bytes, {
    filter: (f) => isFlowFile(f.name) || /(^|\/)customizations\.xml$/i.test(f.name),
  })
  const flows = loadFlowsFromEntries(files)
  if (flows.length === 0) throw new Error('No flow definitions found in this .zip')
  return flows
}

/**
 * Entry point for files picked or dropped by the user. Everything stays local.
 * Accepts .zip exports, single .json definitions, or all files of an unpacked solution folder
 * (`webkitRelativePath` keeps their folder structure).
 */
export async function loadFlowsFromFiles(files: File[]): Promise<ParsedFlow[]> {
  const folderFiles = files.filter((f) => f.webkitRelativePath)
  const flows: ParsedFlow[] = []
  if (folderFiles.length) {
    const wanted = folderFiles.filter(
      (f) => isFlowFile(f.webkitRelativePath) || /customizations\.xml$/i.test(f.name),
    )
    const entries: Record<string, Uint8Array> = {}
    for (const f of wanted) entries[f.webkitRelativePath] = new Uint8Array(await f.arrayBuffer())
    flows.push(...loadFlowsFromEntries(entries))
    if (flows.length === 0) throw new Error('No flow definitions found in this folder')
  }
  for (const file of files.filter((f) => !f.webkitRelativePath)) {
    const buf = new Uint8Array(await file.arrayBuffer())
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b // "PK"
    if (isZip) flows.push(...loadFlowsFromZip(buf))
    else
      flows.push(
        loadFlowFromJson(strFromU8(buf), file.name.replace(/\.json$/i, ''), { source: file.name }),
      )
  }
  return flows
}
