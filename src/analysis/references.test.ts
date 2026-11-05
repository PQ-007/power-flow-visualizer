import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import { parseDefinition } from '../parser/parseDefinition'
import { refsOfNode } from './references'
import { analyzeFlow, variableRoles } from './variables'

const flow = loadFlowFromJson(JSON.stringify(sample))
const refs = (id: string) =>
  refsOfNode(flow, flow.byId.get(id)!).map((r) => `${r.kind}:${r.target}${r.unresolved ? '!' : ''}`)

describe('refsOfNode', () => {
  it('finds action, trigger and variable references inside nested expressions', () => {
    expect(refs('Notify_admins').sort()).toEqual(['action:Try', 'trigger:When_an_item_is_created'])
    expect(refs('Post_message_in_Teams').sort()).toEqual([
      'loop:Notify_each_watcher',
      'trigger:When_an_item_is_created',
      'variable:ApprovalStatus',
    ])
    expect(refs('Switch_on_outcome')).toEqual(['action:Start_and_wait_for_an_approval'])
  })

  it('reads condition objects and ignores nested actions and $connections', () => {
    expect(refs('Check_amount')).toEqual(['trigger:When_an_item_is_created'])
    expect(refs('Try')).toEqual([])
  })

  it('resolves item() to the nearest Apply to each and flags unknown targets', () => {
    const f = parseDefinition({
      triggers: { t: { type: 'Request' } },
      actions: {
        Loop: {
          type: 'Foreach',
          foreach: '@createArray(1)',
          actions: {
            Use: { type: 'Compose', inputs: "@{item()} @{body('Ghost')} @{body(variables('n'))}" },
          },
        },
      },
    })
    expect(refsOfNode(f, f.byId.get('Use')!)).toEqual([
      { kind: 'loop', target: 'Loop', fn: 'item' },
      { kind: 'action', target: 'Ghost', fn: 'body', unresolved: true },
      { kind: 'variable', target: 'n', fn: 'variables' },
    ])
  })
})

describe('analyzeFlow', () => {
  const a = analyzeFlow(flow)

  it('builds the "used by" index', () => {
    expect(a.usedBy.get('Get_approver')).toEqual(['Start_and_wait_for_an_approval'])
    expect(a.usedBy.get('Try')).toEqual(['Notify_admins'])
  })

  it('collects variable declarations, writes and reads', () => {
    const v = a.variables.get('approvalstatus')!
    expect(v.name).toBe('ApprovalStatus')
    expect(v.type).toBe('string')
    expect(v.initializedBy.map((i) => i.nodeId)).toEqual(['Initialize_ApprovalStatus'])
    expect(v.writes.map((w) => `${w.op}:${w.nodeId}`)).toEqual([
      'set:Set_status_Approved',
      'set:Set_status_Rejected',
      'set:Auto_approve',
    ])
    expect(v.reads.sort()).toEqual(['Post_message_in_Teams', 'Update_item'])
    expect(v.warnings).toEqual([])
    expect(variableRoles(v).get('Auto_approve')).toBe('write')
    expect(variableRoles(v).get('Update_item')).toBe('read')
  })

  it('warns about common variable mistakes', () => {
    const f = parseDefinition({
      triggers: { t: { type: 'Request' } },
      actions: {
        Init_unused: {
          type: 'InitializeVariable',
          inputs: { variables: [{ name: 'unused', type: 'integer', value: 0 }] },
        },
        Loop: {
          type: 'Foreach',
          foreach: '@createArray(1,2)',
          runtimeConfiguration: { concurrency: { repetitions: 10 } },
          runAfter: { Init_unused: ['Succeeded'] },
          actions: {
            Bump: { type: 'IncrementVariable', inputs: { name: 'Counter', value: 1 } },
          },
        },
      },
    })
    const vars = analyzeFlow(f).variables
    expect(vars.get('unused')!.warnings).toEqual(['Never read'])
    expect(vars.get('counter')!.warnings).toEqual([
      'Used but never initialized',
      'Never read',
      'Changed inside "Loop", which runs iterations in parallel: values may race',
    ])
  })
})
