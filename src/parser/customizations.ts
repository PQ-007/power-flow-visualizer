/**
 * Minimal reader for a solution's `customizations.xml`: we only need each workflow's
 * display name, id and JSON file. Regex-based on purpose so the parser runs in Node
 * (no DOMParser) and tolerates the huge, varied rest of the file.
 */

export interface WorkflowEntry {
  /** Lower-case GUID without braces. */
  id: string
  name: string
  /** Path of the definition inside the solution, without leading slash: `Workflows/X-GUID.json`. */
  jsonFile?: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const decodeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ENTITIES[e.toLowerCase()],
  )

export const normalizeGuid = (g: string) => g.replace(/[{}]/g, '').toLowerCase()

export function parseCustomizations(xml: string): WorkflowEntry[] {
  const out: WorkflowEntry[] = []
  for (const m of xml.matchAll(/<Workflow\b([^>]*)>([\s\S]*?)<\/Workflow>/g)) {
    const attrs = m[1]
    const id = attrs.match(/\bWorkflowId="([^"]+)"/)?.[1]
    const name = attrs.match(/\bName="([^"]*)"/)?.[1]
    if (!id || name === undefined) continue
    const json = m[2].match(/<JsonFileName>\s*([^<]+?)\s*<\/JsonFileName>/)?.[1]
    out.push({
      id: normalizeGuid(id),
      name: decodeXml(name),
      jsonFile: json
        ? decodeXml(json)
            .replace(/^[/\\]+/, '')
            .replace(/\\/g, '/')
        : undefined,
    })
  }
  return out
}
