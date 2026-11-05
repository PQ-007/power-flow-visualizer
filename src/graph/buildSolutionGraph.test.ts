import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { buildSolutionIndex } from '../analysis/solution'
import { loadFlowsFromEntries } from '../parser/loadFlow'
import { sampleSolutionEntries } from '../samples/solution'
import { buildSolutionGraph, flowNodeId, neighborsOf } from './buildSolutionGraph'

const flows = loadFlowsFromEntries(sampleSolutionEntries)
const index = buildSolutionIndex(flows)
const fid = (name: string) => flowNodeId(flows.findIndex((f) => f.displayName === name))

describe('buildSolutionGraph', async () => {
  const { nodes, edges } = await buildSolutionGraph(index, new ELK(), {
    kinds: new Set(['sharepoint', 'dataverse']),
  })

  it('draws every flow and only the requested resource kinds', () => {
    expect(nodes.filter((n) => n.type === 'flowMap')).toHaveLength(5)
    const kinds = new Set(
      nodes.flatMap((n) => (n.type === 'resourceMap' ? [n.data.resource.kind] : [])),
    )
    expect([...kinds].sort()).toEqual(['dataverse', 'sharepoint'])
  })

  it('points edges the way data moves and dedupes them per access', () => {
    const invoices = 'r#sharepoint:https://contoso.sharepoint.com/sites/finance|invoices'
    const around = edges
      .filter((e) => e.source === invoices || e.target === invoices)
      .map(
        (e) =>
          `${e.source === invoices ? 'list' : e.source} -> ${e.target === invoices ? 'list' : e.target} ${e.data!.access}`,
      )
      .sort()
    expect(around).toEqual([
      `${fid('Archive paid invoices')} -> list write`,
      `${fid('Invoice approval')} -> list write`,
      `list -> ${fid('Archive paid invoices')} read`,
      `list -> ${fid('Invoice approval')} trigger`,
      `list -> ${fid('Invoice reminder')} read`,
    ])
  })

  it('links callers to child flows', () => {
    expect(
      edges.some(
        (e) =>
          e.source === fid('Invoice approval') &&
          e.target === fid('Write audit entry (child)') &&
          e.data?.access === 'call',
      ),
    ).toBe(true)
  })
})

describe('neighborsOf', () => {
  const kinds = new Set(['sharepoint', 'dataverse'] as const)
  it('returns a flow with its visible resources and related flows', () => {
    const n = [...neighborsOf(index, fid('Write audit entry (child)'), kinds)].sort()
    expect(n).toEqual(
      [
        fid('Archive paid invoices'),
        fid('Invoice approval'),
        fid('Write audit entry (child)'),
        'r#dataverse:new_auditlogs',
      ].sort(),
    )
  })
  it('returns a resource with the flows using it', () => {
    expect([...neighborsOf(index, 'r#dataverse:new_vendor', kinds)].sort()).toEqual(
      ['r#dataverse:new_vendor', fid('Sync vendors from ERP')].sort(),
    )
  })
})
