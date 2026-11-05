import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson, extractDefinition } from './loadFlow'
import { parseDefinition } from './parseDefinition'

describe('extractDefinition', () => {
  it('accepts the bare definition, {definition}, and {properties:{definition}}', () => {
    const def = { triggers: {}, actions: {} }
    expect(extractDefinition(def)?.definition).toBe(def)
    expect(extractDefinition({ definition: def })?.definition).toBe(def)
    expect(extractDefinition({ properties: { displayName: 'X', definition: def } })).toMatchObject({
      definition: def,
      displayName: 'X',
    })
    expect(extractDefinition({ foo: 1 })).toBeNull()
  })
})

describe('parseDefinition on the sample flow', () => {
  const flow = loadFlowFromJson(JSON.stringify(sample))

  it('reads display name, trigger and top-level actions', () => {
    expect(flow.displayName).toBe('Sample - Invoice approval')
    expect(flow.triggers.map((t) => t.name)).toEqual(['When_an_item_is_created'])
    expect(flow.actions.map((a) => a.name)).toEqual([
      'Initialize_ApprovalStatus',
      'Try',
      'Catch',
      'Notify_each_watcher',
    ])
    expect(flow.warnings).toEqual([])
  })

  it('classifies containers and builds branches', () => {
    const cond = flow.byId.get('Check_amount')!
    expect(cond.kind).toBe('condition')
    expect(cond.parentId).toBe('Try')
    expect(cond.branches.map((b) => b.label)).toEqual(['If yes', 'If no'])
    expect(cond.branches[1].nodes.map((n) => n.name)).toEqual(['Auto_approve'])

    const sw = flow.byId.get('Switch_on_outcome')!
    expect(sw.kind).toBe('switch')
    expect(sw.branches.map((b) => b.label)).toEqual(['Case: Approve', 'Case: Reject', 'Default'])

    expect(flow.byId.get('Notify_each_watcher')!.kind).toBe('foreach')
  })

  it('extracts connector and operation', () => {
    const n = flow.byId.get('Update_item')!
    expect(n.connector).toBe('sharepointonline')
    expect(n.operationId).toBe('PatchItem')
    expect(n.displayName).toBe('Update item')
  })

  it('keeps non-default runAfter statuses', () => {
    expect(flow.byId.get('Catch')!.runAfter).toEqual({ Try: ['Failed', 'TimedOut'] })
  })
})

describe('parseDefinition warnings', () => {
  it('flags unknown runAfter targets and missing trigger', () => {
    const flow = parseDefinition({
      actions: { A: { type: 'Compose', runAfter: { Ghost: ['Succeeded'] } } },
    })
    expect(flow.warnings).toContain('Flow has no trigger')
    expect(flow.warnings).toContain('"A" runs after unknown action "Ghost"')
  })
})
