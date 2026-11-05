import { describe, expect, it } from 'vitest'
import { loadFlowFromJson } from '../parser/loadFlow'
import sample from '../samples/invoice-approval.json'
import sampleRun from '../samples/runs/invoice-approval-failed-run.json'
import { branchTaken, formatDuration, matchRun, ran, rootCauses, runClass } from './overlay'
import { loadRunFromText, parseRun } from './parseRun'

const flow = loadFlowFromJson(JSON.stringify(sample))

describe('parseRun', () => {
  it('reads the pfv-run/1 export format', () => {
    const run = parseRun(sampleRun)!
    expect(run.status).toBe('Failed')
    expect(run.flowId).toBe('00000000-0000-0000-0000-000000000001')
    expect(run.flowName).toBe('Sample - Invoice approval')
    expect(run.trigger?.status).toBe('Succeeded')
    expect(run.actions.get('Update_item')).toMatchObject({
      status: 'Failed',
      code: 'NotFound',
      error: { message: 'Item does not exist. It may have been deleted by another user.' },
    })
    expect(run.durationMs).toBeGreaterThan(3 * 3600 * 1000)
  })

  it('reads the portal shape (properties.actions, links instead of data)', () => {
    const run = parseRun({
      name: '0858XYZ',
      properties: {
        status: 'Failed',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T10:00:02.5Z',
        error: { code: 'ActionFailed', message: 'An action failed.' },
        flow: {
          name: 'AB12CD34-0000-4000-8000-000000000001',
          properties: { displayName: 'My flow' },
        },
        trigger: { name: 'manual', status: 'Succeeded', outputsLink: { uri: 'https://x' } },
        actions: {
          Compose: {
            status: 'Failed',
            code: 'BadRequest',
            inputsLink: { uri: 'https://x' },
            outputsLink: { uri: 'https://y' },
            repetitionCount: 3,
          },
        },
      },
    })!
    expect(run).toMatchObject({
      name: '0858XYZ',
      status: 'Failed',
      durationMs: 2500,
      flowId: 'ab12cd34-0000-4000-8000-000000000001',
      flowName: 'My flow',
      error: { code: 'ActionFailed', message: 'An action failed.' },
    })
    expect(run.trigger?.outputsLinked).toBe(true)
    expect(run.actions.get('Compose')).toMatchObject({
      inputsLinked: true,
      outputsLinked: true,
      repetitionCount: 3,
    })
  })

  it('reads an actions list ({ value: [...] }) and input/output aliases', () => {
    const list = parseRun({
      value: [{ name: 'A', properties: { status: 'Succeeded', outputs: { body: 1 } } }],
    })!
    expect(list.actions.get('A')?.outputs).toEqual({ body: 1 })
    const cli = parseRun({
      actions: {
        B: { status: 'Failed', input: 1, output: { body: { error: { message: 'boom' } } } },
      },
    })!
    expect(cli.actions.get('B')).toMatchObject({ inputs: 1, error: { message: 'boom' } })
  })

  it('accepts a UTF-8 BOM and Windows PowerShell 5.1 dates', () => {
    const run = loadRunFromText(
      '\uFEFF' +
        JSON.stringify({
          actions: {
            A: {
              status: 'Succeeded',
              startTime: '/Date(1700000000000)/',
              endTime: '/Date(1700000001500)/',
            },
          },
        }),
    )!
    expect(run.actions.get('A')).toMatchObject({
      startTime: '2023-11-14T22:13:20.000Z',
      durationMs: 1500,
    })
  })

  it('rejects flow definitions and junk', () => {
    expect(parseRun(sample)).toBeNull()
    expect(loadRunFromText('not json')).toBeNull()
    expect(parseRun({ actions: { A: { type: 'Compose' } } })).toBeNull()
  })
})

describe('overlay', () => {
  const overlay = matchRun(flow, parseRun(sampleRun)!)

  it('matches run entries to actions and the trigger', () => {
    expect(overlay.unmatched).toEqual([])
    expect(overlay.coverage).toBe(1)
    expect(overlay.byId.get('When_an_item_is_created')?.status).toBe('Succeeded')
  })

  it('reports run entries missing from the flow', () => {
    const o = matchRun(
      flow,
      parseRun({ actions: { Ghost: { status: 'Succeeded' }, Try: { status: 'Failed' } } })!,
    )
    expect(o.unmatched).toEqual(['Ghost'])
    expect(o.coverage).toBe(0.5)
  })

  it('knows which actions ran and which branches were taken', () => {
    expect(ran(overlay, 'Update_item')).toBe(true)
    expect(ran(overlay, 'Auto_approve')).toBe(false)
    const [yes, no] = flow.byId.get('Check_amount')!.branches
    expect(branchTaken(overlay, yes)).toBe(true)
    expect(branchTaken(overlay, no)).toBe(false)
  })

  it('points at the innermost failure, not the failed scope around it', () => {
    expect(rootCauses(flow, overlay)).toEqual(['Update_item'])
  })

  it('classifies statuses and formats durations', () => {
    expect(['Succeeded', 'TimedOut', 'Skipped', 'Waiting', 'Weird'].map(runClass)).toEqual([
      'succeeded',
      'failed',
      'skipped',
      'running',
      'unknown',
    ])
    expect(formatDuration(450)).toBe('450 ms')
    expect(formatDuration(2500)).toBe('2.5 s')
    expect(formatDuration(3 * 3600_000 + 12 * 60_000)).toBe('3 h 12 min')
  })
})

describe('pickFlowForRun', async () => {
  const { pickFlowForRun } = await import('./attach')
  const { loadFlowsFromEntries } = await import('../parser/loadFlow')
  const { sampleSolutionEntries } = await import('../samples/solution')
  const solution = loadFlowsFromEntries(sampleSolutionEntries)
  const run = parseRun(sampleRun)!

  it('uses the flow id when it matches', () => {
    expect(pickFlowForRun([flow], run)).toBe(0)
  })

  it('falls back to the flow containing most of the run', () => {
    const anonymous = { ...run, flowId: undefined }
    const i = pickFlowForRun(solution, anonymous)
    expect(solution[i!].displayName).toBe('Invoice approval')
  })

  it('returns undefined when no flow fits', () => {
    const other = parseRun({ actions: { Nope: { status: 'Succeeded' } } })!
    expect(pickFlowForRun(solution, other)).toBeUndefined()
  })
})
