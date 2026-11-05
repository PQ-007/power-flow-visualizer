import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import {
  ancestorsOf,
  containersAtOrBelow,
  defaultCollapsed,
  depthOf,
  descendantCount,
  walk,
} from './tree'

const flow = loadFlowFromJson(JSON.stringify(sample))

describe('tree helpers', () => {
  it('finds ancestors outermost first', () => {
    expect(ancestorsOf(flow, 'Set_status_Approved')).toEqual([
      'Try',
      'Check_amount',
      'Switch_on_outcome',
    ])
    expect(depthOf(flow, 'Try')).toBe(0)
  })
  it('counts descendants', () => {
    expect(descendantCount(flow.byId.get('Check_amount')!)).toBe(5)
    expect(descendantCount(flow.byId.get('Update_item')!)).toBe(0)
  })
  it('selects containers by depth', () => {
    expect([...containersAtOrBelow(flow, 1)].sort()).toEqual(['Check_amount', 'Switch_on_outcome'])
    expect(containersAtOrBelow(flow, 0).size).toBe(5)
  })
  it('keeps small flows expanded by default', () => {
    expect(defaultCollapsed(flow).size).toBe(0)
    expect(defaultCollapsed(flow, 5).has('Check_amount')).toBe(true)
  })
  it('walks in designer order', () => {
    const order = [...walk(flow)].map((n) => n.id)
    expect(order.slice(0, 4)).toEqual([
      'When_an_item_is_created',
      'Initialize_ApprovalStatus',
      'Try',
      'Get_approver',
    ])
    expect(order.indexOf('Auto_approve')).toBeGreaterThan(order.indexOf('Set_status_Rejected'))
  })
})
