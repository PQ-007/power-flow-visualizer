import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { sampleSolutionEntries } from '../samples/solution'
import { parseCustomizations } from './customizations'
import { loadFlowsFromEntries, loadFlowsFromZip } from './loadFlow'

describe('parseCustomizations', () => {
  it('reads workflow ids, names and json files', () => {
    const xml = `<ImportExportXml><Workflows>
      <Workflow WorkflowId="{AB12CD34-0000-4000-8000-000000000001}" Name="Tom &amp; Jerry's flow" Description="x">
        <JsonFileName>/Workflows/TomJerry-AB12CD34-0000-4000-8000-000000000001.json</JsonFileName>
      </Workflow>
      <Workflow WorkflowId="{AB12CD34-0000-4000-8000-000000000002}" Name="Classic workflow"><Type>1</Type></Workflow>
    </Workflows></ImportExportXml>`
    expect(parseCustomizations(xml)).toEqual([
      {
        id: 'ab12cd34-0000-4000-8000-000000000001',
        name: "Tom & Jerry's flow",
        jsonFile: 'Workflows/TomJerry-AB12CD34-0000-4000-8000-000000000001.json',
      },
      { id: 'ab12cd34-0000-4000-8000-000000000002', name: 'Classic workflow', jsonFile: undefined },
    ])
  })
})

describe('loadFlowsFromEntries', () => {
  it('loads an unpacked solution with names, ids and connection references', () => {
    const flows = loadFlowsFromEntries(sampleSolutionEntries)
    expect(flows.map((f) => f.displayName)).toEqual([
      'Archive paid invoices',
      'Invoice approval',
      'Invoice reminder',
      'Sync vendors from ERP',
      'Write audit entry (child)',
    ])
    const child = flows.find((f) => f.displayName.startsWith('Write audit'))!
    expect(child.id).toBe('1a2b3c4d-0003-4000-8000-00000000a003')
    expect(child.connectionReferences).toEqual({
      shared_commondataserviceforapps: 'new_sharedcommondataserviceforapps_finance',
    })
  })

  it('falls back to the file name (minus GUID) and file GUID without customizations.xml', () => {
    const entries = Object.fromEntries(
      Object.entries(sampleSolutionEntries).filter(([p]) => p.includes('InvoiceReminder')),
    )
    const [flow] = loadFlowsFromEntries(entries)
    expect(flow.displayName).toBe('InvoiceReminder')
    expect(flow.id).toBe('1a2b3c4d-0005-4000-8000-00000000a005')
  })

  it('handles a leading folder name (picked unpacked folder)', () => {
    const entries = Object.fromEntries(
      Object.entries(sampleSolutionEntries).map(([p, t]) => [`FinanceSolution/${p}`, t]),
    )
    expect(loadFlowsFromEntries(entries).map((f) => f.displayName)).toContain('Invoice approval')
  })
})

describe('loadFlowsFromZip', () => {
  it('loads a solution zip', () => {
    const zip = zipSync(
      Object.fromEntries(Object.entries(sampleSolutionEntries).map(([p, t]) => [p, strToU8(t)])),
    )
    expect(loadFlowsFromZip(zip)).toHaveLength(5)
  })

  it('loads a legacy package and takes the id from the folder', () => {
    const zip = zipSync({
      'manifest.json': strToU8('{}'),
      'Microsoft.Flow/flows/0f0e0d0c-1111-4222-8333-444455556666/definition.json': strToU8(
        JSON.stringify(sample),
      ),
    })
    const [flow] = loadFlowsFromZip(zip)
    expect(flow.displayName).toBe('Sample - Invoice approval')
    expect(flow.id).toBe('0f0e0d0c-1111-4222-8333-444455556666')
  })

  it('throws when nothing in the zip is a flow', () => {
    expect(() => loadFlowsFromZip(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/No flow/)
  })
})
