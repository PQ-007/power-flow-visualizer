import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import { buildGraph } from './buildGraph'

describe('buildGraph', async () => {
  const flow = loadFlowFromJson(JSON.stringify(sample))
  const { nodes, edges } = await buildGraph(flow)

  it('creates a visual node for every flow node plus branch boxes', () => {
    const ids = new Set(nodes.map((n) => n.id))
    for (const id of flow.byId.keys()) expect(ids).toContain(id)
    expect(ids).toContain('Check_amount#true')
    expect(ids).toContain('Switch_on_outcome#default')
  })

  it('orders parents before children (React Flow requirement)', () => {
    const seen = new Set<string>()
    for (const n of nodes) {
      if (n.parentId) expect(seen).toContain(n.parentId)
      seen.add(n.id)
    }
  })

  it('labels non-Succeeded runAfter edges', () => {
    const e = edges.find((x) => x.source === 'Try' && x.target === 'Catch')!
    expect(e.label).toBe('on Failed, TimedOut')
    expect(edges.find((x) => x.source === 'When_an_item_is_created')?.target).toBe(
      'Initialize_ApprovalStatus',
    )
  })

  it('lays out siblings top-to-bottom', () => {
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y
    expect(y('Try')).toBeGreaterThan(y('Initialize_ApprovalStatus'))
  })
})
