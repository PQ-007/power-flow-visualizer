import { describe, expect, it } from 'vitest'
import { loadFlowsFromEntries } from '../parser/loadFlow'
import { sampleSolutionEntries } from '../samples/solution'
import { siteLabel } from './resources'
import { buildSolutionIndex, searchSolution } from './solution'

const flows = loadFlowsFromEntries(sampleSolutionEntries)
const index = buildSolutionIndex(flows)
const flowName = (i: number) => flows[i].displayName
const usesOf = (key: string) =>
  index.resourceByKey
    .get(key)!
    .uses.map((u) => `${flowName(u.flowIndex)} / ${u.nodeId} / ${u.access}`)
    .sort()

const INVOICES = 'sharepoint:https://contoso.sharepoint.com/sites/finance|invoices'

describe('buildSolutionIndex', () => {
  it('merges a list referenced by name and by GUID (resolved through action metadata)', () => {
    expect(usesOf(INVOICES)).toEqual([
      'Archive paid invoices / Delete_original / write',
      'Archive paid invoices / Get_paid_invoices / read',
      'Invoice approval / Update_item / write',
      'Invoice approval / When_an_item_is_created / trigger',
      'Invoice reminder / Get_pending_invoices / read',
    ])
    expect(index.resourceByKey.get(INVOICES)!.detail).toBe('finance')
  })

  it('finds Dataverse, Excel, HTTP, env var and connection reference resources', () => {
    const keys = index.resources.map((r) => `${r.kind}: ${r.label}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        'dataverse: new_auditlogs',
        'dataverse: new_vendor',
        'excel: VendorChanges.xlsx › Changes',
        'http: erp.example.com',
        'envvar: Finance mailbox',
        'envvar: ERP API key',
        'mailbox: flow-admins@contoso.com',
        'connection: new_sharedsharepointonline_finance',
      ]),
    )
    expect(usesOf('dataverse:new_vendor')).toEqual([
      'Sync vendors from ERP / When_a_vendor_changes / trigger',
    ])
    expect(usesOf('envvar:new_financemailbox')).toEqual(['Invoice reminder / Send_reminder / read'])
  })

  it('resolves child flow calls to flows in the solution', () => {
    const calls = index.calls.map(
      (c) => `${flowName(c.from)} -> ${c.to === undefined ? '?' : flowName(c.to)}`,
    )
    expect(calls.sort()).toEqual([
      'Archive paid invoices -> Write audit entry (child)',
      'Invoice approval -> Write audit entry (child)',
    ])
    expect(index.resources.some((r) => r.kind === 'flow')).toBe(false)
  })

  it('reports child flows outside the loaded set as resources', () => {
    const only = buildSolutionIndex(flows.filter((f) => f.displayName === 'Invoice approval'))
    expect(only.calls[0].to).toBeUndefined()
    expect(only.resources.find((r) => r.kind === 'flow')?.label).toMatch(/not in this set/)
  })
})

describe('searchSolution', () => {
  it('searches actions in every flow, flow names and resources', () => {
    const r = searchSolution(index, 'vendors')
    expect(r.flows.map((f) => flowName(f.flowIndex))).toEqual(['Sync vendors from ERP'])
    expect(r.flows[0].nameMatch).toBe(true)
    expect(r.resources.map((x) => x.label)).toEqual(['Vendors'])
    const audit = searchSolution(index, 'audit')
    expect(audit.flows.map((f) => flowName(f.flowIndex)).sort()).toEqual([
      'Archive paid invoices',
      'Invoice approval',
      'Write audit entry (child)',
    ])
  })
})

describe('siteLabel', () => {
  it('shortens SharePoint site URLs', () => {
    expect(siteLabel('https://contoso.sharepoint.com/sites/finance')).toBe('finance')
    expect(siteLabel('https://contoso.sharepoint.com/teams/HR%20Team/')).toBe('HR Team')
    expect(siteLabel('https://contoso.sharepoint.com/')).toBe('contoso.sharepoint.com')
  })
})
