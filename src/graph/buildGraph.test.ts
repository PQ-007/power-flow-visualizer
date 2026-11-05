import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import { buildGraph } from './buildGraph'

const elk = new ELK()
const flow = loadFlowFromJson(JSON.stringify(sample))

describe('buildGraph (expanded)', async () => {
  const { nodes, edges } = await buildGraph(flow, elk)

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

  it('lays out siblings top-to-bottom and branches left-to-right in definition order', () => {
    const pos = (id: string) => nodes.find((n) => n.id === id)!.position
    expect(pos('Try').y).toBeGreaterThan(pos('Initialize_ApprovalStatus').y)
    expect(pos('Check_amount#false').x).toBeGreaterThan(pos('Check_amount#true').x)
    expect(pos('Switch_on_outcome#default').x).toBeGreaterThan(
      pos('Switch_on_outcome#case:Case_Reject').x,
    )
  })
})

describe('buildGraph (collapsed)', async () => {
  const { nodes, edges } = await buildGraph(flow, elk, { collapsed: new Set(['Try']) })

  it('draws a collapsed container as one card and hides its contents', () => {
    const tryNode = nodes.find((n) => n.id === 'Try')!
    expect(tryNode.type).toBe('collapsed')
    expect(tryNode.data).toMatchObject({ hiddenCount: 8 })
    for (const hidden of ['Get_approver', 'Check_amount', 'Check_amount#true', 'Update_item']) {
      expect(nodes.some((n) => n.id === hidden)).toBe(false)
    }
    expect(edges.some((e) => e.target === 'Update_item')).toBe(false)
  })

  it('keeps edges into and out of the collapsed container', () => {
    expect(edges.some((e) => e.source === 'Try' && e.target === 'Catch')).toBe(true)
    expect(edges.some((e) => e.source === 'Initialize_ApprovalStatus' && e.target === 'Try')).toBe(
      true,
    )
  })
})
