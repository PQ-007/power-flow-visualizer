import { strFromU8, unzipSync } from 'fflate'
import type { ParsedFlow } from '../model/types'
import { parseDefinition } from './parseDefinition'

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Finds the WDL definition inside the common JSON shapes people copy around:
 *  - the bare definition ({ $schema, triggers, actions })
 *  - { definition: {...} }
 *  - { properties: { displayName, definition } }  (legacy package / solution Workflows/*.json)
 *  - { properties: { definition } } wrapped one level deeper by some tools
 */
export function extractDefinition(
  json: unknown,
): { definition: unknown; displayName?: string } | null {
  if (!isObject(json)) return null
  if (isObject(json.triggers) || isObject(json.actions)) return { definition: json }
  if (isObject(json.definition)) {
    return { definition: json.definition, displayName: str(json.displayName) }
  }
  if (isObject(json.properties)) {
    const inner = extractDefinition(json.properties)
    if (inner)
      return { ...inner, displayName: inner.displayName ?? str(json.properties.displayName) }
  }
  return null
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

export function loadFlowFromJson(text: string, fallbackName = 'Untitled flow'): ParsedFlow {
  const json: unknown = JSON.parse(text)
  const found = extractDefinition(json)
  if (!found) throw new Error('No flow definition (triggers/actions) found in this JSON')
  return parseDefinition(found.definition, found.displayName ?? fallbackName)
}

/**
 * Loads every flow from a .zip export:
 *  - legacy package: Microsoft.Flow/flows/<guid>/definition.json
 *  - solution:       Workflows/<name>-<guid>.json
 */
export function loadFlowsFromZip(bytes: Uint8Array): ParsedFlow[] {
  const files = unzipSync(bytes, {
    filter: (f) => /(^|\/)definition\.json$/i.test(f.name) || /^Workflows\/.+\.json$/i.test(f.name),
  })
  const flows: ParsedFlow[] = []
  for (const [path, data] of Object.entries(files)) {
    try {
      const name = path
        .split('/')
        .pop()!
        .replace(/\.json$/i, '')
      flows.push(loadFlowFromJson(strFromU8(data), name))
    } catch {
      // Not every matching file is a flow (e.g. connection definitions); skip it.
    }
  }
  if (flows.length === 0) throw new Error('No flow definitions found in this .zip')
  return flows
}

/** Entry point for files picked or dropped by the user. Everything stays local. */
export async function loadFlowsFromFile(file: File): Promise<ParsedFlow[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b // "PK"
  if (isZip) return loadFlowsFromZip(buf)
  return [loadFlowFromJson(new TextDecoder().decode(buf), file.name.replace(/\.json$/i, ''))]
}
